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

---

## Layer 2a — Pinch detection

Goal: detect a pinch on Spectacles and update the status text. No camera yet.

### 2a.1  Update the script

1. The repo's `lens/scripts-source/ShelfSenseApp.ts` has been updated.
2. Open that file and copy its entire contents.
3. In Lens Studio, open your `ShelfSenseApp` asset (double-click it in the
   Asset Browser) and paste the new contents over the old.
4. **Ctrl+S** to save. The Logger should show:
   `TypeScript compilation succeeded!`
   If it shows errors, the most common cause is a stale file — select all,
   delete, paste again.

### 2a.2  No scene changes needed

Good news: the `StatusText` SceneObject and the Script component you wired
in Layer 1 are still exactly what this step needs. Nothing to rewire.

### 2a.3  Test pinch in the Preview panel

Lens Studio 5.x Preview can simulate Spectacles hand input.

1. Press **▶ Preview Lens**. The status text should read:
   `ShelfSense: Ready` / `Pinch to scan` (two lines).
2. At the bottom-right of the Preview panel there is a small **hand icon**
   (Hand Tracking simulation). Click it to open hand-sim options, or click
   directly on the hand preview cursor in the preview area to trigger a pinch.
   - If you don't see a hand simulator, skip to 2a.4 and test on hardware.

### 2a.4  Test on real Spectacles (the most reliable path)

1. Put on the Spectacles.
2. Look at the status text floating in front of you.
3. Hold your hand up in view and **pinch** (thumb tip to index tip).
4. Each pinch should:
   - change the text to `Pinch R #1` (or `Pinch L #1`) / `(scanning — stub)`
   - increment the counter on every subsequent pinch
   - print `[ShelfSense] pinch R #N` in the Logger

### Success criteria (2a)

- [ ] `TypeScript compilation succeeded!` in Logger after paste.
- [ ] In Preview or on Spectacles, status text initially shows
      `ShelfSense: Ready / Pinch to scan`.
- [ ] Pinching increments the counter in the text and logs `[ShelfSense] pinch ...`.
- [ ] Both hands work (optional — left or right is fine for Layer 2a).

### Common failures

| Symptom | Fix |
|---|---|
| Logger: `Cannot find name 'GestureModule'` | You pasted the old Layer 1 file. Re-copy `ShelfSenseApp.ts` from `lens/scripts-source/`. |
| No errors, but pinch doesn't register | Lens Studio Preview hand-sim wasn't active. Test on hardware; or click the hand preview in the Preview panel to fire a pinch. |
| Text never changed from `ShelfSense: Ready` | Script didn't compile — check Logger for red errors, fix, save. |

When the counter increments on pinch, stop and tell me — we move to Layer 2b (real camera frames).

---

## Layer 2b — Live camera frames + capture on pinch

Goal:
- Subscribe to the real Spectacles world-facing camera (`Left_Color`).
- Prove frames are flowing.
- On pinch, snapshot the current live frame's dimensions + timestamp and log it.

No backend yet. No image upload yet. That is Layer 4.

### 2b.1  Paste the updated script

1. Open `lens/scripts-source/ShelfSenseApp.ts`, copy all.
2. In Lens Studio, open your `ShelfSenseApp` asset, select all, delete, paste, **Ctrl+S**.
3. Logger must show: `TypeScript compilation succeeded!`

### 2b.2  Camera permission — first run only

The first time a lens with `CameraModule` is pushed to Spectacles (or run in
Preview with camera simulation), Lens Studio / Spectacles may prompt for
**camera access**. Approve it. If you don't see a prompt, that's fine — it
means the project already has camera permission from the template.

You generally do **not** need to touch Project Settings — `CameraModule` is
granted by default in the Spectacles project template. If you hit a privacy
error at runtime, tell me and we'll enable it manually.

### 2b.3  Test in Preview

1. Press **▶ Preview Lens**.
2. Expected text sequence (watch the Preview panel):
   - `ShelfSense: Booting camera...`  (for a split second)
   - `Camera ready.` / `Pinch to scan`
3. Watch the Logger — every ~1 second you should see a heartbeat:
   `[ShelfSense] frames=60 lastTs=...`
   `[ShelfSense] frames=120 lastTs=...`
4. If Preview's camera simulation isn't providing frames, the heartbeat will
   not appear. That's a Preview limitation, **not a code bug** — go to 2b.4.

### 2b.4  Test on Spectacles (the real test)

1. **Device → Send to Spectacles**.
2. Put them on. You should see `Camera ready. / Pinch to scan`.
3. Look at any real object (a bottle, a cereal box — anything).
4. **Pinch**. The text should update to something like:
   `Scan #1 (R)`
   `512x384 @ 12.3s`
5. Each subsequent pinch updates the numbers.

### Success criteria (2b)

- [ ] `TypeScript compilation succeeded!` in Logger after paste.
- [ ] Text transitions: `Booting camera...` → `Camera ready.` within 1–2 s.
- [ ] Logger shows periodic `frames=N lastTs=...` heartbeats (on hardware or
      if Preview has camera sim enabled).
- [ ] On pinch, Logger shows `captured pinch #N ... size=WxH ts=...`.
- [ ] The status text shows scan count, dimensions, and timestamp.

### Common failures

| Symptom | Cause | Fix |
|---|---|---|
| Text stuck on `Booting camera...` | `OnStartEvent` never fired, or `createCameraRequest` threw | Check Logger for `ERROR starting camera:` and paste it to me |
| `Camera error. See Logger.` text | Exception in `startCamera` | Read the printed error — often a privacy/permission issue |
| `(camera not ready)` on pinch | You pinched before `OnStartEvent` completed | Wait 1–2 s after text says `Camera ready.`, then pinch |
| Compile error `createEvent is not a function` | Paste incomplete | Re-paste the whole file |
| `imageSmallerDimension` complaint | Your Lens Studio is older than 5.x | You have 5.15 — shouldn't happen; remove that one line if it does |

When pinch produces a `Scan #N / WxH @ Ts` line on real Spectacles, stop and tell me —
we move to Layer 3 (backend) so we have somewhere for Layer 4 to actually send this frame.
