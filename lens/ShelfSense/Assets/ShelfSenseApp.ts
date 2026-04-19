// ShelfSenseApp.ts
// Main ShelfSense app for Snap Spectacles.
//
// Scan flow (the whole product, end-to-end):
//   1. Live camera is sampled continuously (CameraModule).
//   2. User pinches (GestureModule).
//   3. We freeze the latest frame metadata and POST to /api/analyze-label
//      on the deployed backend (Render.com HTTPS).
//   4. Backend returns a JSON verdict (Safe / Caution / Avoid + reasons).
//   5. Verdict is shown on the world-space text and (later) spoken.
//
// The /health probe is kept only as a connectivity indicator. Scan does NOT
// depend on the probe — a successful scan also proves the backend is alive,
// and we never want a cold /health to block the user from scanning.
//
// Requires (in Lens Studio):
//   1. Project Settings → "Experimental APIs" enabled.
//   2. An `InternetModule` asset created in the scene and dragged into the
//      Inspector slot `Internet Module` on this script.
//   3. The `Backend Url` field in the Inspector set to the Render URL
//      (default below). No LAN, no firewall, no localhost — the glasses hit
//      the public HTTPS endpoint directly.
//   4. Spectacles on any Wi-Fi with internet.
//
// Note on free-tier cold start:
//   Render sleeps the service after ~15 min idle. The first /health probe
//   after idle can take ~30 sec while the container wakes. Subsequent calls
//   are instant. We'll surface a "warming up..." state in a later layer.
//
// Docs:
//   - https://docs.snap.com/spectacles/about-spectacles-features/apis/internet-access
//   - https://developers.snap.com/spectacles/about-spectacles-features/apis/camera-module
//   - https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module

@component
export class ShelfSenseApp extends BaseScriptComponent {
    @input
    statusText: SceneObject;

    @input
    internetModule: InternetModule;

    @input
    backendUrl: string = "https://shelfsense-backend-o79b.onrender.com";

    private gestureModule: GestureModule = require("LensStudio:GestureModule");
    private cameraModule: any = require("LensStudio:CameraModule");

    private textComponent: any = null;

    private cameraTexture: any = null;
    private cameraProvider: any = null;

    private frameCount: number = 0;
    private lastFrameTs: number = 0;
    private pinchCount: number = 0;

    private backendStatus: "booting" | "probing" | "ok" | "down" = "booting";
    private backendDemoMode: boolean | null = null;
    // null = unknown, true = real Vision API wired, false = backend is running
    // in demo-OCR fallback (will still return verdicts, but labeled DEMO).
    private backendOcrReady: boolean | null = null;
    private backendError: string = "";
    private probeAttempt: number = 0;

    // Render free-tier can cold-start for up to ~30 sec. 6 * 5 sec = 30 sec budget.
    private static readonly MAX_PROBE_ATTEMPTS: number = 6;
    private static readonly PROBE_RETRY_SECONDS: number = 5;

    // Fallback OCR text for environments where we cannot get a real camera
    // frame (Lens Studio preview, camera still booting, encoding fails).
    // On real Spectacles the live frame is encoded and sent as `image_base64`,
    // and the backend OCRs it via Google Vision — that is the real product path.
    private static readonly DEMO_OCR_TEXT: string =
        "Sugar, high fructose corn syrup, wheat flour, partially hydrogenated soybean oil, salt, artificial flavors.";

    // Active demo profile the backend should evaluate against. Must match a key
    // in backend/src/demo/profiles.ts (e.g. "diabetic", "allergy", "budget").
    private activeProfileId: string = "diabetic";

    // Per-session cart/meal-plan continuity. Sent with every request.
    private sessionId: string = "spectacles-" + Math.floor(Math.random() * 1e9).toString();

    // State of the most recent in-flight or completed scan.
    private scanStatus: "idle" | "sending" | "ok" | "fail" = "idle";
    private scanVerdictLine: string = "";
    private scanError: string = "";

    private lastCapture: {
        pinchId: number;
        timestampSeconds: number;
        width: number;
        height: number;
    } | null = null;

    onAwake(): void {
        print("[ShelfSense] alive");

        if (!this.statusText) {
            print("[ShelfSense] ERROR: statusText is not assigned in the Inspector.");
            return;
        }

        this.textComponent =
            this.statusText.getComponent("Component.Text3D") ||
            this.statusText.getComponent("Component.Text");

        if (!this.textComponent) {
            print("[ShelfSense] ERROR: assigned SceneObject has no Text or Text3D component.");
            return;
        }

        this.refreshText("Booting...");

        // GestureModule.HandType may be undefined in Lens Studio's editor preview
        // (it's only populated on-device). Guard so editor reloads don't throw.
        if (
            typeof GestureModule !== "undefined" &&
            (GestureModule as any).HandType &&
            this.gestureModule
        ) {
            this.subscribePinch(GestureModule.HandType.Right, "R");
            this.subscribePinch(GestureModule.HandType.Left, "L");
        } else {
            print("[ShelfSense] GestureModule unavailable (editor preview?) - skipping pinch bindings");
        }

        this.createEvent("OnStartEvent").bind(() => {
            this.startCamera();
            this.probeBackend();
        });
    }

    private async probeBackend(): Promise<void> {
        if (!this.internetModule) {
            this.backendStatus = "down";
            this.backendError = "module not bound";
            this.refreshText(null);
            print("[ShelfSense] ERROR: internetModule is not assigned in the Inspector.");
            return;
        }

        this.probeAttempt += 1;
        this.backendStatus = "probing";
        this.refreshText(null);

        const url = this.backendUrl + "/health";
        print("[ShelfSense] probe attempt " + this.probeAttempt + " -> " + url);

        try {
            // NOTE: we use the (string, options) form of fetch. The `new Request(...)`
            // form throws `ReferenceError: 'Request' is not defined` in Lens Studio's
            // JS runtime (both Preview and some device builds). Per Snap's docs,
            // InternetModule.fetch(url: string | Request, options?: any) is valid.
            const resp = await this.internetModule.fetch(url, {
                method: "GET",
                headers: { "Accept": "application/json" },
            });
            print(
                "[ShelfSense] probe resp status=" + resp.status +
                " (attempt " + this.probeAttempt + ")"
            );
            if (resp.status !== 200) {
                this.backendError = "HTTP " + resp.status;
                this.scheduleProbeRetry();
                return;
            }
            const data: any = await resp.json();
            this.backendStatus = "ok";
            this.backendError = "";
            this.backendDemoMode = Boolean(data && data.demoMode);
            // /health includes ocrConfigured (added after the Vision wiring).
            // Older backends won't have it — leave the flag as unknown.
            if (data && typeof data.ocrConfigured === "boolean") {
                this.backendOcrReady = data.ocrConfigured;
            }
            print(
                "[ShelfSense] probe OK service=" + data.service +
                " demo=" + this.backendDemoMode +
                " ocr=" + this.backendOcrReady +
                " (attempt " + this.probeAttempt + ")"
            );
            this.refreshText(null);
        } catch (e) {
            const detail = ShelfSenseApp.describeError(e);
            this.backendError = detail;
            print("[ShelfSense] probe threw [" + detail + "] raw=" + String(e));
            this.scheduleProbeRetry();
        }
    }

    // Encoding budget: if the device takes longer than this, we abandon the
    // image path and fall back to the demo ingredients text so the user is
    // never left staring at "Scanning..." forever.
    private static readonly ENCODE_TIMEOUT_MS: number = 5000;

    // Wrap the callback-style Base64.encodeTextureAsync in a Promise so the
    // scan flow can `await` it. JPEG at low-quality — small enough to POST
    // cheaply on glasses Wi-Fi, still legible enough for label OCR.
    // A timeout guards against the async callback never firing.
    //
    // Docs: https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.Base64.html
    private encodeCameraFrameAsJpeg(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (typeof Base64 === "undefined" || typeof (Base64 as any).encodeTextureAsync !== "function") {
                reject(new Error("Base64.encodeTextureAsync unavailable"));
                return;
            }
            if (typeof CompressionQuality === "undefined" || typeof EncodingType === "undefined") {
                reject(new Error("CompressionQuality/EncodingType enums unavailable"));
                return;
            }

            let done = false;
            const timer = this.createEvent("DelayedCallbackEvent") as any;
            timer.bind(() => {
                if (done) return;
                done = true;
                reject(new Error("encode timeout after " + ShelfSenseApp.ENCODE_TIMEOUT_MS + "ms"));
            });
            timer.reset(ShelfSenseApp.ENCODE_TIMEOUT_MS / 1000);

            try {
                (Base64 as any).encodeTextureAsync(
                    this.cameraTexture,
                    (b64: string) => {
                        if (done) return;
                        done = true;
                        if (!b64) {
                            reject(new Error("empty base64 result"));
                            return;
                        }
                        resolve(b64);
                    },
                    () => {
                        if (done) return;
                        done = true;
                        reject(new Error("encodeTextureAsync onFailure"));
                    },
                    (CompressionQuality as any).LowQuality ??
                        (CompressionQuality as any).Low ??
                        (CompressionQuality as any).Medium,
                    (EncodingType as any).Jpg ??
                        (EncodingType as any).JPG ??
                        (EncodingType as any).JPEG,
                );
            } catch (e) {
                if (!done) {
                    done = true;
                    reject(e);
                }
            }
        });
    }

    // Extract the most informative error string possible from whatever Lens Studio
    // decides to throw. We want the AR label to show e.g. "TypeError: Failed to fetch"
    // rather than a vague "fetch err" that tells us nothing about the real cause.
    private static describeError(e: any): string {
        if (!e) return "unknown";
        if (typeof e === "string") return e;
        const name = e.name ? String(e.name) : "Error";
        const msg = e.message ? String(e.message) : String(e);
        return (name + ": " + msg).substring(0, 120);
    }

    private scheduleProbeRetry(): void {
        if (this.probeAttempt >= ShelfSenseApp.MAX_PROBE_ATTEMPTS) {
            this.backendStatus = "down";
            this.refreshText(null);
            print("[ShelfSense] probe gave up after " + this.probeAttempt + " attempts");
            return;
        }
        // Reflect the fact that we're still trying, with a countdown on the main line.
        this.backendStatus = "probing";
        this.refreshText(null);
        const delay = this.createEvent("DelayedCallbackEvent") as any;
        delay.bind(() => {
            this.probeBackend();
        });
        delay.reset(ShelfSenseApp.PROBE_RETRY_SECONDS);
    }

    private startCamera(): void {
        try {
            const req = CameraModule.createCameraRequest();
            req.cameraId = CameraModule.CameraId.Left_Color;
            req.imageSmallerDimension = 512;

            this.cameraTexture = this.cameraModule.requestCamera(req);
            this.cameraProvider = this.cameraTexture.control;

            this.cameraProvider.onNewFrame.add((frame: any) => {
                this.onNewFrame(frame);
            });

            print("[ShelfSense] camera requested (Left_Color, 512)");
            this.refreshText(null);
        } catch (e) {
            print("[ShelfSense] ERROR starting camera: " + e);
            this.refreshText("Camera error");
        }
    }

    private onNewFrame(frame: any): void {
        this.frameCount += 1;
        if (frame && typeof frame.timestampSeconds === "number") {
            this.lastFrameTs = frame.timestampSeconds;
        }
        if (this.frameCount % 60 === 0) {
            print("[ShelfSense] frames=" + this.frameCount + " lastTs=" + this.lastFrameTs.toFixed(2));
        }
    }

    private subscribePinch(hand: GestureModule.HandType, label: string): void {
        this.gestureModule.getPinchDownEvent(hand).add(() => {
            this.onPinch(label);
        });
    }

    private onPinch(hand: string): void {
        this.pinchCount += 1;

        // Guard: if a scan is already in-flight, ignore the new pinch instead
        // of racing two requests and stomping scanStatus. The user can re-pinch
        // once the verdict lands.
        if (this.scanStatus === "sending") {
            print("[ShelfSense] pinch " + hand + " #" + this.pinchCount + " ignored (scan in flight)");
            return;
        }

        if (!this.cameraProvider) {
            this.refreshText("Pinch #" + this.pinchCount + " (camera not ready)");
            print("[ShelfSense] pinch " + hand + " #" + this.pinchCount + " - camera not ready");
            return;
        }

        let width: number = 0;
        let height: number = 0;
        try {
            width = this.cameraProvider.getWidth();
            height = this.cameraProvider.getHeight();
        } catch (e) {
            print("[ShelfSense] pinch " + hand + " size read failed: " + ShelfSenseApp.describeError(e));
        }

        this.lastCapture = {
            pinchId: this.pinchCount,
            timestampSeconds: this.lastFrameTs,
            width: width,
            height: height,
        };

        print(
            "[ShelfSense] captured pinch #" + this.pinchCount +
            " hand=" + hand +
            " size=" + width + "x" + height +
            " ts=" + this.lastFrameTs.toFixed(2)
        );

        // Kick off the real scan against /api/analyze-label. We don't wait on
        // the /health probe — a successful scan is itself the proof of life.
        this.sendScan(hand);
    }

    // Main product flow: POST the current scan context to the backend and display
    // the verdict. This is the only place we talk to /api/analyze-label.
    private async sendScan(hand: string): Promise<void> {
        if (!this.internetModule) {
            this.scanStatus = "fail";
            this.scanError = "module not bound";
            this.refreshText(null);
            print("[ShelfSense] scan ABORT: internetModule not bound");
            return;
        }
        if (!this.lastCapture) {
            this.scanStatus = "fail";
            this.scanError = "no capture";
            this.refreshText(null);
            print("[ShelfSense] scan ABORT: no capture");
            return;
        }

        this.scanStatus = "sending";
        this.scanError = "";
        this.scanVerdictLine = "";
        this.refreshText(null);

        // Try to encode the current live camera frame as JPEG base64. This is
        // the REAL product-scan path: the backend will OCR this image via
        // Google Vision and run the analyzer on whatever text is on the label.
        // If the encode fails (Lens Studio preview, camera bug, etc.) we fall
        // back to DEMO_OCR_TEXT so the pipeline is still exercised.
        let imageBase64: string | null = null;
        let imageErr: string = "";
        if (this.cameraTexture) {
            try {
                imageBase64 = await this.encodeCameraFrameAsJpeg();
                print(
                    "[ShelfSense] encoded frame chars=" +
                    (imageBase64 ? imageBase64.length : 0)
                );
            } catch (e) {
                imageErr = ShelfSenseApp.describeError(e);
                print("[ShelfSense] encode fail: " + imageErr);
            }
        } else {
            imageErr = "no camera texture";
        }

        const url = this.backendUrl + "/api/analyze-label";
        const bodyObj: any = {
            session_id: this.sessionId,
            profile_id: this.activeProfileId,
            capture: {
                pinch_id: this.lastCapture.pinchId,
                hand: hand,
                width: this.lastCapture.width,
                height: this.lastCapture.height,
                frame_timestamp: this.lastCapture.timestampSeconds,
                image_source: imageBase64 ? "spectacles-camera" : "demo-fallback",
                encode_error: imageErr || undefined,
            },
        };
        if (imageBase64) {
            bodyObj.image_base64 = imageBase64;
        } else {
            bodyObj.ocr_text = ShelfSenseApp.DEMO_OCR_TEXT;
        }
        const body = JSON.stringify(bodyObj);

        print(
            "[ShelfSense] scan POST " + url +
            " bytes=" + body.length +
            " mode=" + (imageBase64 ? "image" : "demo-text") +
            " profile=" + this.activeProfileId +
            " pinch=" + this.lastCapture.pinchId
        );

        try {
            // String URL + options form. See probeBackend() for rationale.
            const resp = await this.internetModule.fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: body,
            });
            print("[ShelfSense] scan resp status=" + resp.status);
            if (resp.status !== 200) {
                // Surface the actual server-side error tag on the glasses. A
                // generic "HTTP 500" is useless to debug from the couch.
                let errBody = "";
                try { errBody = await resp.text(); } catch (_) { errBody = ""; }
                let errTag = "HTTP " + resp.status;
                try {
                    const parsed: any = JSON.parse(errBody);
                    if (parsed && parsed.error) errTag += " " + String(parsed.error);
                } catch (_) { /* keep default */ }
                this.scanStatus = "fail";
                this.scanError = errTag;
                print("[ShelfSense] scan non-200 body=" + errBody.substring(0, 200));
                this.refreshText(null);
                return;
            }
            const data: any = await resp.json();
            this.applyVerdict(data);
            // A successful scan implies the backend is reachable. Reflect it.
            this.backendStatus = "ok";
            this.backendError = "";
            this.refreshText(null);
        } catch (e) {
            const detail = ShelfSenseApp.describeError(e);
            this.scanStatus = "fail";
            this.scanError = detail;
            print("[ShelfSense] scan threw [" + detail + "] raw=" + String(e));
            this.refreshText(null);
        }
    }

    // Turn the backend analyze-label response into a compact AR line.
    // We follow the response shape defined in backend/src/schemas/analyze.ts.
    // `source === "demo-no-ocr"` means the backend substituted demo text
    // because the Vision API key isn't configured yet — we prefix the line
    // so the user understands the result is not from their real product.
    private applyVerdict(data: any): void {
        const verdict: string = data && data.verdict ? String(data.verdict) : "Unknown";
        const reason: string =
            data && data.reason ? String(data.reason) :
            data && Array.isArray(data.flags) && data.flags.length > 0 ? String(data.flags[0]) :
            "";
        const src: string = data && data.source ? String(data.source) : "heuristic";
        const isDemo = src !== "heuristic";
        // Only downgrade the OCR-ready flag here: source==="demo-no-ocr" is
        // conclusive proof the backend couldn't reach Vision. We must NOT
        // upgrade to true on source==="heuristic", because the heuristic path
        // also runs when the lens sent ocr_text fallback (e.g. encode failure
        // in preview) — in that case OCR readiness is still unknown, and the
        // authoritative answer is /health's ocrConfigured flag.
        if (src === "demo-no-ocr") {
            this.backendOcrReady = false;
        }
        const short = reason.length > 60 ? reason.substring(0, 57) + "..." : reason;
        this.scanStatus = "ok";
        const prefix = isDemo ? "[DEMO] " : "";
        this.scanVerdictLine = short
            ? prefix + verdict.toUpperCase() + " - " + short
            : prefix + verdict.toUpperCase();
        print(
            "[ShelfSense] verdict=" + verdict +
            " source=" + src +
            " reason=" + reason.substring(0, 120)
        );
    }

    // Composes the full 3-line status text.
    //   line 1: backend connection indicator + OCR readiness (from /health).
    //   line 2: camera state.
    //   line 3: scan state — either a one-shot event, or the most recent verdict.
    private refreshText(oneShotLine: string | null): void {
        if (!this.textComponent) return;

        let line1: string;
        if (this.backendStatus === "ok") {
            let ocrTag = "";
            if (this.backendOcrReady === true) ocrTag = " | OCR: ready";
            else if (this.backendOcrReady === false) ocrTag = " | OCR: demo-mode";
            line1 = "Backend: OK" + (this.backendDemoMode ? " (demo)" : "") + ocrTag;
        } else if (this.backendStatus === "probing") {
            line1 = "Backend: probing " + this.probeAttempt + "/" + ShelfSenseApp.MAX_PROBE_ATTEMPTS;
        } else if (this.backendStatus === "down") {
            line1 = this.backendError
                ? "Backend: down - " + this.backendError
                : "Backend: down";
        } else {
            line1 = "Backend: ...";
        }

        const cameraLine = this.cameraProvider ? "Camera: ready" : "Camera: booting";

        let scanLine: string;
        if (oneShotLine) {
            scanLine = oneShotLine;
        } else if (this.scanStatus === "sending") {
            scanLine = "Scanning #" + this.pinchCount + "...";
        } else if (this.scanStatus === "ok" && this.scanVerdictLine) {
            scanLine = this.scanVerdictLine;
        } else if (this.scanStatus === "fail") {
            scanLine = "Scan fail: " + (this.scanError || "unknown");
        } else {
            scanLine = "Pinch to scan";
        }

        this.textComponent.text = line1 + "\n" + cameraLine + "\n" + scanLine;
    }
}