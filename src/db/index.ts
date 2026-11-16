import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export function resolveDatabaseCredentials() {
  const isTestEnv = process.env.NODE_ENV === 'test';
  return {
    host: (isTestEnv ? process.env.TEST_SQL_HOST : undefined) ?? process.env.SQL_HOST,
    user: (isTestEnv ? process.env.TEST_SQL_USER : undefined) ?? process.env.SQL_USER,
    password: (isTestEnv ? process.env.TEST_SQL_PASSWORD : undefined) ?? process.env.SQL_PASSWORD,
    database: (isTestEnv ? process.env.TEST_SQL_DB_NAME : undefined) ?? process.env.SQL_DB_NAME,
  };
}

export function hasDatabaseCredentials(): boolean {
  const creds = resolveDatabaseCredentials();
  return Boolean(creds.host && creds.user && creds.password && creds.database);
}

export const createPool = () => {
  if (!global._postgresPool) {
    const creds = resolveDatabaseCredentials();
    global._postgresPool = new Pool({
      host: creds.host,
      user: creds.user,
      password: creds.password,
      database: creds.database,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
