import type {
  DifficultySpec,
  GameState,
  PaceOffer,
  PracticeState,
  Round,
  Rule,
} from './types';
import {
  applyRule,
  buildWorkedExample,
  createSeededRng,
  generateConnectedTrail,
  trailKey,
  toTrailSteps,
  type Rng,
} from './trails';

export const SMOOTH_WINS_FOR_HARDER = 2;
export const COMPLETIONS_BEFORE_REOFFER = 3;
export const HELPED_STREAK_FOR_EASIER = 2;
export const MAX_STAGE = 6;
export const GRID = 4;
export const MAX_GRID = 4;
export const MAX_STEPS = 9;

/**
 * Ladder: stages 1–2 stay gentle, then memory load climbs hard.
 * Always 4×4 — only trail length + rule change.
 */
const STAGE6_TIERS: Array<{ steps: number }> = [
  { steps: 7 },
  { steps: 8 },
  { steps: 8 },
  { steps: 9 },
  { steps: 9 },
];

/** Reverse mode: soft start, then real backward-memory challenge. */
const REVERSE_TIERS: Array<{ steps: number }> = [
  { steps: 3 },
  { steps: 4 },
  { steps: 5 },
  { steps: 6 },
  { steps: 7 },
  { steps: 8 },
  { steps: 9 },
];

export function defaultPracticeState(): PracticeState {
  return {
    stage: 1,
    unlockedStage: 1,
    unlockedRules: ['forward'],
    smoothWinsAtPace: 0,
    completionsSinceStay: COMPLETIONS_BEFORE_REOFFER,
    consecutiveHelped: 0,
    stage6Tier: 0,
    seenReverseExample: false,
    seenMirrorExample: false,
    lastTrailKey: null,
    pendingOffer: null,
    totalCompletions: 0,
  };
}

function clampStage(stage: number): number {
  return Math.min(MAX_STAGE, Math.max(1, stage));
}

function pickMixedRule(unlocked: Rule[], rng: Rng): Rule {
  const pool = unlocked.length > 0 ? unlocked : (['forward'] as Rule[]);
  return pool[Math.floor(rng() * pool.length)]!;
}

/** Resolve board size, step count, and rule for the current pace. */
export function difficultyFor(practice: PracticeState, rng: Rng = Math.random): DifficultySpec {
  const stage = clampStage(practice.stage);

  if (stage === 1) {
    // Warm-up — short and friendly.
    return { stage, rows: GRID, cols: GRID, steps: 3, rule: 'forward' };
  }
  if (stage === 2) {
    // Still gentle — one more tile of memory.
    return { stage, rows: GRID, cols: GRID, steps: 4, rule: 'forward' };
  }
  if (stage === 3) {
    return { stage, rows: GRID, cols: GRID, steps: 5, rule: 'forward' };
  }
  if (stage === 4) {
    return { stage, rows: GRID, cols: GRID, steps: 6, rule: 'reverse' };
  }
  if (stage === 5) {
    return { stage, rows: GRID, cols: GRID, steps: 7, rule: 'mirror' };
  }

  const tier = STAGE6_TIERS[Math.min(practice.stage6Tier, STAGE6_TIERS.length - 1)]!;
  return {
    stage: 6,
    rows: GRID,
    cols: GRID,
    steps: tier.steps,
    rule: pickMixedRule(practice.unlockedRules, rng),
  };
}

/** One step easier without locking away unlocked stages/rules. */
export function easierDifficulty(practice: PracticeState): Pick<
  PracticeState,
  'stage' | 'stage6Tier'
> {
  if (practice.stage === 6 && practice.stage6Tier > 0) {
    return { stage: 6, stage6Tier: practice.stage6Tier - 1 };
  }
  if (practice.stage > 1) {
    return {
      stage: practice.stage - 1,
      stage6Tier: 0,
    };
  }
  return { stage: 1, stage6Tier: 0 };
}

export function harderPace(practice: PracticeState): Pick<
  PracticeState,
  'stage' | 'unlockedStage' | 'unlockedRules' | 'stage6Tier'
> {
  if (practice.stage < 6) {
    const stage = practice.stage + 1;
    const unlockedRules: Rule[] = [...practice.unlockedRules];
    if (stage >= 4 && !unlockedRules.includes('reverse')) {
      unlockedRules.push('reverse');
    }
    if (stage >= 5 && !unlockedRules.includes('mirror')) {
      unlockedRules.push('mirror');
    }
    return {
      stage,
      unlockedStage: Math.max(practice.unlockedStage, stage),
      unlockedRules,
      stage6Tier: 0,
    };
  }

  const stage6Tier = Math.min(STAGE6_TIERS.length - 1, practice.stage6Tier + 1);
  return {
    stage: 6,
    unlockedStage: Math.max(practice.unlockedStage, 6),
    unlockedRules: practice.unlockedRules,
    stage6Tier,
  };
}

export function isSmoothWin(state: GameState): boolean {
  return (
    state.phase === 'complete' &&
    !state.usedHint &&
    !state.usedReplay &&
    !state.hadIncorrectTap
  );
}

export function neededHelp(state: GameState): boolean {
  return state.usedHint || state.usedReplay || state.hadIncorrectTap;
}

/** Reverse-mode board size/steps from how many Reverse wins the player has. */
export function reverseDifficulty(reverseCompletions: number): DifficultySpec {
  const tier =
    REVERSE_TIERS[Math.min(Math.max(0, reverseCompletions), REVERSE_TIERS.length - 1)]!;
  return {
    stage: 4,
    rows: GRID,
    cols: GRID,
    steps: tier.steps,
    rule: 'reverse',
  };
}

export function createReverseRound(
  reverseCompletions: number,
  roundIndex: number,
  rng: Rng = Math.random,
  avoidKey: string | null = null,
): Round {
  const diff = reverseDifficulty(reverseCompletions);
  const forwardCells = generateConnectedTrail(
    diff.rows,
    diff.cols,
    diff.steps,
    rng,
    avoidKey,
  );
  const echoCells = applyRule(forwardCells, 'reverse', diff.cols);
  const key = trailKey(forwardCells);
  return {
    id: `reverse:${roundIndex}:${key}`,
    index: roundIndex,
    rows: diff.rows,
    cols: diff.cols,
    forwardCells,
    trail: toTrailSteps(echoCells),
    rule: 'reverse',
  };
}

export function createPracticeRound(
  practice: PracticeState,
  roundIndex: number,
  rng: Rng = Math.random,
): { round: Round; practice: PracticeState; showExample: boolean; exampleRule?: 'reverse' | 'mirror' } {
  const diff = difficultyFor(practice, rng);
  const showReverseExample = diff.rule === 'reverse' && !practice.seenReverseExample;
  const showMirrorExample = diff.rule === 'mirror' && !practice.seenMirrorExample;

  if (showReverseExample || showMirrorExample) {
    const rule = showReverseExample ? 'reverse' : 'mirror';
    const example = buildWorkedExample(rule);
    return {
      showExample: true,
      exampleRule: rule,
      practice,
      round: {
        id: `practice:example:${rule}:${roundIndex}`,
        index: roundIndex,
        rows: example.rows,
        cols: example.cols,
        forwardCells: example.forwardCells,
        trail: toTrailSteps(example.echoCells),
        rule,
      },
    };
  }

  const forwardCells = generateConnectedTrail(
    diff.rows,
    diff.cols,
    diff.steps,
    rng,
    practice.lastTrailKey,
  );
  const echoCells = applyRule(forwardCells, diff.rule, diff.cols);
  const key = trailKey(forwardCells);

  return {
    showExample: false,
    practice: {
      ...practice,
      lastTrailKey: key,
    },
    round: {
      id: `practice:${roundIndex}:${key}:${diff.rule}`,
      index: roundIndex,
      rows: diff.rows,
      cols: diff.cols,
      forwardCells,
      trail: toTrailSteps(echoCells),
      rule: diff.rule,
    },
  };
}

export function markExampleSeen(
  practice: PracticeState,
  rule: 'reverse' | 'mirror',
): PracticeState {
  if (rule === 'reverse') {
    return { ...practice, seenReverseExample: true };
  }
  return { ...practice, seenMirrorExample: true };
}

/**
 * Apply a completed round to Practice state.
 * Every completion is a win; smooth wins drive the harder offer.
 */
export function recordPracticeCompletion(
  practice: PracticeState,
  game: GameState,
): PracticeState {
  const smooth = isSmoothWin(game);
  const helped = neededHelp(game);

  let smoothWinsAtPace = practice.smoothWinsAtPace;
  let consecutiveHelped = practice.consecutiveHelped;
  let completionsSinceStay = practice.completionsSinceStay;
  let pendingOffer: PaceOffer = null;

  if (helped) {
    consecutiveHelped += 1;
    smoothWinsAtPace = 0;
  } else if (smooth) {
    consecutiveHelped = 0;
    smoothWinsAtPace += 1;
  } else {
    consecutiveHelped = 0;
  }

  completionsSinceStay += 1;

  const canOfferHarder =
    smoothWinsAtPace >= SMOOTH_WINS_FOR_HARDER &&
    completionsSinceStay >= COMPLETIONS_BEFORE_REOFFER &&
    !(practice.stage === 6 && practice.stage6Tier >= STAGE6_TIERS.length - 1);

  const canOfferEasier =
    consecutiveHelped >= HELPED_STREAK_FOR_EASIER &&
    (practice.stage > 1 || practice.stage6Tier > 0);

  // Prefer easier when struggling; otherwise harder when ready.
  if (canOfferEasier) {
    pendingOffer = 'easier';
  } else if (canOfferHarder) {
    pendingOffer = 'harder';
  }

  return {
    ...practice,
    smoothWinsAtPace,
    consecutiveHelped,
    completionsSinceStay,
    pendingOffer,
    totalCompletions: practice.totalCompletions + 1,
  };
}

export function chooseHarder(practice: PracticeState): PracticeState {
  const next = harderPace(practice);
  return {
    ...practice,
    ...next,
    smoothWinsAtPace: 0,
    completionsSinceStay: 0,
    consecutiveHelped: 0,
    pendingOffer: null,
  };
}

export function chooseKeepPace(practice: PracticeState): PracticeState {
  return {
    ...practice,
    smoothWinsAtPace: 0,
    completionsSinceStay: 0,
    consecutiveHelped: 0,
    pendingOffer: null,
  };
}

export function chooseEasier(practice: PracticeState): PracticeState {
  const next = easierDifficulty(practice);
  return {
    ...practice,
    ...next,
    // Unlocked stage/rules preserved.
    smoothWinsAtPace: 0,
    completionsSinceStay: 0,
    consecutiveHelped: 0,
    pendingOffer: null,
  };
}

/** Build a real (non-example) practice round after the example card. */
export function createPracticeRoundAfterExample(
  practice: PracticeState,
  roundIndex: number,
  rule: 'reverse' | 'mirror',
  rng: Rng = Math.random,
): { round: Round; practice: PracticeState } {
  const marked = markExampleSeen(practice, rule);
  const built = createPracticeRound(marked, roundIndex, rng);
  if (!built.showExample) {
    return { round: built.round, practice: built.practice };
  }

  // Safety: force a live round if flags somehow still request an example.
  const diff = difficultyFor(marked, rng);
  const forwardCells = generateConnectedTrail(
    diff.rows,
    diff.cols,
    diff.steps,
    rng,
    marked.lastTrailKey,
  );
  const key = trailKey(forwardCells);
  return {
    practice: {
      ...marked,
      lastTrailKey: key,
    },
    round: {
      id: `practice:${roundIndex}:${key}:${rule}`,
      index: roundIndex,
      rows: diff.rows,
      cols: diff.cols,
      forwardCells,
      trail: toTrailSteps(applyRule(forwardCells, rule, diff.cols)),
      rule,
    },
  };
}

export { createSeededRng };
