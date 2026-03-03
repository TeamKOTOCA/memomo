import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const DB_PATH = process.env.MEMOMO_DB_PATH || 'database.sqlite';

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql) {
  return execFileSync('sqlite3', [DB_PATH, sql], { encoding: 'utf8' });
}

export function nowTs() {
  return Math.floor(Date.now() / 1000);
}

export function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function initDb() {
  runSql(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      device_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id)
    );

    CREATE TABLE IF NOT EXISTS note_conflicts (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      base_version INTEGER NOT NULL,
      local_content TEXT NOT NULL,
      remote_content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id)
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      UNIQUE(note_id, tag),
      FOREIGN KEY(note_id) REFERENCES notes(id)
    );

    CREATE TABLE IF NOT EXISTS assets_meta (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
    USING fts5(content, content='notes', content_rowid='rowid');

    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, content) VALUES (new.rowid, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.rowid, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      INSERT INTO notes_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
  `);
}

function normalizeTags(tags = []) {
  return [...new Set(tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 8);
}

export function replaceNoteTags(noteId, tags = []) {
  const normalized = normalizeTags(tags);
  const values = normalized.map((tag) => `(${sqlQuote(noteId)}, ${sqlQuote(tag)})`).join(', ');
  runSql(`DELETE FROM note_tags WHERE note_id = ${sqlQuote(noteId)};`);
  if (values) {
    runSql(`INSERT INTO note_tags (note_id, tag) VALUES ${values};`);
  }
  return normalized;
}

export function getNote(noteId) {
  const noteRaw = runSql(`
    SELECT json_object(
      'id', id,
      'content', content,
      'content_hash', content_hash,
      'version', version,
      'updated_at', updated_at,
      'device_id', device_id
    )
    FROM notes
    WHERE id = ${sqlQuote(noteId)};
  `).trim();

  if (!noteRaw) return null;
  const note = JSON.parse(noteRaw);

  const tagsRaw = runSql(`
    SELECT json_group_array(tag)
    FROM note_tags
    WHERE note_id = ${sqlQuote(noteId)};
  `).trim();
  note.tags = tagsRaw ? (JSON.parse(tagsRaw) || []) : [];
  return note;
}

export function upsertNote({ noteId, content, baseVersion, deviceId, tags = [] }) {
  const existingRaw = runSql(`SELECT json_object('id', id, 'content', content, 'version', version) FROM notes WHERE id = ${sqlQuote(noteId)};`).trim();
  const existing = existingRaw ? JSON.parse(existingRaw) : null;

  const contentHash = hashContent(content);
  const ts = nowTs();

  if (!existing) {
    const version = 1;
    const versionId = crypto.randomUUID();
    runSql(`
      INSERT INTO notes (id, content, content_hash, version, updated_at, device_id)
      VALUES (${sqlQuote(noteId)}, ${sqlQuote(content)}, ${sqlQuote(contentHash)}, ${version}, ${ts}, ${sqlQuote(deviceId)});

      INSERT INTO note_versions (id, note_id, content, content_hash, created_at)
      VALUES (${sqlQuote(versionId)}, ${sqlQuote(noteId)}, ${sqlQuote(content)}, ${sqlQuote(contentHash)}, ${ts});
    `);
    const savedTags = replaceNoteTags(noteId, tags);
    return { status: 'updated', id: noteId, version, tags: savedTags };
  }

  const currentVersion = Number(existing.version);
  if (currentVersion !== Number(baseVersion)) {
    const conflictId = crypto.randomUUID();
    runSql(`
      INSERT INTO note_conflicts (id, note_id, base_version, local_content, remote_content, created_at)
      VALUES (
        ${sqlQuote(conflictId)},
        ${sqlQuote(noteId)},
        ${Number(baseVersion)},
        ${sqlQuote(content)},
        ${sqlQuote(existing.content)},
        ${ts}
      );
    `);
    return { status: 'conflict', id: noteId, current_version: currentVersion };
  }

  const nextVersion = currentVersion + 1;
  const versionId = crypto.randomUUID();
  runSql(`
    UPDATE notes
    SET content = ${sqlQuote(content)},
        content_hash = ${sqlQuote(contentHash)},
        version = ${nextVersion},
        updated_at = ${ts},
        device_id = ${sqlQuote(deviceId)}
    WHERE id = ${sqlQuote(noteId)};

    INSERT INTO note_versions (id, note_id, content, content_hash, created_at)
    VALUES (${sqlQuote(versionId)}, ${sqlQuote(noteId)}, ${sqlQuote(content)}, ${sqlQuote(contentHash)}, ${ts});
  `);

  const savedTags = replaceNoteTags(noteId, tags);
  return { status: 'updated', id: noteId, version: nextVersion, tags: savedTags };
}

export function searchNotes(query, { limit = 5, tags = [] } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20));
  const normalizedTags = normalizeTags(tags);

  const tagFilter = normalizedTags.length
    ? `AND EXISTS (
        SELECT 1 FROM note_tags nt
        WHERE nt.note_id = n.id
          AND nt.tag IN (${normalizedTags.map(sqlQuote).join(', ')})
      )`
    : '';

  const sql = `
    SELECT json_group_array(
      json_object(
        'id', x.id,
        'content', x.content,
        'version', x.version,
        'updated_at', x.updated_at,
        'tags', COALESCE((
          SELECT json_group_array(tag)
          FROM note_tags t
          WHERE t.note_id = x.id
        ), json('[]'))
      )
    )
    FROM (
      SELECT n.id, n.content, n.version, n.updated_at
      FROM notes_fts f
      JOIN notes n ON n.rowid = f.rowid
      WHERE notes_fts MATCH ${sqlQuote(query)}
      ${tagFilter}
      ORDER BY rank
      LIMIT ${safeLimit}
    ) x;
  `;

  const raw = runSql(sql).trim();
  if (!raw) return [];
  return JSON.parse(raw) || [];
}
