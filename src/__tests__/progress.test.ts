import { markWinOnce, defaultAppSnapshot } from '../game/session';
import {
  __resetProgressMemoryForTests,
  loadProgress,
  updateProgress,
} from '../storage/progress';
import AsyncStorage from '../test/asyncStorageMock';

describe('saved progress', () => {
  beforeEach(async () => {
    __resetProgressMemoryForTests();
    await AsyncStorage.clear();
  });

  it('loads defaults when storage is empty or invalid', async () => {
    const empty = await loadProgress();
    expect(empty.version).toBe(6);
    expect(empty.totalWins).toBe(0);

    await AsyncStorage.setItem('@chalk-echo/progress/v4', '{not-json');
    __resetProgressMemoryForTests();
    const invalid = await loadProgress();
    expect(invalid.totalWins).toBe(0);
  });

  it('serializes writes so older revisions cannot overwrite newer ones', async () => {
    await updateProgress((s) => ({ ...s, totalWins: 1 }));
    const first = await updateProgress((s) => ({ ...s, onboardingComplete: true }));
    expect(first.revision).toBeGreaterThan(0);

    const second = await updateProgress((s) => ({
      ...s,
      practice: { ...s.practice, stage: 3 },
    }));
    expect(second.revision).toBe(first.revision + 1);
    expect(second.practice.stage).toBe(3);

    __resetProgressMemoryForTests();
    const reloaded = await loadProgress();
    expect(reloaded.practice.stage).toBe(3);
    expect(reloaded.onboardingComplete).toBe(true);
  });
});

describe('duplicate-win prevention', () => {
  it('counts each round id only once', () => {
    let snap = defaultAppSnapshot();
    const first = markWinOnce(snap, 'practice:1');
    expect(first.counted).toBe(true);
    expect(first.snapshot.totalWins).toBe(1);

    const second = markWinOnce(first.snapshot, 'practice:1');
    expect(second.counted).toBe(false);
    expect(second.snapshot.totalWins).toBe(1);

    const third = markWinOnce(second.snapshot, 'practice:2');
    expect(third.counted).toBe(true);
    expect(third.snapshot.totalWins).toBe(2);
  });

  it('handles two rapid distinct completions without losing a win', async () => {
    __resetProgressMemoryForTests();
    await AsyncStorage.clear();

    const writes = await Promise.all([
      updateProgress((s) => {
        const win = markWinOnce(s, 'rapid:a');
        return win.snapshot;
      }),
      updateProgress((s) => {
        const win = markWinOnce(s, 'rapid:b');
        return win.snapshot;
      }),
    ]);

    const latest = writes[writes.length - 1]!;
    expect(latest.countedWinIds).toEqual(expect.arrayContaining(['rapid:a', 'rapid:b']));
    expect(latest.totalWins).toBe(2);
  });
});
