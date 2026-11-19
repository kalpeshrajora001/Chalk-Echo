import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Board } from '../components/Board';
import { InfoSheet, type InfoSheetKind } from '../components/InfoSheet';
import {
  advanceToNextFtueRound,
  beginRecall,
  canOfferHint,
  createPracticeGame,
  dismissWorkedExample,
  LAST_FTUE_ROUND,
  markGameWinCounted,
  promptForState,
  ruleLabel,
  seeTrailAgain,
  showNextTile,
  tapCell,
  trailLength,
} from '../game/engine';
import {
  encouragementForComplete,
  shareChallengeMessage,
} from '../game/encourage';
import {
  chooseEasier,
  chooseHarder,
  chooseKeepPace,
  recordPracticeCompletion,
} from '../game/practice';
import {
  bootGameFromSnapshot,
  gameToTrailSnapshot,
  markWinOnce,
  reverseUnlocked,
  startNextReverseTrail,
  switchMode,
  type SwitchTarget,
} from '../game/session';
import type {
  AppSnapshot,
  CellId,
  GameState,
  PracticeState,
} from '../game/types';
import { useReduceMotion } from '../hooks/useReduceMotion';
import {
  defaultProgress,
  loadProgress,
  updateProgress,
} from '../storage/progress';
import { colors, spacing } from '../theme/colors';

const CELEBRATE_MS = 520;
const PERSIST_DEBOUNCE_MS = 180;

const brandFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});

export function GameScreen() {
  const reduceMotion = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [snapshot, setSnapshot] = useState<AppSnapshot>(defaultProgress);
  const [game, setGame] = useState<GameState>(() => bootGameFromSnapshot(defaultProgress()).game);
  const [practice, setPractice] = useState<PracticeState>(defaultProgress().practice);
  const [celebrate, setCelebrate] = useState(false);
  const [booted, setBooted] = useState(false);
  const [sheet, setSheet] = useState<InfoSheetKind | null>(null);

  const snapshotRef = useRef(snapshot);
  const practiceRef = useRef(practice);
  const gameRef = useRef(game);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTrailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(game.phase);
  const fade = useRef(new Animated.Value(1)).current;
  const completionHandledRef = useRef(false);

  snapshotRef.current = snapshot;
  practiceRef.current = practice;
  gameRef.current = game;

  const persist = useCallback(async (mutator: (current: AppSnapshot) => AppSnapshot) => {
    const next = await updateProgress(mutator);
    setSnapshot(next);
    return next;
  }, []);

  const applyTrailToSnapshot = useCallback(
    (current: AppSnapshot, nextGame: GameState, nextPractice: PracticeState): AppSnapshot => {
      if (nextGame.mode === 'practice') {
        return {
          ...current,
          practice: nextPractice,
          practiceTrail: gameToTrailSnapshot(nextGame),
          activeMode: 'practice',
        };
      }
      if (nextGame.mode === 'reverse') {
        return {
          ...current,
          practice: nextPractice,
          reverseTrail: gameToTrailSnapshot(nextGame),
          activeMode: 'reverse',
        };
      }
      return {
        ...current,
        practice: nextPractice,
        activeMode: 'ftue',
      };
    },
    [],
  );

  const syncActiveTrail = useCallback(
    (
      nextGame: GameState,
      nextPractice: PracticeState = practiceRef.current,
      options: { flush?: boolean } = {},
    ) => {
      setGame(nextGame);
      setPractice(nextPractice);
      gameRef.current = nextGame;
      practiceRef.current = nextPractice;

      if (persistTrailTimer.current) {
        clearTimeout(persistTrailTimer.current);
        persistTrailTimer.current = null;
      }

      const write = () => {
        void persist((current) => applyTrailToSnapshot(current, nextGame, nextPractice));
      };

      if (options.flush) {
        write();
        return;
      }

      persistTrailTimer.current = setTimeout(write, PERSIST_DEBOUNCE_MS);
    },
    [applyTrailToSnapshot, persist],
  );

  useEffect(() => {
    let alive = true;
    loadProgress().then((stored) => {
      if (!alive) return;
      const bootedSession = bootGameFromSnapshot(stored);
      setSnapshot(bootedSession.snapshot);
      setPractice(bootedSession.practice);
      setGame(bootedSession.game);
      setBooted(true);
      void updateProgress(() => bootedSession.snapshot).then(setSnapshot);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background' && state !== 'inactive') return;
      if (persistTrailTimer.current) {
        clearTimeout(persistTrailTimer.current);
        persistTrailTimer.current = null;
      }
      const g = gameRef.current;
      const p = practiceRef.current;
      void updateProgress((current) => applyTrailToSnapshot(current, g, p));
    });
    return () => sub.remove();
  }, [applyTrailToSnapshot]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) {
        setSheet(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [sheet]);

  useEffect(() => {
    return () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
      if (persistTrailTimer.current) clearTimeout(persistTrailTimer.current);
    };
  }, []);

  useEffect(() => {
    const previous = phaseRef.current;
    phaseRef.current = game.phase;

    if (previous === game.phase || game.phase !== 'complete') {
      if (game.phase !== 'complete') {
        completionHandledRef.current = false;
      }
      return;
    }

    if (completionHandledRef.current) return;
    completionHandledRef.current = true;

    setCelebrate(true);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(
      () => setCelebrate(false),
      reduceMotion ? 0 : CELEBRATE_MS,
    );

    void (async () => {
      const roundId = game.round.id;
      let nextPractice = practiceRef.current;

      if (game.mode === 'practice') {
        nextPractice = recordPracticeCompletion(practiceRef.current, game);
        setPractice(nextPractice);
      }

      const nextGame = markGameWinCounted(game);
      setGame(nextGame);

      await persist((current) => {
        let next = markWinOnce(current, roundId).snapshot;

        if (game.mode === 'ftue') {
          next = {
            ...next,
            ftueHighestRound: Math.max(next.ftueHighestRound, game.round.index),
            onboardingComplete:
              game.round.index >= LAST_FTUE_ROUND ? true : next.onboardingComplete,
            activeMode: 'ftue',
          };
        }

        if (game.mode === 'practice') {
          next = {
            ...next,
            practice: nextPractice,
            practiceTrail: gameToTrailSnapshot(nextGame),
            activeMode: 'practice',
          };
        }

        if (game.mode === 'reverse') {
          next = {
            ...next,
            reverseCompletions: next.reverseCompletions + 1,
            reverseTrail: gameToTrailSnapshot(nextGame),
            activeMode: 'reverse',
          };
        }

        return next;
      });
    })();
  }, [game, persist, reduceMotion]);

  const animateBoard = useCallback(() => {
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(fade, { toValue: 0.45, duration: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [fade, reduceMotion]);

  const onImReady = useCallback(() => {
    animateBoard();
    syncActiveTrail(beginRecall(gameRef.current), practiceRef.current, { flush: true });
  }, [animateBoard, syncActiveTrail]);

  const onSeeTrailAgain = useCallback(() => {
    animateBoard();
    syncActiveTrail(seeTrailAgain(gameRef.current), practiceRef.current, { flush: true });
  }, [animateBoard, syncActiveTrail]);

  const onShowNextTile = useCallback(() => {
    syncActiveTrail(showNextTile(gameRef.current), practiceRef.current, { flush: true });
  }, [syncActiveTrail]);

  const onDismissExample = useCallback(() => {
    const dismissed = dismissWorkedExample(gameRef.current, practiceRef.current);
    syncActiveTrail(dismissed.game, dismissed.practice, { flush: true });
  }, [syncActiveTrail]);

  const onSwitchMode = useCallback(
    async (target: SwitchTarget) => {
      if (!reverseUnlocked(snapshotRef.current) && target === 'reverse') return;
      const switched = switchMode(
        snapshotRef.current,
        gameRef.current,
        practiceRef.current,
        target,
      );
      setSnapshot(switched.snapshot);
      setPractice(switched.practice);
      setGame(switched.game);
      completionHandledRef.current = switched.game.phase === 'complete';
      await persist(() => switched.snapshot);
    },
    [persist],
  );

  const continuePractice = useCallback(
    async (nextPractice: PracticeState) => {
      setCelebrate(false);
      completionHandledRef.current = false;
      const started = createPracticeGame(
        nextPractice,
        Math.max(1, snapshotRef.current.totalWins + 1),
      );
      syncActiveTrail(started.game, started.practice, { flush: true });
    },
    [syncActiveTrail],
  );

  const continueReverse = useCallback(async () => {
    setCelebrate(false);
    completionHandledRef.current = false;
    const started = startNextReverseTrail(snapshotRef.current);
    setSnapshot(started.snapshot);
    setGame(started.game);
    await persist(() => started.snapshot);
  }, [persist]);

  const onNextTrail = useCallback(async () => {
    setCelebrate(false);
    completionHandledRef.current = false;
    const current = gameRef.current;

    if (current.mode === 'ftue') {
      if (current.round.index >= LAST_FTUE_ROUND) {
        await persist((s) => ({
          ...s,
          onboardingComplete: true,
          activeMode: 'practice',
        }));
        await continuePractice(practiceRef.current);
        return;
      }
      syncActiveTrail(advanceToNextFtueRound(current), practiceRef.current, { flush: true });
      return;
    }

    if (current.mode === 'reverse') {
      await continueReverse();
      return;
    }

    await continuePractice(practiceRef.current);
  }, [continuePractice, continueReverse, persist, syncActiveTrail]);

  const onTryHarder = useCallback(async () => {
    await continuePractice(chooseHarder(practiceRef.current));
  }, [continuePractice]);

  const onKeepPace = useCallback(async () => {
    await continuePractice(chooseKeepPace(practiceRef.current));
  }, [continuePractice]);

  const onEasierTrail = useCallback(async () => {
    await continuePractice(chooseEasier(practiceRef.current));
  }, [continuePractice]);

  const onCellPress = useCallback(
    (cellId: CellId) => {
      const current = gameRef.current;
      const result = tapCell(current, cellId);
      if (result.kind === 'ignored') return;
      // Free-draw accepts any tile; grading (Correct / You Missed) happens at the end.
      syncActiveTrail(result.state);
    },
    [syncActiveTrail],
  );

  const showHintButton = canOfferHint(game);
  const prompt =
    game.phase === 'complete'
      ? encouragementForComplete(game)
      : promptForState(game);
  const offer =
    game.phase === 'complete' && game.mode === 'practice' ? practice.pendingOffer : null;
  const unlockedReverse = reverseUnlocked(snapshot);
  const perfectClear =
    game.phase === 'complete' &&
    !Object.values(game.cellGrades ?? {}).some((g) => g === 'missed');

  const onShareChallenge = useCallback(async () => {
    const modeLabel =
      game.mode === 'reverse'
        ? 'Reverse'
        : game.round.rule === 'mirror'
          ? 'Mirror'
          : 'Practice';
    const message = shareChallengeMessage({
      tiles: trailLength(game),
      wins: snapshot.totalWins,
      perfect: perfectClear,
      modeLabel,
    });
    try {
      await Share.share({
        message,
        title: 'Challenge a friend on Chalk Echo',
      });
    } catch {
      // User dismissed the sheet — nothing to do.
    }
  }, [game, perfectClear, snapshot.totalWins]);

  const trailLabel =
    game.mode === 'reverse'
      ? `Reverse ${Math.max(1, snapshot.reverseCompletions + (game.phase === 'complete' ? 0 : 1))}`
      : game.mode === 'practice'
        ? `Trail ${Math.max(1, practice.totalCompletions + (game.phase === 'complete' ? 0 : 1))}`
        : `Trail ${game.round.index}`;

  const modeSelected =
    game.mode === 'reverse' ? 'reverse' : 'practice';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View style={[styles.layout, landscape && styles.layoutLandscape]}>
        <View style={[styles.header, landscape && styles.headerLandscape]}>
          <View style={styles.brandRow}>
            <View style={styles.brandCopy}>
              <Text
                style={styles.brand}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.3}
              >
                Chalk Echo
              </Text>
              <Text style={styles.tagline} maxFontSizeMultiplier={1.35}>
                Train your memory. Challenge the people you love.
              </Text>
            </View>
            <View style={styles.utilityRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="How to Play"
                onPress={() => setSheet('help')}
                hitSlop={10}
                style={({ pressed }) => [styles.textLink, pressed && styles.textLinkPressed]}
              >
                <Text style={styles.textLinkLabel}>Help</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Privacy"
                onPress={() => setSheet('privacy')}
                hitSlop={10}
                style={({ pressed }) => [styles.textLink, pressed && styles.textLinkPressed]}
              >
                <Text style={styles.textLinkLabel}>Privacy</Text>
              </Pressable>
            </View>
          </View>

          {booted && snapshot.onboardingComplete ? (
            <View
              style={styles.modeSwitch}
              accessibilityRole="tablist"
              accessibilityLabel="Game mode"
            >
              <ModePill
                label="Practice"
                selected={modeSelected === 'practice'}
                onPress={() => void onSwitchMode('practice')}
              />
              <ModePill
                label="Reverse"
                selected={modeSelected === 'reverse'}
                disabled={!unlockedReverse}
                accessibilityLabel={
                  unlockedReverse
                    ? 'Reverse mode'
                    : 'Reverse mode locked. Finish the intro first.'
                }
                onPress={() => unlockedReverse && void onSwitchMode('reverse')}
              />
            </View>
          ) : null}
        </View>

        <Animated.View
          style={[
            styles.playArea,
            landscape && styles.playAreaLandscape,
            { opacity: fade },
          ]}
        >
          <View style={styles.trailMeta}>
            <Text style={styles.trailTitle} maxFontSizeMultiplier={1.25}>
              {trailLabel}
            </Text>
            <Text style={styles.ruleText} maxFontSizeMultiplier={1.2}>
              {ruleLabel(game.round.rule)} · {trailLength(game)} tiles
            </Text>
          </View>

          <Text style={styles.prompt} maxFontSizeMultiplier={1.45}>
            {prompt}
          </Text>

          <View style={styles.boardWrap}>
            <Board
              state={game}
              onCellPress={onCellPress}
              reduceMotion={reduceMotion}
              celebrate={celebrate || game.phase === 'complete'}
            />
          </View>
        </Animated.View>

        <View style={[styles.footer, landscape && styles.footerLandscape]}>
          {game.phase === 'example' ? (
            <PrimaryButton label="Got it — start trail" onPress={onDismissExample} />
          ) : null}

          {game.phase === 'study' ? (
            <PrimaryButton label="I'm ready" onPress={onImReady} />
          ) : null}

          {game.phase === 'recall' ? (
            <View style={styles.recallActions}>
              {showHintButton ? (
                <SecondaryButton label="Show next tile" onPress={onShowNextTile} />
              ) : null}
              <LinkButton label="See trail again" onPress={onSeeTrailAgain} />
            </View>
          ) : null}

          {game.phase === 'complete' && offer === 'harder' ? (
            <View style={styles.offerBlock}>
              <PrimaryButton label="Try a little harder" onPress={() => void onTryHarder()} />
              <SecondaryButton label="Keep this pace" onPress={() => void onKeepPace()} />
              <LinkButton
                label="Challenge a friend or family"
                onPress={() => void onShareChallenge()}
              />
            </View>
          ) : null}

          {game.phase === 'complete' && offer === 'easier' ? (
            <View style={styles.offerBlock}>
              <PrimaryButton label="Easier trail" onPress={() => void onEasierTrail()} />
              <SecondaryButton label="Keep this pace" onPress={() => void onKeepPace()} />
              <LinkButton
                label="Challenge a friend or family"
                onPress={() => void onShareChallenge()}
              />
            </View>
          ) : null}

          {game.phase === 'complete' && offer === null ? (
            <View style={styles.offerBlock}>
              <PrimaryButton label="Next trail" onPress={() => void onNextTrail()} />
              <SecondaryButton
                label="Challenge a friend or family"
                onPress={() => void onShareChallenge()}
              />
            </View>
          ) : null}
        </View>
      </View>

      {sheet ? <InfoSheet kind={sheet} onClose={() => setSheet(null)} /> : null}
    </SafeAreaView>
  );
}

function ModePill({
  label,
  selected,
  disabled = false,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? `${label} mode`}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.modeChip,
        selected && styles.modeChipActive,
        disabled && styles.modeChipDisabled,
      ]}
    >
      <Text
        style={[
          styles.modeChipLabel,
          selected && styles.modeChipLabelActive,
          disabled && styles.modeChipLabelDisabled,
        ]}
        maxFontSizeMultiplier={1.2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
    >
      <Text style={styles.ctaLabel} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryCta, pressed && styles.secondaryPressed]}
    >
      <Text style={styles.secondaryLabel} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  );
}

function LinkButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.linkButton, pressed && styles.linkPressed]}
    >
      <Text style={styles.linkLabel} maxFontSizeMultiplier={1.35}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.chalkboard,
  },
  layout: {
    flex: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: 4,
  },
  layoutLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.section,
  },
  header: {
    gap: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerLandscape: {
    flex: 1,
    minWidth: 220,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  brandCopy: {
    flex: 1,
    gap: 8,
  },
  brand: {
    color: colors.cream,
    fontFamily: brandFont,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  tagline: {
    color: colors.creamMuted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400',
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  textLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  textLinkPressed: {
    opacity: 0.65,
  },
  textLinkLabel: {
    color: colors.creamMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'flex-start',
  },
  modeChip: {
    minHeight: 40,
    minWidth: 108,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.tileBorder,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipActive: {
    backgroundColor: colors.chalkLime,
    borderColor: colors.chalkLime,
  },
  modeChipDisabled: {
    opacity: 0.4,
  },
  modeChipLabel: {
    color: colors.creamMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  modeChipLabelActive: {
    color: colors.chalkboardDeep,
  },
  modeChipLabelDisabled: {
    color: colors.creamMuted,
  },
  playArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 12,
  },
  playAreaLandscape: {
    flex: 1.4,
    minWidth: 280,
  },
  trailMeta: {
    gap: 4,
  },
  trailTitle: {
    color: colors.cream,
    fontFamily: brandFont,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
  },
  ruleText: {
    color: colors.chalkLime,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  prompt: {
    color: colors.creamMuted,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '400',
    maxWidth: 420,
  },
  boardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  footer: {
    minHeight: 96,
    justifyContent: 'center',
    paddingBottom: 10,
    gap: 12,
  },
  footerLandscape: {
    flexBasis: '100%',
    minHeight: 84,
  },
  recallActions: {
    gap: 10,
    alignItems: 'center',
  },
  offerBlock: {
    gap: 10,
    width: '100%',
  },
  cta: {
    backgroundColor: colors.chalkLime,
    borderRadius: 16,
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  ctaPressed: {
    backgroundColor: colors.chalkLimePressed,
  },
  ctaLabel: {
    color: colors.chalkboardDeep,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryCta: {
    backgroundColor: 'transparent',
    borderColor: colors.tileBorder,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 50,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  secondaryPressed: {
    backgroundColor: colors.tileIdle,
  },
  secondaryLabel: {
    color: colors.cream,
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    minHeight: 44,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkPressed: {
    opacity: 0.65,
  },
  linkLabel: {
    color: colors.creamMuted,
    fontSize: 16,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
