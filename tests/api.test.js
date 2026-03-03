import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';

function setupDb() {
  process.env.MEMOMO_DB_PATH = path.join(os.tmpdir(), `memomo-api-${Date.now()}-${Math.random()}.sqlite`);
}

test('HTTP API quick memo + ai tags + search + web ui', async (t) => {
  setupDb();
  const { createServer } = await import(`../src/server.js?${Date.now()}`);
  const server = createServer();

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /memomo/);

  const tagsRes = await fetch(`${base}/ai/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'Node sqlite FTS local memo ideas' }),
  });
  assert.equal(tagsRes.status, 200);
  const tagsBody = await tagsRes.json();
  assert.ok(Array.isArray(tagsBody.tags));

  const save = await fetch(`${base}/quick-memo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'node sqlite search', tags: ['node', 'sqlite'], device_id: 'dev-a' }),
  });
  assert.equal(save.status, 200);
  const saveJson = await save.json();
  assert.equal(saveJson.status, 'updated');

  const search = await fetch(`${base}/search?q=sqlite&tags=node`);
  assert.equal(search.status, 200);
  const searchJson = await search.json();
  assert.equal(searchJson.hits.length, 1);
  assert.equal(searchJson.hits[0].id, saveJson.id);
});
