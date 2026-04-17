import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../../theme';
import { textVariants, TextVariant } from '../../theme/typography';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export function Text({
  variant = 'body',
  color,
  align,
  style,
  children,
  ...props
}: TextProps) {
  const theme = useTheme();
  const variantStyle = textVariants[variant];

  return (
    <RNText
      style={[
        {
          ...variantStyle,
          color: color || theme.colors.text,
          textAlign: align,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
}
