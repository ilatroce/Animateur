import { AssetValidationError, Pose, buildWorldTransforms, getJointName, getRig } from './authoring.js';
import {
  addVectors as add,
  canonicalizeQuaternion,
  conjugateQuaternion as conjugate,
  crossVectors as cross,
  dotVectors as dot,
  multiplyQuaternions,
  normalizeQuaternion,
  normalizeVector as normalize,
  readQuaternion,
  readVector3,
  rotateVector,
  scaleVector as scale,
  subtractVectors as subtract,
  vectorLength as length,
} from './math.js';
import type { Quaternion, SerializedPose, Vector3 } from './types.js';

type ArmSide = 'left' | 'right';
type OrientationMode = 'maintain' | 'target';

const EPSILON = 1e-8;

interface ArmChainSpec {
  rigId: string;
  side: ArmSide;
  shoulderJoint: string | null;
  rootJoint: string;
  midJoint: string;
  endJoint: string | null;
  defaultTipOffset: Vector3;
  defaultPoleAxis: Vector3;
  localSideAxis: Vector3;
}

export interface SolveArmToTargetOptions {
  characterIndex?: number;
  pole?: Iterable<number> | null;
  tipOffset?: Iterable<number> | null;
  orient?: OrientationMode;
  targetOrientation?: Iterable<number> | null;
}

export interface SolveMirroredArmsToTargetsOptions {
  characterIndex?: number;
  leftPole?: Iterable<number> | null;
  rightPole?: Iterable<number> | null;
  leftTipOffset?: Iterable<number> | null;
  rightTipOffset?: Iterable<number> | null;
  orient?: OrientationMode;
  leftTargetOrientation?: Iterable<number> | null;
  rightTargetOrientation?: Iterable<number> | null;
}

const CHAIN_SPECS = new Map<string, ArmChainSpec>([
  ['r11_core:left', {
    rigId: 'r11_core',
    side: 'left',
    shoulderJoint: null,
    rootJoint: 'Left_Upper_Arm',
    midJoint: 'Left_Lower_Arm',
    endJoint: null,
    defaultTipOffset: [0, -0.9, 0],
    defaultPoleAxis: [1, 0, 0],
    localSideAxis: [1, 0, 0],
  }],
  ['r11_core:right', {
    rigId: 'r11_core',
    side: 'right',
    shoulderJoint: null,
    rootJoint: 'Right_Upper_Arm',
    midJoint: 'Right_Lower_Arm',
    endJoint: null,
    defaultTipOffset: [0, -0.9, 0],
    defaultPoleAxis: [-1, 0, 0],
    localSideAxis: [-1, 0, 0],
  }],
  ['autorig_r18:left', {
    rigId: 'autorig_r18',
    side: 'left',
    shoulderJoint: 'Left_Shoulder',
    rootJoint: 'Left_Upper_Arm',
    midJoint: 'Left_Lower_Arm',
    endJoint: 'Left_Hand',
    defaultTipOffset: [0, -0.88, 0.02],
    defaultPoleAxis: [1, 0, 0],
    localSideAxis: [1, 0, 0],
  }],
  ['autorig_r18:right', {
    rigId: 'autorig_r18',
    side: 'right',
    shoulderJoint: 'Right_Shoulder',
    rootJoint: 'Right_Upper_Arm',
    midJoint: 'Right_Lower_Arm',
    endJoint: 'Right_Hand',
    defaultTipOffset: [0, -0.88, 0.02],
    defaultPoleAxis: [-1, 0, 0],
    localSideAxis: [-1, 0, 0],
  }],
]);

export function solveArmToTarget(
  pose: Pose,
  side: ArmSide | string,
  target: Iterable<number>,
  options: SolveArmToTargetOptions = {},
): Pose {
  const resolvedSide = normalizeSide(side);
  const resolvedOrient = normalizeOrient(options.orient ?? 'maintain');
  const characterIndex = Math.trunc(options.characterIndex ?? 0);
  if (characterIndex < 0) {
    throw new AssetValidationError('characterIndex must be >= 0.');
  }

  const chain = CHAIN_SPECS.get(`${pose.rigId}:${resolvedSide}`);
  if (!chain) {
    throw new AssetValidationError(`Rig "${pose.rigId}" does not support arm IK authoring.`);
  }

  pose.characterCount = Math.max(pose.characterCount, characterIndex + 1);
  const rig = getRig(pose.rigId);
  const jointSpecs = Object.fromEntries(rig.joints.map(joint => [joint.baseName, joint]));
  const targetPosition = parseVector3(target, 'target');
  const tipOffset = resolveTipOffset(chain, options.tipOffset ?? null, resolvedOrient);

  let effectorTarget: Vector3;
  let targetOrientationQuaternion: Quaternion | null;
  if (chain.endJoint === null) {
    if (resolvedOrient !== 'maintain') {
      throw new AssetValidationError(`Rig "${pose.rigId}" arm IK does not support hand orientation targeting.`);
    }
    if (options.targetOrientation) {
      throw new AssetValidationError('targetOrientation is only valid on rigs with hand joints.');
    }
    effectorTarget = targetPosition;
    targetOrientationQuaternion = null;
  } else if (resolvedOrient === 'target') {
    const targetOrientation = options.targetOrientation;
    if (!targetOrientation) {
      throw new AssetValidationError('orient="target" requires targetOrientation.');
    }
    targetOrientationQuaternion = parseQuaternion(targetOrientation, 'targetOrientation');
    if (options.tipOffset === null || options.tipOffset === undefined) {
      effectorTarget = targetPosition;
    } else {
      effectorTarget = subtract(targetPosition, rotateVector(targetOrientationQuaternion, tipOffset));
    }
  } else {
    if (options.targetOrientation) {
      throw new AssetValidationError('targetOrientation requires orient="target".');
    }
    if (options.tipOffset !== null && options.tipOffset !== undefined) {
      throw new AssetValidationError(
        `Rig "${pose.rigId}" only accepts tipOffset with orient="target" when a hand joint exists.`,
      );
    }
    effectorTarget = targetPosition;
    targetOrientationQuaternion = null;
  }

  const normalizedPose = pose.normalized();
  const worldTransforms = buildWorldTransforms(normalizedPose, rig, characterIndex);
  const rootSpec = jointSpecs[chain.rootJoint];
  const parentName = rootSpec?.parent;
  if (!parentName) {
    throw new AssetValidationError(`Joint "${chain.rootJoint}" must have a parent for IK solving.`);
  }

  const rootWorld = worldTransforms[chain.rootJoint];
  const parentWorld = worldTransforms[parentName];
  if (!rootWorld || !parentWorld) {
    throw new AssetValidationError(`Missing world transform for "${chain.rootJoint}".`);
  }
  const rootLocalForward = jointLocalPosition(normalizedPose, chain.rootJoint === chain.midJoint ? chain.rootJoint : chain.midJoint, characterIndex);
  const midLocalForward = chain.endJoint
    ? jointLocalPosition(normalizedPose, chain.endJoint, characterIndex)
    : tipOffset;

  const upperLength = length(rootLocalForward);
  const lowerLength = length(midLocalForward);
  if (upperLength <= EPSILON || lowerLength <= EPSILON) {
    throw new AssetValidationError(`Rig "${pose.rigId}" has a zero-length arm segment and cannot be solved.`);
  }

  const currentRootForward = normalize(rotateVector(rootWorld.quaternion, rootLocalForward));
  const resolvedPole = resolvePolePoint(options.pole ?? null, {
    rootPosition: rootWorld.position,
    parentQuaternion: parentWorld.quaternion,
    defaultPoleAxis: chain.defaultPoleAxis,
  });

  const [elbowPosition, effectorPosition] = solveTwoBonePositions({
    rootPosition: rootWorld.position,
    targetPosition: effectorTarget,
    polePosition: resolvedPole,
    upperLength,
    lowerLength,
    directionFallback: currentRootForward,
  });

  const upperForward = normalize(subtract(elbowPosition, rootWorld.position));
  const lowerForward = normalize(subtract(effectorPosition, elbowPosition));
  const currentParentSide = rotateVector(parentWorld.quaternion, chain.localSideAxis);
  const upperWorldQuaternion = solveBoneWorldQuaternion({
    localForward: rootLocalForward,
    localSideAxis: chain.localSideAxis,
    desiredForward: upperForward,
    jointPosition: rootWorld.position,
    polePosition: resolvedPole,
    fallbackSide: currentParentSide,
  });
  const lowerWorldQuaternion = solveBoneWorldQuaternion({
    localForward: midLocalForward,
    localSideAxis: chain.localSideAxis,
    desiredForward: lowerForward,
    jointPosition: elbowPosition,
    polePosition: resolvedPole,
    fallbackSide: rotateVector(upperWorldQuaternion, chain.localSideAxis),
  });

  const rootLocalQuaternion = canonicalizeQuaternion(normalizeQuaternion(
    multiplyQuaternions(conjugate(parentWorld.quaternion), upperWorldQuaternion),
  ));
  const midLocalQuaternion = canonicalizeQuaternion(normalizeQuaternion(
    multiplyQuaternions(conjugate(upperWorldQuaternion), lowerWorldQuaternion),
  ));

  pose.setRotation(chain.rootJoint, rootLocalQuaternion, { characterIndex });
  pose.setRotation(chain.midJoint, midLocalQuaternion, { characterIndex });
  if (chain.shoulderJoint) {
    pose.setRotation(chain.shoulderJoint, rootLocalQuaternion, { characterIndex });
  }

  if (chain.endJoint && resolvedOrient === 'target' && targetOrientationQuaternion) {
    const endLocalQuaternion = canonicalizeQuaternion(normalizeQuaternion(
      multiplyQuaternions(conjugate(lowerWorldQuaternion), targetOrientationQuaternion),
    ));
    pose.setRotation(chain.endJoint, endLocalQuaternion, { characterIndex });
  }

  return pose;
}

export function solveMirroredArmsToTargets(
  pose: Pose,
  leftTarget: Iterable<number>,
  rightTarget: Iterable<number>,
  options: SolveMirroredArmsToTargetsOptions = {},
): Pose {
  const characterIndex = options.characterIndex ?? 0;
  solveArmToTarget(pose, 'left', leftTarget, {
    characterIndex,
    pole: options.leftPole ?? null,
    tipOffset: options.leftTipOffset ?? null,
    orient: options.orient ?? 'maintain',
    targetOrientation: options.leftTargetOrientation ?? null,
  });
  solveArmToTarget(pose, 'right', rightTarget, {
    characterIndex,
    pole: options.rightPole ?? null,
    tipOffset: options.rightTipOffset ?? null,
    orient: options.orient ?? 'maintain',
    targetOrientation: options.rightTargetOrientation ?? null,
  });
  return pose;
}

function normalizeSide(value: unknown): ArmSide {
  const resolved = String(value || '').trim().toLowerCase();
  if (resolved !== 'left' && resolved !== 'right') {
    throw new AssetValidationError('side must be "left" or "right".');
  }
  return resolved;
}

function normalizeOrient(value: unknown): OrientationMode {
  const resolved = String(value || '').trim().toLowerCase();
  if (resolved !== 'maintain' && resolved !== 'target') {
    throw new AssetValidationError('orient must be "maintain" or "target".');
  }
  return resolved;
}

function resolveTipOffset(
  chain: ArmChainSpec,
  tipOffset: Iterable<number> | null,
  orient: OrientationMode,
): Vector3 {
  if (tipOffset === null) {
    return chain.defaultTipOffset;
  }
  const resolved = parseVector3(tipOffset, 'tipOffset');
  if (length(resolved) <= EPSILON) {
    throw new AssetValidationError('tipOffset must not be zero-length.');
  }
  if (chain.endJoint !== null && orient !== 'target') {
    throw new AssetValidationError(
      `Rig "${chain.rigId}" only supports tipOffset with orient="target" on hand-enabled rigs.`,
    );
  }
  return resolved;
}

function jointLocalPosition(pose: SerializedPose, baseName: string, characterIndex: number): Vector3 {
  const jointName = getJointName(baseName, characterIndex);
  const transform = pose[jointName];
  if (!transform) {
    throw new AssetValidationError(`Missing joint "${jointName}" in normalized pose.`);
  }
  return parseVector3(transform.position, `${jointName}.position`);
}

function resolvePolePoint(
  pole: Iterable<number> | null,
  values: {
    rootPosition: Vector3;
    parentQuaternion: Quaternion;
    defaultPoleAxis: Vector3;
  },
): Vector3 {
  if (pole !== null) {
    return parseVector3(pole, 'pole');
  }
  return add(values.rootPosition, rotateVector(values.parentQuaternion, values.defaultPoleAxis));
}

function solveTwoBonePositions(values: {
  rootPosition: Vector3;
  targetPosition: Vector3;
  polePosition: Vector3;
  upperLength: number;
  lowerLength: number;
  directionFallback: Vector3;
}): [Vector3, Vector3] {
  const toTarget = subtract(values.targetPosition, values.rootPosition);
  const distance = length(toTarget);
  const direction = distance <= EPSILON ? normalize(values.directionFallback) : scale(toTarget, 1 / distance);

  let poleVector = reject(subtract(values.polePosition, values.rootPosition), direction);
  if (length(poleVector) <= EPSILON) {
    poleVector = reject(values.directionFallback, direction);
  }
  if (length(poleVector) <= EPSILON) {
    poleVector = orthogonal(direction);
  }
  const bendDirection = normalize(poleVector);

  const minimumReach = Math.max(Math.abs(values.upperLength - values.lowerLength) + 1e-6, 1e-6);
  const maximumReach = Math.max(values.upperLength + values.lowerLength - 1e-6, minimumReach);
  const solvedDistance = Math.min(Math.max(distance, minimumReach), maximumReach);
  const effectorPosition = add(values.rootPosition, scale(direction, solvedDistance));

  let upperProjection = solvedDistance * solvedDistance + values.upperLength * values.upperLength - values.lowerLength * values.lowerLength;
  upperProjection /= Math.max(2 * solvedDistance, EPSILON);
  const bendHeightSq = Math.max(values.upperLength * values.upperLength - upperProjection * upperProjection, 0);
  const bendHeight = Math.sqrt(bendHeightSq);
  const elbowPosition = add(
    values.rootPosition,
    add(
      scale(direction, upperProjection),
      scale(bendDirection, bendHeight),
    ),
  );
  return [elbowPosition, effectorPosition];
}

function solveBoneWorldQuaternion(values: {
  localForward: Vector3;
  localSideAxis: Vector3;
  desiredForward: Vector3;
  jointPosition: Vector3;
  polePosition: Vector3;
  fallbackSide: Vector3;
}): Quaternion {
  const localBasis = orthonormalBasis(values.localForward, values.localSideAxis, values.fallbackSide);
  const desiredSideHint = subtract(values.polePosition, values.jointPosition);
  const worldBasis = orthonormalBasis(values.desiredForward, desiredSideHint, values.fallbackSide);
  return canonicalizeQuaternion(normalizeQuaternion(
    multiplyQuaternions(
      quaternionFromBasis(...worldBasis),
      conjugate(quaternionFromBasis(...localBasis)),
    ),
  ));
}

function orthonormalBasis(forward: Vector3, sideHint: Vector3, fallbackSide: Vector3): [Vector3, Vector3, Vector3] {
  const resolvedForward = normalize(forward);
  let side = reject(sideHint, resolvedForward);
  if (length(side) <= EPSILON) {
    side = reject(fallbackSide, resolvedForward);
  }
  if (length(side) <= EPSILON) {
    side = orthogonal(resolvedForward);
  }
  side = normalize(side);
  const up = normalize(cross(resolvedForward, side));
  side = normalize(cross(up, resolvedForward));
  return [side, up, resolvedForward];
}

function quaternionFromBasis(side: Vector3, up: Vector3, forward: Vector3): Quaternion {
  const matrix = [
    [side[0], up[0], forward[0]],
    [side[1], up[1], forward[1]],
    [side[2], up[2], forward[2]],
  ] as const;
  const trace = matrix[0][0] + matrix[1][1] + matrix[2][2];
  let result: Quaternion;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    result = [
      (matrix[2][1] - matrix[1][2]) / s,
      (matrix[0][2] - matrix[2][0]) / s,
      (matrix[1][0] - matrix[0][1]) / s,
      0.25 * s,
    ];
  } else if (matrix[0][0] > matrix[1][1] && matrix[0][0] > matrix[2][2]) {
    const s = Math.sqrt(1 + matrix[0][0] - matrix[1][1] - matrix[2][2]) * 2;
    result = [
      0.25 * s,
      (matrix[0][1] + matrix[1][0]) / s,
      (matrix[0][2] + matrix[2][0]) / s,
      (matrix[2][1] - matrix[1][2]) / s,
    ];
  } else if (matrix[1][1] > matrix[2][2]) {
    const s = Math.sqrt(1 + matrix[1][1] - matrix[0][0] - matrix[2][2]) * 2;
    result = [
      (matrix[0][1] + matrix[1][0]) / s,
      0.25 * s,
      (matrix[1][2] + matrix[2][1]) / s,
      (matrix[0][2] - matrix[2][0]) / s,
    ];
  } else {
    const s = Math.sqrt(1 + matrix[2][2] - matrix[0][0] - matrix[1][1]) * 2;
    result = [
      (matrix[0][2] + matrix[2][0]) / s,
      (matrix[1][2] + matrix[2][1]) / s,
      0.25 * s,
      (matrix[1][0] - matrix[0][1]) / s,
    ];
  }
  return canonicalizeQuaternion(normalizeQuaternion(result));
}

function parseVector3(value: unknown, label: string): Vector3 {
  try {
    return readVector3(value, label);
  } catch (error) {
    throw new AssetValidationError(error instanceof Error ? error.message : `${label} must contain 3 values.`);
  }
}

function parseQuaternion(value: unknown, label: string): Quaternion {
  try {
    return readQuaternion(value, label);
  } catch (error) {
    throw new AssetValidationError(error instanceof Error ? error.message : `${label} must contain 4 values.`);
  }
}

function reject(vector: Vector3, axis: Vector3): Vector3 {
  const axisLengthSq = dot(axis, axis);
  if (axisLengthSq <= EPSILON) {
    return vector;
  }
  return subtract(vector, scale(axis, dot(vector, axis) / axisLengthSq));
}

function orthogonal(vector: Vector3): Vector3 {
  if (Math.abs(vector[0]) < Math.abs(vector[1])) {
    if (Math.abs(vector[0]) < Math.abs(vector[2])) {
      return normalize(cross(vector, [1, 0, 0]));
    }
    return normalize(cross(vector, [0, 0, 1]));
  }
  if (Math.abs(vector[1]) < Math.abs(vector[2])) {
    return normalize(cross(vector, [0, 1, 0]));
  }
  return normalize(cross(vector, [0, 0, 1]));
}
