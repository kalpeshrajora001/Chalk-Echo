import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultPracticeState } from '../game/practice';
import { defaultAppSnapshot, keepFourByFourTrail } from '../game/session';
import type {
  AppSnapshot,
  PaceOffer,
  Phase,
  PlayMode,
  PracticeState,
  Round,
  Rule,
  TrailSnapshot,
  TrailStep,
} from '../game/types';

const STORAGE_KEY = '@chalk-echo/progress/v4';

/** In-memory head revision used to drop stale async writes. */
let memorySnapshot: AppSnapshot | null = null;
let writeChain: Promise<void> = Promise.resolve();

export type Progress = AppSnapshot;

export const defaultProgress = defaultAppSnapshot;

function isRule(value: unknown): value is Rule {
  return value === 'forward' || value === 'reverse' || value === 'mirror';
}

function isPhase(value: unknown): value is Phase {
  return (
    value === 'example' ||
    value === 'study' ||
    value === 'recall' ||
    value === 'complete'
  );
}

function isPlayMode(value: unknown): value is PlayMode | 'daily' {
  return (
    value === 'ftue' ||
    value === 'practice' ||
    value === 'reverse' ||
    value === 'daily'
  );
}

function isPaceOffer(value: unknown): value is PaceOffer {
  return value === null || value === 'harder' || value === 'easier';
}

function isTrailStep(value: unknown): value is TrailStep {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.cellId === 'number' && typeof v.order === 'number';
}

function isRound(value: unknown): value is Round {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.index === 'number' &&
    typeof v.rows === 'number' &&
    typeof v.cols === 'number' &&
    Array.isArray(v.forwardCells) &&
    v.forwardCells.every((c) => typeof c === 'number') &&
    Array.isArray(v.trail) &&
    v.trail.every(isTrailStep) &&
    isRule(v.rule)
  );
}

function isTrailSnapshot(value: unknown): value is TrailSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    isRound(v.round) &&
    isPhase(v.phase) &&
    typeof v.nextOrder === 'number' &&
    Array.isArray(v.echoedCellIds) &&
    v.echoedCellIds.every((c) => typeof c === 'number') &&
    typeof v.wrongAttemptsOnStep === 'number' &&
    (v.softMistakeCellId === null || typeof v.softMistakeCellId === 'number') &&
    (v.hintCellId === null || typeof v.hintCellId === 'number') &&
    typeof v.usedHint === 'boolean' &&
    typeof v.usedReplay === 'boolean' &&
    typeof v.hadIncorrectTap === 'boolean' &&
    typeof v.isWorkedExample === 'boolean' &&
    typeof v.winCounted === 'boolean' &&
    (v.cellGrades === undefined ||
      v.cellGrades === null ||
      (typeof v.cellGrades === 'object' && !Array.isArray(v.cellGrades)))
  );
}

function isPracticeState(value: unknown): value is PracticeState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.stage === 'number' &&
    typeof v.unlockedStage === 'number' &&
    Array.isArray(v.unlockedRules) &&
    v.unlockedRules.every(isRule) &&
    typeof v.smoothWinsAtPace === 'number' &&
    typeof v.completionsSinceStay === 'number' &&
    typeof v.consecutiveHelped === 'number' &&
    typeof v.stage6Tier === 'number' &&
    typeof v.seenReverseExample === 'boolean' &&
    typeof v.seenMirrorExample === 'boolean' &&
    (v.lastTrailKey === null || typeof v.lastTrailKey === 'string') &&
    isPaceOffer(v.pendingOffer) &&
    typeof v.totalCompletions === 'number'
  );
}

type LegacySnapshot = {
  version: number;
  revision: number;
  onboardingComplete: boolean;
  ftueHighestRound: number;
  totalWins: number;
  countedWinIds: string[];
  activeMode: PlayMode | 'daily';
  practice: PracticeState;
  practiceTrail: TrailSnapshot | null;
  reverseTrail?: TrailSnapshot | null;
  reverseCompletions?: number;
  lastPlayedAt: string | null;
};

function isLegacySnapshot(value: unknown): value is LegacySnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.version === 4 || v.version === 5 || v.version === 6) &&
    typeof v.revision === 'number' &&
    typeof v.onboardingComplete === 'boolean' &&
    typeof v.ftueHighestRound === 'number' &&
    typeof v.totalWins === 'number' &&
    Array.isArray(v.countedWinIds) &&
    v.countedWinIds.every((id) => typeof id === 'string') &&
    isPlayMode(v.activeMode) &&
    isPracticeState(v.practice) &&
    (v.practiceTrail === null || isTrailSnapshot(v.practiceTrail)) &&
    (v.lastPlayedAt === null || typeof v.lastPlayedAt === 'string')
  );
}

function sanitize(snapshot: LegacySnapshot): AppSnapshot {
  const activeMode: PlayMode =
    snapshot.activeMode === 'daily' ? 'practice' : snapshot.activeMode;

  return {
    version: 6,
    revision: snapshot.revision,
    onboardingComplete: snapshot.onboardingComplete,
    ftueHighestRound: snapshot.ftueHighestRound,
    totalWins: snapshot.totalWins,
    countedWinIds: snapshot.countedWinIds ?? [],
    activeMode,
    practice: snapshot.practice ?? defaultPracticeState(),
    practiceTrail: keepFourByFourTrail(snapshot.practiceTrail ?? null),
    reverseTrail: keepFourByFourTrail(snapshot.reverseTrail ?? null),
    reverseCompletions:
      typeof snapshot.reverseCompletions === 'number' ? snapshot.reverseCompletions : 0,
    lastPlayedAt: snapshot.lastPlayedAt,
  };
}

export async function loadProgress(): Promise<AppSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = defaultAppSnapshot();
      memorySnapshot = fresh;
      return fresh;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isLegacySnapshot(parsed)) {
      const fresh = defaultAppSnapshot();
      memorySnapshot = fresh;
      return fresh;
    }
    const sanitized = sanitize(parsed);
    memorySnapshot = sanitized;
    return sanitized;
  } catch {
    const fresh = defaultAppSnapshot();
    memorySnapshot = fresh;
    return fresh;
  }
}

/**
 * Serialize mutations so rapid completions cannot let an older write
 * overwrite a newer revision.
 */
export async function updateProgress(
  mutator: (current: AppSnapshot) => AppSnapshot,
): Promise<AppSnapshot> {
  const run = writeChain.then(async () => {
    const current = memorySnapshot ?? (await loadProgress());
    const drafted = mutator(current);
    const next: AppSnapshot = {
      ...drafted,
      version: 6,
      revision: current.revision + 1,
      lastPlayedAt: new Date().toISOString(),
    };

    if (memorySnapshot && next.revision <= memorySnapshot.revision) {
      return memorySnapshot;
    }

    memorySnapshot = next;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });

  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function saveProgress(progress: AppSnapshot): Promise<AppSnapshot> {
  return updateProgress(() => progress);
}

/** Test helper — reset in-memory write head. */
export function __resetProgressMemoryForTests(): void {
  memorySnapshot = null;
  writeChain = Promise.resolve();
}

export function isFtueDone(progress: AppSnapshot): boolean {
  return progress.onboardingComplete || progress.ftueHighestRound >= 3;
}

export function bootMode(progress: AppSnapshot): PlayMode {
  if (!isFtueDone(progress)) return 'ftue';
  return progress.activeMode === 'reverse' ? 'reverse' : 'practice';
}

export function nextFtueRound(progress: AppSnapshot): number {
  return Math.min(3, Math.max(1, progress.ftueHighestRound + 1));
}

export async function recordFtueComplete(
  progress: AppSnapshot,
  roundIndex: number,
): Promise<AppSnapshot> {
  return updateProgress((current) => ({
    ...current,
    ...progress,
    ftueHighestRound: Math.max(current.ftueHighestRound, roundIndex),
    onboardingComplete: roundIndex >= 3 ? true : current.onboardingComplete,
  }));
}

export async function savePracticeProgress(
  progress: AppSnapshot,
  practice: PracticeState,
  options?: { countWin?: boolean },
): Promise<AppSnapshot> {
  return updateProgress((current) => ({
    ...current,
    practice,
    totalWins: options?.countWin ? current.totalWins + 1 : current.totalWins,
  }));
}

export const recordRoundComplete = recordFtueComplete;
export const nextRoundFromProgress = nextFtueRound;
