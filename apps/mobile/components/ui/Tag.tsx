import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Text } from './Text';

interface TagProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
}

export function Tag({
  label,
  active = false,
  onPress,
  color,
  backgroundColor,
  style,
}: TagProps) {
  const theme = useTheme();

  const bgColor = active
    ? (backgroundColor || theme.colors.accent)
    : (backgroundColor || theme.colors.surfaceSecondary);

  const textColor = active
    ? (color || theme.colors.textInverse)
    : (color || theme.colors.textSecondary);

  const content = (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: bgColor,
          borderRadius: theme.radius.xs,
        },
        !active && {
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <Text variant="small" color={textColor}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={4}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  tag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
});
