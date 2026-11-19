import { createGame, createPracticeGame, createReverseGame } from './engine';
import { defaultPracticeState } from './practice';
import type {
  AppSnapshot,
  GameState,
  PlayMode,
  PracticeState,
  TrailSnapshot,
} from './types';

export type SwitchTarget = 'practice' | 'reverse';

export function utcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function gameToTrailSnapshot(game: GameState): TrailSnapshot {
  return {
    round: game.round,
    phase: game.phase,
    nextOrder: game.nextOrder,
    echoedCellIds: [...game.echoedCellIds],
    wrongAttemptsOnStep: game.wrongAttemptsOnStep,
    softMistakeCellId: game.softMistakeCellId,
    hintCellId: game.hintCellId,
    usedHint: game.usedHint,
    usedReplay: game.usedReplay,
    hadIncorrectTap: game.hadIncorrectTap,
    isWorkedExample: game.isWorkedExample,
    winCounted: game.winCounted,
    cellGrades: game.cellGrades ? { ...game.cellGrades } : null,
  };
}

export function trailSnapshotToGame(
  snap: TrailSnapshot,
  mode: PlayMode,
): GameState {
  return {
    mode,
    round: snap.round,
    phase: snap.phase,
    nextOrder: snap.nextOrder,
    echoedCellIds: [...snap.echoedCellIds],
    wrongAttemptsOnStep: snap.wrongAttemptsOnStep,
    softMistakeCellId: snap.softMistakeCellId,
    hintCellId: snap.hintCellId,
    usedHint: snap.usedHint,
    usedReplay: snap.usedReplay,
    hadIncorrectTap: snap.hadIncorrectTap,
    isWorkedExample: snap.isWorkedExample,
    winCounted: snap.winCounted,
    cellGrades: snap.cellGrades ? { ...snap.cellGrades } : null,
  };
}

/** Drop parked trails that are no longer on the fixed 4×4 board. */
export function keepFourByFourTrail(
  snap: TrailSnapshot | null,
): TrailSnapshot | null {
  if (!snap) return null;
  if (snap.round.rows !== 4 || snap.round.cols !== 4) return null;
  return snap;
}

export function defaultAppSnapshot(): AppSnapshot {
  return {
    version: 6,
    revision: 0,
    onboardingComplete: false,
    ftueHighestRound: 0,
    totalWins: 0,
    countedWinIds: [],
    activeMode: 'ftue',
    practice: defaultPracticeState(),
    practiceTrail: null,
    reverseTrail: null,
    reverseCompletions: 0,
    lastPlayedAt: null,
  };
}

export function markWinOnce(
  snapshot: AppSnapshot,
  roundId: string,
): { snapshot: AppSnapshot; counted: boolean } {
  if (snapshot.countedWinIds.includes(roundId)) {
    return { snapshot, counted: false };
  }
  return {
    counted: true,
    snapshot: {
      ...snapshot,
      totalWins: snapshot.totalWins + 1,
      countedWinIds: [...snapshot.countedWinIds, roundId],
      lastPlayedAt: new Date().toISOString(),
    },
  };
}

function parkCurrentTrail(
  snapshot: AppSnapshot,
  game: GameState,
  practice: PracticeState,
): AppSnapshot {
  const base: AppSnapshot = {
    ...snapshot,
    practice,
    lastPlayedAt: new Date().toISOString(),
  };

  if (game.mode === 'practice') {
    return { ...base, practiceTrail: gameToTrailSnapshot(game) };
  }
  if (game.mode === 'reverse') {
    return { ...base, reverseTrail: gameToTrailSnapshot(game) };
  }
  return base;
}

function startFreshReverse(snapshot: AppSnapshot): {
  snapshot: AppSnapshot;
  game: GameState;
} {
  const game = createReverseGame(
    snapshot.reverseCompletions,
    Math.max(1, snapshot.reverseCompletions + 1),
    snapshot.reverseTrail?.round.forwardCells.join(',') ?? null,
  );
  return {
    game,
    snapshot: {
      ...snapshot,
      activeMode: 'reverse',
      reverseTrail: gameToTrailSnapshot(game),
    },
  };
}

/**
 * Switch Practice / Reverse without discarding parked trails.
 */
export function switchMode(
  snapshot: AppSnapshot,
  game: GameState,
  practice: PracticeState,
  target: SwitchTarget,
): { snapshot: AppSnapshot; game: GameState; practice: PracticeState } {
  let next = parkCurrentTrail(snapshot, game, practice);

  if (target === 'reverse') {
    const parked = keepFourByFourTrail(next.reverseTrail);
    if (parked) {
      return {
        snapshot: { ...next, activeMode: 'reverse', reverseTrail: parked },
        practice: next.practice,
        game: trailSnapshotToGame(parked, 'reverse'),
      };
    }
    const started = startFreshReverse({ ...next, reverseTrail: null });
    return {
      snapshot: started.snapshot,
      practice: next.practice,
      game: started.game,
    };
  }

  next = { ...next, activeMode: 'practice' };
  const parked = keepFourByFourTrail(next.practiceTrail);
  if (parked) {
    return {
      snapshot: { ...next, practiceTrail: parked },
      practice: next.practice,
      game: trailSnapshotToGame(parked, 'practice'),
    };
  }

  const started = createPracticeGame(next.practice, Math.max(1, next.totalWins + 1));
  next = {
    ...next,
    practice: started.practice,
    practiceTrail: gameToTrailSnapshot(started.game),
  };
  return {
    snapshot: next,
    practice: started.practice,
    game: started.game,
  };
}

export function bootGameFromSnapshot(
  snapshot: AppSnapshot,
): { snapshot: AppSnapshot; game: GameState; practice: PracticeState } {
  let activeMode: PlayMode = snapshot.activeMode;
  if ((activeMode as string) === 'daily') {
    activeMode = 'practice';
  }

  let next: AppSnapshot = {
    ...snapshot,
    version: 6,
    activeMode,
    practiceTrail: keepFourByFourTrail(snapshot.practiceTrail),
    reverseTrail: keepFourByFourTrail(snapshot.reverseTrail),
    reverseCompletions: snapshot.reverseCompletions ?? 0,
  };

  if (!next.onboardingComplete) {
    const roundIndex = Math.min(3, Math.max(1, next.ftueHighestRound + 1));
    return {
      snapshot: { ...next, activeMode: 'ftue' },
      practice: next.practice,
      game: createGame(roundIndex),
    };
  }

  if (next.activeMode === 'reverse') {
    if (next.reverseTrail) {
      return {
        snapshot: next,
        practice: next.practice,
        game: trailSnapshotToGame(next.reverseTrail, 'reverse'),
      };
    }
    const started = startFreshReverse(next);
    return {
      snapshot: started.snapshot,
      practice: next.practice,
      game: started.game,
    };
  }

  next = { ...next, activeMode: 'practice' };
  if (next.practiceTrail) {
    return {
      snapshot: next,
      practice: next.practice,
      game: trailSnapshotToGame(next.practiceTrail, 'practice'),
    };
  }

  const started = createPracticeGame(next.practice, Math.max(1, next.totalWins + 1));
  return {
    snapshot: {
      ...next,
      practice: started.practice,
      practiceTrail: gameToTrailSnapshot(started.game),
    },
    practice: started.practice,
    game: started.game,
  };
}

export function reverseUnlocked(snapshot: AppSnapshot): boolean {
  return snapshot.onboardingComplete;
}

export function startNextReverseTrail(snapshot: AppSnapshot): {
  snapshot: AppSnapshot;
  game: GameState;
} {
  const completions = snapshot.reverseCompletions;
  const game = createReverseGame(
    completions,
    Math.max(1, completions + 1),
    snapshot.reverseTrail?.round.forwardCells.join(',') ?? null,
  );
  return {
    game,
    snapshot: {
      ...snapshot,
      activeMode: 'reverse',
      reverseTrail: gameToTrailSnapshot(game),
    },
  };
}
