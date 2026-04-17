import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { Text } from './Text';

interface AvatarProps {
  name?: string | null;
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ name, size = 56, style }: AvatarProps) {
  const theme = useTheme();
  const initial = (name || '?').charAt(0).toUpperCase();

  const fontSize = size * 0.38;

  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[theme.colors.accent, theme.colors.accentGold]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text
          variant="heading2"
          color="#FFFFFF"
          style={{ fontSize, lineHeight: fontSize * 1.2 }}
        >
          {initial}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
