import { useRef, useEffect, useCallback } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Fade-in animation on mount.
 * @param delay - ms delay before starting (for staggered list animations)
 */
export function useFadeIn(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      delay,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, []);

  return { opacity, style: { opacity } };
}

/**
 * Spring scale press effect for interactive elements.
 * Uses spring physics for natural-feeling press feedback.
 */
export function useScalePress(toValue = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      damping: 15,
      stiffness: 300,
    }).start();
  }, [toValue]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 300,
    }).start();
  }, []);

  return {
    scale,
    onPressIn,
    onPressOut,
    style: { transform: [{ scale }] },
  };
}

/**
 * Shimmer translateX animation for skeleton loading.
 * @param width - container width (measured via onLayout)
 */
export function useShimmer(width: number) {
  const translateX = useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: width,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [width]);

  return { translateX };
}

/**
 * Slide-up and fade-in animation for screen entrances.
 * Decelerated easing for natural feel.
 */
export function useSlideUp(delay = 0) {
  const translateY = useRef(new Animated.Value(16)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 450,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 450,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  return {
    style: {
      opacity,
      transform: [{ translateY }],
    },
  };
}

/**
 * Staggered fade-in for list items.
 * Returns an array of animated styles indexed by item position.
 */
export function useStaggeredFadeIn(count: number, baseDelay = 50) {
  const anims = useRef(
    Array.from({ length: count }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(12),
    })),
  ).current;

  useEffect(() => {
    const animations = anims.slice(0, count).map((anim, index) =>
      Animated.parallel([
        Animated.timing(anim.opacity, {
          toValue: 1,
          duration: 350,
          delay: index * baseDelay,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(anim.translateY, {
          toValue: 0,
          duration: 350,
          delay: index * baseDelay,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]),
    );

    Animated.stagger(0, animations).start();
  }, [count]);

  return anims.map((anim) => ({
    opacity: anim.opacity,
    transform: [{ translateY: anim.translateY }],
  }));
}

/**
 * Gentle pulse animation for drawing attention.
 * Loops a subtle scale oscillation.
 */
export function usePulse(minScale = 0.97, maxScale = 1.03, duration = 2000) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: maxScale,
          duration: duration / 2,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(scale, {
          toValue: minScale,
          duration: duration / 2,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return { style: { transform: [{ scale }] } };
}

/**
 * Combined scale + opacity for modal/sheet entrance.
 * Spring physics for bouncy entrance feel.
 */
export function useModalEntrance(visible: boolean) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();
    } else {
      scale.setValue(0.92);
      opacity.setValue(0);
    }
  }, [visible]);

  return {
    style: {
      transform: [{ scale }],
      opacity,
    },
  };
}
