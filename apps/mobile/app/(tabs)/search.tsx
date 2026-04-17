import React, { useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { Search as SearchIcon } from 'lucide-react-native';
import { SafeArea } from '../../components/layout/SafeArea';
import { Text } from '../../components/ui/Text';
import { Card } from '../../components/ui/Card';
import { SearchBar } from '../../components/ui/SearchBar';
import { EmptyState } from '../../components/layout/EmptyState';
import { useTheme } from '../../theme';
import { useLibraryStore } from '../../store/libraryStore';
import { useSlideUp } from '../../hooks/useAnimations';
import { Book } from '@yomiru/shared';

export default function SearchScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const books = useLibraryStore((s) => s.books);
  const [query, setQuery] = useState('');

  const headerAnim = useSlideUp(0);

  const results = useMemo(() => {
    if (!query.trim()) return books;
    const q = query.toLowerCase();
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.source_domain.toLowerCase().includes(q)
    );
  }, [books, query]);

  const renderItem = ({ item }: { item: Book }) => (
    <Card
      onPress={() => router.push(`/(tabs)/book/${item.id}`)}
      style={styles.resultCard}
    >
      <View style={styles.resultRow}>
        {item.cover_image_url ? (
          <Image
            source={{ uri: item.cover_image_url }}
            style={[styles.thumbnail, { borderRadius: theme.radius.sm }]}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.thumbnail, { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.sm }]} />
        )}
        <View style={styles.resultInfo}>
          <Text variant="bodyMedium" numberOfLines={2}>{item.title}</Text>
          <Text variant="small" color={theme.colors.textTertiary}>{item.source_domain}</Text>
        </View>
      </View>
    </Card>
  );

  return (
    <SafeArea>
      <Animated.View style={[styles.header, headerAnim.style]}>
        <Text variant="heading1">{t('search.title')}</Text>
      </Animated.View>

      <View style={styles.searchBar}>
        <SearchBar
          placeholder={t('search.placeholder')}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          results.length === 0 && styles.emptyList,
        ]}
        ListEmptyComponent={
          query.trim() ? (
            <EmptyState
              title={t('search.noResults')}
              description={t('search.noResultsDesc')}
              icon={<SearchIcon size={32} color={theme.colors.textTertiary} strokeWidth={1.5} />}
            />
          ) : null
        }
      />
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  searchBar: { paddingHorizontal: 20, paddingBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  emptyList: { flex: 1 },
  resultCard: { marginBottom: 8 },
  resultRow: { flexDirection: 'row', padding: 12, gap: 12 },
  thumbnail: { width: 48, height: 64 },
  resultInfo: { flex: 1, justifyContent: 'center', gap: 4 },
});
