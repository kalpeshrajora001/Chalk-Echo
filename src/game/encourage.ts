import type { GameState } from './types';
import { trailLength } from './engine';

const PERFECT_LINES = [
  'Beautiful memory — that trail stuck with you.',
  'Sharp focus. Your mind held every step.',
  'Nailed it. That was clean chalk work.',
  'You kept the whole pattern. Impressive.',
];

const TOUGH_LINES = [
  'Close! The misses teach the next trail.',
  'Good try — your memory is warming up.',
  'Almost there. One more look and you will own it.',
  'Courage to finish. That is how memory grows.',
];

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length]!;
}

export function encouragementForComplete(state: GameState): string {
  const seed = state.round.index + state.echoedCellIds.length + trailLength(state);
  const missed = Object.values(state.cellGrades ?? {}).some((g) => g === 'missed');
  if (missed) {
    return pick(TOUGH_LINES, seed);
  }
  return pick(PERFECT_LINES, seed);
}

export function shareChallengeMessage(options: {
  tiles: number;
  wins: number;
  perfect: boolean;
  modeLabel: string;
}): string {
  const { tiles, wins, perfect, modeLabel } = options;
  const result = perfect
    ? `I just cleared a ${tiles}-tile ${modeLabel} trail on Chalk Echo with a clean score.`
    : `I just took on a ${tiles}-tile ${modeLabel} trail on Chalk Echo.`;

  const wish =
    'I wish you can play this game with me — challenge your memory, then challenge mine.';
  const invite =
    wins > 0
      ? `I am on ${wins} win${wins === 1 ? '' : 's'}. Think you can beat that?`
      : 'Think you can remember the trail better than me?';

  return [
    result,
    invite,
    wish,
    '',
    'Chalk Echo — remember the trail. Then give it a twist.',
    'Ask a friend or family member to try it too.',
  ].join('\n');
}
