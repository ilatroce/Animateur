import {
  AUTORIG_AUTO_SKIN_SEGMENTS as GENERATED_AUTORIG_AUTO_SKIN_SEGMENTS,
  AUTORIG_R18 as GENERATED_AUTORIG_R18,
  AUTORIG_SEGMENTS as GENERATED_AUTORIG_SEGMENTS,
  AUTORIG_UAL_HINTS as GENERATED_AUTORIG_UAL_HINTS,
  NEUTRAL_BIND_POSE as GENERATED_NEUTRAL_BIND_POSE,
  R11_CORE as GENERATED_R11_CORE,
  RELAXED_PREVIEW_POSE as GENERATED_RELAXED_PREVIEW_POSE,
} from '../generated/rig-spec.mjs';
import type {
  AutoSkinSegmentSpec,
  PosePreset,
  RigSpec,
  SegmentLayoutSpec,
  UalHints,
} from './types.js';

export const R11_CORE_ID = 'r11_core';
export const AUTORIG_R18_ID = 'autorig_r18';
export const NEUTRAL_BIND_ID = 'neutral_bind';
export const RELAXED_PREVIEW_ID = 'relaxed_preview';

export const R11_CORE = GENERATED_R11_CORE as RigSpec;
export const AUTORIG_R18 = GENERATED_AUTORIG_R18 as RigSpec;
export const AUTORIG_UAL_HINTS = GENERATED_AUTORIG_UAL_HINTS as UalHints;
export const NEUTRAL_BIND_POSE = GENERATED_NEUTRAL_BIND_POSE as PosePreset;
export const RELAXED_PREVIEW_POSE = GENERATED_RELAXED_PREVIEW_POSE as PosePreset;
export const AUTORIG_SEGMENTS = GENERATED_AUTORIG_SEGMENTS as readonly SegmentLayoutSpec[];
export const AUTORIG_AUTO_SKIN_SEGMENTS =
  GENERATED_AUTORIG_AUTO_SKIN_SEGMENTS as readonly AutoSkinSegmentSpec[];

export const RIGS_BY_ID: ReadonlyMap<string, RigSpec> = new Map([
  [R11_CORE_ID, R11_CORE],
  [AUTORIG_R18_ID, AUTORIG_R18],
]);

export const PRESETS_BY_ID: ReadonlyMap<string, PosePreset> = new Map([
  [NEUTRAL_BIND_ID, NEUTRAL_BIND_POSE],
  [RELAXED_PREVIEW_ID, RELAXED_PREVIEW_POSE],
]);

export const KNOWN_BASE_NAMES = new Set<string>([
  ...R11_CORE.joints.map(joint => joint.baseName),
  ...AUTORIG_R18.joints.map(joint => joint.baseName),
]);
