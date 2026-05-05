# Standalone Index Architecture

`Index.html` is intended to remain directly runnable from local disk with no install step.

## Runtime Contract

- `Index.html` loads only local files.
- `vendor/three/three.min.js` provides the global `THREE` runtime.
- `standalone/index-standalone.js` is the single standalone app bundle consumed by the page.
- No npm resolution, dev server, CDN, or bundler is required at runtime.

## Source Of Truth

The standalone bundle is built from ordered source files in `src/standalone/index/`.

Files are concatenated in lexical order by `scripts/build-standalone-index.mjs`.

## Module Layout

- `00-core.js`
  Shared state, scene bootstrapping, UI cache, and low-level setup.
- `10-assets.js`
  Pose/animation storage, import/export, and payload normalization.
- `20-effects.js`
  Animation effect models, materials, VFX rigs, and effect playback helpers.
- `30-posing.js`
  Pose capture/application and transform-control driven posing behavior.
- `40-timeline.js`
  Keyframe editing, play state, clip ranges, and timeline pointer interactions.
- `50-scene-entities.js`
  Selection, characters, weapons, reference cubes, and entity lifecycle behavior.
- `60-runtime.js`
  Timeline rendering, animation ticking, and render-loop helpers.
- `99-start.js`
  Explicit startup entrypoint.

## Editing Guidance

- Prefer editing the `src/standalone/index/` source files, then regenerate `standalone/index-standalone.js`.
- Keep cross-module coupling narrow and function names explicit.
- When adding new features, place them in the nearest feature file first instead of growing `00-core.js`.
- If a feature becomes large, split it into a new numbered file rather than folding it into an unrelated section.
