export type AnimationEffectPreset = 'arcane-summon' | 'blade-storm';

export type AnimationEffect =
  | {
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
  | {
      preset: 'blade-storm';
      targetCharacter: number;
      weaponId: number;
      anchorJoint: string;
      startTime: number;
      peakTime: number;
      endTime: number;
      bladeLength: number;
      trailLength: number;
      trailWidth: number;
      shockwaveRadius: number;
      sparkCount: number;
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
      glowColor: string;
    };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundEffectTime(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

export function normalizeHexColor(value: unknown, fallback: string) {
  const source = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const match = source.match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

export function normalizeAnimationEffects(data: any): AnimationEffect | null {
  if (!data || typeof data.preset !== 'string') return null;

  const startTime = Math.max(0, Number.parseFloat(data.startTime) || 0);
  const peakTime = Math.max(startTime + 0.1, Number.parseFloat(data.peakTime) || startTime + 1.8);
  const endTime = Math.max(peakTime + 0.1, Number.parseFloat(data.endTime) || peakTime + 1.6);

  if (data.preset === 'arcane-summon') {
    return {
      preset: 'arcane-summon',
      targetCharacter: Math.max(0, Number.parseInt(data.targetCharacter, 10) || 0),
      startTime: roundEffectTime(startTime),
      peakTime: roundEffectTime(peakTime),
      endTime: roundEffectTime(endTime),
      radius: clamp(Number.parseFloat(data.radius) || 3.2, 1.5, 6),
      columnHeight: clamp(Number.parseFloat(data.columnHeight) || 6.2, 2.5, 10),
      primaryColor: normalizeHexColor(data.primaryColor, '#63f3ff'),
      secondaryColor: normalizeHexColor(data.secondaryColor, '#5b36ff'),
      accentColor: normalizeHexColor(data.accentColor, '#ffd36b'),
      glowColor: normalizeHexColor(data.glowColor, '#f0f9ff')
    };
  }

  if (data.preset === 'blade-storm') {
    return {
      preset: 'blade-storm',
      targetCharacter: Math.max(0, Number.parseInt(data.targetCharacter, 10) || 0),
      weaponId: Math.max(0, Number.parseInt(data.weaponId, 10) || 0),
      anchorJoint: String(data.anchorJoint || 'Right_Lower_Arm_0').trim() || 'Right_Lower_Arm_0',
      startTime: roundEffectTime(startTime),
      peakTime: roundEffectTime(peakTime),
      endTime: roundEffectTime(endTime),
      bladeLength: clamp(Number.parseFloat(data.bladeLength) || 2.8, 0.8, 5.5),
      trailLength: clamp(Number.parseInt(data.trailLength, 10) || 24, 8, 48),
      trailWidth: clamp(Number.parseFloat(data.trailWidth) || 0.52, 0.16, 1.35),
      shockwaveRadius: clamp(Number.parseFloat(data.shockwaveRadius) || 3.4, 1.2, 6.5),
      sparkCount: clamp(Number.parseInt(data.sparkCount, 10) || 96, 24, 180),
      primaryColor: normalizeHexColor(data.primaryColor, '#67f8ff'),
      secondaryColor: normalizeHexColor(data.secondaryColor, '#8b5cff'),
      accentColor: normalizeHexColor(data.accentColor, '#fff06a'),
      glowColor: normalizeHexColor(data.glowColor, '#f7fbff')
    };
  }

  return null;
}
