import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/colors';

export type InfoSheetKind = 'help' | 'privacy';

type InfoSheetProps = {
  kind: InfoSheetKind;
  onClose: () => void;
};

const HELP_BODY = `Chalk Echo is a memory challenge on a 4×4 board — gentle at first, then sharp enough to share.

1. Study the numbered chalk trail.
2. Tap I'm ready when you want the numbers to hide.
3. Draw the pattern freely — wrong turns are allowed.
4. When you finish, tiles blink Correct or You Missed.

Early trails are short warm-ups. Later trails grow longer and twist with Reverse and Mirror rules, so real remembrance matters.

Finished a tough trail? Challenge a friend or family member — wish them luck and see who remembers better.

Need a reminder? Use See trail again.
Stuck? Show next tile reveals the next step.
Hints and replays still count as wins.`;

const PRIVACY_BODY = `Chalk Echo works fully offline.

What we store on this device
• Onboarding completion
• Practice difficulty and unlocked stages
• Your current Practice and Reverse trails
• Total wins

How it is stored
• Data is saved locally with AsyncStorage on your phone or tablet.
• Nothing is sent to a server. There are no accounts, ads, analytics, purchases, or online leaderboards.

Clearing data
• Uninstalling the app or clearing the app's storage removes this local progress.`;

export function InfoSheet({ kind, onClose }: InfoSheetProps) {
  const title = kind === 'help' ? 'How to Play' : 'Privacy';
  const body = kind === 'help' ? HELP_BODY : PRIVACY_BODY;

  return (
    <SafeAreaView style={styles.overlay} edges={['top', 'right', 'bottom', 'left']}>
      <View
        style={styles.card}
        accessibilityViewIsModal
        accessibilityLabel={title}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closePressed]}
          >
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          <Text style={styles.body}>{body}</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 14, 10, 0.88)',
    justifyContent: 'center',
    padding: spacing.screen,
  },
  card: {
    maxHeight: '86%',
    borderRadius: 24,
    backgroundColor: colors.chalkboardDeep,
    borderWidth: 1,
    borderColor: colors.tileBorder,
    padding: spacing.section + 4,
    gap: spacing.section,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: colors.cream,
    fontSize: 26,
    fontWeight: '700',
    fontFamily: 'serif',
    flexShrink: 1,
  },
  closeBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.tileBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: {
    backgroundColor: colors.tileIdle,
  },
  closeLabel: {
    color: colors.cream,
    fontSize: 14,
    fontWeight: '700',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  body: {
    color: colors.creamMuted,
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '500',
  },
});
