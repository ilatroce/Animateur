import type { Quaternion, QuaternionInput, Vector3, Vector3Input, WorldTransform } from './types.js';

export const EPSILON = 1e-8;
export const X_AXIS = [1, 0, 0] as const;
export const Y_AXIS = [0, 1, 0] as const;
export const Z_AXIS = [0, 0, 1] as const;
export const IDENTITY_QUATERNION = [0, 0, 0, 1] as const;

export interface AxisAngleRotationInput {
  axis: Vector3Input;
  angleRadians: number;
}

export interface QuaternionRotationInput {
  quaternion: QuaternionInput;
}

export type RotationInput = QuaternionInput | AxisAngleRotationInput | QuaternionRotationInput;

function toArray(value: unknown): unknown[] | null {
  if (typeof value === 'string' || value instanceof String) {
    return null;
  }
  if (value && typeof value === 'object' && Symbol.iterator in value) {
    return Array.from(value as Iterable<unknown>);
  }
  if (value && typeof value === 'object' && 'length' in value) {
    return Array.from(value as ArrayLike<unknown>);
  }
  return null;
}

export function vector3(value: unknown, fallback: Vector3 = [0, 0, 0]): Vector3 {
  const values = toArray(value);
  if (!values || values.length < 3) {
    return [...fallback];
  }

  const numbers = values.slice(0, 3).map(Number);
  return numbers.every(Number.isFinite)
    ? [numbers[0] as number, numbers[1] as number, numbers[2] as number]
    : [...fallback];
}

export function readVector3(value: unknown, label = 'vector'): Vector3 {
  const values = toArray(value);
  if (!values || values.length < 3) {
    throw new Error(`${label} must contain 3 values.`);
  }

  const numbers = values.slice(0, 3).map(Number);
  if (!numbers.every(Number.isFinite)) {
    throw new Error(`${label} must contain finite numeric values.`);
  }

  return [numbers[0] as number, numbers[1] as number, numbers[2] as number];
}

export function normalizeQuaternion(
  quaternion: unknown,
  fallback: Quaternion = [0, 0, 0, 1],
): Quaternion {
  const values = toArray(quaternion);
  if (!values || values.length < 4) {
    return [...fallback];
  }

  const numbers = values.slice(0, 4).map(Number);
  if (!numbers.every(Number.isFinite)) {
    return [...fallback];
  }

  const length = Math.hypot(numbers[0] as number, numbers[1] as number, numbers[2] as number, numbers[3] as number);
  if (length === 0) {
    return [0, 0, 0, 1];
  }

  return [
    (numbers[0] as number) / length,
    (numbers[1] as number) / length,
    (numbers[2] as number) / length,
    (numbers[3] as number) / length,
  ];
}

export function readQuaternion(value: unknown, label = 'quaternion'): Quaternion {
  const values = toArray(value);
  if (!values || values.length < 4) {
    throw new Error(`${label} must contain 4 values.`);
  }

  const numbers = values.slice(0, 4).map(Number);
  if (!numbers.every(Number.isFinite)) {
    throw new Error(`${label} must contain finite numeric values.`);
  }

  const length = Math.hypot(numbers[0] as number, numbers[1] as number, numbers[2] as number, numbers[3] as number);
  if (length <= EPSILON) {
    throw new Error(`${label} must not be zero-length.`);
  }

  return canonicalizeQuaternion([
    (numbers[0] as number) / length,
    (numbers[1] as number) / length,
    (numbers[2] as number) / length,
    (numbers[3] as number) / length,
  ]);
}

export function identityQuaternion(): Quaternion {
  return [...IDENTITY_QUATERNION];
}

export function quaternionFromAxisAngle(axis: Vector3Input, angleRadians: number): Quaternion {
  const resolvedAngle = Number(angleRadians);
  if (!Number.isFinite(resolvedAngle)) {
    throw new Error('angleRadians must be a finite number.');
  }

  const resolvedAxis = readVector3(axis, 'axis');
  const axisLength = vectorLength(resolvedAxis);
  if (axisLength <= EPSILON) {
    if (Math.abs(resolvedAngle) <= EPSILON) {
      return identityQuaternion();
    }
    throw new Error('axis must not be zero-length for a non-zero rotation.');
  }

  const unitAxis = scaleVector(resolvedAxis, 1 / axisLength);
  const halfAngle = resolvedAngle * 0.5;
  const sinHalf = Math.sin(halfAngle);
  return normalizeQuaternion([
    unitAxis[0] * sinHalf,
    unitAxis[1] * sinHalf,
    unitAxis[2] * sinHalf,
    Math.cos(halfAngle),
  ]);
}

export function axisAngleQuaternion(axis: Vector3Input, angleRadians: number): Quaternion {
  return quaternionFromAxisAngle(axis, angleRadians);
}

export function readRotation(value: RotationInput, label = 'rotation'): Quaternion {
  if (isRecord(value) && 'quaternion' in value) {
    return readQuaternion(value.quaternion, `${label}.quaternion`);
  }
  if (isRecord(value) && ('axis' in value || 'angleRadians' in value)) {
    if (!('axis' in value) || !('angleRadians' in value)) {
      throw new Error(`${label} must include both axis and angleRadians.`);
    }
    return quaternionFromAxisAngle(value.axis as Vector3Input, Number(value.angleRadians));
  }
  return readQuaternion(value, label);
}

export function canonicalizeQuaternion(quaternion: QuaternionInput): Quaternion {
  const [x, y, z, w] = normalizeQuaternion(quaternion);
  if (
    w < 0 ||
    (Math.abs(w) <= EPSILON &&
      (x < 0 || (Math.abs(x) <= EPSILON && (y < 0 || (Math.abs(y) <= EPSILON && z < 0)))))
  ) {
    return [-x, -y, -z, -w];
  }
  return [x, y, z, w];
}

export function multiplyQuaternions(a: QuaternionInput, b: QuaternionInput): Quaternion {
  const qa = normalizeQuaternion(a);
  const qb = normalizeQuaternion(b);
  return normalizeQuaternion([
    qa[3] * qb[0] + qa[0] * qb[3] + qa[1] * qb[2] - qa[2] * qb[1],
    qa[3] * qb[1] - qa[0] * qb[2] + qa[1] * qb[3] + qa[2] * qb[0],
    qa[3] * qb[2] + qa[0] * qb[1] - qa[1] * qb[0] + qa[2] * qb[3],
    qa[3] * qb[3] - qa[0] * qb[0] - qa[1] * qb[1] - qa[2] * qb[2],
  ]);
}

export function composeQuaternions(...quaternions: QuaternionInput[]): Quaternion {
  let composed = identityQuaternion();
  for (const quaternion of quaternions) {
    composed = multiplyQuaternions(composed, readQuaternion(quaternion));
  }
  return composed;
}

export function applyLocalRotation(quaternion: QuaternionInput, rotation: RotationInput): Quaternion {
  return composeQuaternions(readQuaternion(quaternion, 'quaternion'), readRotation(rotation));
}

export function applyWorldRotation(quaternion: QuaternionInput, rotation: RotationInput): Quaternion {
  return composeQuaternions(readRotation(rotation), readQuaternion(quaternion, 'quaternion'));
}

export function conjugateQuaternion(quaternion: QuaternionInput): Quaternion {
  const [x, y, z, w] = normalizeQuaternion(quaternion);
  return [-x, -y, -z, w];
}

export function rotateVector(quaternion: QuaternionInput, vector: Vector3Input): Vector3 {
  const q = normalizeQuaternion(quaternion);
  const v = readVector3(vector, 'vector');
  const rotated = multiplyRawQuaternions(multiplyRawQuaternions(q, [v[0], v[1], v[2], 0]), [
    -q[0],
    -q[1],
    -q[2],
    q[3],
  ]);
  return [rotated[0], rotated[1], rotated[2]];
}

export function slerpQuaternions(a: QuaternionInput, b: QuaternionInput, t: number): Quaternion {
  const qa = normalizeQuaternion(a);
  let qb = normalizeQuaternion(b);
  let dot = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];

  if (dot < 0) {
    qb = [-qb[0], -qb[1], -qb[2], -qb[3]];
    dot = -dot;
  }

  const clampedT = Math.min(1, Math.max(0, Number(t)));
  if (dot > 0.9995) {
    return normalizeQuaternion([
      qa[0] + clampedT * (qb[0] - qa[0]),
      qa[1] + clampedT * (qb[1] - qa[1]),
      qa[2] + clampedT * (qb[2] - qa[2]),
      qa[3] + clampedT * (qb[3] - qa[3]),
    ]);
  }

  const theta0 = Math.acos(Math.min(1, Math.max(-1, dot)));
  const theta = theta0 * clampedT;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return normalizeQuaternion([
    s0 * qa[0] + s1 * qb[0],
    s0 * qa[1] + s1 * qb[1],
    s0 * qa[2] + s1 * qb[2],
    s0 * qa[3] + s1 * qb[3],
  ]);
}

export function composeTransforms(parent: WorldTransform, local: WorldTransform): WorldTransform {
  return {
    position: addVectors(parent.position, rotateVector(parent.quaternion, local.position)),
    quaternion: normalizeQuaternion(multiplyQuaternions(parent.quaternion, local.quaternion)),
  };
}

export function addVectors(a: Vector3Input, b: Vector3Input): Vector3 {
  const va = readVector3(a, 'a');
  const vb = readVector3(b, 'b');
  return [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
}

export function subtractVectors(a: Vector3Input, b: Vector3Input): Vector3 {
  const va = readVector3(a, 'a');
  const vb = readVector3(b, 'b');
  return [va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]];
}

export function scaleVector(vector: Vector3Input, scalar: number): Vector3 {
  const value = readVector3(vector, 'vector');
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

export function dotVectors(a: Vector3Input, b: Vector3Input): number {
  const va = readVector3(a, 'a');
  const vb = readVector3(b, 'b');
  return va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
}

export function crossVectors(a: Vector3Input, b: Vector3Input): Vector3 {
  const va = readVector3(a, 'a');
  const vb = readVector3(b, 'b');
  return [
    va[1] * vb[2] - va[2] * vb[1],
    va[2] * vb[0] - va[0] * vb[2],
    va[0] * vb[1] - va[1] * vb[0],
  ];
}

export function vectorLength(vector: Vector3Input): number {
  const value = readVector3(vector, 'vector');
  return Math.sqrt(value[0] * value[0] + value[1] * value[1] + value[2] * value[2]);
}

export function normalizeVector(vector: Vector3Input): Vector3 {
  const value = readVector3(vector, 'vector');
  const length = vectorLength(value);
  if (length <= EPSILON) {
    return [0, 0, 0];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function multiplyRawQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
