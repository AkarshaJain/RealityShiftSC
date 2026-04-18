// ShelfSenseApp.ts
// Layer 1 — Proof of life.
// Minimal Lens Studio 5.x component for Spectacles.
// Only responsibility: show "ShelfSense: Ready" on a Text SceneObject
// and print "[ShelfSense] alive" to the Logger.
//
// No camera. No backend. No AI yet. That's the point of Layer 1.

@component
export class ShelfSenseApp extends BaseScriptComponent {
    // Drag a SceneObject that has a Text component into this slot
    // from the Inspector. (See lens/README.md step 1.3.7.)
    @input
    statusText: SceneObject;

    onAwake(): void {
        print("[ShelfSense] alive");

        if (!this.statusText) {
            print("[ShelfSense] ERROR: statusText is not assigned in the Inspector.");
            return;
        }

        // Try Text3D first (world-space text, what we want on Spectacles),
        // then fall back to 2D Text if the user picked Screen Text instead.
        let textComponent: any =
            this.statusText.getComponent("Component.Text3D") ||
            this.statusText.getComponent("Component.Text");

        if (!textComponent) {
            print("[ShelfSense] ERROR: assigned SceneObject has no Text or Text3D component.");
            return;
        }

        textComponent.text = "ShelfSense: Ready";
    }
}
