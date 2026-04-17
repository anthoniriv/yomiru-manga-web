import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useSlideUp } from '../../hooks/useAnimations';
import { Animated } from 'react-native';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  const theme = useTheme();
  const slideUp = useSlideUp();

  return (
    <Animated.View style={[styles.container, slideUp.style]}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: theme.colors.surfaceSecondary },
        ]}
      >
        {icon || <BookOpen size={32} color={theme.colors.accent} strokeWidth={1.5} />}
      </View>
      <Text variant="heading3" align="center" style={styles.title}>
        {title}
      </Text>
      <Text
        variant="body"
        color={theme.colors.textSecondary}
        align="center"
        style={styles.description}
      >
        {description}
      </Text>
      {actionLabel && onAction && (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant="primary"
          style={styles.button}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    marginBottom: 8,
  },
  description: {
    marginBottom: 24,
    maxWidth: 280,
  },
  button: {
    minWidth: 200,
  },
});
