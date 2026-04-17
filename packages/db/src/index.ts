// SQLite (legacy local)
export * from './schema.js';
export * from './client.js';

// PostgreSQL (Supabase)
export * as pgSchema from './schema.pg.js';
export { getPgDb, closePgDb } from './client.pg.js';
export type { PgDB } from './client.pg.js';
