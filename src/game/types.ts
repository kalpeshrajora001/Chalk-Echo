/** Shared cell index: `row * cols + col`. */
export type CellId = number;

export type Phase = 'example' | 'study' | 'recall' | 'complete';

export type Rule = 'forward' | 'reverse' | 'mirror';

export type PlayMode = 'ftue' | 'practice' | 'reverse';

export type TrailStep = {
  cellId: CellId;
  /** 1-based order the player must echo. */
  order: number;
};

export type Round = {
  /** Display index within the current mode. */
  index: number;
  /** Stable id for idempotent win counting. */
  id: string;
  rows: number;
  cols: number;
  trail: TrailStep[];
  /** Forward path before reverse/mirror transform. */
  forwardCells: CellId[];
  rule: Rule;
};

export type PaceOffer = 'harder' | 'easier' | null;

/** Per-tile grade after a free pattern draw is finished. */
export type CellGrade = 'correct' | 'missed';

export type GameState = {
  round: Round;
  phase: Phase;
  mode: PlayMode;
  nextOrder: number;
  echoedCellIds: CellId[];
  wrongAttemptsOnStep: number;
  softMistakeCellId: CellId | null;
  hintCellId: CellId | null;
  usedHint: boolean;
  usedReplay: boolean;
  hadIncorrectTap: boolean;
  isWorkedExample: boolean;
  /** True once this round's win has been counted. */
  winCounted: boolean;
  /** Filled on complete — which drawn tiles matched the trail. */
  cellGrades: Partial<Record<CellId, CellGrade>> | null;
};

export type TapResult =
  | { kind: 'ignored' }
  | { kind: 'correct'; state: GameState }
  | { kind: 'complete'; state: GameState }
  | { kind: 'wrong'; state: GameState };

/** Persistent adaptive Practice ladder state. */
export type PracticeState = {
  stage: number;
  unlockedStage: number;
  unlockedRules: Rule[];
  smoothWinsAtPace: number;
  completionsSinceStay: number;
  consecutiveHelped: number;
  stage6Tier: number;
  seenReverseExample: boolean;
  seenMirrorExample: boolean;
  lastTrailKey: string | null;
  pendingOffer: PaceOffer;
  totalCompletions: number;
};

export type DifficultySpec = {
  stage: number;
  rows: number;
  cols: number;
  steps: number;
  rule: Rule;
};

/** Serializable in-progress trail (Practice or Reverse). */
export type TrailSnapshot = {
  round: Round;
  phase: Phase;
  nextOrder: number;
  echoedCellIds: CellId[];
  wrongAttemptsOnStep: number;
  softMistakeCellId: CellId | null;
  hintCellId: CellId | null;
  usedHint: boolean;
  usedReplay: boolean;
  hadIncorrectTap: boolean;
  isWorkedExample: boolean;
  winCounted: boolean;
  cellGrades: Partial<Record<CellId, CellGrade>> | null;
};

/** Full persisted app document. */
export type AppSnapshot = {
  version: 6;
  /** Monotonic write counter — older writes must not clobber newer. */
  revision: number;
  onboardingComplete: boolean;
  ftueHighestRound: number;
  totalWins: number;
  countedWinIds: string[];
  activeMode: PlayMode;
  practice: PracticeState;
  practiceTrail: TrailSnapshot | null;
  /** In-progress Reverse-mode trail (parked when switching modes). */
  reverseTrail: TrailSnapshot | null;
  /** Completed Reverse-mode rounds — drives Reverse trail length. */
  reverseCompletions: number;
  lastPlayedAt: string | null;
};
