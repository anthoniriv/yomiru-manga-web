import React from 'react';
import { Pressable, StyleSheet, ViewStyle, View, Animated, StyleProp } from 'react-native';
import { useTheme } from '../../theme';
import { useFadeIn, useScalePress } from '../../hooks/useAnimations';

interface CardProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'flat';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  animationDelay?: number;
}

export function Card({
  children,
  variant = 'elevated',
  onPress,
  style,
  animationDelay = 0,
}: CardProps) {
  const theme = useTheme();
  const fadeIn = useFadeIn(animationDelay);
  const { onPressIn, onPressOut, style: scaleStyle } = useScalePress(0.97);

  const cardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    ...(variant === 'elevated'
      ? {
          ...(theme.shadows.sm as ViewStyle),
          borderWidth: 1,
          borderColor: theme.colors.border,
        }
      : {
          borderWidth: 1,
          borderColor: theme.colors.border,
        }),
  };

  if (onPress) {
    return (
      <Animated.View style={[fadeIn.style, scaleStyle]}>
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[cardStyle, style]}
        >
          {children}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[fadeIn.style]}>
      <View style={[cardStyle, style]}>{children}</View>
    </Animated.View>
  );
}
