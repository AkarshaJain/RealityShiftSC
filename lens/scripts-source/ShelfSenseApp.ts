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
    private backendError: string = "";
    private probeAttempt: number = 0;

    // Render free-tier can cold-start for up to ~30 sec. 6 * 5 sec = 30 sec budget.
    private static readonly MAX_PROBE_ATTEMPTS: number = 6;
    private static readonly PROBE_RETRY_SECONDS: number = 5;

    // Placeholder ingredient text used until Layer 5 (on-device image capture + OCR)
    // gives us the real label text. The backend accepts this and returns a real
    // verdict against the selected demo profile.
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
            const req = new Request(url, {
                method: "GET",
                headers: { "Accept": "application/json" },
            });
            const resp = await this.internetModule.fetch(req);
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
            print(
                "[ShelfSense] probe OK service=" + data.service +
                " demo=" + this.backendDemoMode +
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

        if (!this.cameraProvider) {
            this.refreshText("Pinch #" + this.pinchCount + " (camera not ready)");
            print("[ShelfSense] pinch " + hand + " #" + this.pinchCount + " - camera not ready");
            return;
        }

        const width: number = this.cameraProvider.getWidth();
        const height: number = this.cameraProvider.getHeight();

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

        const url = this.backendUrl + "/api/analyze-label";
        const bodyObj = {
            session_id: this.sessionId,
            profile_id: this.activeProfileId,
            ocr_text: ShelfSenseApp.DEMO_OCR_TEXT,
            capture: {
                pinch_id: this.lastCapture.pinchId,
                hand: hand,
                width: this.lastCapture.width,
                height: this.lastCapture.height,
                frame_timestamp: this.lastCapture.timestampSeconds,
            },
        };
        const body = JSON.stringify(bodyObj);

        print(
            "[ShelfSense] scan POST " + url +
            " len=" + body.length +
            " profile=" + this.activeProfileId +
            " pinch=" + this.lastCapture.pinchId
        );

        try {
            const req = new Request(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: body,
            });
            const resp = await this.internetModule.fetch(req);
            print("[ShelfSense] scan resp status=" + resp.status);
            if (resp.status !== 200) {
                // Try to read an error body for diagnostics; don't crash if unavailable.
                let errBody = "";
                try { errBody = await resp.text(); } catch (_) { errBody = ""; }
                this.scanStatus = "fail";
                this.scanError = "HTTP " + resp.status;
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
    private applyVerdict(data: any): void {
        const verdict: string = data && data.verdict ? String(data.verdict) : "Unknown";
        const reason: string =
            data && data.reason ? String(data.reason) :
            data && Array.isArray(data.flags) && data.flags.length > 0 ? String(data.flags[0]) :
            "";
        const short = reason.length > 64 ? reason.substring(0, 61) + "..." : reason;
        this.scanStatus = "ok";
        this.scanVerdictLine = short ? verdict.toUpperCase() + " - " + short : verdict.toUpperCase();
        print(
            "[ShelfSense] verdict=" + verdict +
            " reason=" + reason.substring(0, 120)
        );
    }

    // Composes the full 3-line status text.
    //   line 1: backend connection indicator (from /health probe)
    //   line 2: camera state
    //   line 3: scan state — either a one-shot event, or the most recent verdict.
    private refreshText(oneShotLine: string | null): void {
        if (!this.textComponent) return;

        let line1: string;
        if (this.backendStatus === "ok") {
            line1 = "Backend: OK" + (this.backendDemoMode ? " (demo)" : "");
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