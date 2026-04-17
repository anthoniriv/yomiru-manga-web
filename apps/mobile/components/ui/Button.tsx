import React from 'react';
import {
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useScalePress } from '../../hooks/useAnimations';
import { Text } from './Text';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  haptic?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  haptic = true,
}: ButtonProps) {
  const theme = useTheme();
  const { onPressIn, onPressOut, style: scaleStyle } = useScalePress();
  const sizeStyles = SIZE_MAP[size];
  const opacity = disabled ? 0.5 : 1;

  const textColor =
    variant === 'primary'
      ? theme.colors.textInverse
      : variant === 'danger'
        ? theme.colors.error
        : theme.colors.accent;

  const handlePress = () => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  const content = loading ? (
    <ActivityIndicator size="small" color={textColor} />
  ) : (
    <>
      {icon}
      <Text
        variant={size === 'sm' ? 'label' : 'bodyMedium'}
        color={textColor}
      >
        {title}
      </Text>
    </>
  );

  return (
    <Animated.View style={[scaleStyle, { opacity }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || loading}
        style={[
          styles.base,
          sizeStyles.container,
          variant === 'primary' && {
            backgroundColor: theme.colors.accent,
          },
          variant === 'secondary' && {
            borderWidth: 1,
            borderColor: theme.colors.borderAccent,
            backgroundColor: theme.colors.accentSurface,
          },
          variant === 'ghost' && {
            backgroundColor: 'transparent',
          },
          variant === 'danger' && {
            borderWidth: 1,
            borderColor: 'rgba(212, 86, 74, 0.25)',
            backgroundColor: 'rgba(212, 86, 74, 0.08)',
          },
        ]}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}

const SIZE_MAP: Record<ButtonSize, { container: ViewStyle }> = {
  sm: { container: { paddingVertical: 8, paddingHorizontal: 16, gap: 6 } },
  md: { container: { paddingVertical: 14, paddingHorizontal: 24, gap: 8 } },
  lg: { container: { paddingVertical: 18, paddingHorizontal: 32, gap: 10 } },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    overflow: 'hidden',
  },
});
