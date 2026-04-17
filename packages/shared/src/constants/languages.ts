import { Language } from '../types/user';

export const SUPPORTED_LANGUAGES: Language[] = ['en', 'es'];

export const LANGUAGE_LABELS: Record<Language, { native: string; english: string }> = {
  en: { native: 'English', english: 'English' },
  es: { native: 'Espanol', english: 'Spanish' },
};
