import { beginRecall, createPracticeGame, tapCell } from '../game/engine';
import {
  chooseEasier,
  chooseHarder,
  chooseKeepPace,
  COMPLETIONS_BEFORE_REOFFER,
  defaultPracticeState,
  difficultyFor,
  HELPED_STREAK_FOR_EASIER,
  recordPracticeCompletion,
  reverseDifficulty,
  SMOOTH_WINS_FOR_HARDER,
} from '../game/practice';
import type { GameState, PracticeState } from '../game/types';

function applyTap(state: GameState, cellId: number): GameState {
  const result = tapCell(state, cellId);
  expect(result.kind).not.toBe('ignored');
  if (result.kind === 'ignored') throw new Error('ignore');
  return result.state;
}

function completeSmooth(practice: PracticeState, roundIndex: number) {
  const started = createPracticeGame(practice, roundIndex);
  let state = beginRecall(started.game);
  for (const step of state.round.trail) {
    state = applyTap(state, step.cellId);
  }
  return {
    practice: recordPracticeCompletion(started.practice, state),
    game: state,
  };
}

function completeHelped(practice: PracticeState, roundIndex: number) {
  const started = createPracticeGame(practice, roundIndex);
  let state = beginRecall(started.game);
  const trail = state.round.trail.map((s) => s.cellId);
  const other =
    Array.from({ length: state.round.rows * state.round.cols }, (_, i) => i).find(
      (id) => !trail.includes(id),
    ) ?? trail[0]!;
  // Free-draw a full-length wrong-first path so grading marks a miss.
  state = applyTap(state, other);
  for (let i = 1; i < trail.length; i += 1) {
    state = applyTap(state, trail[i]!);
  }
  expect(state.phase).toBe('complete');
  expect(state.hadIncorrectTap).toBe(true);
  return {
    practice: recordPracticeCompletion(started.practice, state),
    game: state,
  };
}

describe('adaptive progression', () => {
  it('keeps early stages gentle and later stages memory-heavy on 4×4', () => {
    expect(difficultyFor({ ...defaultPracticeState(), stage: 1 })).toEqual(
      expect.objectContaining({ steps: 3, rule: 'forward', rows: 4 }),
    );
    expect(difficultyFor({ ...defaultPracticeState(), stage: 2 })).toEqual(
      expect.objectContaining({ steps: 4, rule: 'forward' }),
    );
    expect(difficultyFor({ ...defaultPracticeState(), stage: 4 }).rule).toBe('reverse');
    expect(difficultyFor({ ...defaultPracticeState(), stage: 5 })).toEqual(
      expect.objectContaining({ steps: 7, rule: 'mirror', rows: 4 }),
    );
  });

  it('grows Reverse mode by trail length on a fixed 4×4', () => {
    expect(reverseDifficulty(0)).toEqual(
      expect.objectContaining({ rows: 4, cols: 4, steps: 3, rule: 'reverse' }),
    );
    expect(reverseDifficulty(3)).toEqual(
      expect.objectContaining({ rows: 4, cols: 4, steps: 6, rule: 'reverse' }),
    );
  });

  it('offers harder after smooth wins at the warm-up pace', () => {
    let practice = defaultPracticeState();
    for (let i = 0; i < SMOOTH_WINS_FOR_HARDER; i += 1) {
      practice = completeSmooth(practice, i + 1).practice;
    }
    expect(practice.pendingOffer).toBe('harder');
    practice = chooseHarder(practice);
    expect(practice.stage).toBe(2);
    expect(practice.pendingOffer).toBeNull();
  });

  it('waits after Keep this pace before offering harder again', () => {
    let practice: PracticeState = {
      ...defaultPracticeState(),
      smoothWinsAtPace: SMOOTH_WINS_FOR_HARDER,
      completionsSinceStay: COMPLETIONS_BEFORE_REOFFER,
      pendingOffer: 'harder',
    };
    practice = chooseKeepPace(practice);
    expect(practice.completionsSinceStay).toBe(0);

    for (let i = 0; i < COMPLETIONS_BEFORE_REOFFER - 1; i += 1) {
      practice = completeSmooth(practice, 10 + i).practice;
    }
    expect(practice.pendingOffer).not.toBe('harder');
  });

  it('offers easier after helped streak without removing unlocks', () => {
    let practice: PracticeState = {
      ...defaultPracticeState(),
      stage: 2,
      unlockedStage: 2,
    };
    for (let i = 0; i < HELPED_STREAK_FOR_EASIER; i += 1) {
      practice = completeHelped(practice, 20 + i).practice;
    }
    expect(practice.pendingOffer).toBe('easier');
    const unlocked = practice.unlockedStage;
    practice = chooseEasier(practice);
    expect(practice.stage).toBe(1);
    expect(practice.unlockedStage).toBe(unlocked);
  });
});
