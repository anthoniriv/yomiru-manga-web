import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Text } from './Text';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export function SectionHeader({ title, subtitle, rightAction, style }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.left}>
        <Text variant="heading3">{title}</Text>
        {subtitle && (
          <Text variant="caption" color={theme.colors.textTertiary}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightAction && <View style={styles.right}>{rightAction}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  right: {
    marginLeft: 12,
  },
});
