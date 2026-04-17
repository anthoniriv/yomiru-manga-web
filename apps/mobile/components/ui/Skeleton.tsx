import React, { useEffect, useRef, useState } from 'react';
import { ViewStyle, Animated, Easing, LayoutChangeEvent, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const theme = useTheme();
  const translateX = useRef(new Animated.Value(-1)).current;
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [translateX]);

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const animatedTranslate = translateX.interpolate({
    inputRange: [-1, 1],
    outputRange: [-containerWidth, containerWidth],
  });

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: theme.colors.skeleton,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {containerWidth > 0 && (
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            transform: [{ translateX: animatedTranslate }],
          }}
        >
          <LinearGradient
            colors={[
              'transparent',
              theme.colors.shimmer,
              'transparent',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}
