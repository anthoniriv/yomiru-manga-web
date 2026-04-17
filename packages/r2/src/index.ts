import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'node:https';

function createClient() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 env vars missing: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: new NodeHttpHandler({
      httpsAgent: new Agent({
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
      }),
    }),
  });
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) _client = createClient();
  return _client;
}

function bucket(): string {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error('R2_BUCKET env var missing');
  return b;
}

export async function r2Upload(key: string, body: Buffer, contentType?: string): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType ?? 'application/octet-stream',
      ContentLength: body.length,
    }),
  );
}

export async function r2UploadLarge(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  const upload = new Upload({
    client: client(),
    params: {
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType ?? 'application/octet-stream',
    },
  });
  await upload.done();
}

export async function r2Get(key: string): Promise<ReadableStream | null> {
  try {
    const res = await client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key }),
    );
    return (res.Body?.transformToWebStream() as ReadableStream) ?? null;
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function r2Exists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function r2Delete(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
