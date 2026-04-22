import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Pose,
  X_AXIS,
  Z_AXIS,
  axisAngleQuaternion,
  buildWorldTransforms,
  composeQuaternions,
  newAnimation,
  quaternionFromAxisAngle,
  rotateVector,
  solveArmToTarget,
  solveMirroredArmsToTargets,
} from '../dist/index.js';

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function r11TipPosition(pose, side) {
  const world = buildWorldTransforms(pose, 'r11_core');
  const joint = world[`${side}_Lower_Arm`];
  return add(joint.position, rotateVector(joint.quaternion, [0, -0.9, 0]));
}

function autorigHandPose(pose, side) {
  const world = buildWorldTransforms(pose, 'autorig_r18');
  const joint = world[`${side}_Hand`];
  return [joint.position, joint.quaternion];
}

function sameRotation(a, b, tolerance = 1e-6) {
  const magnitudeA = Math.hypot(...a);
  const magnitudeB = Math.hypot(...b);
  const normalizedA = a.map(component => component / magnitudeA);
  const normalizedB = b.map(component => component / magnitudeB);
  const dot = normalizedA.reduce((total, component, index) => total + component * normalizedB[index], 0);
  return Math.abs(dot) >= 1 - tolerance;
}

test('r11_core arm IK reaches a target within tolerance', () => {
  const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });
  const target = [0.22, 2.68, 0.26];

  solveArmToTarget(pose, 'left', target);

  assert.ok(distance(r11TipPosition(pose, 'Left'), target) < 1e-5);
});

test('autorig_r18 reaches target orientation and tip offset', () => {
  const pose = Pose.default({ rigId: 'autorig_r18', characterCount: 1 });
  const target = [0.18, 2.48, 0.34];
  const tipOffset = [0, -0.18, 0.04];
  const targetOrientation = axisAngleQuaternion([0, 0, 1], 0.35);

  solveArmToTarget(pose, 'left', target, {
    orient: 'target',
    tipOffset,
    targetOrientation,
  });

  const [handPosition, handQuaternion] = autorigHandPose(pose, 'Left');
  const solvedContact = add(handPosition, rotateVector(handQuaternion, tipOffset));
  assert.ok(distance(solvedContact, target) < 1e-5);
  assert.ok(sameRotation(handQuaternion, targetOrientation));
});

test('mirrored R11 arm solve is symmetric', () => {
  const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });
  const leftTarget = [0.14, 2.56, 0.30];
  const rightTarget = [-0.14, 2.56, 0.30];

  solveMirroredArmsToTargets(pose, leftTarget, rightTarget);

  const leftTip = r11TipPosition(pose, 'Left');
  const rightTip = r11TipPosition(pose, 'Right');
  assert.ok(distance(leftTip, leftTarget) < 1e-5);
  assert.ok(distance(rightTip, rightTarget) < 1e-5);
  assert.equal(leftTip[0].toFixed(5), (-rightTip[0]).toFixed(5));
  assert.equal(leftTip[1].toFixed(5), rightTip[1].toFixed(5));
  assert.equal(leftTip[2].toFixed(5), rightTip[2].toFixed(5));
});

test('maintain orientation preserves hand local quaternion', () => {
  const pose = Pose.default({ rigId: 'autorig_r18', characterCount: 1 });
  pose.setRotation('Left_Hand', axisAngleQuaternion([1, 0, 0], 0.27));
  const before = pose.normalized().Left_Hand_0.quaternion;

  solveArmToTarget(pose, 'left', [0.26, 2.70, 0.18], { orient: 'maintain' });

  const after = pose.normalized().Left_Hand_0.quaternion;
  assert.ok(sameRotation(before, after));
});

test('baked IK output is deterministic', () => {
  function buildClipDict() {
    const clip = newAnimation('ik-clap', {
      rig: 'r11_core',
      characterCount: 1,
      savedAt: '2026-04-20T00:00:00.000Z',
    });
    for (const [time, leftTarget, rightTarget] of [
      [0.0, [0.48, 2.58, 0.16], [-0.48, 2.58, 0.16]],
      [0.12, [0.10, 2.54, 0.34], [-0.10, 2.54, 0.34]],
    ]) {
      const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });
      solveMirroredArmsToTargets(pose, leftTarget, rightTarget);
      clip.addKeyframe(time, pose);
    }
    return clip.toDict();
  }

  assert.deepEqual(buildClipDict(), buildClipDict());
});

test('json contract remains unchanged', () => {
  const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });
  solveArmToTarget(pose, 'left', [0.20, 2.66, 0.24]);

  const clip = newAnimation('ik-pose', { rig: 'r11_core', characterCount: 1 });
  clip.addKeyframe(0.0, pose);
  const asset = clip.toDict();

  assert.deepEqual(Object.keys(asset), [
    'format',
    'version',
    'type',
    'name',
    'savedAt',
    'scene',
    'playbackSpeed',
    'effects',
    'keyframes',
  ]);
  assert.deepEqual(Object.keys(asset.keyframes[0]), ['time', 'pose']);
  assert.deepEqual(Object.keys(asset.keyframes[0].pose.Left_Upper_Arm_0), ['position', 'quaternion']);
  assert.deepEqual(Object.keys(asset.keyframes[0].pose.Left_Lower_Arm_0), ['position', 'quaternion']);
});

test('non-linear keyframe easing round-trips through animation assets', () => {
  const startPose = Pose.default({ rigId: 'r11_core', characterCount: 1 });
  const endPose = startPose.copy();
  endPose.setRotation('Head', { axis: X_AXIS, angleRadians: 0.25 });

  const clip = newAnimation('easing-check', { rig: 'r11_core', characterCount: 1 });
  clip.addKeyframe(0.0, startPose, { easing: 'easeInOutSine' });
  clip.addKeyframe(0.4, endPose);
  const asset = clip.toDict();

  assert.equal(asset.keyframes[0].easing, 'easeInOutSine');
  assert.equal(asset.keyframes[1].easing, undefined);
});

test('camelCase authoring surface works for R11 assets', () => {
  const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });
  pose.setRotation('Left_Upper_Arm', null, { axis: [0, 0, 1], angleRadians: 0.2 });
  const asset = newAnimation('surface-check', {
    rig: 'r11_core',
    characterCount: 1,
    savedAt: '2026-04-20T00:00:00.000Z',
  });
  asset.addKeyframe(0, pose);

  assert.equal(asset.toDict().keyframes[0].pose.Left_Upper_Arm_0.quaternion[2].toFixed(8), '0.09983342');
});

test('axis-angle helper normalizes authoring axes', () => {
  const unitAxisRotation = quaternionFromAxisAngle(Z_AXIS, 0.35);
  const scaledAxisRotation = quaternionFromAxisAngle([0, 0, 5], 0.35);

  assert.ok(sameRotation(unitAxisRotation, scaledAxisRotation));
});

test('pose rotation authoring accepts explicit APIs and joint references', () => {
  const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });

  pose.setAxisAngle('Left_Upper_Arm', Z_AXIS, 0.2);
  pose.setRotation('Left_Lower_Arm_0', { axis: X_AXIS, angleRadians: 0.4 });

  assert.ok(sameRotation(
    pose.getRotation('Left_Upper_Arm'),
    quaternionFromAxisAngle(Z_AXIS, 0.2),
  ));
  assert.ok(sameRotation(
    pose.getRotation('Left_Lower_Arm'),
    quaternionFromAxisAngle(X_AXIS, 0.4),
  ));
});

test('pose can apply local and world rotation deltas', () => {
  const pose = Pose.default({ rigId: 'r11_core', characterCount: 1 });
  const xRotation = quaternionFromAxisAngle(X_AXIS, 0.2);
  const zRotation = quaternionFromAxisAngle(Z_AXIS, 0.3);

  pose.setQuaternion('Left_Upper_Arm', xRotation);
  pose.rotateLocal('Left_Upper_Arm', { axis: Z_AXIS, angleRadians: 0.3 });
  assert.ok(sameRotation(
    pose.getRotation('Left_Upper_Arm'),
    composeQuaternions(xRotation, zRotation),
  ));

  pose.setQuaternion('Right_Upper_Arm', xRotation);
  pose.rotateWorld('Right_Upper_Arm', { axis: Z_AXIS, angleRadians: 0.3 });
  assert.ok(sameRotation(
    pose.getRotation('Right_Upper_Arm'),
    composeQuaternions(zRotation, xRotation),
  ));
});
