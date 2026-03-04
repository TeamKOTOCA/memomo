import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';

function setupDb() {
  process.env.MEMOMO_DB_PATH = path.join(os.tmpdir(), `memomo-api-${Date.now()}-${Math.random()}.sqlite`);
}

test('HTTP API memo flows + ai search + conflict + delete', async (t) => {
  setupDb();
  const { createServer } = await import(`../src/server.js?${Date.now()}`);
  const server = createServer();

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Markdown/);

  const manifest = await fetch(`${base}/manifest.json`);
  assert.equal(manifest.status, 200);

  const createRes = await fetch(`${base}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Node memo',
      content: 'Node sqlite FTS local memo ideas',
      tags: ['project/memomo/spec'],
      device_id: 'dev-a',
    }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();

  const listRes = await fetch(`${base}/notes?folder=project/memomo`);
  assert.equal(listRes.status, 200);
  const listed = await listRes.json();
  assert.equal(listed.notes.length, 1);

  const noteRes = await fetch(`${base}/notes/${created.id}`);
  const note = await noteRes.json();

  const updateRes = await fetch(`${base}/notes/${created.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Node memo v2',
      content: 'updated content',
      version: note.version,
      tags: ['project/memomo/spec'],
      device_id: 'dev-a',
    }),
  });
  assert.equal(updateRes.status, 200);

  const conflictRes = await fetch(`${base}/notes/${created.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'stale',
      content: 'stale content',
      version: 1,
      tags: [],
      device_id: 'dev-b',
    }),
  });
  assert.equal(conflictRes.status, 409);

  const conflictListRes = await fetch(`${base}/conflicts`);
  assert.equal(conflictListRes.status, 200);
  const conflictList = await conflictListRes.json();
  assert.equal(conflictList.conflicts.length, 1);

  const resolveRes = await fetch(`${base}/conflicts/${conflictList.conflicts[0].id}/resolve`, { method: 'POST' });
  assert.equal(resolveRes.status, 200);

  const searchRes = await fetch(`${base}/search?q=updated`);
  assert.equal(searchRes.status, 200);

  const aiSearch = await fetch(`${base}/ai-search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'sqlite のメモ' }),
  });
  assert.equal(aiSearch.status, 200);
  const aiBody = await aiSearch.json();
  assert.ok(typeof aiBody.summary === 'string');

  const deleteRes = await fetch(`${base}/notes/${created.id}`, { method: 'DELETE' });
  assert.equal(deleteRes.status, 200);

  const noteAfterDelete = await fetch(`${base}/notes/${created.id}`);
  assert.equal(noteAfterDelete.status, 404);

  const vacuumRes = await fetch(`${base}/admin/vacuum`, { method: 'POST' });
  assert.equal(vacuumRes.status, 200);
});

test('HTTP API validates note payload and query limits', async (t) => {
  setupDb();
  const { createServer } = await import(`../src/server.js?${Date.now()}`);
  const server = createServer();

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const invalidFolderRes = await fetch(`${base}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'ok',
      content: 'ok',
      folders: ['project//memomo'],
    }),
  });
  assert.equal(invalidFolderRes.status, 400);

  const invalidVersionRes = await fetch(`${base}/notes/non-existent`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'x',
      content: 'x',
      version: 1.5,
    }),
  });
  assert.equal(invalidVersionRes.status, 400);

  const longQueryRes = await fetch(`${base}/search?q=${'x'.repeat(201)}`);
  assert.equal(longQueryRes.status, 400);
});
