import {
  createPracticeRound,
  createPracticeRoundAfterExample,
  createReverseRound,
} from './practice';
import { toTrailSteps } from './trails';
import type {
  CellGrade,
  CellId,
  GameState,
  PracticeState,
  Round,
  Rule,
  TapResult,
  TrailStep,
} from './types';

export const WRONG_ATTEMPTS_BEFORE_HINT = 2;
export const FIRST_ROUND = 1;
export const LAST_FTUE_ROUND = 3;

/**
 * FTUE fixed L-shaped paths on a 4×4 board.
 *  0  1  2  3
 *  4  5  6  7
 *  8  9 10 11
 * 12 13 14 15
 */
const FTUE_TRAILS: Record<1 | 2 | 3, CellId[]> = {
  1: [0, 4, 5],
  2: [3, 7, 6],
  3: [12, 13, 9],
};

function emptyPlayFields() {
  return {
    nextOrder: 1,
    echoedCellIds: [] as CellId[],
    wrongAttemptsOnStep: 0,
    softMistakeCellId: null as CellId | null,
    hintCellId: null as CellId | null,
    usedHint: false,
    usedReplay: false,
    hadIncorrectTap: false,
    winCounted: false,
    cellGrades: null as GameState['cellGrades'],
  };
}

function orderedTrail(round: Round): TrailStep[] {
  return [...round.trail].sort((a, b) => a.order - b.order);
}

/** Grade a finished free-draw path against the expected trail order. */
export function gradeDrawnPath(
  drawn: CellId[],
  round: Round,
): { cellGrades: Partial<Record<CellId, CellGrade>>; anyMissed: boolean } {
  const expected = orderedTrail(round);
  const cellGrades: Partial<Record<CellId, CellGrade>> = {};
  let anyMissed = false;

  for (let i = 0; i < drawn.length; i += 1) {
    const cellId = drawn[i]!;
    const step = expected[i];
    if (step && step.cellId === cellId) {
      cellGrades[cellId] = 'correct';
    } else {
      cellGrades[cellId] = 'missed';
      anyMissed = true;
    }
  }

  return { cellGrades, anyMissed };
}

export function createFtueRound(index: number): Round {
  const clamped = Math.min(LAST_FTUE_ROUND, Math.max(FIRST_ROUND, index)) as
    | 1
    | 2
    | 3;
  const forwardCells = FTUE_TRAILS[clamped];
  return {
    id: `ftue:${clamped}`,
    index: clamped,
    rows: 4,
    cols: 4,
    forwardCells,
    trail: toTrailSteps(forwardCells),
    rule: 'forward',
  };
}

export function createGameFromRound(
  round: Round,
  mode: GameState['mode'],
  options?: { phase?: GameState['phase']; isWorkedExample?: boolean; winCounted?: boolean },
): GameState {
  return {
    round,
    mode,
    phase: options?.phase ?? 'study',
    isWorkedExample: options?.isWorkedExample ?? false,
    ...emptyPlayFields(),
    winCounted: options?.winCounted ?? false,
  };
}

export function createGame(roundIndex: number = FIRST_ROUND): GameState {
  return createGameFromRound(createFtueRound(roundIndex), 'ftue');
}

export function createIntroGame(): GameState {
  return createGame(FIRST_ROUND);
}

export function createPracticeGame(
  practice: PracticeState,
  roundIndex: number,
): { game: GameState; practice: PracticeState } {
  const built = createPracticeRound(practice, roundIndex);
  if (built.showExample && built.exampleRule) {
    return {
      practice: built.practice,
      game: createGameFromRound(built.round, 'practice', {
        phase: 'example',
        isWorkedExample: true,
      }),
    };
  }
  return {
    practice: built.practice,
    game: createGameFromRound(built.round, 'practice'),
  };
}

export function createReverseGame(
  reverseCompletions: number,
  roundIndex: number,
  avoidKey: string | null = null,
): GameState {
  const round = createReverseRound(reverseCompletions, roundIndex, Math.random, avoidKey);
  return createGameFromRound(round, 'reverse');
}

export function dismissWorkedExample(
  game: GameState,
  practice: PracticeState,
): { game: GameState; practice: PracticeState } {
  if (!game.isWorkedExample || game.phase !== 'example') {
    return { game, practice };
  }
  const rule = game.round.rule as 'reverse' | 'mirror';
  const built = createPracticeRoundAfterExample(practice, game.round.index, rule);
  return {
    practice: built.practice,
    game: createGameFromRound(built.round, 'practice'),
  };
}

export function trailLength(state: GameState): number {
  return state.round.trail.length;
}

export function orderForCell(round: Round, cellId: CellId): number | null {
  const step = round.trail.find((s) => s.cellId === cellId);
  return step?.order ?? null;
}

export function expectedStep(state: GameState): TrailStep | null {
  return state.round.trail.find((s) => s.order === state.nextOrder) ?? null;
}

export function canOfferHint(state: GameState): boolean {
  return (
    state.phase === 'recall' &&
    state.hintCellId === null &&
    state.echoedCellIds.length < state.round.trail.length
  );
}

export function beginRecall(state: GameState): GameState {
  if (state.phase !== 'study') {
    return state;
  }
  return {
    ...state,
    phase: 'recall',
    softMistakeCellId: null,
    hintCellId: null,
  };
}

export function seeTrailAgain(state: GameState): GameState {
  if (state.phase !== 'recall') {
    return state;
  }
  return {
    ...state,
    phase: 'study',
    softMistakeCellId: null,
    hintCellId: null,
    usedReplay: true,
    // Clear the free-draw so a peek starts a fresh pattern.
    echoedCellIds: [],
    nextOrder: 1,
    cellGrades: null,
  };
}

export function showNextTile(state: GameState): GameState {
  if (!canOfferHint(state)) {
    return state;
  }
  const expected = orderedTrail(state.round)[state.echoedCellIds.length];
  if (!expected) {
    return state;
  }
  return {
    ...state,
    hintCellId: expected.cellId,
    softMistakeCellId: null,
    usedHint: true,
  };
}

export function clearSoftMistake(state: GameState): GameState {
  if (state.softMistakeCellId === null) {
    return state;
  }
  return {
    ...state,
    softMistakeCellId: null,
  };
}

/**
 * Free pattern draw: any unused tile can be added.
 * When the drawn length matches the trail, the path is graded.
 */
export function tapCell(state: GameState, cellId: CellId): TapResult {
  if (state.phase !== 'recall') {
    return { kind: 'ignored' };
  }

  if (state.echoedCellIds.includes(cellId)) {
    return { kind: 'ignored' };
  }

  if (state.echoedCellIds.length >= state.round.trail.length) {
    return { kind: 'ignored' };
  }

  const echoedCellIds = [...state.echoedCellIds, cellId];
  const nextOrder = echoedCellIds.length + 1;
  const finished = echoedCellIds.length === state.round.trail.length;

  if (finished) {
    const { cellGrades, anyMissed } = gradeDrawnPath(echoedCellIds, state.round);
    return {
      kind: 'complete',
      state: {
        ...state,
        phase: 'complete',
        nextOrder,
        echoedCellIds,
        wrongAttemptsOnStep: 0,
        softMistakeCellId: null,
        hintCellId: null,
        hadIncorrectTap: state.hadIncorrectTap || anyMissed,
        cellGrades,
      },
    };
  }

  return {
    kind: 'correct',
    state: {
      ...state,
      nextOrder,
      echoedCellIds,
      softMistakeCellId: null,
      // Clear hint after the player continues the stroke.
      hintCellId: state.hintCellId === cellId ? null : state.hintCellId,
    },
  };
}

/** FTUE-only: advance fixed intro rounds. */
export function advanceToNextFtueRound(state: GameState): GameState {
  if (state.phase !== 'complete' || state.mode !== 'ftue') {
    return state;
  }
  const nextIndex = Math.min(LAST_FTUE_ROUND, state.round.index + 1);
  if (nextIndex === state.round.index) {
    return state;
  }
  return createGame(nextIndex);
}

export function ruleLabel(rule: Rule): string {
  switch (rule) {
    case 'forward':
      return 'Forward';
    case 'reverse':
      return 'Reverse';
    case 'mirror':
      return 'Mirror';
  }
}

export function promptForState(state: GameState): string {
  if (state.phase === 'example') {
    if (state.round.rule === 'reverse') {
      return 'New rule: Reverse — draw from the last tile back to the first.';
    }
    if (state.round.rule === 'mirror') {
      return 'New rule: Mirror — same order, but each tile flips left↔right in its row.';
    }
  }

  switch (state.phase) {
    case 'study':
      if (state.round.rule === 'reverse') {
        return 'Study carefully — you will draw this backward.';
      }
      if (state.round.rule === 'mirror') {
        return 'Study carefully — each tile will flip left↔right.';
      }
      return trailLength(state) <= 4
        ? 'Easy warm-up. Remember the pattern — take your time.'
        : 'This trail needs real memory. Study every step.';
    case 'recall':
      return state.round.rule === 'reverse'
        ? 'Draw it backward — trust what you remembered.'
        : 'Draw the pattern — glide tile to tile. You have this.';
    case 'complete': {
      const grades = state.cellGrades ?? {};
      const missed = Object.values(grades).some((g) => g === 'missed');
      return missed
        ? 'Check the board — Correct and You Missed. Next trail will feel clearer.'
        : `Perfect echo — all ${trailLength(state)} tiles remembered!`;
    }
    default:
      return '';
  }
}

export function markGameWinCounted(state: GameState): GameState {
  return { ...state, winCounted: true };
}

// Back-compat alias used by older FTUE helpers/tests.
export const createRound = createFtueRound;
export const advanceToNextRound = advanceToNextFtueRound;
export { createPracticeRoundAfterExample };
