import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

interface DividerProps {
  style?: ViewStyle;
}

export function Divider({ style }: DividerProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: theme.colors.border,
          marginVertical: 8,
        },
        style,
      ]}
    />
  );
}
