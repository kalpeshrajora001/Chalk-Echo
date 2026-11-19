import {
  beginRecall,
  canOfferHint,
  createGame,
  seeTrailAgain,
  showNextTile,
  tapCell,
} from '../game/engine';
import type { GameState } from '../game/types';

function applyTap(state: GameState, cellId: number): GameState {
  const result = tapCell(state, cellId);
  expect(result.kind).not.toBe('ignored');
  if (result.kind === 'ignored') {
    throw new Error('unexpected ignore');
  }
  return result.state;
}

function playPerfect(game: GameState): GameState {
  let state = beginRecall(game);
  for (const step of state.round.trail) {
    state = applyTap(state, step.cellId);
  }
  return state;
}

describe('free pattern draw', () => {
  it('allows wrong tiles mid-draw and grades at the end', () => {
    let state = beginRecall(createGame(1));
    const [first, second, third] = state.round.trail.map((s) => s.cellId);
    const other =
      Array.from({ length: 16 }, (_, i) => i).find(
        (id) => id !== first && id !== second && id !== third,
      ) ?? 1;

    state = applyTap(state, other);
    expect(state.phase).toBe('recall');
    expect(state.echoedCellIds).toEqual([other]);

    state = applyTap(state, second!);
    state = applyTap(state, third!);
    expect(state.phase).toBe('complete');
    expect(state.cellGrades?.[other!]).toBe('missed');
    expect(state.cellGrades?.[second!]).toBe('correct');
    expect(state.cellGrades?.[third!]).toBe('correct');
    expect(state.hadIncorrectTap).toBe(true);
  });

  it('marks a perfect path as all correct', () => {
    const done = playPerfect(createGame(1));
    expect(done.phase).toBe('complete');
    expect(done.hadIncorrectTap).toBe(false);
    for (const step of done.round.trail) {
      expect(done.cellGrades?.[step.cellId]).toBe('correct');
    }
  });
});

describe('hints and retries', () => {
  it('can show the next expected tile during free draw', () => {
    let state = beginRecall(createGame(1));
    expect(canOfferHint(state)).toBe(true);

    state = showNextTile(state);
    expect(state.hintCellId).toBe(state.round.trail[0]!.cellId);
    expect(state.usedHint).toBe(true);

    for (const step of state.round.trail) {
      state = applyTap(state, step.cellId);
    }
    expect(state.phase).toBe('complete');
    expect(state.usedHint).toBe(true);
  });
});

describe('repeat taps', () => {
  it('ignores a second tap on an already drawn tile', () => {
    let state = beginRecall(createGame(1));
    const first = state.round.trail[0]!.cellId;
    state = applyTap(state, first);

    const repeat = tapCell(state, first);
    expect(repeat.kind).toBe('ignored');
    expect(state.nextOrder).toBe(2);
  });

  it('clears the draw after See trail again', () => {
    let state = beginRecall(createGame(1));
    const first = state.round.trail[0]!.cellId;
    state = applyTap(state, first);
    state = seeTrailAgain(state);
    expect(state.phase).toBe('study');
    expect(state.echoedCellIds).toEqual([]);
    expect(state.usedReplay).toBe(true);
    state = beginRecall(state);
    expect(state.nextOrder).toBe(1);
  });
});

describe('first trail completion', () => {
  it('completes the intro L trail', () => {
    const done = playPerfect(createGame(1));
    expect(done.phase).toBe('complete');
    expect(done.round.forwardCells).toEqual([0, 4, 5]);
  });
});
