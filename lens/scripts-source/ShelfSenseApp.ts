// ShelfSenseApp.ts
// Layer 2b — Live camera frames + capture on pinch.
//
// What this proves:
//   1. The lens subscribes to the real Spectacles world-facing camera.
//   2. Live frames are flowing (onNewFrame fires continuously).
//   3. On pinch, we sample the *current* live frame (timestamp + dimensions)
//      and stash a reference for Layer 4 (send to backend).
//
// Docs we are relying on (not guessing):
//   - https://developers.snap.com/spectacles/about-spectacles-features/apis/camera-module
//   - https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.CameraFrame.html
//   - https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.CameraTextureProvider.html
//   - https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module
//
// IMPORTANT: createCameraRequest() MUST be called on OnStartEvent, not onAwake.

@component
export class ShelfSenseApp extends BaseScriptComponent {
    @input
    statusText: SceneObject;

    private gestureModule: GestureModule = require("LensStudio:GestureModule");
    private cameraModule: any = require("LensStudio:CameraModule");

    private textComponent: any = null;

    private cameraTexture: any = null;
    private cameraProvider: any = null;

    private frameCount: number = 0;
    private lastFrameTs: number = 0;
    private pinchCount: number = 0;

    // A snapshot of the most recent frame — Layer 4 will send this to the backend.
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

        this.setText("ShelfSense: Booting camera...");

        // Pinch is safe to wire on Awake.
        this.subscribePinch(GestureModule.HandType.Right, "R");
        this.subscribePinch(GestureModule.HandType.Left, "L");

        // Camera request MUST go on OnStartEvent per the docs.
        this.createEvent("OnStartEvent").bind(() => {
            this.startCamera();
        });
    }

    private startCamera(): void {
        try {
            const req = CameraModule.createCameraRequest();
            req.cameraId = CameraModule.CameraId.Left_Color;
            // Keep frames modest — fast to process and fast to upload later.
            req.imageSmallerDimension = 512;

            this.cameraTexture = this.cameraModule.requestCamera(req);
            this.cameraProvider = this.cameraTexture.control;

            this.cameraProvider.onNewFrame.add((frame: any) => {
                this.onNewFrame(frame);
            });

            this.setText("Camera ready.\nPinch to scan");
            print("[ShelfSense] camera requested (Left_Color, 512)");
        } catch (e) {
            print("[ShelfSense] ERROR starting camera: " + e);
            this.setText("Camera error.\nSee Logger.");
        }
    }

    private onNewFrame(frame: any): void {
        this.frameCount += 1;
        if (frame && typeof frame.timestampSeconds === "number") {
            this.lastFrameTs = frame.timestampSeconds;
        }
        // Every ~60 frames (~1s @ 60fps), heartbeat the Logger so we can see it's alive
        // without spamming. Do NOT update the text every frame — that's expensive.
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
            this.setText("Pinch " + hand + " #" + this.pinchCount + "\n(camera not ready)");
            print("[ShelfSense] pinch " + hand + " #" + this.pinchCount + " — camera not ready");
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
            " ts=" + this.lastFrameTs.toFixed(2) +
            " totalFrames=" + this.frameCount
        );

        this.setText(
            "Scan #" + this.pinchCount + " (" + hand + ")\n" +
            width + "x" + height + " @ " + this.lastFrameTs.toFixed(1) + "s"
        );
    }

    private setText(value: string): void {
        if (this.textComponent) {
            this.textComponent.text = value;
        }
    }
}
