/**
 * Practice progression + trail rules verification.
 * Run: npx --yes tsx src/game/verifyPractice.ts
 */
import {
  beginRecall,
  createGame,
  createPracticeGame,
  dismissWorkedExample,
  seeTrailAgain,
  showNextTile,
  tapCell,
} from './engine';
import {
  chooseEasier,
  chooseHarder,
  chooseKeepPace,
  COMPLETIONS_BEFORE_REOFFER,
  createSeededRng,
  defaultPracticeState,
  difficultyFor,
  easierDifficulty,
  harderPace,
  HELPED_STREAK_FOR_EASIER,
  recordPracticeCompletion,
  SMOOTH_WINS_FOR_HARDER,
} from './practice';
import {
  applyRule,
  cellToRowCol,
  generateConnectedTrail,
  mirrorCell,
  orthogonalNeighbors,
  trailKey,
} from './trails';
import type { GameState, PracticeState } from './types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function applyTap(state: GameState, cellId: number): GameState {
  const result = tapCell(state, cellId);
  assert(result.kind !== 'ignored', 'tap ignored unexpectedly');
  return result.state;
}

function completeSmooth(game: GameState): GameState {
  let state = beginRecall(game);
  for (const step of state.round.trail) {
    state = applyTap(state, step.cellId);
  }
  assert(state.phase === 'complete', 'round complete');
  return state;
}

function completeWithHelp(game: GameState): GameState {
  let state = beginRecall(game);
  const expected = state.round.trail[0]!.cellId;
  const wrongCell =
    Array.from({ length: state.round.rows * state.round.cols }, (_, i) => i).find(
      (cellId) => cellId !== expected,
    ) ?? expected;
  state = applyTap(state, wrongCell);
  for (const step of state.round.trail) {
    state = applyTap(state, step.cellId);
  }
  return state;
}

function verifyMirrorCornersAndWidths() {
  // Odd width 3: corners swap L↔R, center col fixed.
  assert(mirrorCell(0, 3) === 2, '3× corner 0→2');
  assert(mirrorCell(2, 3) === 0, '3× corner 2→0');
  assert(mirrorCell(6, 3) === 8, '3× corner 6→8');
  assert(mirrorCell(8, 3) === 6, '3× corner 8→6');
  assert(mirrorCell(4, 3) === 4, '3× center fixed');
  assert(mirrorCell(1, 3) === 1, '3× mid-top fixed');

  // Even width 4: corners swap, no fixed center column.
  assert(mirrorCell(0, 4) === 3, '4× corner 0→3');
  assert(mirrorCell(3, 4) === 0, '4× corner 3→0');
  assert(mirrorCell(12, 4) === 15, '4× corner 12→15');
  assert(mirrorCell(15, 4) === 12, '4× corner 15→12');
  assert(mirrorCell(1, 4) === 2, '4× inner');
  assert(mirrorCell(5, 4) === 6, '4× row1');
}

function verifyConnectedGeneration() {
  const rng = createSeededRng(42);
  for (const [rows, cols, steps] of [
    [3, 3, 3],
    [3, 3, 4],
    [4, 4, 5],
    [5, 5, 8],
  ] as const) {
    const path = generateConnectedTrail(rows, cols, steps, rng, null);
    assert(path.length === steps, `${rows}×${cols} length`);
    assert(new Set(path).size === steps, 'no repeated tiles');
    for (let i = 1; i < path.length; i += 1) {
      const prev = path[i - 1]!;
      const curr = path[i]!;
      assert(
        orthogonalNeighbors(prev, rows, cols).includes(curr),
        'orthogonal only (no diagonal)',
      );
    }
  }

  const a = generateConnectedTrail(3, 3, 3, createSeededRng(7), null);
  const b = generateConnectedTrail(3, 3, 3, createSeededRng(7), trailKey(a));
  // Same seed after avoid may still collide on tiny boards; ensure generator returns a path.
  assert(b.length === 3, 'avoid path still generated');
}

function verifyReverseAndMirrorRules() {
  const forward = [0, 3, 4];
  assert(applyRule(forward, 'reverse', 3).join(',') === '4,3,0', 'reverse order');
  assert(applyRule(forward, 'mirror', 3).join(',') === '2,5,4', 'mirror cells');
  assert(applyRule(forward, 'forward', 3).join(',') === '0,3,4', 'forward intact');
}

function verifyStageBoundaries() {
  let p = defaultPracticeState();
  assert(difficultyFor(p).steps === 3 && difficultyFor(p).rows === 3, 'stage 1');
  p = { ...p, stage: 2 };
  assert(difficultyFor(p).steps === 4, 'stage 2');
  p = { ...p, stage: 3 };
  assert(difficultyFor(p).rows === 4 && difficultyFor(p).steps === 5, 'stage 3');
  p = { ...p, stage: 4 };
  assert(difficultyFor(p).rule === 'reverse' && difficultyFor(p).steps === 4, 'stage 4');
  p = { ...p, stage: 5 };
  assert(difficultyFor(p).rule === 'mirror' && difficultyFor(p).steps === 3, 'stage 5');
  p = { ...p, stage: 6, stage6Tier: 4, unlockedRules: ['forward', 'reverse', 'mirror'] };
  const d6 = difficultyFor(p, createSeededRng(1));
  assert(d6.rows === 5 && d6.steps === 8, 'stage 6 max tier');

  const hard = harderPace({ ...defaultPracticeState(), stage: 6, stage6Tier: 4 });
  assert(hard.stage6Tier === 4, 'cannot exceed max tier');

  const easyFrom1 = easierDifficulty(defaultPracticeState());
  assert(easyFrom1.stage === 1, 'stage 1 floor');
}

function verifySmoothWinOffers() {
  let practice = defaultPracticeState();
  let roundIndex = 1;

  for (let i = 0; i < SMOOTH_WINS_FOR_HARDER; i += 1) {
    const started = createPracticeGame(practice, roundIndex);
    practice = started.practice;
    assert(started.game.phase === 'study', 'practice study');
    const done = completeSmooth(started.game);
    practice = recordPracticeCompletion(practice, done);
    roundIndex += 1;
  }
  assert(practice.pendingOffer === 'harder', 'offer harder after 3 smooth wins');

  // Keep pace → wait for more completions before re-offer.
  practice = chooseKeepPace(practice);
  assert(practice.pendingOffer === null, 'offer cleared');
  assert(practice.completionsSinceStay === 0, 'stay resets counter');

  for (let i = 0; i < COMPLETIONS_BEFORE_REOFFER - 1; i += 1) {
    const started = createPracticeGame(practice, roundIndex++);
    practice = started.practice;
    const done = completeSmooth(started.game);
    practice = recordPracticeCompletion(practice, done);
  }
  assert(practice.pendingOffer === null, 'no re-offer before 3 completions');

  const third = createPracticeGame(practice, roundIndex++);
  practice = third.practice;
  practice = recordPracticeCompletion(practice, completeSmooth(third.game));
  // Need 3 smooth at pace again AND completionsSinceStay >= 3.
  // After stay, smoothWins reset; one smooth isn't enough for harder.
  assert(practice.pendingOffer !== 'harder' || practice.smoothWinsAtPace >= SMOOTH_WINS_FOR_HARDER, 'harder gated');
}

function verifyHarderThenEasier() {
  let practice: PracticeState = {
    ...defaultPracticeState(),
    stage: 2,
    unlockedStage: 2,
    smoothWinsAtPace: SMOOTH_WINS_FOR_HARDER,
    completionsSinceStay: COMPLETIONS_BEFORE_REOFFER,
  };
  practice = chooseHarder(practice);
  assert(practice.stage === 3, 'harder advances stage');
  assert(practice.unlockedStage === 3, 'unlock preserved upward');

  practice = {
    ...practice,
    consecutiveHelped: HELPED_STREAK_FOR_EASIER,
    pendingOffer: 'easier',
  };
  const unlockedBefore = practice.unlockedStage;
  const rulesBefore = [...practice.unlockedRules];
  practice = chooseEasier(practice);
  assert(practice.stage === 2, 'easier drops current pace');
  assert(practice.unlockedStage === unlockedBefore, 'unlocked stage kept');
  assert(
    practice.unlockedRules.join(',') === rulesBefore.join(','),
    'unlocked rules kept',
  );
}

function verifyHelpedStreakOffersEasier() {
  let practice = { ...defaultPracticeState(), stage: 2, unlockedStage: 2 };
  let roundIndex = 10;
  for (let i = 0; i < HELPED_STREAK_FOR_EASIER; i += 1) {
    const started = createPracticeGame(practice, roundIndex++);
    practice = started.practice;
    const done = completeWithHelp(started.game);
    practice = recordPracticeCompletion(practice, done);
  }
  assert(practice.pendingOffer === 'easier', 'easier after helped streak');
}

function verifyReverseExample() {
  let practice: PracticeState = {
    ...defaultPracticeState(),
    stage: 4,
    unlockedStage: 4,
    unlockedRules: ['forward', 'reverse'],
    seenReverseExample: false,
  };
  const started = createPracticeGame(practice, 20);
  assert(started.game.phase === 'example', 'reverse example first');
  assert(started.game.round.rule === 'reverse', 'example rule');
  const dismissed = dismissWorkedExample(started.game, started.practice);
  assert(dismissed.game.phase === 'study', 'live reverse study');
  assert(dismissed.practice.seenReverseExample, 'example marked seen');
  assert(dismissed.game.round.trail[0]!.cellId === dismissed.game.round.forwardCells.at(-1), 'starts at last tile');
}

function verifyFtueStillWorks() {
  let state = createGame(1);
  state = completeSmooth(state);
  assert(state.round.index === 1, 'ftue round 1');
}

function verifyReplayStillCounts() {
  const started = createPracticeGame(defaultPracticeState(), 1);
  let practice = started.practice;
  let state = beginRecall(started.game);
  state = seeTrailAgain(state);
  state = beginRecall(state);
  for (const step of state.round.trail) {
    state = applyTap(state, step.cellId);
  }
  assert(state.usedReplay, 'replay flagged');
  practice = recordPracticeCompletion(practice, state);
  assert(practice.totalCompletions === 1, 'completion still counts');
  assert(practice.smoothWinsAtPace === 0, 'replay is not smooth');
}

function verifyHintPath() {
  let state = createPracticeGame(defaultPracticeState(), 1).game;
  state = beginRecall(state);
  const expected = state.round.trail[0]!.cellId;
  const other =
    Array.from({ length: state.round.rows * state.round.cols }, (_, i) => i).find(
      (cellId) => cellId !== expected,
    ) ?? expected;
  const w1 = tapCell(state, other);
  assert(w1.kind === 'wrong', 'hint setup wrong 1');
  state = w1.state;
  const w2 = tapCell(state, other);
  assert(w2.kind === 'wrong', 'hint setup wrong 2');
  state = w2.state;
  state = showNextTile(state);
  assert(state.hintCellId === expected, 'hint shows next');
  const done = tapCell(state, expected);
  assert(done.kind === 'correct' || done.kind === 'complete', 'hinted tap works');
}

function main() {
  verifyMirrorCornersAndWidths();
  verifyConnectedGeneration();
  verifyReverseAndMirrorRules();
  verifyStageBoundaries();
  verifySmoothWinOffers();
  verifyHarderThenEasier();
  verifyHelpedStreakOffersEasier();
  verifyReverseExample();
  verifyFtueStillWorks();
  verifyReplayStillCounts();
  verifyHintPath();

  // Spot-check row/col helpers used by mirrors.
  assert(cellToRowCol(5, 4).row === 1 && cellToRowCol(5, 4).col === 1, 'row/col');

  console.log('Practice verification passed.');
}

main();
