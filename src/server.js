import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createNote,
  getNote,
  initDb,
  listConflicts,
  listFolders,
  listNotes,
  logicalDeleteNote,
  resolveConflict,
  searchNotes,
  updateNote,
  vacuumDb,
} from './db.js';
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

function contentTypeByExt(filePath) {
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'text/plain; charset=utf-8';
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parseFolders(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return input.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

function parseHierarchicalTags(body = {}, query = null) {
  if (body && (body.folders || body.tags)) return parseFolders(body.folders || body.tags);
  if (query && (query.get('folders') || query.get('tags'))) return parseFolders(query.get('folders') || query.get('tags'));
  return [];
}

export function createServer() {
  initDb();

  const vacuumHours = Number(process.env.MEMOMO_VACUUM_HOURS || 24);
  if (vacuumHours > 0) {
    setInterval(() => {
      try {
        vacuumDb();
        console.log(`[VACUUM] completed at ${new Date().toISOString()}`);
      } catch (error) {
        console.error('[VACUUM] failed', error.message);
      }
    }, vacuumHours * 60 * 60 * 1000).unref();
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
      }

      if (req.method === 'GET' && (url.pathname === '/app.js' || url.pathname === '/sw.js' || url.pathname === '/manifest.json')) {
        const filePath = path.join(PUBLIC_DIR, url.pathname.replace(/^\//, ''));
        return sendFile(res, filePath, contentTypeByExt(filePath));
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { status: 'ok' });
      }

      if (req.method === 'GET' && (url.pathname === '/api/notes' || url.pathname === '/notes')) {
        const folder = url.searchParams.get('folder') || '';
        return sendJson(res, 200, { notes: listNotes({ folder }) });
      }

      if (req.method === 'GET' && (url.pathname.startsWith('/api/notes/') || url.pathname.startsWith('/notes/'))) {
        const noteId = decodeURIComponent(url.pathname.replace('/api/notes/', '').replace('/notes/', ''));
        const note = getNote(noteId);
        if (!note) return sendJson(res, 404, { error: 'not_found' });
        return sendJson(res, 200, note);
      }

      if (req.method === 'POST' && (url.pathname === '/api/notes' || url.pathname === '/notes')) {
        const body = await readBody(req);
        if (typeof body.title !== 'string' || typeof body.content !== 'string') {
          return sendJson(res, 400, { error: 'title and content are required' });
        }

        const result = createNote({
          title: body.title.trim() || 'Untitled',
          content: body.content,
          folders: parseHierarchicalTags(body),
          deviceId: body.device_id || 'web-ui',
        });

        return sendJson(res, 201, result);
      }

      if (req.method === 'PUT' && (url.pathname.startsWith('/api/notes/') || url.pathname.startsWith('/notes/'))) {
        const noteId = decodeURIComponent(url.pathname.replace('/api/notes/', '').replace('/notes/', ''));
        const body = await readBody(req);
        if (typeof body.title !== 'string' || typeof body.content !== 'string' || typeof body.version !== 'number') {
          return sendJson(res, 400, { error: 'title, content and version are required' });
        }

        const result = updateNote({
          id: noteId,
          title: body.title,
          content: body.content,
          version: body.version,
          folders: parseHierarchicalTags(body),
          deviceId: body.device_id || 'web-ui',
        });

        if (result.status === 'not_found') return sendJson(res, 404, { error: 'not_found' });
        if (result.status === 'conflict') {
          return sendJson(res, 409, {
            error: 'VERSION_CONFLICT',
            server_version: result.server_version,
            server_content: result.server_content,
          });
        }
        return sendJson(res, 200, result);
      }

      if (req.method === 'DELETE' && (url.pathname.startsWith('/api/notes/') || url.pathname.startsWith('/notes/'))) {
        const noteId = decodeURIComponent(url.pathname.replace('/api/notes/', '').replace('/notes/', ''));
        const result = logicalDeleteNote(noteId);
        if (result.status === 'not_found') return sendJson(res, 404, { error: 'not_found' });
        return sendJson(res, 200, result);
      }

      if (req.method === 'GET' && url.pathname === '/api/folders') {
        return sendJson(res, 200, { folders: listFolders() });
      }

      if (req.method === 'GET' && (url.pathname === '/api/search' || url.pathname === '/search')) {
        const q = url.searchParams.get('q');
        if (!q) return sendJson(res, 400, { error: 'q is required' });
        const hits = searchNotes(q, { limit: 10 }).map((row) => ({
          ...row,
          content_preview: row.content.slice(0, 140),
        }));
        return sendJson(res, 200, { hits });
      }

      if (req.method === 'POST' && (url.pathname === '/api/ai-search' || url.pathname === '/ai-search')) {
        const body = await readBody(req);
        if (typeof body.query !== 'string' || !body.query.trim()) {
          return sendJson(res, 400, { error: 'query is required' });
        }
        const keywords = suggestTags(body.query).join(' OR ') || body.query;
        const rows = searchNotes(keywords, { limit: 5 });
        return sendJson(res, 200, {
          keywords,
          hits: rows.map((x) => ({ id: x.id, title: x.title, content_preview: x.content.slice(0, 140) })),
          summary: summarizeResults(body.query, rows.map((x) => x.content)),
        });
      }

      if (req.method === 'GET' && (url.pathname === '/api/conflicts' || url.pathname === '/conflicts')) {
        const resolved = Number(url.searchParams.get('resolved') || 0);
        return sendJson(res, 200, { conflicts: listConflicts({ resolved }) });
      }

      if (req.method === 'POST' && (url.pathname.startsWith('/api/conflicts/') || url.pathname.startsWith('/conflicts/')) && url.pathname.endsWith('/resolve')) {
        const conflictId = decodeURIComponent(url.pathname.replace('/api/conflicts/', '').replace('/conflicts/', '').replace('/resolve', ''));
        return sendJson(res, 200, resolveConflict(conflictId));
      }

      if (req.method === 'POST' && (url.pathname === '/api/admin/vacuum' || url.pathname === '/admin/vacuum')) {
        vacuumDb();
        return sendJson(res, 200, { status: 'ok' });
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
