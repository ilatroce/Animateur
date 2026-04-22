import {
  AUTORIG_AUTO_SKIN_SEGMENTS,
  AUTORIG_R18,
  AUTORIG_R18_ID,
  AUTORIG_SEGMENTS,
  AUTORIG_UAL_HINTS,
  KNOWN_BASE_NAMES,
  NEUTRAL_BIND_ID,
  NEUTRAL_BIND_POSE,
  PRESETS_BY_ID,
  R11_CORE,
  R11_CORE_ID,
  RELAXED_PREVIEW_ID,
  RELAXED_PREVIEW_POSE,
  RIGS_BY_ID,
} from './rig-data.js';
import {
  applyLocalRotation,
  applyWorldRotation,
  composeTransforms,
  normalizeQuaternion,
  readRotation,
  vector3,
} from './math.js';
import type { RotationInput } from './math.js';
import type {
  AnimationAssetDict,
  ArcaneSummonEffectDict,
  KeyframeDict,
  KeyframeEasing,
  PoseAssetDict,
  PosePreset,
  PoseTransform,
  Quaternion,
  QuaternionInput,
  RigSpec,
  SceneDict,
  SerializedPose,
  SerializedTransform,
  Vector3Input,
  Vector3,
  WorldTransform,
} from './types.js';

export {
  AUTORIG_AUTO_SKIN_SEGMENTS,
  AUTORIG_R18,
  AUTORIG_R18_ID,
  AUTORIG_SEGMENTS,
  AUTORIG_UAL_HINTS,
  NEUTRAL_BIND_ID,
  NEUTRAL_BIND_POSE,
  R11_CORE,
  R11_CORE_ID,
  RELAXED_PREVIEW_ID,
  RELAXED_PREVIEW_POSE,
};

export const FAST_POSER_ASSET_FORMAT = 'fast-poser-asset';
export const FAST_POSER_ASSET_VERSION = 1;
export const POSE_ASSET_TYPE = 'pose';
export const ANIMATION_ASSET_TYPE = 'animation';
export const KEYFRAME_EASINGS: readonly KeyframeEasing[] = [
  'linear',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
];

const JOINT_NAME_PATTERN = /^(.+)_(\d+)$/;
const KEYFRAME_EASING_SET = new Set<KeyframeEasing>(KEYFRAME_EASINGS);

export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetValidationError';
  }
}

type UnknownRecord = Record<string, unknown>;
type JointTransformInput = PoseTransform | Partial<SerializedTransform> | UnknownRecord | null | undefined;
export type PoseInput = Pose | Record<string, JointTransformInput> | null | undefined;
export type KeyframeInput = Keyframe | Partial<KeyframeDict> | UnknownRecord | null | undefined;
export type EffectInput = ArcaneSummonEffect | Partial<ArcaneSummonEffectDict> | UnknownRecord | null | undefined;

interface SharedAssetOptions {
  rig?: string;
  rigId?: string;
  characterCount?: number;
  characterColors?: Iterable<unknown>;
  savedAt?: string;
}

export interface PoseConstructorOptions {
  rigId?: string;
  characterCount?: number;
  preset?: string;
  overrides?: SerializedPose;
}

export interface PoseDefaultOptions {
  rigId?: string;
  characterCount?: number;
  preset?: string;
}

export interface PoseFromInputOptions extends PoseDefaultOptions {}

export interface JointOptions {
  characterIndex?: number;
}

export interface SetRotationOptions extends JointOptions {
  axis?: Vector3Input;
  angleRadians?: number;
}

export interface RotateJointOptions extends JointOptions {}

export interface SetPositionOptions extends JointOptions {}

export interface KeyframeOptions {
  easing?: KeyframeEasing | null | undefined;
}

export interface NormalizePoseOptions {
  fallbackPose?: PoseInput;
  rig?: string | RigSpec;
  rigId?: string;
  characterCount?: number;
}

export interface NormalizeKeyframesOptions {
  rig?: string | RigSpec;
  rigId?: string;
  characterCount?: number;
}

export interface NewPoseOptions extends SharedAssetOptions {
  preset?: string;
  pose?: PoseInput;
}

export interface NewAnimationOptions extends SharedAssetOptions {
  playbackSpeed?: number;
  effects?: EffectInput;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(): string {
  return new Date().toISOString();
}

function parseCount(value: unknown): number | null {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = Math.trunc(value);
  } else if (typeof value === 'boolean') {
    parsed = value ? 1 : 0;
  } else if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) {
    parsed = Number.parseInt(value, 10);
  } else {
    return null;
  }
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseTime(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, parsed);
}

function normalizeKeyframeEasing(value: unknown): KeyframeEasing | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = String(value).trim();
  if (!text || text === 'linear') {
    return undefined;
  }
  if (KEYFRAME_EASING_SET.has(text as KeyframeEasing)) {
    return text as KeyframeEasing;
  }
  throw new AssetValidationError(
    `Unsupported keyframe easing "${text}". Expected one of: ${KEYFRAME_EASINGS.join(', ')}.`,
  );
}

function normalizeRigId(options: { rig?: string | RigSpec; rigId?: string } = {}): string {
  const rig = options.rig;
  if (typeof rig === 'string') {
    return rig;
  }
  if (rig && typeof rig === 'object') {
    return rig.id;
  }
  return options.rigId ?? R11_CORE_ID;
}

function normalizeCharacterCount(options: { characterCount?: number }, fallback: number): number {
  const count = options.characterCount;
  return count === undefined ? fallback : Math.max(0, Math.trunc(count));
}

function normalizeCharacterIndex(value: unknown = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AssetValidationError('characterIndex must be a finite number.');
  }
  const characterIndex = Math.trunc(parsed);
  if (characterIndex < 0) {
    throw new AssetValidationError('characterIndex must be >= 0.');
  }
  return characterIndex;
}

function normalizeCharacterColors(characterColors: Iterable<unknown> | undefined, characterCount: number): string[] {
  if (characterCount <= 0) {
    return [];
  }

  const colors: string[] = [];
  for (const value of characterColors ?? []) {
    const text = String(value ?? '').trim();
    if (text) {
      colors.push(text);
    }
    if (colors.length >= characterCount) {
      break;
    }
  }
  return colors;
}

function buildScene(characterCount: number, characterColors?: Iterable<unknown>): SceneDict {
  const resolvedCount = Math.max(0, Math.trunc(characterCount));
  return {
    characterCount: resolvedCount,
    characterColors: normalizeCharacterColors(characterColors, resolvedCount),
  };
}

function normalizePlaybackSpeed(playbackSpeed: unknown): number {
  const value = Number(playbackSpeed);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeColor(value: unknown, fallback: string): string {
  const text = String(value || fallback).trim();
  return text || fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundEffectTime(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseTransformInput(transform: unknown): { position: unknown; quaternion: unknown } {
  if (isRecord(transform)) {
    return {
      position: transform.position,
      quaternion: transform.quaternion,
    };
  }
  return {
    position: undefined,
    quaternion: undefined,
  };
}

function clonePosition(position: unknown, fallback: unknown = [0, 0, 0]): Vector3 {
  return vector3(position, vector3(fallback));
}

function normalizeTransform(transform: unknown, fallback: unknown = null): SerializedTransform {
  const fallbackTransform = parseTransformInput(fallback);
  const sourceTransform = parseTransformInput(transform);
  const fallbackPosition = clonePosition(fallbackTransform.position);
  const fallbackQuaternion = normalizeQuaternion(fallbackTransform.quaternion);
  return {
    position: clonePosition(sourceTransform.position, fallbackPosition),
    quaternion: normalizeQuaternion(sourceTransform.quaternion, fallbackQuaternion),
  };
}

function cloneTransform(transform: unknown): SerializedTransform {
  return normalizeTransform(transform);
}

function clonePose(pose: unknown): SerializedPose {
  const clone: SerializedPose = {};
  if (!isRecord(pose)) {
    return clone;
  }

  Object.entries(pose).forEach(([name, transform]) => {
    clone[String(name)] = normalizeTransform(transform);
  });
  return clone;
}

function getPreset(presetId = NEUTRAL_BIND_ID): PosePreset {
  const preset = PRESETS_BY_ID.get(presetId);
  if (!preset) {
    throw new AssetValidationError(`Unknown rig preset "${presetId}".`);
  }
  return preset;
}

export function getRig(rigId = R11_CORE_ID): RigSpec {
  const rig = RIGS_BY_ID.get(rigId);
  if (!rig) {
    throw new AssetValidationError(`Unknown rig "${rigId}".`);
  }
  return rig;
}

export function getJointNames(rig: RigSpec = R11_CORE): string[] {
  return rig.joints.map(joint => joint.baseName);
}

export function getJointParents(rig: RigSpec = R11_CORE): Record<string, string | null> {
  return Object.fromEntries(rig.joints.map(joint => [joint.baseName, joint.parent]));
}

export function getJointName(baseName: string, characterIndex: number): string {
  return `${baseName}_${Math.trunc(characterIndex)}`;
}

function splitJointName(jointName: unknown): { baseName: string; characterIndex: number } | null {
  const match = String(jointName || '').match(JOINT_NAME_PATTERN);
  if (!match) {
    return null;
  }
  return {
    baseName: match[1] as string,
    characterIndex: Number.parseInt(match[2] as string, 10),
  };
}

function parseJointName(jointName: unknown): { baseName: string; characterIndex: number } | null {
  const parsed = splitJointName(jointName);
  if (!parsed || !KNOWN_BASE_NAMES.has(parsed.baseName)) {
    return null;
  }
  return parsed;
}

function resolveJointReference(joint: string, options: JointOptions = {}): {
  jointName: string;
  baseName: string;
  characterIndex: number;
} {
  const name = String(joint).trim();
  if (!name) {
    throw new AssetValidationError('Joint name must not be empty.');
  }

  const explicitJoint = splitJointName(name);
  if (explicitJoint) {
    if (!KNOWN_BASE_NAMES.has(explicitJoint.baseName)) {
      throw new AssetValidationError(`Unknown joint "${name}".`);
    }
    if (options.characterIndex !== undefined) {
      const optionIndex = normalizeCharacterIndex(options.characterIndex);
      if (optionIndex !== explicitJoint.characterIndex) {
        throw new AssetValidationError(
          `Joint "${name}" already targets character ${explicitJoint.characterIndex}.`,
        );
      }
    }
    return {
      jointName: name,
      baseName: explicitJoint.baseName,
      characterIndex: explicitJoint.characterIndex,
    };
  }

  const characterIndex = normalizeCharacterIndex(options.characterIndex);
  return {
    jointName: getJointName(name, characterIndex),
    baseName: name,
    characterIndex,
  };
}

function parseRotationInput(rotation: RotationInput, label = 'rotation'): Quaternion {
  try {
    return readRotation(rotation, label);
  } catch (error) {
    throw new AssetValidationError(error instanceof Error ? error.message : `${label} is not a valid rotation.`);
  }
}

function inferCharacterIndexFromPose(serializedPose: unknown): number {
  if (!isRecord(serializedPose)) {
    return -1;
  }
  return Object.keys(serializedPose).reduce((currentMax, jointName) => {
    const parsed = parseJointName(jointName);
    return parsed ? Math.max(currentMax, parsed.characterIndex) : currentMax;
  }, -1);
}

export function inferCharacterCount(assetOrPose: unknown): number {
  if (!isRecord(assetOrPose)) {
    return 0;
  }

  const scene = isRecord(assetOrPose.scene) ? assetOrPose.scene : null;
  const explicitCount = parseCount(scene?.characterCount ?? assetOrPose.characterCount);
  if (explicitCount !== null) {
    return explicitCount;
  }

  if (Array.isArray(assetOrPose.keyframes)) {
    return assetOrPose.keyframes.reduce((currentMax, frame) => {
      return Math.max(currentMax, isRecord(frame) ? inferCharacterIndexFromPose(frame.pose) : -1);
    }, -1) + 1;
  }

  const pose = isRecord(assetOrPose.pose) ? assetOrPose.pose : assetOrPose;
  return inferCharacterIndexFromPose(pose) + 1;
}

export function buildDefaultPose(
  characterCount: number,
  rigId: string | RigSpec = R11_CORE_ID,
  preset = NEUTRAL_BIND_ID,
): SerializedPose {
  const count = Math.max(0, Math.trunc(characterCount));
  const rig = typeof rigId === 'string' ? getRig(rigId) : rigId;
  const presetData = getPreset(preset);
  const pose: SerializedPose = {};

  for (let characterIndex = 0; characterIndex < count; characterIndex += 1) {
    rig.joints.forEach(joint => {
      const transform = presetData.joints[joint.baseName] ?? {
        position: joint.position,
        quaternion: joint.quaternion,
      };
      pose[getJointName(joint.baseName, characterIndex)] = normalizeTransform(transform);
    });
  }

  return pose;
}

function resolvePoseInput(pose: PoseInput): SerializedPose | Record<string, JointTransformInput> {
  if (pose instanceof Pose) {
    return pose._overrides;
  }
  return isRecord(pose) ? pose as Record<string, JointTransformInput> : {};
}

function isNormalizePoseOptions(value: unknown): value is NormalizePoseOptions {
  return isRecord(value) && (
    'fallbackPose' in value ||
    'rig' in value ||
    'rigId' in value ||
    'characterCount' in value
  );
}

export function normalizePose(
  serializedPose: PoseInput = null,
  fallbackPoseOrOptions: PoseInput | NormalizePoseOptions = null,
  rigId = R11_CORE_ID,
): SerializedPose {
  const options = isNormalizePoseOptions(fallbackPoseOrOptions) ? fallbackPoseOrOptions : null;
  const source = resolvePoseInput(serializedPose);
  const fallback = resolvePoseInput(options ? options.fallbackPose : fallbackPoseOrOptions as PoseInput);
  const resolvedRigId = options ? normalizeRigId(options) : rigId;
  const rig = getRig(resolvedRigId);
  const explicitCount = options ? normalizeCharacterCount(options, -1) : -1;
  const characterCount = Math.max(
    explicitCount,
    inferCharacterCount(source),
    inferCharacterCount(fallback),
  );
  if (characterCount <= 0) {
    return {};
  }

  const neutralFallback = buildDefaultPose(characterCount, rig, NEUTRAL_BIND_ID);
  const pose: SerializedPose = {};
  for (let characterIndex = 0; characterIndex < characterCount; characterIndex += 1) {
    rig.joints.forEach(joint => {
      const jointName = getJointName(joint.baseName, characterIndex);
      const fallbackTransform = fallback[jointName] ?? neutralFallback[jointName];
      pose[jointName] = normalizeTransform(source[jointName], fallbackTransform);
    });
  }
  return pose;
}

function isNormalizeKeyframesOptions(value: unknown): value is NormalizeKeyframesOptions {
  return isRecord(value) && (
    'rig' in value ||
    'rigId' in value ||
    'characterCount' in value
  );
}

export function normalizeKeyframes(
  frames: Iterable<KeyframeInput> | UnknownRecord | null | undefined,
  rigIdOrOptions: string | NormalizeKeyframesOptions = R11_CORE_ID,
  options: NormalizeKeyframesOptions = {},
): KeyframeDict[] {
  const resolvedOptions = isNormalizeKeyframesOptions(rigIdOrOptions)
    ? rigIdOrOptions
    : { ...options, rigId: rigIdOrOptions };
  const resolvedRigId = normalizeRigId(resolvedOptions);
  const explicitCount = resolvedOptions.characterCount;

  let frameValues: Iterable<KeyframeInput>;
  let resolvedCount = explicitCount === undefined ? undefined : Math.trunc(explicitCount);

  if (isRecord(frames) && !(frames instanceof Keyframe) && !Array.isArray(frames)) {
    if (resolvedCount === undefined) {
      resolvedCount = inferCharacterCount(frames);
    }
    frameValues = Array.isArray(frames.keyframes) ? frames.keyframes as KeyframeInput[] : [];
  } else {
    frameValues = frames && Symbol.iterator in Object(frames) ? frames as Iterable<KeyframeInput> : [];
  }

  const sortedFrames: KeyframeDict[] = [];
  for (const frame of frameValues) {
    if (frame instanceof Keyframe) {
      sortedFrames.push({
        time: parseTime(frame.time),
        pose: clonePose(frame.pose._overrides),
        easing: frame.easing,
      });
      continue;
    }
    if (isRecord(frame)) {
      sortedFrames.push({
        time: parseTime(frame.time),
        pose: clonePose(isRecord(frame.pose) ? frame.pose : {}),
        easing: normalizeKeyframeEasing(frame.easing),
      });
    }
  }
  sortedFrames.sort((a, b) => a.time - b.time);

  const characterCount = resolvedCount ?? inferCharacterCount({ keyframes: sortedFrames });
  if (characterCount <= 0) {
    return [];
  }

  let rollingPose = buildDefaultPose(characterCount, resolvedRigId, NEUTRAL_BIND_ID);
  return sortedFrames.map(frame => {
    const pose = normalizePose(frame.pose, rollingPose, resolvedRigId);
    rollingPose = clonePose(pose);
    return {
      time: frame.time,
      pose,
      ...(frame.easing ? { easing: frame.easing } : {}),
    };
  });
}

export class ArcaneSummonEffect {
  targetCharacter: number;
  startTime: number;
  peakTime: number;
  endTime: number;
  radius: number;
  columnHeight: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  glowColor: string;

  constructor(value: Partial<ArcaneSummonEffectDict> = {}) {
    this.targetCharacter = Math.max(0, parseCount(value.targetCharacter) ?? 0);
    this.startTime = parseTime(value.startTime ?? 0);
    this.peakTime = Number(value.peakTime ?? 1.8);
    this.endTime = Number(value.endTime ?? 3.4);
    this.radius = Number(value.radius ?? 3.2);
    this.columnHeight = Number(value.columnHeight ?? 6.2);
    this.primaryColor = value.primaryColor ?? '#63f3ff';
    this.secondaryColor = value.secondaryColor ?? '#5b36ff';
    this.accentColor = value.accentColor ?? '#ffd36b';
    this.glowColor = value.glowColor ?? '#f0f9ff';
  }

  static fromInput(value: EffectInput = null): ArcaneSummonEffect | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof ArcaneSummonEffect) {
      const effect = new ArcaneSummonEffect(value.toDict());
      effect.validate();
      return effect;
    }
    if (!isRecord(value) || value.preset !== 'arcane-summon') {
      throw new AssetValidationError('Unsupported effect payload. Only the arcane-summon preset is supported.');
    }

    const startTime = parseTime(value.startTime);
    const peakTime = Math.max(startTime + 0.1, parseTime(value.peakTime) || startTime + 1.8);
    const endTime = Math.max(peakTime + 0.1, parseTime(value.endTime) || peakTime + 1.6);
    const effect = new ArcaneSummonEffect({
      targetCharacter: Math.max(0, parseCount(value.targetCharacter) ?? 0),
      startTime: roundEffectTime(startTime),
      peakTime: roundEffectTime(peakTime),
      endTime: roundEffectTime(endTime),
      radius: Math.round(clamp(Number(value.radius || 3.2), 1.5, 6) * 100) / 100,
      columnHeight: Math.round(clamp(Number(value.columnHeight || 6.2), 2.5, 10) * 100) / 100,
      primaryColor: normalizeColor(value.primaryColor, '#63f3ff'),
      secondaryColor: normalizeColor(value.secondaryColor, '#5b36ff'),
      accentColor: normalizeColor(value.accentColor, '#ffd36b'),
      glowColor: normalizeColor(value.glowColor, '#f0f9ff'),
    });
    effect.validate();
    return effect;
  }

  validate(): void {
    if (this.targetCharacter < 0) {
      throw new AssetValidationError('ArcaneSummonEffect.targetCharacter must be >= 0.');
    }
    if (this.startTime < 0) {
      throw new AssetValidationError('ArcaneSummonEffect.startTime must be >= 0.');
    }
    if (this.peakTime < this.startTime + 0.1) {
      throw new AssetValidationError('ArcaneSummonEffect.peakTime must be at least 0.1 after startTime.');
    }
    if (this.endTime < this.peakTime + 0.1) {
      throw new AssetValidationError('ArcaneSummonEffect.endTime must be at least 0.1 after peakTime.');
    }
    if (this.radius < 1.5 || this.radius > 6.0) {
      throw new AssetValidationError('ArcaneSummonEffect.radius must be between 1.5 and 6.0.');
    }
    if (this.columnHeight < 2.5 || this.columnHeight > 10.0) {
      throw new AssetValidationError('ArcaneSummonEffect.columnHeight must be between 2.5 and 10.0.');
    }
  }

  toDict(): ArcaneSummonEffectDict {
    this.validate();
    return {
      preset: 'arcane-summon',
      targetCharacter: Math.trunc(this.targetCharacter),
      startTime: roundEffectTime(this.startTime),
      peakTime: roundEffectTime(this.peakTime),
      endTime: roundEffectTime(this.endTime),
      radius: Math.round(this.radius * 100) / 100,
      columnHeight: Math.round(this.columnHeight * 100) / 100,
      primaryColor: this.primaryColor,
      secondaryColor: this.secondaryColor,
      accentColor: this.accentColor,
      glowColor: this.glowColor,
    };
  }

  toJSON(indent = 2): string {
    return JSON.stringify(this.toDict(), null, indent);
  }
}

export class Pose {
  rigId: string;
  characterCount: number;
  preset: string;
  _overrides: SerializedPose;

  constructor(options: PoseConstructorOptions = {}) {
    this.rigId = options.rigId ?? R11_CORE_ID;
    this.characterCount = normalizeCharacterCount(options, 1);
    this.preset = options.preset ?? NEUTRAL_BIND_ID;
    this._overrides = clonePose(options.overrides ?? {});
  }

  static default(options: PoseDefaultOptions = {}): Pose {
    const pose = new Pose({
      rigId: options.rigId ?? R11_CORE_ID,
      characterCount: normalizeCharacterCount(options, 1),
      preset: options.preset ?? NEUTRAL_BIND_ID,
    });
    pose._overrides = buildDefaultPose(pose.characterCount, pose.rigId, pose.preset);
    return pose;
  }

  static fromInput(value: PoseInput = null, options: PoseFromInputOptions = {}): Pose {
    if (value instanceof Pose) {
      const clone = value.copy();
      const count = options.characterCount;
      if (count !== undefined) {
        clone.characterCount = Math.max(clone.characterCount, Math.trunc(count));
      }
      return clone;
    }

    let resolvedCount = options.characterCount;
    if (resolvedCount === undefined) {
      resolvedCount = isRecord(value) ? inferCharacterCount({ pose: value }) : 0;
    }
    if (resolvedCount <= 0) {
      resolvedCount = 1;
    }

    return new Pose({
      rigId: options.rigId ?? R11_CORE_ID,
      characterCount: resolvedCount,
      preset: options.preset ?? NEUTRAL_BIND_ID,
      overrides: clonePose(value),
    });
  }

  copy(): Pose {
    return new Pose({
      rigId: this.rigId,
      characterCount: this.characterCount,
      preset: this.preset,
      overrides: clonePose(this._overrides),
    });
  }

  validate(): void {
    const rig = getRig(this.rigId);
    const validBaseNames = new Set(rig.joints.map(joint => joint.baseName));
    Object.entries(this._overrides).forEach(([jointName, transform]) => {
      const parsed = parseJointName(jointName);
      if (!parsed || !validBaseNames.has(parsed.baseName)) {
        throw new AssetValidationError(`Unknown joint "${jointName}" for rig "${this.rigId}".`);
      }
      if (parsed.characterIndex < 0) {
        throw new AssetValidationError(`Joint "${jointName}" has a negative character index.`);
      }
      normalizeTransform(transform);
    });
  }

  resolvedCharacterCount(): number {
    return Math.max(this.characterCount, inferCharacterCount({ pose: this._overrides }));
  }

  normalized(): SerializedPose {
    const count = this.resolvedCharacterCount();
    const fallback = buildDefaultPose(count, this.rigId, this.preset);
    return normalizePose(this._overrides, fallback, this.rigId);
  }

  toDict(): SerializedPose {
    this.validate();
    return this.normalized();
  }

  toJSON(indent = 2): string {
    return JSON.stringify(this.toDict(), null, indent);
  }

  private setTransform(jointName: string, values: { position?: unknown; quaternion?: unknown }): Pose {
    const current = this._overrides[jointName] ?? {};
    const nextPosition = values.position ?? current.position;
    const nextQuaternion = values.quaternion ?? current.quaternion;
    this._overrides[jointName] = normalizeTransform({
      position: nextPosition,
      quaternion: nextQuaternion,
    }, current);
    return this;
  }

  private resolveWritableJoint(joint: string, options: JointOptions = {}): { jointName: string; characterIndex: number } {
    const resolved = resolveJointReference(joint, options);
    this.characterCount = Math.max(this.characterCount, resolved.characterIndex + 1);
    return resolved;
  }

  private currentTransform(joint: string, options: JointOptions = {}): SerializedTransform {
    const { jointName } = resolveJointReference(joint, options);
    const transform = this.normalized()[jointName];
    if (!transform) {
      throw new AssetValidationError(`Missing joint "${jointName}" in normalized pose.`);
    }
    return cloneTransform(transform);
  }

  getTransform(joint: string, options: JointOptions = {}): SerializedTransform {
    return this.currentTransform(joint, options);
  }

  getPosition(joint: string, options: JointOptions = {}): Vector3 {
    return clonePosition(this.currentTransform(joint, options).position);
  }

  getRotation(joint: string, options: JointOptions = {}): Quaternion {
    return normalizeQuaternion(this.currentTransform(joint, options).quaternion);
  }

  setPosition(joint: string, position: Iterable<number>, options: SetPositionOptions = {}): Pose {
    const { jointName } = this.resolveWritableJoint(joint, options);
    this.setTransform(jointName, { position });
    return this;
  }

  setQuaternion(joint: string, quaternion: QuaternionInput, options: JointOptions = {}): Pose {
    const { jointName } = this.resolveWritableJoint(joint, options);
    this.setTransform(jointName, { quaternion: parseRotationInput(quaternion, 'quaternion') });
    return this;
  }

  setAxisAngle(
    joint: string,
    axis: Vector3Input,
    angleRadians: number,
    options: JointOptions = {},
  ): Pose {
    const { jointName } = this.resolveWritableJoint(joint, options);
    this.setTransform(jointName, { quaternion: parseRotationInput({ axis, angleRadians }) });
    return this;
  }

  setRotation(
    joint: string,
    rotation: RotationInput | null = null,
    options: SetRotationOptions = {},
  ): Pose {
    if (rotation === null) {
      const angleRadians = options.angleRadians;
      if (!options.axis || angleRadians === undefined) {
        throw new AssetValidationError('setRotation requires a quaternion or both axis and angleRadians.');
      }
      return this.setAxisAngle(joint, options.axis, angleRadians, options);
    }
    const { jointName } = this.resolveWritableJoint(joint, options);
    this.setTransform(jointName, { quaternion: parseRotationInput(rotation) });
    return this;
  }

  rotateLocal(joint: string, rotation: RotationInput, options: RotateJointOptions = {}): Pose {
    const { jointName } = this.resolveWritableJoint(joint, options);
    const current = this.getRotation(jointName);
    this.setTransform(jointName, {
      quaternion: applyLocalRotation(current, parseRotationInput(rotation)),
    });
    return this;
  }

  rotateWorld(joint: string, rotation: RotationInput, options: RotateJointOptions = {}): Pose {
    const { jointName } = this.resolveWritableJoint(joint, options);
    const current = this.getRotation(jointName);
    this.setTransform(jointName, {
      quaternion: applyWorldRotation(current, parseRotationInput(rotation)),
    });
    return this;
  }

  offsetRootMotion(offset: Iterable<number>, options: SetPositionOptions = {}): Pose {
    const characterIndex = normalizeCharacterIndex(options.characterIndex);
    const normalized = this.normalized();
    const jointName = getJointName('Hips', characterIndex);
    const current = normalized[jointName]?.position;
    if (!current) {
      throw new AssetValidationError(`Missing joint "${jointName}" in normalized pose.`);
    }
    const delta = clonePosition(offset);
    return this.setPosition('Hips', [
      current[0] + delta[0],
      current[1] + delta[1],
      current[2] + delta[2],
    ], { characterIndex });
  }

  copyCharacterPose(sourceIndex: number, targetIndex: number): Pose {
    const normalized = this.normalized();
    const rig = getRig(this.rigId);
    rig.joints.forEach(joint => {
      const sourceName = getJointName(joint.baseName, sourceIndex);
      const targetName = getJointName(joint.baseName, targetIndex);
      this._overrides[targetName] = cloneTransform(normalized[sourceName]);
    });
    this.characterCount = Math.max(this.characterCount, sourceIndex + 1, targetIndex + 1);
    return this;
  }
}

export class Keyframe {
  time: number;
  pose: Pose;
  easing: KeyframeEasing | undefined;

  constructor(time: number, pose: Pose, options: KeyframeOptions = {}) {
    this.time = parseTime(time);
    this.pose = pose;
    this.easing = normalizeKeyframeEasing(options.easing);
  }

  static fromInput(
    time: number,
    pose: PoseInput = null,
    options: { rigId?: string; characterCount?: number; easing?: KeyframeEasing | null | undefined } = {},
  ): Keyframe {
    return new Keyframe(
      parseTime(time),
      Pose.fromInput(pose, {
        rigId: options.rigId,
        characterCount: options.characterCount,
      }),
      { easing: options.easing },
    );
  }

  validate(): void {
    if (this.time < 0) {
      throw new AssetValidationError('Keyframe.time must be >= 0.');
    }
    this.pose.validate();
    this.easing = normalizeKeyframeEasing(this.easing);
  }

  toDict(): KeyframeDict {
    this.validate();
    return {
      time: parseTime(this.time),
      pose: this.pose.toDict(),
      ...(this.easing ? { easing: this.easing } : {}),
    };
  }

  toJSON(indent = 2): string {
    return JSON.stringify(this.toDict(), null, indent);
  }
}

export class PoseAsset {
  name: string;
  rigId: string;
  characterCount: number;
  characterColors: string[];
  savedAt: string;
  pose: Pose;

  constructor(options: {
    name: string;
    rigId?: string;
    characterCount?: number;
    characterColors?: string[];
    savedAt?: string;
    pose?: Pose;
  }) {
    this.name = options.name;
    this.rigId = options.rigId ?? R11_CORE_ID;
    this.characterCount = options.characterCount ?? 1;
    this.characterColors = options.characterColors ?? [];
    this.savedAt = options.savedAt ?? timestamp();
    this.pose = options.pose ?? Pose.default({ rigId: this.rigId, characterCount: this.characterCount });
  }

  static new(name: string, options: NewPoseOptions = {}): PoseAsset {
    const rig = normalizeRigId(options);
    const resolvedCount = Math.max(1, Math.trunc(options.characterCount ?? 1));
    const preset = options.preset ?? NEUTRAL_BIND_ID;
    const resolvedPose = options.pose === undefined || options.pose === null
      ? Pose.default({ rigId: rig, characterCount: resolvedCount, preset })
      : Pose.fromInput(options.pose, { rigId: rig, characterCount: resolvedCount, preset });
    return new PoseAsset({
      name: String(name).trim() || 'Untitled Pose',
      rigId: rig,
      characterCount: resolvedCount,
      characterColors: normalizeCharacterColors(options.characterColors, resolvedCount),
      savedAt: String(options.savedAt ?? timestamp()),
      pose: resolvedPose,
    });
  }

  validate(): void {
    if (!this.name) {
      throw new AssetValidationError('PoseAsset.name must not be empty.');
    }
    validatePoseDict(this.pose.toDict(), this.rigId, this.characterCount);
  }

  toDict(): PoseAssetDict {
    this.validate();
    return {
      format: FAST_POSER_ASSET_FORMAT,
      version: FAST_POSER_ASSET_VERSION,
      type: POSE_ASSET_TYPE,
      name: this.name,
      savedAt: this.savedAt,
      scene: buildScene(this.characterCount, this.characterColors),
      pose: this.pose.toDict(),
    };
  }

  toJSON(indent = 2): string {
    return JSON.stringify(this.toDict(), null, indent);
  }
}

export class AnimationAsset {
  name: string;
  rigId: string;
  characterCount: number;
  characterColors: string[];
  playbackSpeed: number;
  effects: ArcaneSummonEffect | null;
  savedAt: string;
  keyframes: Keyframe[];

  constructor(options: {
    name: string;
    rigId?: string;
    characterCount?: number;
    characterColors?: string[];
    playbackSpeed?: number;
    effects?: ArcaneSummonEffect | null;
    savedAt?: string;
    keyframes?: Keyframe[];
  }) {
    this.name = options.name;
    this.rigId = options.rigId ?? R11_CORE_ID;
    this.characterCount = options.characterCount ?? 1;
    this.characterColors = options.characterColors ?? [];
    this.playbackSpeed = normalizePlaybackSpeed(options.playbackSpeed ?? 1);
    this.effects = options.effects ?? null;
    this.savedAt = options.savedAt ?? timestamp();
    this.keyframes = options.keyframes ?? [];
  }

  static new(name: string, options: NewAnimationOptions = {}): AnimationAsset {
    const rig = normalizeRigId(options);
    const resolvedCount = Math.max(1, Math.trunc(options.characterCount ?? 1));
    return new AnimationAsset({
      name: String(name).trim() || 'Untitled Animation',
      rigId: rig,
      characterCount: resolvedCount,
      characterColors: normalizeCharacterColors(options.characterColors, resolvedCount),
      playbackSpeed: normalizePlaybackSpeed(options.playbackSpeed ?? 1),
      effects: ArcaneSummonEffect.fromInput(options.effects ?? null),
      savedAt: String(options.savedAt ?? timestamp()),
    });
  }

  addKeyframe(time: number, pose: PoseInput = null, options: KeyframeOptions = {}): Keyframe {
    const resolvedPose = pose === null || pose === undefined
      ? this.keyframes.length > 0
        ? this.keyframes[this.keyframes.length - 1]!.pose.copy()
        : Pose.default({ rigId: this.rigId, characterCount: this.characterCount })
      : Pose.fromInput(pose, { rigId: this.rigId, characterCount: this.characterCount });
    const frame = Keyframe.fromInput(time, resolvedPose, {
      rigId: this.rigId,
      characterCount: this.characterCount,
      easing: options.easing,
    });
    this.keyframes.push(frame);
    this.keyframes.sort((a, b) => a.time - b.time);
    this.characterCount = Math.max(this.characterCount, frame.pose.resolvedCharacterCount());
    return frame;
  }

  hold(duration: number): AnimationAsset {
    if (duration <= 0) {
      return this;
    }
    const currentTime = this.keyframes.length > 0 ? this.keyframes[this.keyframes.length - 1]!.time : 0;
    this.addKeyframe(currentTime + duration);
    return this;
  }

  transition(targetPose: PoseInput, duration: number): AnimationAsset {
    const currentTime = this.keyframes.length > 0 ? this.keyframes[this.keyframes.length - 1]!.time : 0;
    this.addKeyframe(currentTime + Math.max(0, Number(duration)), targetPose);
    return this;
  }

  retime(options: { scale?: number; offset?: number } = {}): AnimationAsset {
    const scale = options.scale ?? 1;
    const offset = options.offset ?? 0;
    if (scale <= 0) {
      throw new AssetValidationError('AnimationAsset.retime scale must be > 0.');
    }
    this.keyframes.forEach(frame => {
      frame.time = parseTime(frame.time * scale + offset);
    });
    this.keyframes.sort((a, b) => a.time - b.time);
    return this;
  }

  appendClip(clip: AnimationAsset, options: { gap?: number } = {}): AnimationAsset {
    if (clip.rigId !== this.rigId) {
      throw new AssetValidationError('appendClip requires both clips to use the same rig.');
    }
    const startTime = this.keyframes.length > 0 ? this.keyframes[this.keyframes.length - 1]!.time : 0;
    const offset = startTime + Math.max(0, Number(options.gap ?? 0));
    const baseTime = clip.keyframes.length > 0 ? clip.keyframes[0]!.time : 0;
    clip.keyframes.forEach(frame => {
      this.addKeyframe(offset + (frame.time - baseTime), frame.pose, { easing: frame.easing });
    });
    this.characterCount = Math.max(this.characterCount, clip.characterCount);
    return this;
  }

  validate(): void {
    if (!this.name) {
      throw new AssetValidationError('AnimationAsset.name must not be empty.');
    }
    const normalizedFrames = this.normalizedKeyframes();
    if (this.effects !== null) {
      this.effects.validate();
      if (this.effects.targetCharacter >= this.characterCount) {
        throw new AssetValidationError('AnimationAsset.effects.targetCharacter must be within scene.characterCount.');
      }
    }
    validateKeyframes(normalizedFrames, this.rigId, this.characterCount);
  }

  normalizedKeyframes(): KeyframeDict[] {
    return normalizeKeyframes(this.keyframes, this.rigId, { characterCount: this.characterCount });
  }

  toDict(): AnimationAssetDict {
    this.validate();
    return {
      format: FAST_POSER_ASSET_FORMAT,
      version: FAST_POSER_ASSET_VERSION,
      type: ANIMATION_ASSET_TYPE,
      name: this.name,
      savedAt: this.savedAt,
      scene: buildScene(this.characterCount, this.characterColors),
      playbackSpeed: this.playbackSpeed,
      effects: this.effects?.toDict() ?? null,
      keyframes: this.normalizedKeyframes(),
    };
  }

  toJSON(indent = 2): string {
    return JSON.stringify(this.toDict(), null, indent);
  }
}

export function validatePoseDict(pose: Record<string, unknown>, rigId: string, characterCount: number): void {
  const rig = getRig(rigId);
  const expected = new Set<string>();
  for (let characterIndex = 0; characterIndex < Math.max(0, characterCount); characterIndex += 1) {
    rig.joints.forEach(joint => {
      expected.add(getJointName(joint.baseName, characterIndex));
    });
  }

  const actual = new Set(Object.keys(pose));
  const missing = [...expected].filter(jointName => !actual.has(jointName));
  const extra = [...actual].filter(jointName => !expected.has(jointName));
  if (missing.length > 0 || extra.length > 0) {
    const message: string[] = [];
    if (missing.length > 0) {
      message.push(`missing joints: ${missing.slice(0, 6).join(', ')}`);
    }
    if (extra.length > 0) {
      message.push(`unexpected joints: ${extra.slice(0, 6).join(', ')}`);
    }
    throw new AssetValidationError(`Pose joint coverage is invalid for ${rigId}: ${message.join('; ')}`);
  }

  Object.entries(pose).forEach(([jointName, transform]) => {
    const parsed = parseJointName(jointName);
    if (!parsed || parsed.characterIndex >= characterCount) {
      throw new AssetValidationError(`Invalid joint name '${jointName}' for characterCount=${characterCount}.`);
    }
    normalizeTransform(transform);
  });
}

export function validateKeyframes(
  keyframes: Iterable<Record<string, unknown> | KeyframeDict>,
  rigId: string,
  characterCount: number,
): void {
  let previousTime = -1;
  for (const frame of keyframes) {
    if (!isRecord(frame)) {
      throw new AssetValidationError('Each keyframe must be a mapping.');
    }
    const time = parseTime(frame.time);
    if (time < previousTime) {
      throw new AssetValidationError('Animation keyframes must be sorted by ascending time.');
    }
    previousTime = time;
    if (!isRecord(frame.pose)) {
      throw new AssetValidationError('Each keyframe must include a pose mapping.');
    }
    normalizeKeyframeEasing(frame.easing);
    validatePoseDict(frame.pose, rigId, characterCount);
  }
}

export function newPose(name: string, options: NewPoseOptions = {}): PoseAsset {
  return PoseAsset.new(name, options);
}

export function newAnimation(name: string, options: NewAnimationOptions = {}): AnimationAsset {
  return AnimationAsset.new(name, options);
}

export function buildWorldTransforms(
  pose: PoseInput,
  rigId: string | RigSpec = R11_CORE_ID,
  characterIndex = 0,
): Record<string, WorldTransform> {
  const rig = typeof rigId === 'string' ? getRig(rigId) : rigId;
  const normalized = pose instanceof Pose
    ? pose.normalized()
    : normalizePose(pose, {
      rig,
      characterCount: Math.max(1, inferCharacterCount(pose)),
    });
  const world: Record<string, WorldTransform> = {};

  rig.joints.forEach(joint => {
    const jointName = getJointName(joint.baseName, characterIndex);
    const local = normalized[jointName];
    if (!local) {
      throw new AssetValidationError(`Missing joint "${jointName}" in normalized pose.`);
    }
    if (joint.parent === null) {
      world[joint.baseName] = {
        position: clonePosition(local.position),
        quaternion: normalizeQuaternion(local.quaternion),
      };
      return;
    }
    const parentWorld = world[joint.parent];
    if (!parentWorld) {
      throw new AssetValidationError(`Missing parent joint "${joint.parent}" before "${joint.baseName}".`);
    }
    world[joint.baseName] = composeTransforms(parentWorld, {
      position: clonePosition(local.position),
      quaternion: normalizeQuaternion(local.quaternion),
    });
  });

  return world;
}
