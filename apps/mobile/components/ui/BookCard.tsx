import React from 'react';
import { View, Pressable, StyleSheet, Animated, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { BookOpen } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Text } from './Text';
import { useScalePress, useFadeIn } from '../../hooks/useAnimations';

interface BookCardProps {
  title: string;
  coverUrl?: string | null;
  subtitle?: string;
  progress?: { read: number; total: number };
  onPress?: () => void;
  animationDelay?: number;
}

export function BookCard({
  title,
  coverUrl,
  subtitle,
  progress,
  onPress,
  animationDelay = 0,
}: BookCardProps) {
  const theme = useTheme();
  const { onPressIn, onPressOut, style: scaleStyle } = useScalePress(0.96);
  const fadeIn = useFadeIn(animationDelay);

  const progressPercent = progress && progress.total > 0
    ? (progress.read / progress.total) * 100
    : 0;

  return (
    <Animated.View style={[fadeIn.style, scaleStyle, styles.container]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.pressable}
      >
        {/* Cover */}
        <View
          style={[
            styles.coverContainer,
            {
              backgroundColor: theme.colors.surfaceSecondary,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              borderColor: theme.colors.border,
            },
            theme.shadows.sm as ViewStyle,
          ]}
        >
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={styles.cover}
              contentFit="cover"
              transition={300}
              cachePolicy="memory-disk"
              placeholder={{ thumbhash: undefined }}
            />
          ) : (
            <View style={styles.coverPlaceholder}>
              <BookOpen size={20} color={theme.colors.textTertiary} strokeWidth={1.5} />
              <Text variant="small" color={theme.colors.textTertiary} align="center" numberOfLines={2} style={styles.placeholderText}>
                {title}
              </Text>
            </View>
          )}

          {/* Progress bar overlay at bottom of cover */}
          {progress && progress.total > 0 && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBg, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
              <View
                style={[
                  styles.progressBar,
                  {
                    backgroundColor: theme.colors.accent,
                    width: `${Math.min(progressPercent, 100)}%`,
                  },
                ]}
              />
            </View>
          )}
        </View>

        {/* Info */}
        <Text
          variant="caption"
          numberOfLines={2}
          style={styles.title}
        >
          {title}
        </Text>
        {subtitle && (
          <Text variant="small" color={theme.colors.textTertiary} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pressable: {
    gap: 6,
  },
  coverContainer: {
    aspectRatio: 0.67,
    width: '100%',
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    gap: 6,
  },
  placeholderText: {
    lineHeight: 15,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  progressBg: {
    ...StyleSheet.absoluteFillObject,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  title: {
    marginTop: 2,
  },
});
