import type { SQLiteDatabase } from 'expo-sqlite';

import type { Tomica, TomicaDraft } from '../types';

const normalizeSearch = (value: string) => `%${value.trim()}%`;

export async function listTomicas(db: SQLiteDatabase, query: string): Promise<Tomica[]> {
  const keyword = query.trim();

  if (!keyword) {
    return db.getAllAsync<Tomica>(
      'SELECT * FROM tomicas ORDER BY updatedAt DESC, id DESC'
    );
  }

  const like = normalizeSearch(keyword);
  return db.getAllAsync<Tomica>(
    `SELECT * FROM tomicas
     WHERE name LIKE ?
        OR number LIKE ?
        OR barcode LIKE ?
        OR series LIKE ?
     ORDER BY updatedAt DESC, id DESC`,
    like,
    like,
    like,
    like
  );
}

export async function getTomicaById(db: SQLiteDatabase, id: number): Promise<Tomica | null> {
  const row = await db.getFirstAsync<Tomica>('SELECT * FROM tomicas WHERE id = ?', id);
  return row ?? null;
}

export async function getTomicaByBarcode(
  db: SQLiteDatabase,
  barcode: string
): Promise<Tomica | null> {
  const row = await db.getFirstAsync<Tomica>(
    'SELECT * FROM tomicas WHERE barcode = ?',
    barcode.trim()
  );
  return row ?? null;
}

export async function createTomica(db: SQLiteDatabase, draft: TomicaDraft): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO tomicas
      (barcode, number, name, series, version, madeIn, year, ownedCount, hasSticker, photoUri, note, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    draft.barcode.trim(),
    draft.number.trim(),
    draft.name.trim(),
    draft.series.trim(),
    draft.version.trim(),
    draft.madeIn.trim(),
    draft.year.trim(),
    Math.max(1, Number(draft.ownedCount) || 1),
    draft.hasSticker ? 1 : 0,
    draft.photoUri.trim(),
    draft.note.trim(),
    now,
    now
  );

  return result.lastInsertRowId;
}

export async function updateTomica(
  db: SQLiteDatabase,
  id: number,
  draft: TomicaDraft
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE tomicas
     SET barcode = ?,
         number = ?,
         name = ?,
         series = ?,
         version = ?,
         madeIn = ?,
         year = ?,
         ownedCount = ?,
         hasSticker = ?,
         photoUri = ?,
         note = ?,
         updatedAt = ?
     WHERE id = ?`,
    draft.barcode.trim(),
    draft.number.trim(),
    draft.name.trim(),
    draft.series.trim(),
    draft.version.trim(),
    draft.madeIn.trim(),
    draft.year.trim(),
    Math.max(1, Number(draft.ownedCount) || 1),
    draft.hasSticker ? 1 : 0,
    draft.photoUri.trim(),
    draft.note.trim(),
    now,
    id
  );
}

export async function deleteTomica(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM tomicas WHERE id = ?', id);
}
