// ShelfSenseApp.ts
// Layer 4a — Lens talks to backend for the first time.
// Layer 6a — backend now lives on Render.com over public HTTPS.
//
// What this proves:
//   - The Spectacles lens reaches our deployed Node backend over the open internet.
//   - `GET /health` returns JSON and we can parse it.
//   - The world-space text reports the connection state.
//
// On top of Layer 2b (pinch + live camera). Nothing in Layer 2 is removed.
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

        this.subscribePinch(GestureModule.HandType.Right, "R");
        this.subscribePinch(GestureModule.HandType.Left, "L");

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
            const req = new Request(url, { method: "GET" });
            const resp = await this.internetModule.fetch(req);
            if (resp.status !== 200) {
                this.backendError = "HTTP " + resp.status;
                print("[ShelfSense] probe non-200: " + resp.status);
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
            this.backendError = "fetch err";
            print("[ShelfSense] probe threw: " + e);
            this.scheduleProbeRetry();
        }
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

        this.refreshText("Scan #" + this.pinchCount + " (" + hand + ") " + width + "x" + height);
    }

    // Single place that composes the full status text from component state.
    // Line 1 ALWAYS reflects backend state (and error reason) so pinch events can't hide it.
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
        const action = oneShotLine ?? "Pinch to scan";

        this.textComponent.text = line1 + "\n" + cameraLine + "\n" + action;
    }
}
