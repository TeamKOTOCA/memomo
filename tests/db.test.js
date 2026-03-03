import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function prepareDb() {
  const dbPath = path.join(os.tmpdir(), `memomo-${Date.now()}-${Math.random()}.sqlite`);
  process.env.MEMOMO_DB_PATH = dbPath;
  return dbPath;
}

test('upsert, tag search, and conflict behavior', async () => {
  const dbPath = prepareDb();
  const db = await import(`../src/db.js?${Date.now()}`);
  db.initDb();

  const created = db.upsertNote({
    noteId: 'n1',
    content: 'local sqlite fts',
    baseVersion: 0,
    deviceId: 'd1',
    tags: ['sqlite', 'ai'],
  });
  assert.equal(created.status, 'updated');
  assert.deepEqual(created.tags, ['sqlite', 'ai']);

  const note = db.getNote('n1');
  assert.equal(note.version, 1);
  assert.deepEqual(note.tags, ['ai', 'sqlite']);

  const hits = db.searchNotes('sqlite', { tags: ['ai'] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'n1');

  const miss = db.searchNotes('sqlite', { tags: ['rust'] });
  assert.equal(miss.length, 0);

  const updated = db.upsertNote({
    noteId: 'n1',
    content: 'update v2',
    baseVersion: 1,
    deviceId: 'd1',
    tags: ['update'],
  });
  assert.equal(updated.status, 'updated');
  assert.equal(updated.version, 2);

  const conflict = db.upsertNote({
    noteId: 'n1',
    content: 'stale write',
    baseVersion: 1,
    deviceId: 'd2',
    tags: ['bad'],
  });
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.current_version, 2);

  fs.rmSync(dbPath, { force: true });
});
