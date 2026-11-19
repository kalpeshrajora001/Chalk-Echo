import { orderForCell } from './engine';
import type { CellId, GameState } from './types';

/** 1-based row/column labels for TalkBack and VoiceOver. */
export function cellCoordinates(
  cellId: CellId,
  cols: number,
): { row: number; col: number; label: string } {
  const row = Math.floor(cellId / cols) + 1;
  const col = (cellId % cols) + 1;
  return {
    row,
    col,
    label: `Row ${row}, column ${col}`,
  };
}

/**
 * Accessibility label rules:
 * - Always include coordinates.
 * - Study / example: include visible step numbers.
 * - Recall: include revealed steps only — never hidden answers.
 */
export function tileAccessibilityLabel(
  state: GameState,
  cellId: CellId,
): string {
  const { round, phase, echoedCellIds, softMistakeCellId, hintCellId } = state;
  const coords = cellCoordinates(cellId, round.cols).label;
  const order = orderForCell(round, cellId);
  const echoed = echoedCellIds.includes(cellId);
  const softMistake = softMistakeCellId === cellId;
  const hinted = hintCellId === cellId;

  if (softMistake) {
    return `${coords}, incorrect, try again`;
  }

  if (echoed && order !== null) {
    return `${coords}, step ${order}, correct`;
  }

  if (phase === 'complete' && order !== null) {
    return `${coords}, step ${order}, trail complete`;
  }

  if ((phase === 'study' || phase === 'example') && order !== null) {
    return `${coords}, step ${order}`;
  }

  if (phase === 'study' || phase === 'example') {
    return `${coords}, empty`;
  }

  if (hinted && order !== null) {
    return `${coords}, step ${order}, hint shown`;
  }

  // Recall (and other) — hidden answers stay out of the label.
  if (phase === 'recall') {
    return coords;
  }

  return coords;
}
