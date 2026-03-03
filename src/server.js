import http from 'node:http';
import { URL } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNote, initDb, searchNotes, upsertNote } from './db.js';
import { suggestTags, summarizeResults } from './llm.js';

const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, contentType) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parseTags(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return input.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

export function createServer() {
  initDb();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/app.js') {
        return sendFile(res, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript; charset=utf-8');
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { status: 'ok' });
      }

      if (req.method === 'POST' && url.pathname === '/ai/tags') {
        const body = await readBody(req);
        if (typeof body.content !== 'string' || !body.content.trim()) {
          return sendJson(res, 400, { error: 'content is required' });
        }
        return sendJson(res, 200, { tags: suggestTags(body.content) });
      }

      if (req.method === 'POST' && url.pathname === '/quick-memo') {
        const body = await readBody(req);
        if (typeof body.content !== 'string' || !body.content.trim()) {
          return sendJson(res, 400, { error: 'content is required' });
        }
        const memoId = body.id || crypto.randomUUID();
        const tags = parseTags(body.tags);
        const result = upsertNote({
          noteId: memoId,
          content: body.content,
          baseVersion: Number(body.version ?? 0),
          deviceId: body.device_id || 'web-ui',
          tags: tags.length ? tags : suggestTags(body.content),
        });
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && url.pathname === '/notes') {
        const body = await readBody(req);
        if (!body.id || typeof body.content !== 'string' || typeof body.version !== 'number' || !body.device_id) {
          return sendJson(res, 400, { error: 'invalid payload' });
        }

        const result = upsertNote({
          noteId: body.id,
          content: body.content,
          baseVersion: body.version,
          deviceId: body.device_id,
          tags: parseTags(body.tags),
        });
        return sendJson(res, 200, result);
      }

      if (req.method === 'GET' && url.pathname.startsWith('/notes/')) {
        const noteId = decodeURIComponent(url.pathname.replace('/notes/', ''));
        const note = getNote(noteId);
        if (!note) return sendJson(res, 404, { detail: 'note not found' });
        return sendJson(res, 200, note);
      }

      if (req.method === 'GET' && url.pathname === '/search') {
        const q = url.searchParams.get('q');
        if (!q) return sendJson(res, 400, { error: 'q is required' });
        const tags = parseTags(url.searchParams.get('tags'));
        const rows = searchNotes(q, { limit: 5, tags });
        const hits = rows.map((row) => ({
          id: row.id,
          version: row.version,
          updated_at: row.updated_at,
          tags: row.tags || [],
          content_preview: row.content.slice(0, 120),
        }));
        const summary = summarizeResults(q, rows.map((r) => r.content));
        return sendJson(res, 200, { hits, summary });
      }

      return sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      return sendJson(res, 500, { error: 'internal_error', message: String(error.message || error) });
    }
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`memomo server listening on :${port}`);
  });
}
