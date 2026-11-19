/**
 * Pure simulation of the first-time experience.
 * Run: npx --yes tsx src/game/verifyFtue.ts
 */
import {
  advanceToNextFtueRound,
  beginRecall,
  canOfferHint,
  createIntroGame,
  createFtueRound,
  seeTrailAgain,
  showNextTile,
  tapCell,
} from './engine';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function playPerfectRecall(withHint: boolean) {
  let state = createIntroGame();
  assert(state.phase === 'study', 'starts in study');
  assert(state.round.rows === 4 && state.round.cols === 4, 'ftue is 4×4');
  assert(
    state.round.trail.map((s) => s.cellId).join(',') === '0,4,5',
    'round 1 is L-path 0-4-5',
  );

  state = beginRecall(state);
  assert(state.phase === 'recall', 'ready enters recall');

  if (withHint) {
    let wrong = tapCell(state, 1);
    assert(wrong.kind === 'wrong', 'wrong tap soft-fails');
    state = wrong.state;
    wrong = tapCell(state, 2);
    assert(wrong.kind === 'wrong', 'second wrong');
    state = wrong.state;
    assert(canOfferHint(state), 'hint offered after two wrongs');
    state = showNextTile(state);
    assert(state.hintCellId === 0, 'hint reveals tile 1');
  }

  let result = tapCell(state, 0);
  assert(result.kind === 'correct', 'tap 1');
  state = result.state;

  state = seeTrailAgain(state);
  assert(state.phase === 'study', 'replay returns to study');
  assert(state.echoedCellIds.length === 0, 'draw clears after peek');
  state = beginRecall(state);
  assert(state.nextOrder === 1, 'fresh draw after peek');

  result = tapCell(state, 0);
  assert(result.kind === 'correct', 'tap 1 again');
  state = result.state;

  result = tapCell(state, 4);
  assert(result.kind === 'correct', 'tap 2');
  state = result.state;

  result = tapCell(state, 5);
  assert(result.kind === 'complete', 'tap 3 completes');
  state = result.state;
  assert(state.phase === 'complete', 'complete phase');
  assert(state.cellGrades?.[0] === 'correct', 'graded correct');

  state = advanceToNextFtueRound(state);
  assert(state.round.index === 2, 'next trail is round 2');
  assert(
    state.round.trail.map((s) => s.cellId).join(',') === '3,7,6',
    'round 2 path differs',
  );
  assert(state.phase === 'study', 'next round starts in study');

  return state;
}

function main() {
  const round2 = createFtueRound(2);
  const round3 = createFtueRound(3);
  assert(
    round2.trail.map((s) => s.cellId).join(',') !==
      round3.trail.map((s) => s.cellId).join(','),
    'rounds 2 and 3 differ',
  );

  playPerfectRecall(false);
  playPerfectRecall(true);

  console.log('FTUE verification passed: launch → recall → next trail.');
}

main();
