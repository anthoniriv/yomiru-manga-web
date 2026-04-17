export type Language = 'en' | 'es';
export type AuthProvider = 'google' | 'apple' | 'email';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  language: Language;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
