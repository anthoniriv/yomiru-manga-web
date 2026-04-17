import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

loadEnv({ path: '.env' });
loadEnv({ path: 'apps/ingestor/.env', override: false });

const root = resolve(process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : 'storage/media');
const mangaRoot = join(root, 'manga');
const shouldDelete = process.argv.includes('--delete');
const dryRun = !shouldDelete;

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error('missing R2 env vars');
}
if (!existsSync(mangaRoot)) {
  throw new Error(`missing local manga folder: ${mangaRoot}`);
}

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

async function listLocalFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listLocalFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function listRemoteSizes(prefix) {
  const sizes = new Map();
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    for (const obj of res.Contents ?? []) {
      if (obj.Key && typeof obj.Size === 'number') sizes.set(obj.Key, obj.Size);
    }
    token = res.NextContinuationToken;
  } while (token);
  return sizes;
}

async function removeEmptyDirs(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) await removeEmptyDirs(join(dir, entry.name));
  }
  const remaining = await readdir(dir).catch(() => []);
  if (remaining.length === 0 && dir !== mangaRoot) await rm(dir, { recursive: false });
}

function isChapterKey(key) {
  const parts = key.split('/');
  return parts.length >= 4 && parts[0] === 'manga' && /^c\d/i.test(parts[2]);
}

const slugs = (await readdir(mangaRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let localFiles = 0;
let remoteMatched = 0;
let bytesMatched = 0;
let deleted = 0;
let bytesDeleted = 0;
let skippedNoRemote = 0;
let skippedSizeDiff = 0;
let skippedNonChapter = 0;

for (const slug of slugs) {
  const localSlugDir = join(mangaRoot, slug);
  const files = await listLocalFiles(localSlugDir);
  if (files.length === 0) continue;

  const remoteSizes = await listRemoteSizes(`manga/${slug}/`);
  let slugMatched = 0;
  let slugBytes = 0;

  for (const file of files) {
    localFiles += 1;
    const key = relative(root, file).split(sep).join('/');
    if (!isChapterKey(key)) {
      skippedNonChapter += 1;
      continue;
    }

    const localSize = (await stat(file)).size;
    const remoteSize = remoteSizes.get(key);
    if (remoteSize === undefined) {
      skippedNoRemote += 1;
      continue;
    }
    if (remoteSize !== localSize) {
      skippedSizeDiff += 1;
      continue;
    }

    remoteMatched += 1;
    bytesMatched += localSize;
    slugMatched += 1;
    slugBytes += localSize;

    if (shouldDelete) {
      await rm(file);
      deleted += 1;
      bytesDeleted += localSize;
    }
  }

  if (slugMatched > 0) {
    console.log(`${dryRun ? 'match' : 'deleted'}\t${slug}\tfiles=${slugMatched}\tgb=${(slugBytes / 1024 / 1024 / 1024).toFixed(2)}`);
  }
}

if (shouldDelete) await removeEmptyDirs(mangaRoot);

console.log(JSON.stringify({
  mode: dryRun ? 'dry-run' : 'delete',
  localFiles,
  remoteMatched,
  bytesMatched,
  deleted,
  bytesDeleted,
  skippedNoRemote,
  skippedSizeDiff,
  skippedNonChapter,
  gbMatched: Number((bytesMatched / 1024 / 1024 / 1024).toFixed(2)),
  gbDeleted: Number((bytesDeleted / 1024 / 1024 / 1024).toFixed(2)),
}, null, 2));
