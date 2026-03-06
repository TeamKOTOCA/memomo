import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const DB_PATH = process.env.MEMOMO_DB_PATH || 'database.sqlite';

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql) {
  const Database = require('better-sqlite3');
const db = new Database(DB_PATH);

return db.prepare(sql).all();
}

export function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function normalizeFolders(folders = []) {
  return [...new Set(
    folders
      .map((folderPath) => String(folderPath).trim().replace(/^\/+|\/+$/g, '').toLowerCase())
      .filter(Boolean),
  )].slice(0, 20);
}

export function initDb() {
  runSql(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      device_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id)
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_folders (
      note_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      UNIQUE(note_id, folder_id),
      FOREIGN KEY(note_id) REFERENCES notes(id),
      FOREIGN KEY(folder_id) REFERENCES folders(id)
    );

    CREATE TABLE IF NOT EXISTS note_conflicts (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      base_version INTEGER NOT NULL,
      local_content TEXT NOT NULL,
      remote_content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved INTEGER DEFAULT 0,
      FOREIGN KEY(note_id) REFERENCES notes(id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
    USING fts5(title, content, content='notes', content_rowid='rowid');

    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
    END;
  `);
}

function ensureFolders(paths = []) {
  const normalized = normalizeFolders(paths);
  for (const folderPath of normalized) {
    runSql(`
      INSERT INTO folders (id, path)
      VALUES (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(folderPath)})
      ON CONFLICT(path) DO NOTHING;
    `);
  }
  return normalized;
}

function replaceNoteFolders(noteId, paths = []) {
  const normalized = ensureFolders(paths);
  runSql(`DELETE FROM note_folders WHERE note_id = ${sqlQuote(noteId)};`);

  if (normalized.length) {
    const values = normalized
      .map((folderPath) => `(${sqlQuote(noteId)}, (SELECT id FROM folders WHERE path = ${sqlQuote(folderPath)} LIMIT 1))`)
      .join(',');

    runSql(`
      INSERT OR IGNORE INTO note_folders (note_id, folder_id)
      VALUES ${values};
    `);
  }

  return normalized;
}

function getFoldersByNoteId(noteId) {
  const raw = runSql(`
    SELECT COALESCE(json_group_array(path), '[]')
    FROM (
      SELECT f.path
      FROM note_folders nf
      JOIN folders f ON f.id = nf.folder_id
      WHERE nf.note_id = ${sqlQuote(noteId)}
      ORDER BY f.path
    );
  `).trim();
  return JSON.parse(raw || '[]');
}

export function createNote({ title, content, folders = [], deviceId = 'web-ui' }) {
  const id = crypto.randomUUID();
  const ts = nowTs();
  const version = 1;

  runSql(`
    INSERT INTO notes (id, title, content, version, created_at, updated_at, is_deleted, device_id)
    VALUES (${sqlQuote(id)}, ${sqlQuote(title)}, ${sqlQuote(content)}, ${version}, ${ts}, ${ts}, 0, ${sqlQuote(deviceId)});

    INSERT INTO note_versions (id, note_id, version, content, created_at)
    VALUES (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(id)}, ${version}, ${sqlQuote(content)}, ${ts});
  `);

  const savedFolders = replaceNoteFolders(id, folders);
  return { id, version, folders: savedFolders };
}

export function updateNote({ id, title, content, version, folders = [], deviceId = 'web-ui' }) {
  const raw = runSql(`
    SELECT json_object('id', id, 'title', title, 'content', content, 'version', version)
    FROM notes
    WHERE id = ${sqlQuote(id)} AND is_deleted = 0;
  `).trim();

  if (!raw) return { status: 'not_found' };

  const existing = JSON.parse(raw);
  const currentVersion = Number(existing.version);
  const baseVersion = Number(version);
  const ts = nowTs();

  if (baseVersion !== currentVersion) {
    runSql(`
      INSERT INTO note_conflicts (id, note_id, base_version, local_content, remote_content, created_at, resolved)
      VALUES (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(id)}, ${baseVersion}, ${sqlQuote(content)}, ${sqlQuote(existing.content)}, ${ts}, 0);
    `);

    return {
      status: 'conflict',
      server_version: currentVersion,
      server_content: existing.content,
    };
  }

  runSql(`
    INSERT INTO note_versions (id, note_id, version, content, created_at)
    VALUES (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(id)}, ${currentVersion}, ${sqlQuote(existing.content)}, ${ts});
  `);

  const nextVersion = currentVersion + 1;
  runSql(`
    UPDATE notes
    SET title = ${sqlQuote(title)},
        content = ${sqlQuote(content)},
        version = ${nextVersion},
        updated_at = ${ts},
        device_id = ${sqlQuote(deviceId)}
    WHERE id = ${sqlQuote(id)};
  `);

  const savedFolders = replaceNoteFolders(id, folders);
  return { status: 'updated', id, version: nextVersion, folders: savedFolders };
}

export function logicalDeleteNote(id) {
  const raw = runSql(`
    SELECT json_object('id', id, 'content', content, 'version', version)
    FROM notes
    WHERE id = ${sqlQuote(id)} AND is_deleted = 0;
  `).trim();

  if (!raw) return { status: 'not_found' };

  const existing = JSON.parse(raw);
  const ts = nowTs();

  runSql(`
    INSERT INTO note_versions (id, note_id, version, content, created_at)
    VALUES (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(id)}, ${Number(existing.version)}, ${sqlQuote(existing.content)}, ${ts});

    UPDATE notes
    SET is_deleted = 1,
        updated_at = ${ts}
    WHERE id = ${sqlQuote(id)};
  `);

  return { status: 'deleted', id };
}

export function listConflicts({ resolved = 0 } = {}) {
  const raw = runSql(`
    SELECT COALESCE(json_group_array(json_object(
      'id', x.id,
      'note_id', x.note_id,
      'base_version', x.base_version,
      'local_content', x.local_content,
      'remote_content', x.remote_content,
      'created_at', x.created_at,
      'resolved', x.resolved
    )), '[]')
    FROM (
      SELECT id, note_id, base_version, local_content, remote_content, created_at, resolved
      FROM note_conflicts
      WHERE resolved = ${Number(resolved) ? 1 : 0}
      ORDER BY created_at DESC
      LIMIT 200
    ) x;
  `).trim();
  return JSON.parse(raw || '[]');
}

export function resolveConflict(id) {
  runSql(`UPDATE note_conflicts SET resolved = 1 WHERE id = ${sqlQuote(id)};`);
  return { status: 'resolved', id };
}

export function vacuumDb() {
  runSql('VACUUM;');
  return { status: 'ok' };
}

export function getNote(id) {
  const raw = runSql(`
    SELECT json_object(
      'id', id,
      'title', title,
      'content', content,
      'version', version,
      'created_at', created_at,
      'updated_at', updated_at
    )
    FROM notes
    WHERE id = ${sqlQuote(id)} AND is_deleted = 0;
  `).trim();

  if (!raw) return null;
  const note = JSON.parse(raw);
  note.folders = getFoldersByNoteId(id);
  return note;
}

export function listNotes({ folder = '', limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 300));
  const hasFolder = typeof folder === 'string' && folder.trim();
  const prefix = hasFolder ? folder.trim().replace(/^\/+|\/+$/g, '').toLowerCase() : '';

  const filter = hasFolder
    ? `AND EXISTS (
        SELECT 1
        FROM note_folders nf
        JOIN folders f ON f.id = nf.folder_id
        WHERE nf.note_id = n.id
          AND f.path LIKE ${sqlQuote(`${prefix}%`)}
      )`
    : '';

  const raw = runSql(`
    SELECT COALESCE(json_group_array(json_object(
      'id', x.id,
      'title', x.title,
      'content_preview', x.content_preview,
      'version', x.version,
      'updated_at', x.updated_at,
      'folders', x.folders
    )), '[]')
    FROM (
      SELECT
        n.id,
        n.title,
        substr(n.content, 1, 140) AS content_preview,
        n.version,
        n.updated_at,
        COALESCE((
          SELECT json_group_array(path)
          FROM (
            SELECT f.path
            FROM note_folders nf2
            JOIN folders f ON f.id = nf2.folder_id
            WHERE nf2.note_id = n.id
            ORDER BY f.path
          )
        ), json('[]')) AS folders
      FROM notes n
      WHERE n.is_deleted = 0
      ${filter}
      ORDER BY n.updated_at DESC
      LIMIT ${safeLimit}
    ) x;
  `).trim();

  return JSON.parse(raw || '[]');
}

export function listFolders() {
  const raw = runSql(`
    SELECT COALESCE(json_group_array(path), '[]')
    FROM (
      SELECT path FROM folders ORDER BY path
    );
  `).trim();
  return JSON.parse(raw || '[]');
}

export function searchNotes(query, { limit = 10 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 30));
  const raw = runSql(`
    SELECT COALESCE(json_group_array(json_object(
      'id', x.id,
      'title', x.title,
      'content', x.content,
      'version', x.version,
      'updated_at', x.updated_at
    )), '[]')
    FROM (
      SELECT n.id, n.title, n.content, n.version, n.updated_at
      FROM notes_fts f
      JOIN notes n ON n.rowid = f.rowid
      WHERE notes_fts MATCH ${sqlQuote(query)}
        AND n.is_deleted = 0
      ORDER BY rank
      LIMIT ${safeLimit}
    ) x;
  `).trim();
  return JSON.parse(raw || '[]');
}
