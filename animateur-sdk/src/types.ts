export type Vector3 = [number, number, number];
export type Quaternion = [number, number, number, number];
export type Vector3Input = Iterable<number> | ArrayLike<number>;
export type QuaternionInput = Iterable<number> | ArrayLike<number>;
export type KeyframeEasing =
  | 'linear'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic';

export interface JointSpec {
  readonly baseName: string;
  readonly parent: string | null;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
}

export interface PreviewGeometryHint {
  readonly size: readonly [number, number, number];
  readonly pivotYOffset: number;
}

export interface RigSpec {
  readonly id: string;
  readonly derivedFrom: string | null;
  readonly joints: readonly JointSpec[];
  readonly previewGeometry: Readonly<Record<string, PreviewGeometryHint>>;
}

export interface PoseTransform {
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
}

export type SerializedTransform = {
  position: Vector3;
  quaternion: Quaternion;
};

export type SerializedPose = Record<string, SerializedTransform>;

export interface KeyframeDict {
  time: number;
  pose: SerializedPose;
  easing?: KeyframeEasing;
}

export interface SceneDict {
  characterCount: number;
  characterColors: string[];
}

export interface ArcaneSummonEffectDict {
  preset: 'arcane-summon';
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
}

export interface PoseAssetDict {
  format: 'fast-poser-asset';
  version: 1;
  type: 'pose';
  name: string;
  savedAt: string;
  scene: SceneDict;
  pose: SerializedPose;
}

export interface AnimationAssetDict {
  format: 'fast-poser-asset';
  version: 1;
  type: 'animation';
  name: string;
  savedAt: string;
  scene: SceneDict;
  playbackSpeed: number;
  effects: ArcaneSummonEffectDict | null;
  keyframes: KeyframeDict[];
}

export interface PosePreset {
  readonly id: string;
  readonly joints: Readonly<Record<string, PoseTransform>>;
}

export interface GroundSegmentSpec {
  readonly start: string;
  readonly end: string;
  readonly radius: number;
}

export interface UalHints {
  readonly directionalTargets: Readonly<Record<string, string>>;
  readonly groundSegments: readonly GroundSegmentSpec[];
}

export interface SegmentLayoutSpec {
  readonly bone: string;
  readonly parent: string | null;
  readonly child: string | null;
  readonly size: readonly [number, number, number];
  readonly anchor: string;
  readonly length: number;
  readonly divisions: number;
  readonly blend: number;
}

export interface AutoSkinSegmentSpec {
  readonly bone: string;
  readonly start: string;
  readonly end: string;
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly radius: number;
  readonly region: string;
}

export interface WorldTransform {
  position: Vector3;
  quaternion: Quaternion;
}
