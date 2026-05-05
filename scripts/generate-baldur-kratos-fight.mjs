import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTPUT = resolve('Animations', 'baldur-kratos-fight.animation.json');

const JOINTS = {
  Hips: [0, 2.6, 0],
  Spine: [0, 0.2, 0],
  Head: [0, 1.2, 0],
  Left_Upper_Arm: [0.6, 1.1, 0],
  Left_Lower_Arm: [0, -0.9, 0],
  Right_Upper_Arm: [-0.6, 1.1, 0],
  Right_Lower_Arm: [0, -0.9, 0],
  Left_Upper_Leg: [0.25, -0.2, 0],
  Left_Lower_Leg: [0, -1.1, 0],
  Right_Upper_Leg: [-0.25, -0.2, 0],
  Right_Lower_Leg: [0, -1.1, 0],
};

function deg(value) {
  return (value * Math.PI) / 180;
}

function quatFromEulerDeg(xDeg = 0, yDeg = 0, zDeg = 0) {
  const x = deg(xDeg) * 0.5;
  const y = deg(yDeg) * 0.5;
  const z = deg(zDeg) * 0.5;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);

  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}

function cloneTransform(position, quaternion) {
  return {
    position: [...position],
    quaternion: [...quaternion],
  };
}

function basePose() {
  const pose = {};
  for (const characterIndex of [0, 1]) {
    for (const [joint, position] of Object.entries(JOINTS)) {
      const isOpponentRoot = characterIndex === 1 && joint === 'Hips';
      pose[`${joint}_${characterIndex}`] = cloneTransform(
        position,
        isOpponentRoot ? quatFromEulerDeg(0, 180, 0) : [0, 0, 0, 1],
      );
    }
  }
  return pose;
}

function setJoint(pose, characterIndex, joint, { position, rotation }) {
  const key = `${joint}_${characterIndex}`;
  if (position) {
    pose[key].position = [...position];
  }
  if (rotation) {
    pose[key].quaternion = quatFromEulerDeg(...rotation);
  }
}

function makeFrame(time, buildPose, easing) {
  const pose = basePose();
  buildPose(pose);
  const frame = { time, pose };
  if (easing) {
    frame.easing = easing;
  }
  return frame;
}

const keyframes = [
  makeFrame(0.0, pose => {
    // Frame 1: Kratos is airborne and inverted after the launch.
    setJoint(pose, 0, 'Hips', { position: [0.18, 4.35, 0.1], rotation: [-20, 18, 124] });
    setJoint(pose, 0, 'Spine', { rotation: [-44, 8, 16] });
    setJoint(pose, 0, 'Head', { rotation: [38, 0, -8] });
    setJoint(pose, 0, 'Left_Upper_Arm', { rotation: [-30, 8, 118] });
    setJoint(pose, 0, 'Left_Lower_Arm', { rotation: [-58, 0, 0] });
    setJoint(pose, 0, 'Right_Upper_Arm', { rotation: [18, -12, -92] });
    setJoint(pose, 0, 'Right_Lower_Arm', { rotation: [-96, 0, 0] });
    setJoint(pose, 0, 'Left_Upper_Leg', { rotation: [74, 10, 24] });
    setJoint(pose, 0, 'Left_Lower_Leg', { rotation: [-76, 0, 0] });
    setJoint(pose, 0, 'Right_Upper_Leg', { rotation: [32, -12, -28] });
    setJoint(pose, 0, 'Right_Lower_Leg', { rotation: [54, 0, 0] });

    // Baldur under him, torso opening up to receive the impact.
    setJoint(pose, 1, 'Hips', { position: [0.48, 2.3, 0.92], rotation: [0, 168, 0] });
    setJoint(pose, 1, 'Spine', { rotation: [14, -18, -12] });
    setJoint(pose, 1, 'Head', { rotation: [-10, 12, 0] });
    setJoint(pose, 1, 'Left_Upper_Arm', { rotation: [-8, 0, 78] });
    setJoint(pose, 1, 'Left_Lower_Arm', { rotation: [-52, 0, 0] });
    setJoint(pose, 1, 'Right_Upper_Arm', { rotation: [-18, 0, -42] });
    setJoint(pose, 1, 'Right_Lower_Arm', { rotation: [-20, 0, 0] });
    setJoint(pose, 1, 'Left_Upper_Leg', { rotation: [10, 0, 8] });
    setJoint(pose, 1, 'Left_Lower_Leg', { rotation: [10, 0, 0] });
    setJoint(pose, 1, 'Right_Upper_Leg', { rotation: [-6, 0, -12] });
    setJoint(pose, 1, 'Right_Lower_Leg', { rotation: [18, 0, 0] });
  }, 'easeOutCubic'),
  makeFrame(0.16, pose => {
    // Frame 2: Kratos drives back in from the left while Baldur reaches up.
    setJoint(pose, 0, 'Hips', { position: [-0.58, 2.92, 0.34], rotation: [-10, 26, 58] });
    setJoint(pose, 0, 'Spine', { rotation: [-28, 10, 12] });
    setJoint(pose, 0, 'Head', { rotation: [18, 10, 4] });
    setJoint(pose, 0, 'Left_Upper_Arm', { rotation: [-16, 18, 46] });
    setJoint(pose, 0, 'Left_Lower_Arm', { rotation: [-54, 0, 0] });
    setJoint(pose, 0, 'Right_Upper_Arm', { rotation: [-8, -16, -18] });
    setJoint(pose, 0, 'Right_Lower_Arm', { rotation: [-36, 0, 0] });
    setJoint(pose, 0, 'Left_Upper_Leg', { rotation: [28, 4, 96] });
    setJoint(pose, 0, 'Left_Lower_Leg', { rotation: [-8, 0, 0] });
    setJoint(pose, 0, 'Right_Upper_Leg', { rotation: [82, -10, -18] });
    setJoint(pose, 0, 'Right_Lower_Leg', { rotation: [-68, 0, 0] });

    setJoint(pose, 1, 'Hips', { position: [0.34, 2.18, 0.72], rotation: [4, 162, 8] });
    setJoint(pose, 1, 'Spine', { rotation: [28, -10, -34] });
    setJoint(pose, 1, 'Head', { rotation: [-8, 22, 4] });
    setJoint(pose, 1, 'Left_Upper_Arm', { rotation: [-12, 0, 118] });
    setJoint(pose, 1, 'Left_Lower_Arm', { rotation: [-38, 0, 0] });
    setJoint(pose, 1, 'Right_Upper_Arm', { rotation: [0, 12, -70] });
    setJoint(pose, 1, 'Right_Lower_Arm', { rotation: [-12, 0, 0] });
    setJoint(pose, 1, 'Left_Upper_Leg', { rotation: [20, 0, 12] });
    setJoint(pose, 1, 'Left_Lower_Leg', { rotation: [12, 0, 0] });
    setJoint(pose, 1, 'Right_Upper_Leg', { rotation: [4, 0, -18] });
    setJoint(pose, 1, 'Right_Lower_Leg', { rotation: [22, 0, 0] });
  }, 'easeInOutCubic'),
  makeFrame(0.3, pose => {
    // Frame 3: Kratos crashes in close and drives through Baldur's torso.
    setJoint(pose, 0, 'Hips', { position: [0.02, 2.5, 0.16], rotation: [2, 38, 10] });
    setJoint(pose, 0, 'Spine', { rotation: [16, 18, -6] });
    setJoint(pose, 0, 'Head', { rotation: [-8, -6, 0] });
    setJoint(pose, 0, 'Left_Upper_Arm', { rotation: [18, 26, 54] });
    setJoint(pose, 0, 'Left_Lower_Arm', { rotation: [-102, 0, 0] });
    setJoint(pose, 0, 'Right_Upper_Arm', { rotation: [26, -24, -54] });
    setJoint(pose, 0, 'Right_Lower_Arm', { rotation: [-96, 0, 0] });
    setJoint(pose, 0, 'Left_Upper_Leg', { rotation: [-14, 0, 10] });
    setJoint(pose, 0, 'Left_Lower_Leg', { rotation: [28, 0, 0] });
    setJoint(pose, 0, 'Right_Upper_Leg', { rotation: [18, 0, -8] });
    setJoint(pose, 0, 'Right_Lower_Leg', { rotation: [22, 0, 0] });

    setJoint(pose, 1, 'Hips', { position: [0.24, 2.4, 0.54], rotation: [0, 154, 8] });
    setJoint(pose, 1, 'Spine', { rotation: [-20, -12, 42] });
    setJoint(pose, 1, 'Head', { rotation: [22, -26, 10] });
    setJoint(pose, 1, 'Left_Upper_Arm', { rotation: [10, -10, 20] });
    setJoint(pose, 1, 'Left_Lower_Arm', { rotation: [-58, 0, 0] });
    setJoint(pose, 1, 'Right_Upper_Arm', { rotation: [4, 18, -104] });
    setJoint(pose, 1, 'Right_Lower_Arm', { rotation: [-22, 0, 0] });
    setJoint(pose, 1, 'Left_Upper_Leg', { rotation: [10, 0, 8] });
    setJoint(pose, 1, 'Left_Lower_Leg', { rotation: [16, 0, 0] });
    setJoint(pose, 1, 'Right_Upper_Leg', { rotation: [-24, 0, -18] });
    setJoint(pose, 1, 'Right_Lower_Leg', { rotation: [38, 0, 0] });
  }, 'easeOutCubic'),
  makeFrame(0.48, pose => {
    // Frame 4: Baldur whips backward and down while Kratos regains his base.
    setJoint(pose, 0, 'Hips', { position: [-0.08, 2.54, -0.04], rotation: [0, 22, 0] });
    setJoint(pose, 0, 'Spine', { rotation: [6, 4, 0] });
    setJoint(pose, 0, 'Head', { rotation: [-4, -8, 0] });
    setJoint(pose, 0, 'Left_Upper_Arm', { rotation: [18, 10, 18] });
    setJoint(pose, 0, 'Left_Lower_Arm', { rotation: [-26, 0, 0] });
    setJoint(pose, 0, 'Right_Upper_Arm', { rotation: [6, -12, -26] });
    setJoint(pose, 0, 'Right_Lower_Arm', { rotation: [-14, 0, 0] });
    setJoint(pose, 0, 'Left_Upper_Leg', { rotation: [8, 0, 6] });
    setJoint(pose, 0, 'Left_Lower_Leg', { rotation: [12, 0, 0] });
    setJoint(pose, 0, 'Right_Upper_Leg', { rotation: [2, 0, -6] });
    setJoint(pose, 0, 'Right_Lower_Leg', { rotation: [10, 0, 0] });

    setJoint(pose, 1, 'Hips', { position: [0.58, 1.82, 0.18], rotation: [-34, 160, -56] });
    setJoint(pose, 1, 'Spine', { rotation: [-38, 8, 28] });
    setJoint(pose, 1, 'Head', { rotation: [56, -6, -12] });
    setJoint(pose, 1, 'Left_Upper_Arm', { rotation: [6, 0, 132] });
    setJoint(pose, 1, 'Left_Lower_Arm', { rotation: [-18, 0, 0] });
    setJoint(pose, 1, 'Right_Upper_Arm', { rotation: [12, 8, -78] });
    setJoint(pose, 1, 'Right_Lower_Arm', { rotation: [-24, 0, 0] });
    setJoint(pose, 1, 'Left_Upper_Leg', { rotation: [58, 0, 12] });
    setJoint(pose, 1, 'Left_Lower_Leg', { rotation: [-66, 0, 0] });
    setJoint(pose, 1, 'Right_Upper_Leg', { rotation: [18, 0, -44] });
    setJoint(pose, 1, 'Right_Lower_Leg', { rotation: [26, 0, 0] });
  }),
];

const asset = {
  format: 'fast-poser-asset',
  version: 1,
  type: 'animation',
  name: 'Baldur Kratos Fight',
  savedAt: new Date().toISOString(),
  scene: {
    characterCount: 2,
    characterColors: ['#d9ddd7', '#d86f61'],
  },
  playbackSpeed: 1.9,
  effects: null,
  keyframes,
};

writeFileSync(OUTPUT, `${JSON.stringify(asset, null, 2)}\n`, 'utf8');
console.log(`Wrote ${OUTPUT}`);
