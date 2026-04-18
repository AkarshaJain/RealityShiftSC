# Lens — Spectacles project for ShelfSense

The actual Lens Studio project (scene file, assets, packages) is created
and managed **by Lens Studio itself**. This folder is where you save it.

The file `scripts-source/ShelfSenseApp.ts` is the git-tracked source of truth
for our TypeScript. You copy its contents into Lens Studio.

---

## Layer 1 — Proof of life on Spectacles

### 1.1  Create the Lens Studio project

1. Open **Lens Studio 5.15.4**.
2. Go to **File → New Project**.
3. In the template picker, choose **Spectacles → "Spectacles Blank"**
   (the blank Spectacles template, not an SIK sample).
   - If you only see an SIK template, pick **"Spectacles Interaction Kit"** —
     it still works; we will just ignore the extra SIK objects in Layer 1.
4. Click **Create**.
5. **File → Save Project As…** and save into:
   `d:\RealityShift SC\lens\ShelfSense\`
   - Lens Studio will create subfolders (`Assets/`, `Packages/`, `Cache/`, etc.) here.
   - The `Cache/` subfolder is git-ignored automatically.

### 1.2  Add the ShelfSenseApp script

1. In Lens Studio, open the **Asset Browser** panel (bottom).
2. Right-click in the Asset Browser → **New → TypeScript File**.
3. Name it exactly: `ShelfSenseApp`
4. Double-click the new file to open the built-in code editor
   (or right-click → **Open in External Editor** to use VS Code).
5. **Delete all default content** in that file.
6. Open `lens/scripts-source/ShelfSenseApp.ts` from this repo, copy its contents,
   and paste into the Lens Studio editor.
7. **Save** (Ctrl+S). Lens Studio will auto-compile the script and show any
   errors in the Logger panel. You should see no errors.

### 1.3  Add a Text object and attach the script

> Lens Studio 5.x does **not** use right-click → New → Text. You use the **+** button.

1. Find the **Objects panel** (left side — it may also be labeled "Scene Hierarchy").
2. At the top of that panel click the **`+`** button.
3. In the picker that opens, choose **Text3D**.
   - This adds a world-space 3D text SceneObject. A default text like "Text" will appear in the Preview panel floating in front of the camera.
   - (If you don't see `Text3D`, type `text` in the picker's search box — Lens Studio 5.15 lists it under the text category. Avoid **Screen Text** for now; it needs extra screen-transform setup.)
4. In the Objects panel, rename the new object to `StatusText` (double-click its name, or F2).
5. With `StatusText` selected, in the **Inspector** panel (right):
   - Under **Transform → Position**, set `(0, 0, -60)`
     (60 cm in front of the camera — visible in the preview).
   - Under the **Text3D** component, set **Size** to around `4` for readability
     (Text3D uses scene units, not pixel font size — `4` is a decent starting value; you can tune later).
6. Still in the Inspector, scroll to the bottom → click **+ Add Component → Script**.
7. A Script component appears. In its **Script Asset** slot, drag the `ShelfSenseApp` asset from the Asset Browser.
8. A field named **Status Text** now appears on the Script component.
9. Drag the `StatusText` SceneObject from the Objects panel into that **Status Text** slot.

### 1.4  Verify in the Preview panel

1. Press the **▶ Preview** button (top of the Preview panel).
2. You should see the text change from `Text` to:
   **`ShelfSense: Ready`**
3. Open the **Logger** panel (bottom). You should see a line:
   **`[ShelfSense] alive`**

### 1.5  Verify on real Spectacles

1. Connect Spectacles via Lens Studio **Device → Send to Spectacles**
   (requires Spectacles to be paired and on the same Wi-Fi as your PC).
2. Put on the glasses. You should see `ShelfSense: Ready` floating in view.

---

## Success criteria for Layer 1

- [ ] Lens Studio shows `ShelfSense: Ready` in the Preview panel.
- [ ] The Logger prints `[ShelfSense] alive`.
- [ ] On hardware, the text is visible through Spectacles.
- [ ] No red errors in the Logger.

## What to watch for (common failures)

- **"Text component not set"** in Logger → you forgot step 1.3.7 (dragging
  `StatusText` into the Status Text slot).
- **Script compile error** → make sure you copied the entire file and deleted
  the default template content first.
- **Text not visible on device** → check the text's Position. If it's behind
  you or too far, move it to `(0, 0, -60)` in world space.

When all four success boxes tick, stop and tell me — we move to Layer 2.
