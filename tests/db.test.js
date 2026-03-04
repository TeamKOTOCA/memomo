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

test('create/update/search/folder filter/conflict/logical delete behavior', async () => {
  const dbPath = prepareDb();
  const db = await import(`../src/db.js?${Date.now()}`);
  db.initDb();

  const created = db.createNote({
    title: 'Spec note',
    content: 'local sqlite fts memo',
    folders: ['project/memomo/spec', 'dev/sqlite'],
    deviceId: 'd1',
  });
  assert.equal(created.version, 1);

  const note = db.getNote(created.id);
  assert.equal(note.title, 'Spec note');
  assert.deepEqual(note.folders, ['dev/sqlite', 'project/memomo/spec']);

  const folderFiltered = db.listNotes({ folder: 'project/memomo' });
  assert.equal(folderFiltered.length, 1);

  const updated = db.updateNote({
    id: created.id,
    title: 'Spec note v2',
    content: 'update version text',
    version: 1,
    folders: ['project/memomo/spec'],
    deviceId: 'd1',
  });
  assert.equal(updated.status, 'updated');
  assert.equal(updated.version, 2);

  const conflict = db.updateNote({
    id: created.id,
    title: 'stale',
    content: 'stale write',
    version: 1,
    folders: [],
    deviceId: 'd2',
  });
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.server_version, 2);

  const conflicts = db.listConflicts({ resolved: 0 });
  assert.equal(conflicts.length, 1);
  db.resolveConflict(conflicts[0].id);
  assert.equal(db.listConflicts({ resolved: 0 }).length, 0);

  const hits = db.searchNotes('version');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, created.id);

  const deleted = db.logicalDeleteNote(created.id);
  assert.equal(deleted.status, 'deleted');
  assert.equal(db.getNote(created.id), null);

  fs.rmSync(dbPath, { force: true });
});
