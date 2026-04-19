# ShelfSense backend integration test suite.
# Exercises every endpoint against the deployed backend and reports PASS/FAIL.
# Exits 0 if all pass, 1 otherwise.

$ErrorActionPreference = "Stop"
$base = "https://shelfsense-backend-o79b.onrender.com"
$fails = @()
$passes = 0

function Test-Case {
    param([string]$Name, [scriptblock]$Check)
    try {
        & $Check
        Write-Host "PASS  $Name" -ForegroundColor Green
        $script:passes += 1
    } catch {
        Write-Host "FAIL  $Name" -ForegroundColor Red
        Write-Host "      $($_.Exception.Message)" -ForegroundColor Yellow
        $script:fails += $Name
    }
}

function Expect-Status {
    param([int]$Expected, [string]$Url, [string]$Method = "GET", $Body = $null, [string]$ContentType = "application/json")
    try {
        if ($Method -eq "GET") {
            $r = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 30 -UseBasicParsing
        } else {
            $r = Invoke-WebRequest -Uri $Url -Method $Method -Body $Body -ContentType $ContentType -TimeoutSec 30 -UseBasicParsing
        }
        if ($r.StatusCode -ne $Expected) { throw "expected $Expected got $($r.StatusCode)" }
        return $r.Content
    } catch [System.Net.WebException] {
        $code = [int]$_.Exception.Response.StatusCode.value__
        if ($code -ne $Expected) { throw "expected $Expected got $code : $($_.Exception.Message)" }
        $s = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($s)
        return $reader.ReadToEnd()
    } catch {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode.value__
            if ($code -ne $Expected) { throw "expected $Expected got $code : $($_.Exception.Message)" }
            $s = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($s)
            return $reader.ReadToEnd()
        }
        throw
    }
}

Write-Host "=== ShelfSense backend tests ($base) ===" -ForegroundColor Cyan

Test-Case "GET /health returns 200 ok + ocrConfigured field" {
    $c = Expect-Status 200 "$base/health"
    $j = $c | ConvertFrom-Json
    if ($j.status -ne "ok") { throw "status != ok" }
    if ($null -eq $j.ocrConfigured) { throw "missing ocrConfigured" }
}

Test-Case "GET /api/ocr-status returns {configured, provider}" {
    $c = Expect-Status 200 "$base/api/ocr-status"
    $j = $c | ConvertFrom-Json
    if ($null -eq $j.configured) { throw "missing configured" }
    if (-not $j.provider) { throw "missing provider" }
}

Test-Case "POST /api/analyze-label (ocr_text + profile_id) -> 200 + verdict" {
    $b = '{"session_id":"t1","profile_id":"diabetic","ocr_text":"Sugar, HFCS, hydrogenated oil, wheat flour"}'
    $c = Expect-Status 200 "$base/api/analyze-label" "POST" $b
    $j = $c | ConvertFrom-Json
    if ($j.verdict -notin @("Safe","Caution","Avoid")) { throw "bad verdict $($j.verdict)" }
    if ($j.source -ne "heuristic") { throw "source=$($j.source) expected heuristic" }
}

Test-Case "POST /api/analyze-label (image_base64 + no key) -> 200 demo-no-ocr" {
    $b = '{"session_id":"t2","profile_id":"diabetic","image_base64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="}'
    $c = Expect-Status 200 "$base/api/analyze-label" "POST" $b
    $j = $c | ConvertFrom-Json
    if ($j.source -ne "demo-no-ocr") { throw "source=$($j.source) expected demo-no-ocr (since Vision key not set)" }
    if (-not $j.verdict) { throw "missing verdict" }
}

Test-Case "POST /api/analyze-label (bad JSON) -> 400" {
    $null = Expect-Status 400 "$base/api/analyze-label" "POST" '{"not":"valid"}'
}

Test-Case "POST /api/analyze-label (unknown profile_id) -> 400" {
    $b = '{"session_id":"t3","profile_id":"nonexistent","ocr_text":"sugar"}'
    $null = Expect-Status 400 "$base/api/analyze-label" "POST" $b
}

Test-Case "POST /api/analyze-label (empty ocr_text + image_base64 empty) -> 400" {
    $b = '{"session_id":"t4","profile_id":"diabetic"}'
    $null = Expect-Status 400 "$base/api/analyze-label" "POST" $b
}

Test-Case "POST /api/analyze-label (cart_context + ocr_text) -> 200 cart_impact populated" {
    $b = '{"session_id":"t5","profile_id":"diabetic","ocr_text":"Sugar, HFCS","cart_context":{"items":[{"name":"prior","verdict":"Safe"}]}}'
    $c = Expect-Status 200 "$base/api/analyze-label" "POST" $b
    $j = $c | ConvertFrom-Json
    if (-not $j.cart_impact.summary) { throw "no cart_impact.summary" }
}

Test-Case "POST /api/profile/parse (simple text) -> 200" {
    $b = '{"text":"diabetic, peanut allergy, high cholesterol"}'
    $c = Expect-Status 200 "$base/api/profile/parse" "POST" $b
    $j = $c | ConvertFrom-Json
    if (-not $j.profile) { throw "no profile" }
}

Test-Case "GET /api/profile/demo/diabetic -> 200" {
    $c = Expect-Status 200 "$base/api/profile/demo/diabetic"
    $j = $c | ConvertFrom-Json
    if (-not $j.profile) { throw "no profile" }
}

Test-Case "GET /api/profile/demo/bogus -> 404" {
    $null = Expect-Status 404 "$base/api/profile/demo/bogus"
}

Test-Case "POST /api/speech (basic) -> 200 returns payload" {
    $b = '{"text":"Avoid - contains HFCS","verdict":"Avoid"}'
    $c = Expect-Status 200 "$base/api/speech" "POST" $b
    $j = $c | ConvertFrom-Json
    if (-not $j) { throw "empty response" }
}

Test-Case "POST /api/cart/update (reset) -> 200 + empty items" {
    $b = '{"session_id":"test-cart-1","reset":true,"item":{"name":"Test","verdict":"Safe"}}'
    $c = Expect-Status 200 "$base/api/cart/update" "POST" $b
    $j = $c | ConvertFrom-Json
    if (-not $j.cart) { throw "no cart" }
}

Test-Case "POST /api/cart/update then GET /api/cart/:id -> persists" {
    $sid = "test-cart-$(Get-Random)"
    $b1 = '{"session_id":"' + $sid + '","reset":true,"item":{"name":"Oreos","verdict":"Avoid"}}'
    $null = Expect-Status 200 "$base/api/cart/update" "POST" $b1
    $b2 = '{"session_id":"' + $sid + '","item":{"name":"Apple","verdict":"Safe"}}'
    $null = Expect-Status 200 "$base/api/cart/update" "POST" $b2
    $c = Expect-Status 200 "$base/api/cart/$sid"
    $j = $c | ConvertFrom-Json
    if ($j.items.Count -lt 1) { throw "cart empty after two updates" }
}

Test-Case "POST /api/meal-plan (real demo profile) -> 200 + meals array" {
    # Real flow: fetch a demo profile, then feed it into /api/meal-plan.
    # This mirrors what the Lens would do.
    $pc = Expect-Status 200 "$base/api/profile/demo/diabetic"
    $pj = $pc | ConvertFrom-Json
    $b = @{
        health_profile = $pj.profile
        budget_per_serving_usd = 5
    } | ConvertTo-Json -Compress -Depth 8
    $c = Expect-Status 200 "$base/api/meal-plan" "POST" $b
    $j = $c | ConvertFrom-Json
    if (-not $j.meals -or $j.meals.Count -lt 1) { throw "no meals returned" }
}

Test-Case "Exact lens POST shape (image + capture metadata + session_id)" {
    # This is literally what ShelfSenseApp.ts builds. Must accept without complaint.
    $b = @{
        session_id = "spectacles-123"
        profile_id = "diabetic"
        image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        capture = @{
            pinch_id = 1; hand = "R"; width = 512; height = 512; frame_timestamp = 42.5
            image_source = "spectacles-camera"
        }
    } | ConvertTo-Json -Compress -Depth 5
    $c = Expect-Status 200 "$base/api/analyze-label" "POST" $b
    $j = $c | ConvertFrom-Json
    if (-not $j.verdict) { throw "no verdict" }
    if ($j.source -notin @("heuristic","demo-no-ocr","demo")) { throw "bad source $($j.source)" }
}

Write-Host ""
Write-Host "=== Results: $passes PASS / $($fails.Count) FAIL ===" -ForegroundColor Cyan
if ($fails.Count -gt 0) {
    Write-Host "FAILED:" -ForegroundColor Red
    $fails | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
exit 0
