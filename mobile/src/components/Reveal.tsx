import React, { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

let played = false; // authored motion plays once per app session, on the first view of Today

/** Staggered ease-out reveal. Content is fully visible by default and when reduce-motion is on. */
export function Reveal({ index = 0, children, settle }: { index?: number; children: React.ReactNode; settle?: boolean }) {
  const reduce = useReducedMotion();
  const animate = !reduce && !played;
  const p = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    p.value = withDelay(index * 90, withTiming(1, { duration: settle ? 400 : 300, easing: Easing.out(Easing.exp) }));
    const id = setTimeout(() => { played = true; }, 1500);
    // failsafe: if the animation frame loop is throttled, content must still appear
    const safe = setTimeout(() => { p.value = 1; }, index * 90 + 900);
    return () => { clearTimeout(id); clearTimeout(safe); };
  }, [animate, index, p, settle]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * (settle ? 8 : 14) }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
