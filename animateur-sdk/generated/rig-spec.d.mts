export type Vector3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];

export interface GeneratedJointSpec {
  readonly baseName: string;
  readonly parent: string | null;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

export interface GeneratedPreviewGeometryHint {
  readonly size: Vector3;
  readonly pivotYOffset: number;
}

export interface GeneratedRigSpec {
  readonly id: string;
  readonly derivedFrom: string | null;
  readonly joints: readonly GeneratedJointSpec[];
  readonly previewGeometry: Readonly<Record<string, GeneratedPreviewGeometryHint>>;
}

export interface GeneratedPoseTransform {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

export interface GeneratedPosePreset {
  readonly id: string;
  readonly joints: Readonly<Record<string, GeneratedPoseTransform>>;
}

export interface GeneratedGroundSegmentSpec {
  readonly start: string;
  readonly end: string;
  readonly radius: number;
}

export interface GeneratedUalHints {
  readonly directionalTargets: Readonly<Record<string, string>>;
  readonly groundSegments: readonly GeneratedGroundSegmentSpec[];
}

export interface GeneratedSegmentLayoutSpec {
  readonly bone: string;
  readonly parent: string | null;
  readonly child: string | null;
  readonly size: Vector3;
  readonly anchor: string;
  readonly length: number;
  readonly divisions: number;
  readonly blend: number;
}

export interface GeneratedAutoSkinSegmentSpec {
  readonly bone: string;
  readonly start: string;
  readonly end: string;
  readonly a: Vector3;
  readonly b: Vector3;
  readonly radius: number;
  readonly region: string;
}

export const R11_CORE: GeneratedRigSpec;
export const AUTORIG_R18: GeneratedRigSpec;
export const AUTORIG_UAL_HINTS: GeneratedUalHints;
export const NEUTRAL_BIND_POSE: GeneratedPosePreset;
export const RELAXED_PREVIEW_POSE: GeneratedPosePreset;
export const AUTORIG_SEGMENTS: readonly GeneratedSegmentLayoutSpec[];
export const AUTORIG_AUTO_SKIN_SEGMENTS: readonly GeneratedAutoSkinSegmentSpec[];
