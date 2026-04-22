# Animateur SDK

Self-contained TypeScript SDK for authoring Animateur/Fast Poser pose and animation assets.

## Install And Test

```bash
npm install
npm test
```

## Example

```ts
import { Pose, Z_AXIS, newAnimation, solveMirroredArmsToTargets } from '@openclaw/animateur-sdk';

const clip = newAnimation('clap', {
  rig: 'r11_core',
  characterCount: 1,
});

const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });
pose.setAxisAngle('Left_Upper_Arm', Z_AXIS, 0.15);
solveMirroredArmsToTargets(
  pose,
  [0.10, 2.54, 0.34],
  [-0.10, 2.54, 0.34],
);

clip.addKeyframe(0, pose);
const animationJson = clip.toJSON();
```

## Surface

- Asset authoring: `Pose`, `Keyframe`, `PoseAsset`, `AnimationAsset`, `ArcaneSummonEffect`, `newPose()`, `newAnimation()`.
- Pose rotation authoring: `pose.getRotation()`, `pose.setQuaternion()`, `pose.setAxisAngle()`, `pose.setRotation()`, `pose.rotateLocal()`, `pose.rotateWorld()`.
- Rig helpers: `R11_CORE`, `AUTORIG_R18`, `buildDefaultPose()`, `normalizePose()`, `normalizeKeyframes()`, `buildWorldTransforms()`.
- IK helpers: `solveArmToTarget()`, `solveMirroredArmsToTargets()`.
- Quaternion helpers: `X_AXIS`, `Y_AXIS`, `Z_AXIS`, `quaternionFromAxisAngle()`, `composeQuaternions()`, `applyLocalRotation()`, `applyWorldRotation()`, `rotateVector()`, `slerpQuaternions()`.

## Rotation Authoring

```ts
import { Pose, X_AXIS, Z_AXIS, quaternionFromAxisAngle } from '@openclaw/animateur-sdk';

const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });

pose.setAxisAngle('Left_Upper_Arm', Z_AXIS, 0.2);
pose.setQuaternion('Left_Lower_Arm', quaternionFromAxisAngle(X_AXIS, -0.15));
pose.rotateLocal('Left_Upper_Arm', { axis: X_AXIS, angleRadians: 0.1 });
```

The package carries its own copy of generated rig metadata under `generated/` so it can build and test from this directory.
