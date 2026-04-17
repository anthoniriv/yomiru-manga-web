import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ListRenderItem,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, type ImageLoadEventData } from 'expo-image';
import { ChevronLeft, Download, CheckCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { SafeArea } from '../../components/layout/SafeArea';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTheme } from '../../theme';
import { apiGet, getReaderImageProxyUrl } from '../../lib/api';
import {
  cacheChapterImages,
  isChapterOfflineReady,
  restoreCachedChapterImages,
} from '../../lib/readerCache';
import {
  cacheChapterContent,
  getCachedChapterContent,
} from '../../lib/readerContentCache';
import { ChapterContentResponse } from '@yomiru/shared';

function ReaderImage({ uri }: { uri: string }) {
  const [aspectRatio, setAspectRatio] = useState(0.7);

  const handleLoad = useCallback((event: ImageLoadEventData) => {
    const width = event.source.width;
    const height = event.source.height;
    if (width > 0 && height > 0) {
      setAspectRatio(width / height);
    }
  }, []);

  return (
    <Image
      source={{ uri }}
      style={[styles.readerImage, { aspectRatio }]}
      contentFit="contain"
      transition={100}
      cachePolicy="memory-disk"
      onLoad={handleLoad}
    />
  );
}

type ReaderItem =
  | { key: string; type: 'image'; uri: string }
  | { key: string; type: 'paragraph'; text: string };

export default function ChapterReaderScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoCaching, setIsAutoCaching] = useState(false);
  const [autoDone, setAutoDone] = useState(0);
  const [autoTotal, setAutoTotal] = useState(0);
  const [isOfflineDownloading, setIsOfflineDownloading] = useState(false);
  const [offlineDone, setOfflineDone] = useState(0);
  const [offlineTotal, setOfflineTotal] = useState(0);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ChapterContentResponse | null>(null);
  const [resolvedImages, setResolvedImages] = useState<string[]>([]);

  const readerItems = useMemo<ReaderItem[]>(() => {
    if (!payload) return [];

    const fallbackProxyUris = payload.content.images.map((url) => getReaderImageProxyUrl(url));
    const imageUris =
      resolvedImages.length === fallbackProxyUris.length && fallbackProxyUris.length > 0
        ? resolvedImages
        : fallbackProxyUris;

    const images: ReaderItem[] = imageUris.map((uri, index) => ({
      key: `img-${index}-${uri}`,
      type: 'image',
      uri,
    }));

    const paragraphs: ReaderItem[] = payload.content.paragraphs.map((paragraph, index) => ({
      key: `txt-${index}-${paragraph.slice(0, 20)}`,
      type: 'paragraph',
      text: paragraph,
    }));

    return [...images, ...paragraphs];
  }, [payload, resolvedImages]);

  const renderReaderItem = useCallback<ListRenderItem<ReaderItem>>(({ item }) => {
    if (item.type === 'image') {
      return <ReaderImage uri={item.uri} />;
    }

    return (
      <Text variant="bodyLarge" style={styles.paragraph}>
        {item.text}
      </Text>
    );
  }, []);

  const syncOfflineStatus = useCallback(async () => {
    if (!chapterId) return;
    const ready = await isChapterOfflineReady(chapterId);
    setIsOfflineReady(ready);
  }, [chapterId]);

  const hydrateFromLocalCache = useCallback(async (): Promise<boolean> => {
    if (!chapterId) return false;
    const cached = await getCachedChapterContent(chapterId);
    if (!cached) return false;

    setPayload(cached.payload);
    const cachedImages = await restoreCachedChapterImages(chapterId, cached.payload.content.images);

    if (cachedImages) {
      setResolvedImages(cachedImages.uris);
      setIsOfflineReady(cachedImages.mode === 'offline');
    } else {
      setResolvedImages(cached.payload.content.images.map((url) => getReaderImageProxyUrl(url)));
      setIsOfflineReady(cached.mode === 'offline');
    }

    return true;
  }, [chapterId]);

  const fetchChapterContent = useCallback(async (refresh = false) => {
    if (!chapterId) return;

    setError(null);
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      if (!refresh) {
        const loadedFromCache = await hydrateFromLocalCache();
        if (loadedFromCache) {
          return;
        }
      }

      const data = await apiGet<ChapterContentResponse>(`/api/chapters/${chapterId}/content`);
      setPayload(data);

      setIsAutoCaching(true);
      setAutoDone(0);
      setAutoTotal(data.content.images.length);

      try {
        const result = await cacheChapterImages(chapterId, data.content.images, {
          mode: 'auto',
          onProgress: (done, total) => {
            setAutoDone(done);
            setAutoTotal(total);
          },
        });
        setResolvedImages(result.uris);
        setIsOfflineReady(result.mode === 'offline');
        await cacheChapterContent(chapterId, data, result.mode);
      } catch {
        setResolvedImages(data.content.images.map((url) => getReaderImageProxyUrl(url)));
        await cacheChapterContent(chapterId, data, 'auto');
      } finally {
        setIsAutoCaching(false);
      }
    } catch (err) {
      const loadedFromCache = await hydrateFromLocalCache();
      if (!loadedFromCache) {
        setError(err instanceof Error ? err.message : 'Failed to load chapter');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      await syncOfflineStatus();
    }
  }, [chapterId, hydrateFromLocalCache, syncOfflineStatus]);

  const handleDownloadOffline = useCallback(async () => {
    if (!chapterId || !payload || isOfflineDownloading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOfflineDownloading(true);
    setOfflineDone(0);
    setOfflineTotal(payload.content.images.length);
    setError(null);

    try {
      const result = await cacheChapterImages(chapterId, payload.content.images, {
        mode: 'offline',
        onProgress: (done, total) => {
          setOfflineDone(done);
          setOfflineTotal(total);
        },
      });
      await cacheChapterContent(chapterId, payload, 'offline');
      setResolvedImages(result.uris);
      setIsOfflineReady(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : 'Offline download failed');
    } finally {
      setIsOfflineDownloading(false);
    }
  }, [chapterId, isOfflineDownloading, payload]);

  useEffect(() => {
    fetchChapterContent();
  }, [fetchChapterContent]);

  if (isLoading || isAutoCaching) {
    return (
      <SafeArea edges={['top', 'bottom']}>
        <View style={styles.loadingHeader}>
          <ActivityIndicator size="small" color={theme.colors.accent} />
          <Text variant="caption" color={theme.colors.textSecondary}>
            {isAutoCaching
              ? `${t('reader.preparing')} ${autoDone}/${autoTotal}`
              : t('reader.loading')}
          </Text>
        </View>
        <View style={styles.loadingBody}>
          <Skeleton width="100%" height={22} />
          <Skeleton width="100%" height={480} borderRadius={12} />
          <Skeleton width="100%" height={480} borderRadius={12} />
        </View>
      </SafeArea>
    );
  }

  return (
    <SafeArea edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={[styles.backButton, { backgroundColor: theme.colors.surfaceSecondary }]}
        >
          <ChevronLeft size={18} color={theme.colors.text} />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text variant="small" color={theme.colors.textTertiary}>
            {t('reader.title')}
          </Text>
          <Text variant="label" numberOfLines={1}>
            {payload?.chapter_title || t('reader.untitled')}
          </Text>
        </View>

        <Pressable
          onPress={handleDownloadOffline}
          disabled={!payload || isOfflineReady || isOfflineDownloading}
          style={[
            styles.offlineChip,
            {
              backgroundColor: isOfflineReady ? theme.colors.accentSurface : theme.colors.surfaceSecondary,
              borderColor: isOfflineReady ? theme.colors.accent : theme.colors.border,
            },
          ]}
        >
          {isOfflineDownloading ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : isOfflineReady ? (
            <CheckCircle size={14} color={theme.colors.accent} strokeWidth={2} />
          ) : (
            <Download size={14} color={theme.colors.textSecondary} strokeWidth={2} />
          )}
          <Text variant="small" color={isOfflineReady ? theme.colors.accent : theme.colors.textSecondary}>
            {isOfflineDownloading
              ? `${offlineDone}/${offlineTotal}`
              : isOfflineReady
                ? t('reader.offlineReady')
                : t('reader.downloadOffline')}
          </Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Card variant="flat" style={[styles.errorCard, { borderColor: theme.colors.error }]}>
            <Text variant="body" color={theme.colors.error}>{error}</Text>
          </Card>
          <Button title={t('common.retry')} onPress={() => fetchChapterContent()} />
        </View>
      )}

      {!error && (
        <FlatList
          style={styles.container}
          contentContainerStyle={styles.content}
          data={readerItems}
          keyExtractor={(item) => item.key}
          renderItem={renderReaderItem}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={8}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchChapterContent(true)}
              tintColor={theme.colors.accent}
            />
          }
          ListHeaderComponent={(
            <View style={styles.listHeader}>
              <Text variant="heading3">
                {t('reader.chapter', { number: payload?.chapter_number ?? 0 })}
              </Text>

              {payload?.content.warnings.length ? (
                <Card variant="flat" style={[styles.warningCard, { borderColor: theme.colors.warning }]}>
                  {payload.content.warnings.map((warning, index) => (
                    <Text key={index} variant="caption" color={theme.colors.warning}>
                      - {warning}
                    </Text>
                  ))}
                </Card>
              ) : null}
            </View>
          )}
          ListEmptyComponent={(
            <Text variant="body" color={theme.colors.textSecondary}>
              {t('reader.noContent')}
            </Text>
          )}
        />
      )}
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 0,
    paddingBottom: 24,
    gap: 12,
  },
  listHeader: {
    gap: 12,
    paddingHorizontal: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTextWrap: { flex: 1, gap: 2 },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  loadingHeader: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingBody: {
    paddingHorizontal: 24,
    gap: 12,
  },
  errorContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  errorCard: {
    borderWidth: 1,
    padding: 16,
  },
  warningCard: {
    borderWidth: 1,
    padding: 12,
    marginHorizontal: 8,
    gap: 4,
  },
  readerImage: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  paragraph: {
    paddingHorizontal: 16,
    lineHeight: 28,
  },
});
