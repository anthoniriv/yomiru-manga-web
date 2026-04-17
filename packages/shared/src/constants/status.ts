import { ReadingStatus } from '../types/book';

export const READING_STATUSES = [
  ReadingStatus.READING,
  ReadingStatus.COMPLETED,
  ReadingStatus.PLAN_TO_READ,
  ReadingStatus.DROPPED,
] as const;

export const STATUS_LABELS: Record<ReadingStatus, { en: string; es: string }> = {
  [ReadingStatus.READING]: { en: 'Reading', es: 'Leyendo' },
  [ReadingStatus.COMPLETED]: { en: 'Completed', es: 'Completado' },
  [ReadingStatus.PLAN_TO_READ]: { en: 'Plan to Read', es: 'Por leer' },
  [ReadingStatus.DROPPED]: { en: 'Dropped', es: 'Abandonado' },
};
