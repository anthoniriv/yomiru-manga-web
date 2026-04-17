import IORedis, { type Redis } from 'ioredis';
import { config } from './config.js';

let _conn: Redis | null = null;

export function getRedis(): Redis {
  if (_conn) return _conn;
  _conn = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return _conn;
}

export async function closeRedis(): Promise<void> {
  if (_conn) {
    await _conn.quit();
    _conn = null;
  }
}
