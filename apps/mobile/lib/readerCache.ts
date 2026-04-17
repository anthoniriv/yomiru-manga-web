import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getReaderImageProxyUrl } from './api';

const CACHE_META_KEY = 'reader_cache_meta_v1';
const AUTO_TTL_MS = 24 * 60 * 60 * 1000;

const ROOT_DIR = `${FileSystem.documentDirectory || ''}reader-cache/`;
const AUTO_DIR = `${ROOT_DIR}auto/`;
const OFFLINE_DIR = `${ROOT_DIR}offline/`;

type CacheMode = 'auto' | 'offline';

interface ChapterCacheEntry {
  mode: CacheMode;
  expiresAt: number | null;
  updatedAt: number;
  images: Record<string, string>;
}

type ReaderCacheMeta = Record<string, ChapterCacheEntry>;

interface CacheImagesOptions {
  mode: CacheMode;
  onProgress?: (done: number, total: number) => void;
}

interface CacheImagesResult {
  uris: string[];
  mode: CacheMode;
}

function isInlineDataUrl(uri: string): boolean {
  return /^data:/i.test(uri);
}

async function ensureDirectories() {
  await FileSystem.makeDirectoryAsync(ROOT_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(AUTO_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
}

async function readMeta(): Promise<ReaderCacheMeta> {
  const raw = await AsyncStorage.getItem(CACHE_META_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ReaderCacheMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMeta(meta: ReaderCacheMeta) {
  await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
}

async function fileExists(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory;
}

function sanitizeChapterId(chapterId: string): string {
  return chapterId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (match) {
      return `.${match[1].toLowerCase()}`;
    }
  } catch {
    // Ignore.
  }
  return '.img';
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function chapterDir(mode: CacheMode, chapterId: string): string {
  const safeId = sanitizeChapterId(chapterId);
  return `${mode === 'offline' ? OFFLINE_DIR : AUTO_DIR}${safeId}/`;
}

function imageFileUri(mode: CacheMode, chapterId: string, imageUrl: string): string {
  const ext = getExtension(imageUrl);
  const filename = `${hashString(imageUrl)}${ext}`;
  return `${chapterDir(mode, chapterId)}${filename}`;
}

function isExpired(entry: ChapterCacheEntry): boolean {
  if (entry.mode === 'offline') return false;
  if (!entry.expiresAt) return true;
  return Date.now() > entry.expiresAt;
}

async function cleanupExpired(meta: ReaderCacheMeta): Promise<ReaderCacheMeta> {
  let changed = false;
  const nextMeta: ReaderCacheMeta = { ...meta };

  for (const [chapterId, entry] of Object.entries(meta)) {
    if (entry.mode !== 'auto' || !isExpired(entry)) continue;

    changed = true;
    delete nextMeta[chapterId];
    await FileSystem.deleteAsync(chapterDir('auto', chapterId), { idempotent: true });
  }

  if (changed) {
    await writeMeta(nextMeta);
  }

  return nextMeta;
}

async function restoreIfAvailable(
  chapterId: string,
  imageUrls: string[],
  meta: ReaderCacheMeta,
): Promise<CacheImagesResult | null> {
  const entry = meta[chapterId];
  if (!entry) return null;
  if (entry.mode === 'auto' && isExpired(entry)) return null;

  const uris: string[] = [];
  for (const imageUrl of imageUrls) {
    const uri = entry.images[imageUrl];
    if (!uri) return null;
    if (!isInlineDataUrl(uri) && !(await fileExists(uri))) return null;
    uris.push(uri);
  }

  return { uris, mode: entry.mode };
}

export async function restoreCachedChapterImages(
  chapterId: string,
  imageUrls: string[],
): Promise<CacheImagesResult | null> {
  await ensureDirectories();
  const meta = await cleanupExpired(await readMeta());
  return restoreIfAvailable(chapterId, imageUrls, meta);
}

async function downloadImageToUri(sourceUrl: string, targetUri: string): Promise<string> {
  const proxyUrl = getReaderImageProxyUrl(sourceUrl);
  await FileSystem.downloadAsync(proxyUrl, targetUri);
  return targetUri;
}

export async function cacheChapterImages(
  chapterId: string,
  imageUrls: string[],
  options: CacheImagesOptions,
): Promise<CacheImagesResult> {
  if (imageUrls.length === 0) {
    return { uris: [], mode: options.mode };
  }

  await ensureDirectories();
  let meta = await cleanupExpired(await readMeta());

  if (options.mode === 'auto') {
    const restored = await restoreIfAvailable(chapterId, imageUrls, meta);
    if (restored) {
      options.onProgress?.(imageUrls.length, imageUrls.length);
      return restored;
    }
  }

  if (options.mode === 'offline') {
    const existingOffline = meta[chapterId];
    if (existingOffline?.mode === 'offline') {
      const restored = await restoreIfAvailable(chapterId, imageUrls, meta);
      if (restored) {
        options.onProgress?.(imageUrls.length, imageUrls.length);
        return restored;
      }
    }
  }

  const previousEntry = meta[chapterId];
  const targetMode: CacheMode =
    options.mode === 'auto' && previousEntry?.mode === 'offline'
      ? 'offline'
      : options.mode;
  const targetDir = chapterDir(targetMode, chapterId);
  await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });

  const nextImages: Record<string, string> = {};
  const outputUris: string[] = [];

  for (let index = 0; index < imageUrls.length; index++) {
    const imageUrl = imageUrls[index];

    if (isInlineDataUrl(imageUrl)) {
      nextImages[imageUrl] = imageUrl;
      outputUris.push(imageUrl);
      options.onProgress?.(index + 1, imageUrls.length);
      continue;
    }

    const preferredUri = imageFileUri(targetMode, chapterId, imageUrl);
    const previousUri = previousEntry?.images?.[imageUrl];

    if (previousUri && await fileExists(previousUri)) {
      if (targetMode === 'offline' && previousUri !== preferredUri) {
        await FileSystem.copyAsync({ from: previousUri, to: preferredUri });
      }
      const finalUri = targetMode === 'offline' ? preferredUri : previousUri;
      nextImages[imageUrl] = finalUri;
      outputUris.push(finalUri);
      options.onProgress?.(index + 1, imageUrls.length);
      continue;
    }

    if (!(await fileExists(preferredUri))) {
      await downloadImageToUri(imageUrl, preferredUri);
    }

    nextImages[imageUrl] = preferredUri;
    outputUris.push(preferredUri);
    options.onProgress?.(index + 1, imageUrls.length);
  }

  meta[chapterId] = {
    mode: targetMode,
    expiresAt: targetMode === 'auto' ? Date.now() + AUTO_TTL_MS : null,
    updatedAt: Date.now(),
    images: nextImages,
  };
  await writeMeta(meta);

  return {
    uris: outputUris,
    mode: targetMode,
  };
}

export async function isChapterOfflineReady(chapterId: string): Promise<boolean> {
  const meta = await readMeta();
  const entry = meta[chapterId];
  if (!entry || entry.mode !== 'offline') return false;
  const uris = Object.values(entry.images);
  if (uris.length === 0) return false;
  for (const uri of uris) {
    if (!isInlineDataUrl(uri) && !(await fileExists(uri))) return false;
  }
  return true;
}
