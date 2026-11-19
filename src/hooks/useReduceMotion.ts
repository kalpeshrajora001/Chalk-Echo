import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => {
        if (alive) {
          setReduceMotion(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
