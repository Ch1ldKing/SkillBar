import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolClient, type QueryResultRow, types } from "pg";

types.setTypeParser(20, (value) => Number(value));

const DATABASE_URL_ENV_NAMES = ["DATABASE_URL", "SKILLBAR_DATABASE_URL"] as const;

type Queryable = Pool | PoolClient;

const globalForDatabase = globalThis as typeof globalThis & {
  __skillBarWebsiteAuthDb?: Kysely<Record<string, never>>;
  __skillBarWebsiteDbPool?: Pool;
  __skillBarWebsiteDatabaseUrl?: string;
};

function getRawDatabaseUrl() {
  for (const envName of DATABASE_URL_ENV_NAMES) {
    const value = process.env[envName]?.trim();

    if (value) {
      return value;
    }
  }

  throw new Error("缺少 DATABASE_URL。请在 website/.env 中配置 Postgres 连接串。");
}

function isLocalDatabase(url: URL) {
  return ["127.0.0.1", "localhost"].includes(url.hostname);
}

function shouldRelaxTlsValidation(url: URL) {
  return url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com");
}

function normalizeDatabaseUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  url.searchParams.delete("sslmode");

  return url.toString();
}

function getPoolOptions(connectionString: string) {
  const url = new URL(connectionString);

  return {
    connectionString,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: isLocalDatabase(url)
      ? undefined
      : shouldRelaxTlsValidation(url)
        ? { rejectUnauthorized: false }
        : {},
  };
}

export function getDatabaseUrl() {
  if (!globalForDatabase.__skillBarWebsiteDatabaseUrl) {
    globalForDatabase.__skillBarWebsiteDatabaseUrl = normalizeDatabaseUrl(getRawDatabaseUrl());
  }

  return globalForDatabase.__skillBarWebsiteDatabaseUrl;
}

export function getPool() {
  if (!globalForDatabase.__skillBarWebsiteDbPool) {
    const pool = new Pool(getPoolOptions(getDatabaseUrl()));

    pool.on("error", (error) => {
      console.error("[skillbar-website] Postgres pool error", error);
    });

    globalForDatabase.__skillBarWebsiteDbPool = pool;
  }

  return globalForDatabase.__skillBarWebsiteDbPool;
}

export function getDatabase() {
  if (!globalForDatabase.__skillBarWebsiteAuthDb) {
    globalForDatabase.__skillBarWebsiteAuthDb = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: getPool(),
      }),
    });
  }

  return globalForDatabase.__skillBarWebsiteAuthDb;
}

export async function executeQuery<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  client: Queryable = getPool(),
) {
  return client.query<T>(text, [...values]);
}

export async function queryRows<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  client: Queryable = getPool(),
) {
  const result = await executeQuery<T>(text, values, client);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  client: Queryable = getPool(),
) {
  const rows = await queryRows<T>(text, values, client);
  return rows[0];
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
