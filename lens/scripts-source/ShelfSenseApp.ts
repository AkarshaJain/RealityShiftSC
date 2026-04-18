// ShelfSenseApp.ts
// Layer 4a — Lens talks to backend for the first time.
//
// What this proves:
//   - The Spectacles lens reaches our local Node backend over the LAN.
//   - `GET /health` returns JSON and we can parse it.
//   - The world-space text reports the connection state.
//
// On top of Layer 2b (pinch + live camera). Nothing in Layer 2 is removed.
//
// Requires (in Lens Studio):
//   1. Project Settings → "Experimental APIs" enabled.
//   2. An `InternetModule` asset created in the scene and dragged into the
//      Inspector slot `Internet Module` on this script.
//   3. The `Backend Url` field in the Inspector set to your PC's LAN address,
//      e.g. http://10.25.33.161:3000  (NOT localhost — the glasses are a
//      separate device on the Wi-Fi).
//   4. Spectacles on the same Wi-Fi as your PC.
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
    backendUrl: string = "http://10.25.33.161:3000";

    private gestureModule: GestureModule = require("LensStudio:GestureModule");
    private cameraModule: any = require("LensStudio:CameraModule");

    private textComponent: any = null;

    private cameraTexture: any = null;
    private cameraProvider: any = null;

    private frameCount: number = 0;
    private lastFrameTs: number = 0;
    private pinchCount: number = 0;

    private backendStatus: "booting" | "ok" | "down" = "booting";
    private backendDemoMode: boolean | null = null;

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
            this.refreshText("Internet module not bound");
            print("[ShelfSense] ERROR: internetModule is not assigned in the Inspector.");
            return;
        }
        const url = this.backendUrl + "/health";
        print("[ShelfSense] probing " + url);
        try {
            const req = new Request(url, { method: "GET" });
            const resp = await this.internetModule.fetch(req);
            if (resp.status !== 200) {
                this.backendStatus = "down";
                this.refreshText("Backend: HTTP " + resp.status);
                print("[ShelfSense] backend non-200: " + resp.status);
                return;
            }
            const data: any = await resp.json();
            this.backendStatus = "ok";
            this.backendDemoMode = Boolean(data && data.demoMode);
            print("[ShelfSense] backend ok service=" + data.service + " demo=" + this.backendDemoMode);
            this.refreshText(null);
        } catch (e) {
            this.backendStatus = "down";
            this.refreshText("Backend: unreachable");
            print("[ShelfSense] backend error: " + e);
        }
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
    private refreshText(oneShotLine: string | null): void {
        if (!this.textComponent) return;

        let line1: string;
        if (this.backendStatus === "ok") {
            line1 = "Backend: OK" + (this.backendDemoMode ? " (demo)" : "");
        } else if (this.backendStatus === "down") {
            line1 = "Backend: down";
        } else {
            line1 = "Backend: ...";
        }

        const cameraLine = this.cameraProvider ? "Camera: ready" : "Camera: booting";
        const action = oneShotLine ?? "Pinch to scan";

        this.textComponent.text = line1 + "\n" + cameraLine + "\n" + action;
    }
}
