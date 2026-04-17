import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { ChapterContentResponse } from '@yomiru/shared';

const CONTENT_CACHE_META_KEY = 'reader_content_cache_meta_v1';
const AUTO_TTL_MS = 24 * 60 * 60 * 1000;

const ROOT_DIR = `${FileSystem.documentDirectory || ''}reader-cache/`;
const CONTENT_ROOT_DIR = `${ROOT_DIR}content/`;
const CONTENT_AUTO_DIR = `${CONTENT_ROOT_DIR}auto/`;
const CONTENT_OFFLINE_DIR = `${CONTENT_ROOT_DIR}offline/`;

type CacheMode = 'auto' | 'offline';

interface ChapterContentCacheEntry {
  mode: CacheMode;
  expiresAt: number | null;
  updatedAt: number;
  fileUri: string;
}

type ReaderContentCacheMeta = Record<string, ChapterContentCacheEntry>;

interface PackedChapterContent {
  a: string;
  b: string;
  c: number;
  d: [
    string | null,
    string,
    string,
    string,
    string[],
    string[],
    string[],
  ];
}

function sanitizeChapterId(chapterId: string): string {
  return chapterId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function chapterFileUri(mode: CacheMode, chapterId: string): string {
  const safeId = sanitizeChapterId(chapterId);
  const dir = mode === 'offline' ? CONTENT_OFFLINE_DIR : CONTENT_AUTO_DIR;
  return `${dir}${safeId}.json`;
}

async function ensureDirectories() {
  await FileSystem.makeDirectoryAsync(CONTENT_ROOT_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(CONTENT_AUTO_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(CONTENT_OFFLINE_DIR, { intermediates: true });
}

async function readMeta(): Promise<ReaderContentCacheMeta> {
  const raw = await AsyncStorage.getItem(CONTENT_CACHE_META_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ReaderContentCacheMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMeta(meta: ReaderContentCacheMeta) {
  await AsyncStorage.setItem(CONTENT_CACHE_META_KEY, JSON.stringify(meta));
}

async function fileExists(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory;
}

function isExpired(entry: ChapterContentCacheEntry): boolean {
  if (entry.mode === 'offline') return false;
  if (!entry.expiresAt) return true;
  return Date.now() > entry.expiresAt;
}

async function cleanupExpired(meta: ReaderContentCacheMeta): Promise<ReaderContentCacheMeta> {
  let changed = false;
  const nextMeta: ReaderContentCacheMeta = { ...meta };

  for (const [chapterId, entry] of Object.entries(meta)) {
    if (entry.mode !== 'auto' || !isExpired(entry)) continue;
    changed = true;
    delete nextMeta[chapterId];
    await FileSystem.deleteAsync(entry.fileUri, { idempotent: true });
  }

  if (changed) {
    await writeMeta(nextMeta);
  }

  return nextMeta;
}

async function readPayloadFromFile(fileUri: string): Promise<ChapterContentResponse | null> {
  if (!(await fileExists(fileUri))) return null;
  try {
    const raw = await FileSystem.readAsStringAsync(fileUri);
    const parsed = JSON.parse(raw) as PackedChapterContent;
    return unpackPayload(parsed);
  } catch {
    return null;
  }
}

function packPayload(payload: ChapterContentResponse): PackedChapterContent {
  return {
    a: payload.chapter_id,
    b: payload.chapter_title,
    c: payload.chapter_number,
    d: [
      payload.content.title,
      payload.content.source_url,
      payload.content.source_domain,
      payload.content.content_type,
      payload.content.images,
      payload.content.paragraphs,
      payload.content.warnings,
    ],
  };
}

function unpackPayload(packed: PackedChapterContent): ChapterContentResponse | null {
  if (!packed || typeof packed !== 'object' || !Array.isArray(packed.d) || packed.d.length !== 7) {
    return null;
  }

  return {
    chapter_id: packed.a,
    chapter_title: packed.b,
    chapter_number: packed.c,
    content: {
      title: packed.d[0],
      source_url: packed.d[1],
      source_domain: packed.d[2],
      content_type: packed.d[3] as ChapterContentResponse['content']['content_type'],
      images: Array.isArray(packed.d[4]) ? packed.d[4] : [],
      paragraphs: Array.isArray(packed.d[5]) ? packed.d[5] : [],
      warnings: Array.isArray(packed.d[6]) ? packed.d[6] : [],
    },
  };
}

export async function getCachedChapterContent(
  chapterId: string,
): Promise<{ payload: ChapterContentResponse; mode: CacheMode } | null> {
  await ensureDirectories();
  const meta = await cleanupExpired(await readMeta());
  const entry = meta[chapterId];
  if (!entry || (entry.mode === 'auto' && isExpired(entry))) return null;

  const payload = await readPayloadFromFile(entry.fileUri);
  if (!payload) {
    delete meta[chapterId];
    await writeMeta(meta);
    return null;
  }

  return { payload, mode: entry.mode };
}

export async function cacheChapterContent(
  chapterId: string,
  payload: ChapterContentResponse,
  mode: CacheMode,
): Promise<CacheMode> {
  await ensureDirectories();
  const meta = await cleanupExpired(await readMeta());
  const previousEntry = meta[chapterId];
  const targetMode: CacheMode =
    mode === 'auto' && previousEntry?.mode === 'offline'
      ? 'offline'
      : mode;
  const fileUri = chapterFileUri(targetMode, chapterId);

  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(packPayload(payload)));

  if (previousEntry?.fileUri && previousEntry.fileUri !== fileUri) {
    await FileSystem.deleteAsync(previousEntry.fileUri, { idempotent: true });
  }

  meta[chapterId] = {
    mode: targetMode,
    expiresAt: targetMode === 'auto' ? Date.now() + AUTO_TTL_MS : null,
    updatedAt: Date.now(),
    fileUri,
  };
  await writeMeta(meta);

  return targetMode;
}
