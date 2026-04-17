import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SafeArea } from '../../../components/layout/SafeArea';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Rating } from '../../../components/ui/Rating';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Divider } from '../../../components/ui/Divider';
import { AppModal } from '../../../components/ui/AppModal';
import { ChevronLeft, Check } from 'lucide-react-native';
import { useTheme } from '../../../theme';
import { useSlideUp } from '../../../hooks/useAnimations';
import { supabase } from '../../../lib/supabase';
import { Book, Chapter, Season } from '@yomiru/shared';
import { apiPost } from '../../../lib/api';
import { useLibraryStore } from '../../../store/libraryStore';

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const deleteBook = useLibraryStore((s) => s.deleteBook);
  const fetchBooks = useLibraryStore((s) => s.fetchBooks);

  const infoAnim = useSlideUp(100);

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  useEffect(() => {
    fetchBookData();
  }, [id]);

  const fetchBookData = async () => {
    setIsLoading(true);
    try {
      const [bookRes, chaptersRes, seasonsRes] = await Promise.all([
        supabase.from('books').select('*').eq('id', id).single(),
        supabase.from('chapters').select('*').eq('book_id', id).order('number'),
        supabase.from('seasons').select('*').eq('book_id', id).order('number'),
      ]);

      if (bookRes.data) setBook(bookRes.data as Book);
      if (chaptersRes.data) setChapters(chaptersRes.data as Chapter[]);
      if (seasonsRes.data) setSeasons(seasonsRes.data as Season[]);
    } catch (err) {
      console.error('Failed to fetch book:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleChapterRead = useCallback(async (chapter: Chapter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newIsRead = !chapter.is_read;

    setChapters(prev =>
      prev.map(c => c.id === chapter.id
        ? { ...c, is_read: newIsRead, last_read_at: newIsRead ? new Date().toISOString() : null }
        : c
      )
    );

    const { error } = await supabase
      .from('chapters')
      .update({
        is_read: newIsRead,
        last_read_at: newIsRead ? new Date().toISOString() : null,
      })
      .eq('id', chapter.id);

    if (error) {
      setChapters(prev =>
        prev.map(c => c.id === chapter.id ? chapter : c)
      );
    }
  }, []);

  const openChapter = useCallback((chapter: Chapter) => {
    router.push({
      pathname: '/reader/[chapterId]',
      params: { chapterId: chapter.id },
    });
  }, [router]);

  const handleDeleteBook = useCallback(() => {
    if (!book) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDeleteModal(true);
  }, [book, deleteBook, router, t]);

  const confirmDeleteBook = useCallback(() => {
    if (!book || isDeleting) return;

    void (async () => {
      try {
        setIsDeleting(true);
        await deleteBook(book.id);
        setShowDeleteModal(false);
        router.replace('/(tabs)');
      } catch (error) {
        setShowDeleteModal(false);
        setFeedbackModal({
          visible: true,
          title: t('common.error'),
          message: error instanceof Error ? error.message : t('bookDetail.deleteError'),
        });
      } finally {
        setIsDeleting(false);
      }
    })();
  }, [book, deleteBook, isDeleting, router, t]);

  const handleCheckUpdates = useCallback(() => {
    if (!book || isCheckingUpdates) return;

    void (async () => {
      try {
        setIsCheckingUpdates(true);
        const response = await apiPost<{
          added_chapters: number;
          updated_chapters: number;
          total_remote_chapters: number;
        }>(`/api/books/${book.id}/check-updates`, {});

        await Promise.all([
          fetchBookData(),
          fetchBooks(),
        ]);

        if (response.added_chapters > 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setFeedbackModal({
            visible: true,
            title: t('bookDetail.checkUpdates'),
            message: t('bookDetail.updatesFound', { count: response.added_chapters }),
          });
          return;
        }

        setFeedbackModal({
          visible: true,
          title: t('bookDetail.checkUpdates'),
          message: t('bookDetail.noUpdatesFound'),
        });
      } catch (error) {
        setFeedbackModal({
          visible: true,
          title: t('common.error'),
          message: error instanceof Error ? error.message : t('bookDetail.updateCheckError'),
        });
      } finally {
        setIsCheckingUpdates(false);
      }
    })();
  }, [book, fetchBooks, isCheckingUpdates, t]);

  const readChapters = chapters.filter(c => c.is_read).length;
  const totalChapters = chapters.length;
  const progress = totalChapters > 0 ? readChapters / totalChapters : 0;

  if (isLoading) {
    return (
      <SafeArea>
        <View style={styles.loadingContainer}>
          <Skeleton width="100%" height={300} borderRadius={0} />
          <View style={{ padding: 24, gap: 12 }}>
            <Skeleton width="70%" height={28} />
            <Skeleton width="40%" height={18} />
            <Skeleton width="100%" height={100} />
          </View>
        </View>
      </SafeArea>
    );
  }

  if (!book) {
    return (
      <SafeArea>
        <View style={styles.errorContainer}>
          <Text variant="heading3">Book not found</Text>
          <Button title="Go back" onPress={() => router.back()} variant="ghost" />
        </View>
      </SafeArea>
    );
  }

  return (
    <SafeArea edges={['top']}>
      <ScrollView style={styles.container}>
        {/* Hero Cover with gradient overlay */}
        <View style={styles.heroContainer}>
          {book.cover_image_url ? (
            <Image
              source={{ uri: book.cover_image_url }}
              style={styles.heroCover}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.heroCover, { backgroundColor: theme.colors.surfaceSecondary }]} />
          )}
          <LinearGradient
            colors={['rgba(13,13,20,0.3)', 'transparent', theme.colors.background]}
            locations={[0, 0.3, 1]}
            style={styles.heroGradient}
          />
          <View style={styles.heroOverlay}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={[styles.backButton, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            >
              <ChevronLeft size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Info Section */}
        <Animated.View style={[styles.infoSection, infoAnim.style]}>
          <Text variant="heading2">{book.title}</Text>

          <View style={styles.metaRow}>
            {book.rating != null && (
              <Rating value={book.rating / 2} showValue size={16} />
            )}
            <Badge label={book.source_domain} size="sm" />
          </View>

          {/* Progress */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Text variant="caption" color={theme.colors.textSecondary}>
                {t('bookDetail.chaptersRead', { read: readChapters, total: totalChapters })}
              </Text>
              <Text variant="small" color={theme.colors.accent}>
                {totalChapters > 0 ? `${Math.round(progress * 100)}%` : ''}
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: theme.colors.surfaceSecondary }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.colors.accent,
                    width: `${progress * 100}%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* Description */}
          {book.description && (
            <Pressable onPress={() => setShowFullDesc(!showFullDesc)}>
              <Text
                variant="body"
                color={theme.colors.textSecondary}
                numberOfLines={showFullDesc ? undefined : 3}
                style={styles.description}
              >
                {book.description}
              </Text>
              <Text variant="small" color={theme.colors.accent} style={styles.readMoreToggle}>
                {showFullDesc ? t('common.showLess') || 'Show less' : t('common.readMore') || 'Read more'}
              </Text>
            </Pressable>
          )}

          <View style={styles.actionRow}>
            <Button
              title={isCheckingUpdates ? t('bookDetail.checkingUpdates') : t('bookDetail.checkUpdates')}
              onPress={handleCheckUpdates}
              loading={isCheckingUpdates}
              variant="secondary"
              size="sm"
              style={styles.actionButton}
            />
            <Button
              title={t('bookDetail.deleteBook')}
              onPress={handleDeleteBook}
              loading={isDeleting}
              variant="danger"
              size="sm"
            />
          </View>

          <Divider style={{ marginVertical: 16 }} />

          {/* Chapters */}
          <Text variant="heading3" style={styles.chaptersTitle}>
            {t('bookDetail.chapters')} ({totalChapters})
          </Text>

          {chapters.map((chapter, index) => (
            <Pressable
              key={chapter.id}
              onPress={() => openChapter(chapter)}
              style={[styles.chapterRow, { borderBottomColor: theme.colors.border }]}
            >
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  void toggleChapterRead(chapter);
                }}
                hitSlop={8}
              >
                <View
                  style={[
                    styles.readIndicator,
                    {
                      backgroundColor: chapter.is_read ? theme.colors.accent : 'transparent',
                      borderColor: chapter.is_read ? theme.colors.accent : theme.colors.borderMedium,
                    },
                  ]}
                >
                  {chapter.is_read && <Check size={12} color={theme.colors.textInverse} strokeWidth={3} />}
                </View>
              </Pressable>
              <View style={styles.chapterInfo}>
                <Text
                  variant="body"
                  color={chapter.is_read ? theme.colors.textTertiary : theme.colors.text}
                >
                  Ch. {chapter.number}
                </Text>
                <Text
                  variant="caption"
                  color={theme.colors.textTertiary}
                  numberOfLines={1}
                >
                  {chapter.title}
                </Text>
              </View>
            </Pressable>
          ))}
        </Animated.View>
      </ScrollView>

      <AppModal
        visible={showDeleteModal}
        title={t('bookDetail.deleteConfirmTitle')}
        message={t('bookDetail.deleteConfirmMessage')}
        onRequestClose={() => {
          if (!isDeleting) setShowDeleteModal(false);
        }}
        actions={[
          {
            label: t('common.cancel'),
            variant: 'ghost',
            onPress: () => setShowDeleteModal(false),
            disabled: isDeleting,
          },
          {
            label: t('common.delete'),
            variant: 'danger',
            onPress: confirmDeleteBook,
            loading: isDeleting,
            disabled: isDeleting,
          },
        ]}
      />

      <AppModal
        visible={feedbackModal.visible}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onRequestClose={() => setFeedbackModal({ visible: false, title: '', message: '' })}
        actions={[
          {
            label: 'OK',
            variant: 'primary',
            onPress: () => setFeedbackModal({ visible: false, title: '', message: '' }),
          },
        ]}
      />
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  heroContainer: { position: 'relative' },
  heroCover: { width: '100%', height: 300 },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  infoSection: { padding: 20, marginTop: -24 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  progressSection: { marginTop: 16, gap: 6 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  description: { marginTop: 14 },
  readMoreToggle: { marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionButton: { flex: 1 },
  chaptersTitle: { marginBottom: 8 },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  readIndicator: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chapterInfo: { flex: 1, gap: 2 },
});
