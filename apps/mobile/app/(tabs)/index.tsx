import React, { useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SafeArea } from '../../components/layout/SafeArea';
import { Text } from '../../components/ui/Text';
import { Badge } from '../../components/ui/Badge';
import { BookCard } from '../../components/ui/BookCard';
import { EmptyState } from '../../components/layout/EmptyState';
import { useTheme } from '../../theme';
import { useLibraryStore } from '../../store/libraryStore';
import { useSlideUp, useFadeIn } from '../../hooks/useAnimations';
import { ReadingStatus, Book } from '@yomiru/shared';

const FILTERS = [
  'all',
  ReadingStatus.READING,
  ReadingStatus.COMPLETED,
  ReadingStatus.PLAN_TO_READ,
  ReadingStatus.DROPPED,
] as const;

export default function LibraryScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const {
    isLoading,
    hasLoaded,
    filter,
    fetchBooks,
    setFilter,
    getFilteredBooks,
    getBookProgress,
  } = useLibraryStore();

  const headerAnim = useSlideUp(0);
  const filtersAnim = useFadeIn(100);

  useFocusEffect(
    useCallback(() => {
      fetchBooks();
    }, [fetchBooks]),
  );

  const filteredBooks = getFilteredBooks();
  const featuredBook = useMemo(() => {
    if (filteredBooks.length === 0) return null;
    const reading = filteredBooks.find((book) => {
      const progress = getBookProgress(book.id);
      return progress.readChapters > 0 && progress.readChapters < progress.totalChapters;
    });
    return reading || filteredBooks[0];
  }, [filteredBooks, getBookProgress]);
  const compactBooks = useMemo(
    () => filteredBooks.filter((book) => book.id !== featuredBook?.id),
    [filteredBooks, featuredBook],
  );

  const filterLabels: Record<string, string> = {
    all: t('library.all'),
    reading: t('library.reading'),
    completed: t('library.completed'),
    plan_to_read: t('library.planToRead'),
    dropped: t('library.dropped'),
  };

  const handleFilterPress = (value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilter(value as any);
  };

  const renderCompactCard = ({ item, index }: { item: Book; index: number }) => {
    const progress = getBookProgress(item.id);
    return (
      <BookCard
        title={item.title}
        coverUrl={item.cover_image_url}
        progress={progress.totalChapters > 0 ? { read: progress.readChapters, total: progress.totalChapters } : undefined}
        onPress={() => router.push(`/(tabs)/book/${item.id}`)}
        animationDelay={Math.min(index * 50, 300)}
      />
    );
  };

  // Greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'おはよう';       // Ohayou — morning
    if (hour < 18) return 'こんにちは';     // Konnichiwa — afternoon
    return 'こんばんは';                     // Konbanwa — evening
  };

  return (
    <SafeArea>
      <Animated.View style={[styles.header, headerAnim.style]}>
        <Text variant="small" color={theme.colors.textTertiary} style={styles.greeting}>
          {getGreeting()}
        </Text>
        <Text variant="heading1">{t('library.title')}</Text>
      </Animated.View>

      <Animated.View style={[styles.filtersWrapper, filtersAnim.style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContainer}
        >
          {FILTERS.map((value) => (
            <Pressable
              key={value}
              onPress={() => handleFilterPress(value)}
              disabled={isLoading && !hasLoaded}
              style={[
                styles.filterChip,
                filter === value
                  ? { backgroundColor: theme.colors.accent }
                  : {
                      backgroundColor: theme.colors.surfaceSecondary,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                    },
              ]}
            >
              <Text
                variant="label"
                color={filter === value ? theme.colors.textInverse : theme.colors.textSecondary}
              >
                {filterLabels[value]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>

      <FlatList
        data={compactBooks}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={renderCompactCard}
        columnWrapperStyle={styles.compactRow}
        contentContainerStyle={[
          styles.listContent,
          filteredBooks.length === 0 && styles.emptyContent,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchBooks}
            tintColor={theme.colors.accent}
          />
        }
        ListHeaderComponent={
          featuredBook ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/(tabs)/book/${featuredBook.id}`);
              }}
              style={[styles.featuredCard, { borderRadius: theme.radius.lg }]}
            >
              <Image
                source={{ uri: featuredBook.cover_image_url || undefined }}
                style={styles.featuredCover}
                contentFit="cover"
                transition={180}
                cachePolicy="memory-disk"
              />
              <LinearGradient
                colors={['transparent', 'rgba(13, 13, 20, 0.75)', 'rgba(13, 13, 20, 0.95)']}
                style={styles.featuredGradient}
              >
                <View style={styles.featuredTop}>
                  <Badge label={t('bookDetail.continueReading')} size="sm" />
                </View>
                <Text variant="heading2" numberOfLines={2} style={styles.featuredTitle}>
                  {featuredBook.title}
                </Text>
                <Text variant="caption" color={theme.colors.textSecondary}>
                  {filterLabels[featuredBook.status] || featuredBook.status}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          isLoading && !hasLoaded ? null : (
            <EmptyState
              title={t('library.empty')}
              description={t('library.emptyAction')}
              actionLabel={t('library.addFirst')}
              onAction={() => router.push('/(tabs)/add')}
            />
          )
        }
      />

      {isLoading && !hasLoaded && (
        <View style={[styles.loadingOverlay, { backgroundColor: theme.colors.overlay }]}>
          <View style={[styles.loadingCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text variant="bodyMedium">{t('library.loading')}</Text>
            <Text variant="small" color={theme.colors.textSecondary}>
              {t('library.loadingHint')}
            </Text>
          </View>
        </View>
      )}
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  greeting: {
    marginBottom: 2,
  },
  filtersWrapper: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyContent: {
    flex: 1,
  },
  featuredCard: {
    overflow: 'hidden',
    marginBottom: 16,
    marginHorizontal: 4,
  },
  featuredCover: {
    width: '100%',
    height: 220,
  },
  featuredGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingTop: 48,
    gap: 4,
  },
  featuredTop: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  featuredTitle: {
    color: '#F0EDE8',
  },
  compactRow: {
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
});
