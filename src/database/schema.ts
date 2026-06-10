import type { SQLiteDatabase } from 'expo-sqlite';

export async function initDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS tomicas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL,
      name TEXT NOT NULL,
      series TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      madeIn TEXT NOT NULL DEFAULT '',
      year TEXT NOT NULL DEFAULT '',
      ownedCount INTEGER NOT NULL DEFAULT 1,
      hasSticker INTEGER NOT NULL DEFAULT 0,
      photoUri TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tomicas_barcode ON tomicas(barcode);
    CREATE INDEX IF NOT EXISTS idx_tomicas_search ON tomicas(name, number, series, version);
  `);

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(tomicas)');
  const hasPhotoUri = columns.some((column) => column.name === 'photoUri');
  const hasSticker = columns.some((column) => column.name === 'hasSticker');

  if (!hasPhotoUri) {
    await db.execAsync("ALTER TABLE tomicas ADD COLUMN photoUri TEXT NOT NULL DEFAULT '';");
  }

  if (!hasSticker) {
    await db.execAsync('ALTER TABLE tomicas ADD COLUMN hasSticker INTEGER NOT NULL DEFAULT 0;');
  }
}
