/**
 * Accessibility label rules for study vs recall.
 * Run: npx --yes tsx src/game/verifyA11y.ts
 */
import { tileAccessibilityLabel } from './a11y';
import { beginRecall, createGame, tapCell } from './engine';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  let game = createGame(1);
  // Study: trail tile announces step; empty does not invent a step.
  const studyTrail = tileAccessibilityLabel(game, 0);
  assert(studyTrail.includes('Row 1, column 1'), 'coords study');
  assert(studyTrail.includes('step 1'), 'study shows step');
  const studyEmpty = tileAccessibilityLabel(game, 1);
  assert(studyEmpty === 'Row 1, column 2, empty', 'study empty');

  game = beginRecall(game);
  const hidden = tileAccessibilityLabel(game, 0);
  assert(hidden === 'Row 1, column 1', 'recall hides answer');
  assert(!hidden.includes('step'), 'no step while hidden');

  const wrong = tapCell(game, 2);
  assert(wrong.kind === 'wrong', 'wrong tap');
  game = wrong.state;
  assert(
    tileAccessibilityLabel(game, 2).includes('incorrect'),
    'incorrect cue in label',
  );

  const right = tapCell(game, 0);
  assert(right.kind === 'correct', 'correct tap');
  game = right.state;
  const revealed = tileAccessibilityLabel(game, 0);
  assert(revealed.includes('step 1'), 'revealed step announced');
  assert(revealed.includes('correct'), 'correct cue in label');

  console.log('A11y verification passed.');
}

main();
