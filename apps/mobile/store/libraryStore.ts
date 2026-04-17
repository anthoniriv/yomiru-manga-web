import { create } from 'zustand';
import { Book, ReadingStatus } from '@yomiru/shared';
import { supabase } from '../lib/supabase';

interface BookProgress {
  totalChapters: number;
  readChapters: number;
}

interface LibraryState {
  books: Book[];
  isLoading: boolean;
  hasLoaded: boolean;
  filter: ReadingStatus | 'all';
  progressByBookId: Record<string, BookProgress>;

  fetchBooks: () => Promise<void>;
  updateBookStatus: (id: string, status: ReadingStatus) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  setFilter: (filter: ReadingStatus | 'all') => void;
  getFilteredBooks: () => Book[];
  getBookProgress: (bookId: string) => BookProgress;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  isLoading: false,
  hasLoaded: false,
  filter: 'all',
  progressByBookId: {},

  fetchBooks: async () => {
    set({ isLoading: true });
    try {
      const [booksRes, chaptersRes] = await Promise.all([
        supabase
          .from('books')
          .select('*')
          .order('updated_at', { ascending: false }),
        supabase
          .from('chapters')
          .select('book_id, is_read'),
      ]);

      if (booksRes.error) throw booksRes.error;
      if (chaptersRes.error) throw chaptersRes.error;

      const progressByBookId: Record<string, BookProgress> = {};
      for (const chapter of chaptersRes.data || []) {
        const key = chapter.book_id;
        const current = progressByBookId[key] || { totalChapters: 0, readChapters: 0 };
        current.totalChapters += 1;
        if (chapter.is_read) current.readChapters += 1;
        progressByBookId[key] = current;
      }

      set({
        books: (booksRes.data || []) as Book[],
        progressByBookId,
        hasLoaded: true,
      });
    } catch (error) {
      console.error('Failed to fetch books:', error);
      set({ hasLoaded: true });
    } finally {
      set({ isLoading: false });
    }
  },

  updateBookStatus: async (id: string, status: ReadingStatus) => {
    // Optimistic update
    const prevBooks = get().books;
    set({
      books: prevBooks.map(b => b.id === id ? { ...b, status } : b),
    });

    const { error } = await supabase
      .from('books')
      .update({ status })
      .eq('id', id);

    if (error) {
      set({ books: prevBooks }); // Rollback
      console.error('Failed to update book status:', error);
    }
  },

  deleteBook: async (id: string) => {
    const prevBooks = get().books;
    set({ books: prevBooks.filter(b => b.id !== id) });

    const { error } = await supabase
      .from('books')
      .delete()
      .eq('id', id);

    if (error) {
      set({ books: prevBooks });
      console.error('Failed to delete book:', error);
    }
  },

  setFilter: (filter) => set({ filter }),

  getFilteredBooks: () => {
    const { books, filter, progressByBookId } = get();
    if (filter === 'all') return books;

    return books.filter((book) => {
      const progress = progressByBookId[book.id] || { totalChapters: 0, readChapters: 0 };
      const hasReadAtLeastOne = progress.readChapters > 0;
      const isCompletedByProgress =
        progress.totalChapters > 0 && progress.readChapters >= progress.totalChapters;
      const isReadingByProgress =
        progress.totalChapters > 0 &&
        progress.readChapters > 0 &&
        progress.readChapters < progress.totalChapters;

      if (filter === ReadingStatus.READING) {
        return isReadingByProgress || (hasReadAtLeastOne && book.status === ReadingStatus.READING);
      }

      if (filter === ReadingStatus.COMPLETED) {
        return isCompletedByProgress || book.status === ReadingStatus.COMPLETED;
      }

      if (filter === ReadingStatus.PLAN_TO_READ) {
        return progress.readChapters === 0 && book.status !== ReadingStatus.DROPPED;
      }

      return book.status === filter;
    });
  },

  getBookProgress: (bookId: string) => {
    return get().progressByBookId[bookId] || { totalChapters: 0, readChapters: 0 };
  },
}));
