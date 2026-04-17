import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, StyleSheet, TextInputProps, ViewStyle, Animated, Easing } from 'react-native';
import { useTheme } from '../../theme';
import { Text } from './Text';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  containerStyle,
  style,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  ...props
}: InputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [isFocused]);

  const borderColor = error
    ? theme.colors.error
    : isFocused
      ? theme.colors.accent
      : theme.colors.border;

  const animatedBorderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.border, theme.colors.accent],
  });

  return (
    <View style={containerStyle}>
      {label && (
        <Text variant="label" color={theme.colors.textSecondary} style={styles.label}>
          {label}
        </Text>
      )}
      <Animated.View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceSecondary : theme.colors.surface,
            borderColor: error ? theme.colors.error : animatedBorderColor,
            borderWidth: 1,
          },
        ]}
      >
        {leftIcon && <View style={styles.icon} pointerEvents="none">{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.text,
              fontFamily: theme.typography.families.regular,
              fontSize: theme.typography.sizes.base,
            },
            style,
          ]}
          placeholderTextColor={theme.colors.textTertiary}
          onFocus={(e) => {
            setIsFocused(true);
            onFocusProp?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlurProp?.(e);
          }}
          {...props}
        />
        {rightIcon && <View style={styles.icon} pointerEvents="none">{rightIcon}</View>}
      </Animated.View>
      {error && (
        <Text variant="small" color={theme.colors.error} style={styles.helper}>
          {error}
        </Text>
      )}
      {!error && helperText && (
        <Text variant="small" color={theme.colors.textTertiary} style={styles.helper}>
          {helperText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
  },
  icon: {
    marginRight: 10,
  },
  helper: {
    marginTop: 4,
    marginLeft: 4,
  },
});
