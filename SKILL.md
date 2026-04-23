---
name: animateur
description: Work with the Animateur/Animator browser 3D animation toolset. Use when an agent needs to run, inspect, modify, test, or explain Fast Poser (`index.html`), Motion Ripper (`ripper.html`), Playground (`Playground.html`), Auto Rig Scene (`AutoRigScene.html`), bundled `Animations/*.animation.json` assets, shared browser libraries, animation/pose JSON interchange, MediaPipe capture, Three.js scenes, or GLB auto-rig export behavior.
---

# Animateur

## Start Here

Read `README.md` for complete user-facing workflows, then identify which page owns the requested behavior:

- `index.html`: Fast Poser, the main manual posing, scene staging, timeline, pose library, and animation library editor.
- `ripper.html`: Motion Ripper, the screen-share and MediaPipe pose-capture tool that saves Fast Poser-compatible animation JSON.
- `Playground.html`: runtime arena for testing bundled/imported clips, player actions, NPC interactions, and summon effects.
- `AutoRigScene.html`: auto-rig preview/export tool that turns compatible animation JSON plus generated cubes or imported meshes into skinned GLB exports.
- `Animations/`: bundled `.animation.json` samples used by Playground, Auto Rig Scene, and manual imports.
- `3D models/`: local model assets exposed by Auto Rig Scene.

This repo uses a small Vite build for deployment, but it still has no backend and no formal automated test runner.

## Run The App

Install dependencies once, then run the Vite dev server so fetches, CDN imports, screen sharing, and same-origin `localStorage` work correctly.

Useful commands:

```powershell
npm install
npm run dev
```

Open the exact page names:

- `http://localhost:PORT/`
- `http://localhost:PORT/ripper.html`
- `http://localhost:PORT/Playground.html`
- `http://localhost:PORT/AutoRigScene.html`

Use the same browser and origin when testing shared libraries. Fast Poser uses `fast-poser:pose-library` and `fast-poser:animation-library`; Motion Ripper and Auto Rig Scene read/write the animation library key.

## Technical Shape

Keep changes sympathetic to the existing structure:

- Use inline HTML, CSS, and JavaScript modules inside the owning `.html` file.
- Use existing Three.js patterns and import maps instead of adding a build system.
- Preserve CDN dependencies unless the task explicitly asks for dependency changes.
- Keep UI copy and controls consistent with each page's current style.
- Avoid large cross-page rewrites unless the shared asset contract or user request requires it.

Primary external dependencies:

- Three.js `0.160.0` through jsDelivr import maps.
- Tailwind CDN in Motion Ripper.
- MediaPipe Tasks Vision Pose Landmarker in Motion Ripper.
- Browser `localStorage`, file APIs, blob downloads, WebGL, screen capture, and canvas.

## Asset Contract

Preserve the shared JSON contract. Compatible assets use:

```json
{
  "format": "fast-poser-asset",
  "version": 1,
  "type": "animation"
}
```

Pose assets include:

- `name`
- `savedAt`
- `scene.characterCount`
- `scene.characterColors`
- `pose`

Animation assets include:

- `name`
- `savedAt`
- `scene.characterCount`
- `scene.characterColors`
- `playbackSpeed`
- `effects` or `null`
- `keyframes`

Each keyframe has `time` and `pose`. Joint entries use:

```json
{
  "position": [0, 2.6, 0],
  "quaternion": [0, 0, 0, 1]
}
```

Joint names follow `<JointName>_<CharacterIndex>`, such as `Hips_0`, `Spine_0`, `Left_Upper_Arm_0`, or `Right_Lower_Leg_1`. This suffix is how multi-character clips work.

Optional effect metadata is currently runtime-playable but not fully authorable in the UI. The known preset is `arcane-summon` with fields such as `targetCharacter`, `startTime`, `peakTime`, `endTime`, `radius`, `columnHeight`, and effect colors.

## Common Changes

When changing Fast Poser:

- Preserve `ASSET_FORMAT`, `ASSET_VERSION`, and `STORAGE_KEYS`.
- Keep animation interpolation compatible with existing keyframes.
- When adding new serialized fields, normalize missing values so old bundled assets still load.
- Confirm exported pose/animation JSON can be imported back into Fast Poser.

When changing Motion Ripper:

- Preserve output compatibility with Fast Poser animation assets.
- Keep MediaPipe failure states clear; offline use can fail because MediaPipe assets are network-loaded.
- Maintain root motion, smoothing, sample-rate, and color behavior unless the user asks to change capture semantics.

When changing Playground:

- Keep `ASSET_MANIFEST` aligned with files in `Animations/`.
- If adding a new action group, update grouping, trigger behavior, and motion scaling together.
- Verify single-character actions, two-character interactions, and summon effects still load.

When changing Auto Rig Scene:

- Keep bundled animation catalog entries aligned with `Animations/`.
- Keep `LOCAL_MODELS` aligned with files under `3D models/`.
- Preserve tolerant asset normalization; imported clips may omit poses for some joints or omit explicit character counts.
- Remember that non-skeletal `effects` metadata is preview/runtime data and is skipped for GLB export.

When adding or editing bundled animations:

- Keep filenames ending in `.animation.json`.
- Use the shared asset contract.
- Update `README.md` sample lists when samples change.
- Update `Playground.html` manifest/grouping and `AutoRigScene.html` bundled catalog when samples should auto-load.

## Validation

There is no automated suite. Validate in the browser according to the touched surface:

- Fast Poser: load `index.html`, add/select a character, record keyframes, play, save/export/import an animation, and check the timeline.
- Motion Ripper: load `ripper.html`, confirm MediaPipe initializes or shows a useful error, and verify captured/exported JSON imports into Fast Poser.
- Playground: load `Playground.html`, confirm bundled assets fetch, move with `WASD`, trigger `Space`, `H`, and `E`, and check console errors.
- Auto Rig Scene: load `AutoRigScene.html`, build a bundled clip, scrub/play it, toggle mesh/rig helpers, import a JSON clip if relevant, and test GLB export when export code changed.

For visual or interaction changes, use a real browser when possible. Check the JavaScript console because most regressions in this repo appear as runtime errors rather than build failures.

## Boundaries

Do not introduce a backend, package manager, build step, framework migration, or persistent project-file format unless the user explicitly asks. Prefer small, page-local edits that preserve the shared JSON format and keep all four tools interoperable.
