import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";

type SqliteDatabase = Database.Database;

const DB_DIRECTORY = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIRECTORY, "skillbar-online.sqlite");

const globalForDatabase = globalThis as typeof globalThis & {
  __skillBarOnlineDb?: SqliteDatabase;
};

export function getDatabasePath() {
  return DB_PATH;
}

export function getDatabase() {
  if (!globalForDatabase.__skillBarOnlineDb) {
    mkdirSync(DB_DIRECTORY, { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    globalForDatabase.__skillBarOnlineDb = db;
  }

  return globalForDatabase.__skillBarOnlineDb;
}
