import type { CellId, Rule, TrailStep } from './types';

export type Rng = () => number;

/** Deterministic RNG for tests; default Math.random in play. */
export function createSeededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function cellToRowCol(cellId: CellId, cols: number): { row: number; col: number } {
  return {
    row: Math.floor(cellId / cols),
    col: cellId % cols,
  };
}

export function rowColToCell(row: number, col: number, cols: number): CellId {
  return row * cols + col;
}

/** Left-right mirror within the same row. Works for odd and even widths. */
export function mirrorCell(cellId: CellId, cols: number): CellId {
  const { row, col } = cellToRowCol(cellId, cols);
  return rowColToCell(row, cols - 1 - col, cols);
}

export function orthogonalNeighbors(
  cellId: CellId,
  rows: number,
  cols: number,
): CellId[] {
  const { row, col } = cellToRowCol(cellId, cols);
  const next: CellId[] = [];
  if (row > 0) next.push(rowColToCell(row - 1, col, cols));
  if (row < rows - 1) next.push(rowColToCell(row + 1, col, cols));
  if (col > 0) next.push(rowColToCell(row, col - 1, cols));
  if (col < cols - 1) next.push(rowColToCell(row, col + 1, cols));
  return next;
}

export function trailKey(cells: CellId[]): string {
  return cells.join(',');
}

export function toTrailSteps(cells: CellId[]): TrailStep[] {
  return cells.map((cellId, index) => ({
    cellId,
    order: index + 1,
  }));
}

/**
 * Apply echo rule to a forward connected path.
 * Reverse: player starts at the last forward tile.
 * Mirror: same order, each tile reflected L↔R in its row.
 */
export function applyRule(
  forwardCells: CellId[],
  rule: Rule,
  cols: number,
): CellId[] {
  if (rule === 'forward') {
    return [...forwardCells];
  }
  if (rule === 'reverse') {
    return [...forwardCells].reverse();
  }
  // mirror
  return forwardCells.map((cellId) => mirrorCell(cellId, cols));
}

function shuffleInPlace<T>(items: T[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}

/**
 * Connected orthogonal path, no repeated tiles, no diagonal jumps.
 * Prefer a path whose key differs from `avoidKey` when alternatives exist.
 */
export function generateConnectedTrail(
  rows: number,
  cols: number,
  steps: number,
  rng: Rng = Math.random,
  avoidKey: string | null = null,
): CellId[] {
  const maxCells = rows * cols;
  if (steps < 1 || steps > maxCells) {
    throw new Error(`Invalid step count ${steps} for ${rows}×${cols}`);
  }

  const attempts = 48;
  let fallback: CellId[] | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const path = tryGeneratePath(rows, cols, steps, rng);
    if (!path) {
      continue;
    }
    const key = trailKey(path);
    if (avoidKey !== null && key === avoidKey) {
      fallback = path;
      continue;
    }
    return path;
  }

  if (fallback) {
    return fallback;
  }

  // Deterministic snake fallback so play never hard-fails.
  return snakeFallback(rows, cols, steps);
}

function tryGeneratePath(
  rows: number,
  cols: number,
  steps: number,
  rng: Rng,
): CellId[] | null {
  const total = rows * cols;
  const starts = Array.from({ length: total }, (_, i) => i);
  shuffleInPlace(starts, rng);

  for (const start of starts) {
    const path: CellId[] = [start];
    const used = new Set<CellId>([start]);
    if (grow(path, used, rows, cols, steps, rng)) {
      return path;
    }
  }
  return null;
}

function grow(
  path: CellId[],
  used: Set<CellId>,
  rows: number,
  cols: number,
  steps: number,
  rng: Rng,
): boolean {
  if (path.length === steps) {
    return true;
  }
  const head = path[path.length - 1]!;
  const options = orthogonalNeighbors(head, rows, cols).filter((n) => !used.has(n));
  shuffleInPlace(options, rng);
  for (const next of options) {
    path.push(next);
    used.add(next);
    if (grow(path, used, rows, cols, steps, rng)) {
      return true;
    }
    path.pop();
    used.delete(next);
  }
  return false;
}

function snakeFallback(rows: number, cols: number, steps: number): CellId[] {
  const cells: CellId[] = [];
  for (let row = 0; row < rows; row += 1) {
    if (row % 2 === 0) {
      for (let col = 0; col < cols; col += 1) {
        cells.push(rowColToCell(row, col, cols));
      }
    } else {
      for (let col = cols - 1; col >= 0; col -= 1) {
        cells.push(rowColToCell(row, col, cols));
      }
    }
  }
  return cells.slice(0, steps);
}

/** Fixed demo path for Reverse / Mirror introduction cards on 4×4. */
export function buildWorkedExample(rule: 'reverse' | 'mirror'): {
  rows: number;
  cols: number;
  forwardCells: CellId[];
  echoCells: CellId[];
} {
  const rows = 4;
  const cols = 4;
  const forwardCells: CellId[] = [0, 4, 5];
  return {
    rows,
    cols,
    forwardCells,
    echoCells: applyRule(forwardCells, rule, cols),
  };
}
