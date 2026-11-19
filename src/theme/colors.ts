/** Chalk Echo visual language — high-contrast chalkboard palette. */
export const colors = {
  chalkboard: '#152318',
  chalkboardDeep: '#0C160E',
  cream: '#F7ECD2',
  creamMuted: '#D7C7A2',
  chalkLime: '#C8EC5C',
  chalkLimeDim: '#3F5533',
  chalkLimePressed: '#A9D63A',
  chalkCorrect: '#D8F48A',
  softMistake: '#3F3428',
  softMistakeBorder: '#E0B07A',
  tileIdle: '#1F2F23',
  tileBorder: '#4A6350',
  focusRing: '#F7ECD2',
  hintDash: '#F0E2B8',
} as const;

export const spacing = {
  screen: 24,
  section: 16,
  tileGap: 10,
} as const;

/** Target tile edge in density-independent pixels when width allows. */
export const TARGET_TILE_DP = 56;
export const MIN_TILE_DP = 48;
export const MAX_TILE_DP = 78;
