import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Star } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Text } from './Text';

interface RatingProps {
  value: number;
  maxStars?: number;
  size?: number;
  showValue?: boolean;
  style?: ViewStyle;
}

export function Rating({
  value,
  maxStars = 5,
  size = 14,
  showValue = false,
  style,
}: RatingProps) {
  const theme = useTheme();
  const fullStars = Math.floor(value);
  const hasHalf = value - fullStars >= 0.5;

  return (
    <View style={[styles.container, style]}>
      {Array.from({ length: maxStars }, (_, i) => {
        const isFilled = i < fullStars || (i === fullStars && hasHalf);
        return (
          <Star
            key={i}
            size={size}
            color={theme.colors.accentGold}
            fill={isFilled ? theme.colors.accentGold : 'transparent'}
            strokeWidth={1.5}
          />
        );
      })}
      {showValue && (
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.value}>
          {value.toFixed(1)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  value: {
    marginLeft: 4,
  },
});
