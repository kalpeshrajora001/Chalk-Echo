import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { tileAccessibilityLabel } from '../game/a11y';
import { orderForCell } from '../game/engine';
import type { CellGrade, CellId, GameState } from '../game/types';
import {
  colors,
  MAX_TILE_DP,
  MIN_TILE_DP,
  spacing,
  TARGET_TILE_DP,
} from '../theme/colors';

type BoardProps = {
  state: GameState;
  onCellPress: (cellId: CellId) => void;
  reduceMotion?: boolean;
  celebrate?: boolean;
  style?: StyleProp<ViewStyle>;
};

type Cue = 'none' | 'correct' | 'incorrect' | 'hint' | 'study' | 'missed';

type TileVisual = {
  background: string;
  border: string;
  borderStyle: 'solid' | 'dashed';
  label: string | null;
  labelColor: string;
  gradeLabel: string | null;
  cue: Cue;
  showDot: boolean;
  interactive: boolean;
};

type Point = { x: number; y: number };

function tileVisual(state: GameState, cellId: CellId, celebrate: boolean): TileVisual {
  const { phase, round, echoedCellIds, hintCellId, cellGrades } = state;
  const order = orderForCell(round, cellId);
  const onTrail = order !== null;
  const echoed = echoedCellIds.includes(cellId);
  const hinted = hintCellId === cellId;
  const drawing = phase === 'recall';
  const grade: CellGrade | undefined = cellGrades?.[cellId];

  if (phase === 'complete' && grade === 'correct') {
    return {
      background: colors.chalkCorrect,
      border: colors.chalkLimePressed,
      borderStyle: 'solid',
      label: order !== null ? String(order) : null,
      labelColor: colors.chalkboardDeep,
      gradeLabel: 'Correct',
      cue: 'correct',
      showDot: false,
      interactive: false,
    };
  }

  if (phase === 'complete' && grade === 'missed') {
    return {
      background: colors.softMistake,
      border: colors.softMistakeBorder,
      borderStyle: 'solid',
      label: order !== null ? String(order) : null,
      labelColor: colors.cream,
      gradeLabel: 'You Missed',
      cue: 'missed',
      showDot: false,
      interactive: false,
    };
  }

  if (drawing && echoed) {
    return {
      background: colors.chalkLimeDim,
      border: colors.chalkLime,
      borderStyle: 'solid',
      label: null,
      labelColor: colors.cream,
      gradeLabel: null,
      cue: 'correct',
      showDot: false,
      interactive: false,
    };
  }

  if (echoed || (phase === 'complete' && onTrail) || (celebrate && onTrail && !cellGrades)) {
    return {
      background: colors.chalkCorrect,
      border: colors.chalkLimePressed,
      borderStyle: 'solid',
      label: order !== null ? String(order) : null,
      labelColor: colors.chalkboardDeep,
      gradeLabel: null,
      cue: 'correct',
      showDot: false,
      interactive: false,
    };
  }

  if ((phase === 'study' || phase === 'example') && onTrail && order !== null) {
    return {
      background: colors.chalkLime,
      border: colors.cream,
      borderStyle: 'solid',
      label: String(order),
      labelColor: colors.chalkboardDeep,
      gradeLabel: null,
      cue: 'study',
      showDot: false,
      interactive: false,
    };
  }

  if (hinted && order !== null) {
    return {
      background: colors.chalkLimeDim,
      border: colors.hintDash,
      borderStyle: 'dashed',
      label: String(order),
      labelColor: colors.cream,
      gradeLabel: null,
      cue: 'hint',
      showDot: false,
      interactive: drawing,
    };
  }

  return {
    background: colors.tileIdle,
    border: colors.tileBorder,
    borderStyle: 'solid',
    label: null,
    labelColor: colors.cream,
    gradeLabel: null,
    cue: 'none',
    showDot: true,
    interactive: drawing,
  };
}

function cellCenter(
  cellId: CellId,
  cols: number,
  tileSize: number,
  gap: number,
): Point {
  const row = Math.floor(cellId / cols);
  const col = cellId % cols;
  return {
    x: col * (tileSize + gap) + tileSize / 2,
    y: row * (tileSize + gap) + tileSize / 2,
  };
}

function hitTestCell(
  x: number,
  y: number,
  rows: number,
  cols: number,
  tileSize: number,
  gap: number,
): CellId | null {
  const pitch = tileSize + gap;
  const col = Math.floor(x / pitch);
  const row = Math.floor(y / pitch);
  if (row < 0 || col < 0 || row >= rows || col >= cols) return null;

  const localX = x - col * pitch;
  const localY = y - row * pitch;
  const pad = tileSize * 0.08;
  if (
    localX < -pad ||
    localY < -pad ||
    localX > tileSize + pad ||
    localY > tileSize + pad
  ) {
    return null;
  }

  const cx = tileSize / 2;
  const cy = tileSize / 2;
  const dx = localX - cx;
  const dy = localY - cy;
  const radius = tileSize * 0.52;
  if (dx * dx + dy * dy > radius * radius) return null;

  return row * cols + col;
}

function GradeBlink({
  label,
  color,
  reduceMotion,
}: {
  label: string;
  color: string;
  reduceMotion: boolean;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.gradeLabel, { color, opacity }]}
      maxFontSizeMultiplier={1.2}
    >
      {label}
    </Animated.Text>
  );
}

function Tile({
  cellId,
  state,
  onPress,
  reduceMotion,
  celebrate,
  size,
  drawMode,
}: {
  cellId: CellId;
  state: GameState;
  onPress: (cellId: CellId) => void;
  reduceMotion: boolean;
  celebrate: boolean;
  size: number;
  drawMode: boolean;
}) {
  const visual = tileVisual(state, cellId, celebrate);
  const scale = useRef(new Animated.Value(1)).current;
  const a11yLabel = tileAccessibilityLabel(state, cellId);

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    const shouldPulse =
      state.echoedCellIds.includes(cellId) ||
      state.cellGrades?.[cellId] != null ||
      (celebrate && orderForCell(state.round, cellId) !== null);
    if (!shouldPulse) return;
    scale.setValue(0.96);
    Animated.spring(scale, {
      toValue: 1,
      friction: 7,
      tension: 220,
      useNativeDriver: true,
    }).start();
  }, [
    celebrate,
    cellId,
    reduceMotion,
    scale,
    state.cellGrades,
    state.echoedCellIds,
    state.round,
  ]);

  const isStudyNumber =
    visual.cue === 'study' || (visual.label !== null && state.phase !== 'complete');
  const fontSize = isStudyNumber
    ? Math.max(26, Math.min(40, size * 0.55))
    : Math.max(18, Math.min(30, size * 0.42));

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: !visual.interactive }}
        disabled={!visual.interactive}
        onPress={() => {
          if (visual.interactive) onPress(cellId);
        }}
        unstable_pressDelay={0}
        android_disableSound
        style={[
          styles.tile,
          {
            backgroundColor: visual.background,
            borderColor: visual.border,
            borderStyle: visual.borderStyle,
            borderWidth: visual.cue === 'study' ? 3.5 : 3,
            pointerEvents: drawMode ? 'none' : 'auto',
          },
        ]}
      >
        {visual.showDot ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[
              styles.idleDot,
              { width: Math.max(6, size * 0.12), height: Math.max(6, size * 0.12) },
            ]}
          />
        ) : null}
        {visual.gradeLabel ? (
          <GradeBlink
            label={visual.gradeLabel}
            color={visual.cue === 'missed' ? colors.softMistakeBorder : colors.chalkboardDeep}
            reduceMotion={reduceMotion}
          />
        ) : null}
        {visual.label !== null ? (
          <Text
            style={[
              styles.tileLabel,
              {
                color: visual.labelColor,
                fontSize,
                marginTop: visual.gradeLabel ? 10 : 0,
              },
            ]}
            maxFontSizeMultiplier={1.25}
          >
            {visual.label}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function Board({
  state,
  onCellPress,
  reduceMotion = false,
  celebrate = false,
  style,
}: BoardProps) {
  const { width, height } = useWindowDimensions();
  const { rows, cols } = state.round;
  const landscape = width > height;
  const gap = spacing.tileGap;
  const drawMode = state.phase === 'recall';
  const studyMode = state.phase === 'study' || state.phase === 'example';

  const [finger, setFinger] = useState<Point | null>(null);
  const [activeCell, setActiveCell] = useState<CellId | null>(null);
  const drawingRef = useRef(false);
  const lastHitRef = useRef<CellId | null>(null);
  const onCellPressRef = useRef(onCellPress);
  const stateRef = useRef(state);
  onCellPressRef.current = onCellPress;
  stateRef.current = state;

  const tileSize = useMemo(() => {
    const horizontalPad = spacing.screen * 2;
    const verticalReserve = landscape ? height * 0.42 : height * 0.38;
    const maxBoardWidth = Math.max(160, width - horizontalPad);
    const maxBoardHeight = Math.max(160, height - verticalReserve);
    const byWidth = (maxBoardWidth - gap * (cols - 1)) / cols;
    const byHeight = (maxBoardHeight - gap * (rows - 1)) / rows;
    const ideal = Math.min(byWidth, byHeight, MAX_TILE_DP);
    if (ideal >= TARGET_TILE_DP) {
      return Math.min(MAX_TILE_DP, ideal);
    }
    return Math.max(MIN_TILE_DP, ideal);
  }, [cols, gap, height, landscape, rows, width]);

  const boardWidth = cols * tileSize + gap * (cols - 1);
  const boardHeight = rows * tileSize + gap * (rows - 1);
  const cells = Array.from({ length: rows * cols }, (_, cellId) => cellId);

  const enterCell = useCallback((cellId: CellId) => {
    setActiveCell(cellId);
    if (lastHitRef.current === cellId) return;
    lastHitRef.current = cellId;
    onCellPressRef.current(cellId);
  }, []);

  const handlePoint = useCallback(
    (x: number, y: number) => {
      setFinger({ x, y });
      const hit = hitTestCell(x, y, rows, cols, tileSize, gap);
      if (hit !== null) {
        enterCell(hit);
      }
    },
    [cols, enterCell, gap, rows, tileSize],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => stateRef.current.phase === 'recall',
        onMoveShouldSetPanResponder: () => stateRef.current.phase === 'recall',
        onStartShouldSetPanResponderCapture: () => stateRef.current.phase === 'recall',
        onMoveShouldSetPanResponderCapture: () => stateRef.current.phase === 'recall',
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          if (stateRef.current.phase !== 'recall') return;
          drawingRef.current = true;
          lastHitRef.current = null;
          const { locationX, locationY } = event.nativeEvent;
          handlePoint(locationX, locationY);
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          if (!drawingRef.current || stateRef.current.phase !== 'recall') return;
          const { locationX, locationY } = event.nativeEvent;
          handlePoint(locationX, locationY);
        },
        onPanResponderRelease: () => {
          drawingRef.current = false;
          lastHitRef.current = null;
          setFinger(null);
          setActiveCell(null);
        },
        onPanResponderTerminate: () => {
          drawingRef.current = false;
          lastHitRef.current = null;
          setFinger(null);
          setActiveCell(null);
        },
      }),
    [handlePoint],
  );

  useEffect(() => {
    if (state.phase !== 'recall') {
      drawingRef.current = false;
      lastHitRef.current = null;
      setFinger(null);
      setActiveCell(null);
    }
  }, [state.phase]);

  const patternPoints = useMemo(() => {
    if (studyMode) {
      return [...state.round.trail]
        .sort((a, b) => a.order - b.order)
        .map((step) => cellCenter(step.cellId, cols, tileSize, gap));
    }
    return state.echoedCellIds.map((cellId) =>
      cellCenter(cellId, cols, tileSize, gap),
    );
  }, [cols, gap, state.echoedCellIds, state.round.trail, studyMode, tileSize]);

  const polylinePoints = patternPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const lineStroke = studyMode ? colors.chalkLime : colors.chalkCorrect;
  const lineOpacity = studyMode ? 0.35 : 0.95;
  const strokeWidth = Math.max(4, tileSize * 0.08);

  const liveOrigin =
    drawMode && finger
      ? patternPoints.length > 0
        ? patternPoints[patternPoints.length - 1]!
        : activeCell !== null
          ? cellCenter(activeCell, cols, tileSize, gap)
          : null
      : null;

  const grid = (
    <View style={styles.grid} pointerEvents={drawMode ? 'none' : 'box-none'}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={`row-${row}`} style={[styles.row, { gap }]}>
          {cells.slice(row * cols, row * cols + cols).map((cellId) => (
            <Tile
              key={cellId}
              cellId={cellId}
              state={state}
              onPress={onCellPress}
              reduceMotion={reduceMotion}
              celebrate={celebrate}
              size={tileSize}
              drawMode={drawMode}
            />
          ))}
        </View>
      ))}
    </View>
  );

  const overlay = (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width={boardWidth}
      height={boardHeight}
    >
      {polylinePoints.length > 1 ? (
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={lineStroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={lineOpacity}
        />
      ) : null}

      {liveOrigin && finger ? (
        <Line
          x1={liveOrigin.x}
          y1={liveOrigin.y}
          x2={finger.x}
          y2={finger.y}
          stroke={colors.chalkLime}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={0.9}
        />
      ) : null}

      {/* Hide node dots during study so step numbers stay readable. */}
      {!studyMode
        ? patternPoints.map((point, index) => (
            <Circle
              key={`node-${index}`}
              cx={point.x}
              cy={point.y}
              r={Math.max(5, tileSize * 0.1)}
              fill={lineStroke}
              opacity={lineOpacity}
            />
          ))
        : null}

      {finger && drawMode ? (
        <Circle
          cx={finger.x}
          cy={finger.y}
          r={Math.max(6, tileSize * 0.11)}
          fill={colors.chalkLime}
          opacity={0.85}
        />
      ) : null}
    </Svg>
  );

  return (
    <View
      style={[styles.board, { width: boardWidth, height: boardHeight }, style]}
      accessibilityRole="summary"
      accessibilityLabel={`Chalk board, ${rows} by ${cols} grid. Draw the pattern during recall.`}
      {...(drawMode ? panResponder.panHandlers : null)}
    >
      {/* Study: lines behind numbers. Recall: ink above tiles. */}
      {studyMode ? (
        <>
          {overlay}
          {grid}
        </>
      ) : (
        <>
          {grid}
          {overlay}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    position: 'relative',
  },
  grid: {
    gap: spacing.tileGap,
  },
  row: {
    flexDirection: 'row',
  },
  tile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: MIN_TILE_DP,
    minHeight: MIN_TILE_DP,
  },
  tileLabel: {
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  gradeLabel: {
    position: 'absolute',
    top: 6,
    left: 4,
    right: 4,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  idleDot: {
    borderRadius: 999,
    backgroundColor: colors.chalkLimeDim,
  },
});
