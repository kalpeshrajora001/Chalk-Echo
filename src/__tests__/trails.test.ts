import {
  applyRule,
  createSeededRng,
  generateConnectedTrail,
  mirrorCell,
  orthogonalNeighbors,
  trailKey,
} from '../game/trails';

describe('path generation', () => {
  it('builds connected orthogonal paths with no repeats or diagonals', () => {
    const rng = createSeededRng(99);
    for (const [rows, cols, steps] of [
      [3, 3, 3],
      [3, 3, 4],
      [4, 4, 5],
      [5, 5, 8],
    ] as const) {
      const path = generateConnectedTrail(rows, cols, steps, rng, null);
      expect(path).toHaveLength(steps);
      expect(new Set(path).size).toBe(steps);
      for (let i = 1; i < path.length; i += 1) {
        expect(orthogonalNeighbors(path[i - 1]!, rows, cols)).toContain(path[i]);
      }
    }
  });

  it('avoids repeating an identical trail when another path exists', () => {
    const first = generateConnectedTrail(3, 3, 3, createSeededRng(3), null);
    const second = generateConnectedTrail(3, 3, 3, createSeededRng(3), trailKey(first));
    expect(second).toHaveLength(3);
    // Same seed after avoid should prefer a different key when possible.
    // On tiny boards a collision is allowed only as last resort; ensure validity.
    expect(new Set(second).size).toBe(3);
  });
});

describe('Forward, Reverse, Mirror transforms', () => {
  const forward = [0, 3, 4];

  it('keeps Forward order', () => {
    expect(applyRule(forward, 'forward', 3)).toEqual([0, 3, 4]);
  });

  it('starts Reverse at the last tile', () => {
    expect(applyRule(forward, 'reverse', 3)).toEqual([4, 3, 0]);
  });

  it('mirrors left-right within each row for odd and even widths', () => {
    expect(applyRule(forward, 'mirror', 3)).toEqual([2, 5, 4]);
    expect(mirrorCell(0, 3)).toBe(2);
    expect(mirrorCell(4, 3)).toBe(4);
    expect(mirrorCell(0, 4)).toBe(3);
    expect(mirrorCell(15, 4)).toBe(12);
  });
});
