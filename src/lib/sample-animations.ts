export type SampleAnimationGroup = 'walk' | 'jump' | 'interaction' | 'summon';

export type SampleAnimation = {
  id: string;
  label: string;
  file: string;
  group: SampleAnimationGroup;
  motionScale?: number;
};

export const SAMPLE_ANIMATIONS: SampleAnimation[] = [
  { id: 'walking', label: 'Walking Stylized', file: 'walking-anim.animation.json', group: 'walk' },
  { id: 'walking-realistic', label: 'Walking Realistic', file: 'walking-realistic.animation.json', group: 'walk' },
  { id: 'forwardflip', label: 'Forward Flip', file: 'forwardflip.animation.json', group: 'jump', motionScale: 0.88 },
  { id: 'forwardflip-realistic', label: 'Forward Flip Realistic', file: 'forwardflip-realistic.animation.json', group: 'jump', motionScale: 0.72 },
  { id: 'spinningkick', label: 'Spinning Kick', file: 'spinningkick.animation.json', group: 'jump', motionScale: 0.42 },
  { id: 'spinningkick-realistic', label: 'Spinning Kick Realistic', file: 'spinningkick-realistic.animation.json', group: 'jump', motionScale: 0.34 },
  { id: 'spinningslash-overdrive', label: 'Spinning Slash Overdrive', file: 'spinningslash-overdrive.animation.json', group: 'jump', motionScale: 0.38 },
  { id: 'spear', label: 'Spear Duel', file: 'spear.animation.json', group: 'interaction', motionScale: 1 },
  { id: 'spear-realistic', label: 'Spear Duel Realistic', file: 'spear-realistic.animation.json', group: 'interaction', motionScale: 1 },
  { id: 'powerbomb', label: 'Powerbomb', file: 'powerbomb.animation.json', group: 'interaction' },
  { id: 'powerbomb-v2', label: 'Powerbomb V2', file: 'powerbombv2.animation.json', group: 'interaction' },
  { id: 'two-character-fight', label: 'Two Character Fight', file: 'two-character-fight.animation.json', group: 'interaction' },
  { id: 'summoning-magic', label: 'Summoning Magic', file: 'summoning-magic.animation.json', group: 'summon', motionScale: 0.08 }
];

export function getAnimationUrl(file: string) {
  return `./Animations/${file}`;
}
