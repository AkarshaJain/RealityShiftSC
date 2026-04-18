// ShelfSenseApp.ts
// Layer 2a — Pinch detection.
// Still no camera, still no backend. We only prove that:
//   - The script runs on Spectacles.
//   - A pinch from either hand is detected.
//   - The status text reflects the pinch count.
//
// Camera frame capture arrives in Layer 2b. Don't add it yet.

@component
export class ShelfSenseApp extends BaseScriptComponent {
    // Drag your StatusText (Text3D) SceneObject into this slot in the Inspector.
    @input
    statusText: SceneObject;

    private gestureModule: GestureModule = require("LensStudio:GestureModule");
    private textComponent: any = null;
    private pinchCount: number = 0;

    onAwake(): void {
        print("[ShelfSense] alive");

        if (!this.statusText) {
            print("[ShelfSense] ERROR: statusText is not assigned in the Inspector.");
            return;
        }

        // Text3D first (Spectacles-friendly), 2D Text as fallback.
        this.textComponent =
            this.statusText.getComponent("Component.Text3D") ||
            this.statusText.getComponent("Component.Text");

        if (!this.textComponent) {
            print("[ShelfSense] ERROR: assigned SceneObject has no Text or Text3D component.");
            return;
        }

        this.setText("ShelfSense: Ready\nPinch to scan");

        this.subscribePinch(GestureModule.HandType.Right, "R");
        this.subscribePinch(GestureModule.HandType.Left, "L");
    }

    private subscribePinch(hand: GestureModule.HandType, label: string): void {
        // getPinchDownEvent fires once per thumb+index pinch on the given hand.
        // See: https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module
        this.gestureModule.getPinchDownEvent(hand).add(() => {
            this.onPinch(label);
        });
    }

    private onPinch(hand: string): void {
        this.pinchCount += 1;
        print("[ShelfSense] pinch " + hand + " #" + this.pinchCount);
        this.setText(
            "Pinch " + hand + " #" + this.pinchCount + "\n(scanning — stub)"
        );
    }

    private setText(value: string): void {
        if (this.textComponent) {
            this.textComponent.text = value;
        }
    }
}
