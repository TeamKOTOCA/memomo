const noteList = document.querySelector('#noteList');
const titleEl = document.querySelector('#title');
const foldersEl = document.querySelector('#folders');
const metaIconEl = document.querySelector('#metaIcon');
const metaColorEl = document.querySelector('#metaColor');
const metaPinnedEl = document.querySelector('#metaPinned');
const metaPropsEl = document.querySelector('#metaProps');
const pageMetaLineEl = document.querySelector('#pageMetaLine');
const metaMenuEl = document.querySelector('#metaMenu');
const metaMenuBtnEl = document.querySelector('#metaMenuBtn');
const panelMenuBtnEl = document.querySelector('#panelMenuBtn');
const mobileOverlayEl = document.querySelector('#mobileOverlay');
const themeToggleBtnEl = document.querySelector('#themeToggleBtn');
const slashMenuEl = document.querySelector('#slashMenu');

const editorEl = document.querySelector('#editor');
const statusEl = document.querySelector('#status');
const folderFilterEl = document.querySelector('#folderFilter');
const folderTreeEl = document.querySelector('#folderTree');
const queryEl = document.querySelector('#query');
const searchResultEl = document.querySelector('#searchResult');
const aiQueryEl = document.querySelector('#aiQuery');
const aiSummaryEl = document.querySelector('#aiSummary');
const assetListEl = document.querySelector('#assetList');
const conflictListEl = document.querySelector('#conflictList');
const autosaveSecEl = document.querySelector('#autosaveSec');
const settingsStatusEl = document.querySelector('#settingsStatus');
const syncStatusEl = document.querySelector('#syncStatus');

let selectedNote = null;
let autosaveTimer = null;
let markdownSource = '';
let folderTreeState = {};
let latestFolderTree = { name: '', path: '', children: {} };

const DB_NAME = 'memomo_offline_v1';
const DB_VERSION = 1;
const META_KEY = 'memomo_page_meta';
const THEME_KEY = 'memomo_theme';

function splitCsv(text) {
  return (text || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function isOnline() {
  return navigator.onLine;
}

function updateSyncStatus(text = null) {
  syncStatusEl.textContent = text || (isOnline() ? 'online' : 'offline');
}

const SLASH_COMMANDS = [
  { key: 'h1', label: '見出し1' },
  { key: 'h2', label: '見出し2' },
  { key: 'list', label: '箇条書き' },
  { key: 'check', label: 'チェック' },
  { key: 'quote', label: '引用' },
  { key: 'table', label: '表' },
  { key: 'divider', label: '区切り' },
];

function applyTheme(theme) {
  const finalTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', finalTheme);
  localStorage.setItem(THEME_KEY, finalTheme);
  const icon = themeToggleBtnEl?.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = finalTheme === 'dark' ? 'light_mode' : 'dark_mode';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(saved);
}

function closeSlashMenu() {
  slashMenuEl.classList.remove('open');
  slashMenuEl.innerHTML = '';
}

function showSlashMenu() {
  const rect = editorEl.getBoundingClientRect();
  slashMenuEl.style.left = `${Math.min(rect.left + 14, window.innerWidth - 240)}px`;
  slashMenuEl.style.top = `${Math.min(rect.top + 80, window.innerHeight - 220)}px`;
  slashMenuEl.innerHTML = '';

  for (const cmd of SLASH_COMMANDS) {
    const btn = document.createElement('button');
    btn.className = 'slash-item';
    btn.textContent = cmd.label;
    btn.addEventListener('click', () => {
      insertWritingTemplate(cmd.key);
      closeSlashMenu();
    });
    slashMenuEl.appendChild(btn);
  }

  slashMenuEl.classList.add('open');
}

function getMetaStore() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}');
  } catch {
    return {};
  }
}

function setMetaStore(next) {
  localStorage.setItem(META_KEY, JSON.stringify(next));
}

function defaultMeta() {
  return { icon: '📝', color: 'default', pinned: false, props: '{}' };
}

function getMetaByNoteId(id) {
  if (!id) return defaultMeta();
  return { ...defaultMeta(), ...(getMetaStore()[id] || {}) };
}

function renderPageMetaLine() {
  const targetId = selectedNote?.id;
  const meta = getMetaByNoteId(targetId);
  const title = titleEl.value.trim() || 'Untitled';
  const folders = splitCsv(foldersEl.value).join(', ') || '-';
  pageMetaLineEl.textContent = `${meta.icon} ${title} / tags: ${folders} / color: ${meta.color} / pinned: ${meta.pinned ? 'yes' : 'no'}`;
}

function loadMetaToForm(id) {
  const meta = getMetaByNoteId(id);
  metaIconEl.value = meta.icon;
  metaColorEl.value = meta.color;
  metaPinnedEl.checked = !!meta.pinned;
  metaPropsEl.value = meta.props || '{}';
  renderPageMetaLine();
}

function saveMetaFromForm() {
  const noteId = selectedNote?.id;
  if (!noteId) {
    updateStatus('先にノートを作成/選択してください。');
    return;
  }

  const next = getMetaStore();
  next[noteId] = {
    icon: metaIconEl.value.trim() || '📝',
    color: metaColorEl.value.trim() || 'default',
    pinned: !!metaPinnedEl.checked,
    props: metaPropsEl.value.trim() || '{}',
  };
  setMetaStore(next);
  renderPageMetaLine();
  updateStatus('メタ情報を保存しました');
  loadNotes().catch((e) => updateStatus(e.message));
}

function toggleMetaMenu(forceOpen = null) {
  const shouldOpen = forceOpen === null ? !metaMenuEl.classList.contains('open') : forceOpen;
  metaMenuEl.classList.toggle('open', shouldOpen);
}


function setSidebarOpen(open) {
  document.body.classList.toggle('sidebar-open', !!open);
}

function closePanelsForMobile() {
  if (window.innerWidth <= 980) setSidebarOpen(false);
  closeSlashMenu();
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

function renderLiveMarkdown(source) {
  const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.split(/\r?\n/).map((line) => {
    if (line.startsWith('### ')) return `<div class="line-h3">${line}</div>`;
    if (line.startsWith('## ')) return `<div class="line-h2">${line}</div>`;
    if (line.startsWith('# ')) return `<div class="line-h1">${line}</div>`;
    if (/^\s*[-*]\s+/.test(line)) return `<div class="line-list">${line}</div>`;
    if (/^\s*`.+`\s*$/.test(line)) return `<div><span class="line-code">${line}</span></div>`;
    if (!line.trim()) return '<div><br /></div>';
    return `<div>${line}</div>`;
  }).join('');
}

function syncEditorFromMarkdown(moveCaretToEnd = false) {
  editorEl.innerHTML = renderLiveMarkdown(markdownSource);
  if (!moveCaretToEnd) return;
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editorEl);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function readEditorToMarkdown() {
  markdownSource = editorEl.innerText.replace(/\u00a0/g, '');
}

function keepSelectionInEditor() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return false;
  return editorEl.contains(selection.getRangeAt(0).startContainer);
}

function insertTextAtCaret(text) {
  editorEl.focus();
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !keepSelectionInEditor()) {
    markdownSource += text;
    syncEditorFromMarkdown(true);
    scheduleAutosave();
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
  readEditorToMarkdown();
  syncEditorFromMarkdown(true);
  scheduleAutosave();
}

function insertWritingTemplate(kind) {
  const templates = {
    h1: '\n# 見出し\n',
    h2: '\n## セクション\n',
    bold: '**強調**',
    list: '\n- 項目\n',
    quote: '\n> 引用\n',
    code: '\n`code`\n',
    check: '\n- [ ] TODO\n',
    table: '\n| col1 | col2 |\n|---|---|\n| a | b |\n',
    toggle: '\n<details><summary>Toggle</summary>内容</details>\n',
    divider: '\n---\n',
  };
  insertTextAtCaret(templates[kind] || '');
}

function getAssets() {
  try {
    return JSON.parse(localStorage.getItem('memomo_assets') || '[]');
  } catch {
    return [];
  }
}

function setAssets(next) {
  localStorage.setItem('memomo_assets', JSON.stringify(next));
}

function renderAssets() {
  const assets = getAssets();
  assetListEl.innerHTML = '';
  for (const asset of assets) {
    const card = document.createElement('div');
    card.className = 'card';
    if (asset.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.className = 'asset-preview';
      img.src = asset.dataUrl;
      img.alt = asset.name;
      card.appendChild(img);
    }

    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = `${asset.name} (${asset.type})`;
    card.appendChild(info);

    const insertBtn = document.createElement('button');
    insertBtn.textContent = '本文へ挿入';
    insertBtn.addEventListener('click', () => {
      const md = asset.type.startsWith('image/') ? `\n![${asset.name}](${asset.dataUrl})\n` : `\n[${asset.name}](${asset.dataUrl})\n`;
      markdownSource += md;
      syncEditorFromMarkdown(true);
      scheduleAutosave();
    });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '削除';
    removeBtn.style.marginLeft = '8px';
    removeBtn.addEventListener('click', () => {
      setAssets(getAssets().filter((x) => x.id !== asset.id));
      renderAssets();
    });

    card.appendChild(insertBtn);
    card.appendChild(removeBtn);
    assetListEl.appendChild(card);
  }
}

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes_cache')) db.createObjectStore('notes_cache', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pending_updates')) db.createObjectStore('pending_updates', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('conflicts_local')) db.createObjectStore('conflicts_local', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName, value) {
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbDelete(storeName, id) {
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGetAll(storeName) {
  const db = await openOfflineDb();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows;
}

async function cacheNote(note) {
  await idbPut('notes_cache', note);
}

async function removeCachedNote(id) {
  await idbDelete('notes_cache', id);
}

async function queuePending(update) {
  await idbPut('pending_updates', {
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: 0,
    lastError: '',
    ...update,
  });
  updateSyncStatus(`pending: ${(await idbGetAll('pending_updates')).length}`);
}

async function remapTemporaryId(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;

  const pending = await idbGetAll('pending_updates');
  for (const task of pending) {
    let changed = false;
    if (task.noteId === oldId) {
      task.noteId = newId;
      changed = true;
    }
    if (task.tempId === oldId) {
      task.tempId = newId;
      changed = true;
    }
    if (changed) await idbPut('pending_updates', task);
  }

  const meta = getMetaStore();
  if (meta[oldId]) {
    meta[newId] = meta[oldId];
    delete meta[oldId];
    setMetaStore(meta);
  }
}

function getRetryDelayMs(attempts) {
  const base = 1000;
  const max = 60_000;
  return Math.min(max, base * (2 ** Math.max(0, attempts)));
}

function buildFolderTree(paths) {
  const root = { name: '', path: '', children: {} };
  for (const fullPath of paths) {
    const parts = String(fullPath).split('/').map((x) => x.trim()).filter(Boolean);
    let node = root;
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!node.children[part]) node.children[part] = { name: part, path: currentPath, children: {} };
      node = node.children[part];
    }
  }
  return root;
}

function renderFolderNodes(parent, node, depth = 0) {
  const names = Object.keys(node.children).sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const child = node.children[name];
    const hasChildren = Object.keys(child.children).length > 0;
    if (folderTreeState[child.path] === undefined) folderTreeState[child.path] = depth < 1;

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = `${depth * 12}px`;

    const toggle = document.createElement('button');
    toggle.className = 'tree-toggle';
    toggle.textContent = hasChildren ? (folderTreeState[child.path] ? '▾' : '▸') : '·';
    toggle.disabled = !hasChildren;
    if (hasChildren) {
      toggle.addEventListener('click', () => {
        folderTreeState[child.path] = !folderTreeState[child.path];
        renderFolderTreeFromState();
      });
    }

    const button = document.createElement('button');
    button.className = 'tree-btn';
    if (folderFilterEl.value.trim() === child.path) button.classList.add('active');
    button.textContent = child.name;
    button.title = child.path;
    button.addEventListener('click', () => {
      folderFilterEl.value = child.path;
      loadNotes().catch((e) => updateStatus(e.message));
      renderFolderTreeFromState();
    });

    row.appendChild(toggle);
    row.appendChild(button);
    parent.appendChild(row);

    if (hasChildren && folderTreeState[child.path]) renderFolderNodes(parent, child, depth + 1);
  }
}

function renderFolderTreeFromState() {
  folderTreeEl.innerHTML = '';
  if (!Object.keys(latestFolderTree.children).length) {
    folderTreeEl.innerHTML = '<p class="muted">フォルダー未登録</p>';
    return;
  }
  renderFolderNodes(folderTreeEl, latestFolderTree, 0);
}

async function loadFolderTree() {
  try {
    const data = await request('/api/folders');
    latestFolderTree = buildFolderTree(data.folders || []);
  } catch {
    const notes = await idbGetAll('notes_cache');
    const folders = [...new Set(notes.flatMap((n) => n.folders || []))];
    latestFolderTree = buildFolderTree(folders);
  }
  renderFolderTreeFromState();
}

async function loadNotes() {
  const folder = folderFilterEl.value.trim();
  const query = folder ? `?folder=${encodeURIComponent(folder)}` : '';

  let notes = [];
  try {
    const data = await request(`/notes${query}`);
    notes = data.notes || [];
    for (const note of notes) await cacheNote(note);
  } catch {
    notes = await idbGetAll('notes_cache');
    if (folder) notes = notes.filter((n) => (n.folders || []).some((f) => f.startsWith(folder)));
  }

  const metaStore = getMetaStore();
  notes.sort((a, b) => Number(!!metaStore[b.id]?.pinned) - Number(!!metaStore[a.id]?.pinned));

  noteList.innerHTML = '';
  for (const note of notes) {
    const noteMeta = getMetaByNoteId(note.id);
    const btn = document.createElement('button');
    btn.className = 'note-btn';
    btn.innerHTML = `<strong>${noteMeta.icon} ${note.title}</strong><div class="muted">v${note.version || 1} / ${(note.folders || []).join(', ')}</div><div>${note.content_preview || String(note.content || '').slice(0, 140)}</div>`;
    if (selectedNote && selectedNote.id === note.id) btn.classList.add('active');
    btn.addEventListener('click', () => openNote(note.id));
    noteList.appendChild(btn);
  }
}

async function openNote(id) {
  let note = null;
  try {
    note = await request(`/notes/${encodeURIComponent(id)}`);
    await cacheNote(note);
  } catch {
    const cached = await idbGetAll('notes_cache');
    note = cached.find((x) => x.id === id) || null;
  }
  if (!note) return;

  selectedNote = note;
  titleEl.value = note.title;
  foldersEl.value = (note.folders || []).join(', ');
  markdownSource = note.content || '';
  syncEditorFromMarkdown();
  loadMetaToForm(note.id);
  updateStatus(`編集中: ${note.id} (v${note.version || 1})`);
  await loadNotes();
}

function clearEditor() {
  selectedNote = null;
  titleEl.value = '';
  foldersEl.value = '';
  markdownSource = '';
  syncEditorFromMarkdown();
  loadMetaToForm(null);
  updateStatus('新規メモモード');
  loadNotes().catch((e) => updateStatus(e.message));
}

async function storeConflictLocal(noteId, error, localContent) {
  const row = {
    id: crypto.randomUUID(),
    note_id: noteId,
    base_version: selectedNote?.version || 0,
    local_content: localContent,
    remote_content: error?.data?.server_content || '',
    server_version: error?.data?.server_version || 0,
    created_at: Date.now(),
    resolved: 0,
  };
  await idbPut('conflicts_local', row);
  await renderConflicts();
}

async function saveCurrent() {
  const payload = {
    title: titleEl.value.trim() || 'Untitled',
    content: markdownSource,
    folders: splitCsv(foldersEl.value),
    device_id: 'web-ui',
  };

  if (!payload.content.trim()) {
    updateStatus('本文は必須です。');
    return;
  }

  const cachedDraft = {
    id: selectedNote?.id || `local-${Date.now()}`,
    title: payload.title,
    content: payload.content,
    content_preview: payload.content.slice(0, 140),
    version: selectedNote?.version || 1,
    folders: payload.folders,
    updated_at: Math.floor(Date.now() / 1000),
  };

  if (!isOnline()) {
    await cacheNote(cachedDraft);
    await queuePending({ kind: selectedNote ? 'update' : 'create', noteId: selectedNote?.id || null, payload, tempId: cachedDraft.id, localVersion: cachedDraft.version });
    selectedNote = cachedDraft;
    updateStatus('オフライン保存: pending_updates に追加しました');
    await loadNotes();
    return;
  }

  if (!selectedNote || String(selectedNote.id).startsWith('local-')) {
    const created = await request('/notes', { method: 'POST', body: JSON.stringify(payload) });
    selectedNote = { ...cachedDraft, id: created.id, version: created.version };
    await cacheNote(selectedNote);
    updateStatus(`作成しました: ${created.id}`);
    await loadFolderTree();
    await openNote(created.id);
    return;
  }

  try {
    const updated = await request(`/notes/${encodeURIComponent(selectedNote.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...payload, version: selectedNote.version }),
    });
    selectedNote.version = updated.version;
    await cacheNote({ ...cachedDraft, id: selectedNote.id, version: updated.version });
    updateStatus(`保存しました: v${updated.version}`);
    await loadFolderTree();
    await openNote(selectedNote.id);
  } catch (error) {
    if (error.status === 409) {
      await storeConflictLocal(selectedNote.id, error, payload.content);
      updateStatus('競合を検出: conflicts_local に保存しました');
      return;
    }
    await cacheNote(cachedDraft);
    await queuePending({ kind: 'update', noteId: selectedNote.id, payload, tempId: selectedNote.id, localVersion: selectedNote.version });
    updateStatus('ネットワーク失敗: pending_updates に退避しました');
  }
}

async function deleteCurrent() {
  if (!selectedNote) return;
  const targetId = selectedNote.id;

  if (!isOnline() || String(targetId).startsWith('local-')) {
    await removeCachedNote(targetId);
    await queuePending({ kind: 'delete', noteId: targetId, payload: {}, tempId: targetId, localVersion: selectedNote?.version || 1 });
    clearEditor();
    return;
  }

  await request(`/notes/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
  await removeCachedNote(targetId);
  clearEditor();
}

function scheduleAutosave() {
  const seconds = Number(autosaveSecEl.value || 0);
  if (!selectedNote || !seconds) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveCurrent().catch((e) => updateStatus(e.message));
  }, seconds * 1000);
}

async function runSearch() {
  const q = queryEl.value.trim();
  if (!q) return;

  let hits = [];
  try {
    const body = await request(`/search?q=${encodeURIComponent(q)}`);
    hits = body.hits || [];
  } catch {
    const cached = await idbGetAll('notes_cache');
    const k = q.toLowerCase();
    hits = cached
      .filter((n) => (n.title || '').toLowerCase().includes(k) || (n.content || '').toLowerCase().includes(k))
      .slice(0, 10)
      .map((n) => ({ ...n, content_preview: (n.content || '').slice(0, 140) }));
  }

  searchResultEl.innerHTML = '';
  for (const hit of hits) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<strong>${hit.title}</strong><div class="muted">${hit.id}</div><div>${hit.content_preview}</div>`;
    card.addEventListener('click', () => openNote(hit.id));
    searchResultEl.appendChild(card);
  }
}

async function runAiSearch() {
  const query = aiQueryEl.value.trim();
  if (!query) return;
  const body = await request('/ai-search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  aiSummaryEl.textContent = `keywords: ${body.keywords} / ${body.summary}`;
}

async function syncPendingUpdates() {
  if (!isOnline()) {
    settingsStatusEl.textContent = 'オフラインのため同期できません';
    return;
  }

  const now = Date.now();
  const pending = (await idbGetAll('pending_updates')).sort((a, b) => a.id - b.id);
  for (const task of pending) {
    if (task.nextRetryAt && now < task.nextRetryAt) continue;

    try {
      if (task.kind === 'create') {
        const created = await request('/notes', { method: 'POST', body: JSON.stringify(task.payload) });
        const cacheRows = await idbGetAll('notes_cache');
        const old = cacheRows.find((n) => n.id === task.tempId);
        if (old) {
          await removeCachedNote(task.tempId);
          await cacheNote({ ...old, id: created.id, version: created.version });
          await remapTemporaryId(task.tempId, created.id);
        }
      }

      if (task.kind === 'update') {
        if (String(task.noteId).startsWith('local-')) {
          continue;
        }
        const note = (await idbGetAll('notes_cache')).find((n) => n.id === task.noteId);
        const version = note?.version || task.localVersion || 1;
        await request(`/notes/${encodeURIComponent(task.noteId)}`, {
          method: 'PUT',
          body: JSON.stringify({ ...task.payload, version }),
        });
      }

      if (task.kind === 'delete') {
        if (!String(task.noteId).startsWith('local-')) {
          await request(`/notes/${encodeURIComponent(task.noteId)}`, { method: 'DELETE' });
        }
      }

      await idbDelete('pending_updates', task.id);
    } catch (error) {
      if (error.status === 409 && task.noteId) {
        await storeConflictLocal(task.noteId, error, task.payload?.content || '');
        await idbDelete('pending_updates', task.id);
        continue;
      }

      const attempts = (task.attempts || 0) + 1;
      await idbPut('pending_updates', {
        ...task,
        attempts,
        lastError: error.message || 'sync_failed',
        nextRetryAt: Date.now() + getRetryDelayMs(attempts),
      });
    }
  }

  const rest = await idbGetAll('pending_updates');
  const failed = rest.filter((x) => x.lastError).length;
  settingsStatusEl.textContent = `同期処理完了 / pending=${rest.length} / failed=${failed}`;
  updateSyncStatus(`pending: ${rest.length}`);
  await loadNotes();
  await renderConflicts();
}

async function renderConflicts() {
  const localConflicts = await idbGetAll('conflicts_local');
  let serverConflicts = [];
  if (isOnline()) {
    try {
      const body = await request('/conflicts?resolved=0');
      serverConflicts = body.conflicts || [];
    } catch {
      serverConflicts = [];
    }
  }

  conflictListEl.innerHTML = '';

  for (const conflict of localConflicts.sort((a, b) => b.created_at - a.created_at)) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <strong>[local] ${conflict.note_id}</strong>
      <div class="muted">base v${conflict.base_version} / server v${conflict.server_version || '-'}</div>
      <p class="muted">local: ${(conflict.local_content || '').slice(0, 80)}</p>
      <p class="muted">remote: ${(conflict.remote_content || '').slice(0, 80)}</p>
    `;

    const useLocalBtn = document.createElement('button');
    useLocalBtn.textContent = 'ローカル内容を再適用';
    useLocalBtn.addEventListener('click', async () => {
      const note = await request(`/notes/${encodeURIComponent(conflict.note_id)}`);
      await request(`/notes/${encodeURIComponent(conflict.note_id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: note.title,
          content: conflict.local_content,
          version: note.version,
          folders: note.folders,
          device_id: 'web-ui',
        }),
      });
      await idbDelete('conflicts_local', conflict.id);
      await renderConflicts();
      await loadNotes();
      updateStatus('競合を手動解消しました');
    });

    const resolveBtn = document.createElement('button');
    resolveBtn.textContent = '解消済みにする';
    resolveBtn.style.marginLeft = '8px';
    resolveBtn.addEventListener('click', async () => {
      await idbDelete('conflicts_local', conflict.id);
      await renderConflicts();
    });

    card.appendChild(useLocalBtn);
    card.appendChild(resolveBtn);
    conflictListEl.appendChild(card);
  }

  for (const conflict of serverConflicts) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <strong>[server] ${conflict.note_id}</strong>
      <div class="muted">base v${conflict.base_version}</div>
      <p class="muted">local: ${(conflict.local_content || '').slice(0, 80)}</p>
      <p class="muted">remote: ${(conflict.remote_content || '').slice(0, 80)}</p>
    `;

    const resolveServerBtn = document.createElement('button');
    resolveServerBtn.textContent = 'サーバ競合を解消済みにする';
    resolveServerBtn.addEventListener('click', async () => {
      await request(`/conflicts/${encodeURIComponent(conflict.id)}/resolve`, { method: 'POST' });
      await renderConflicts();
    });

    card.appendChild(resolveServerBtn);
    conflictListEl.appendChild(card);
  }

  if (!localConflicts.length && !serverConflicts.length) {
    conflictListEl.innerHTML = '<p class="muted">未解消の競合はありません</p>';
  }
}

async function registerPwa() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js');
  }
}

editorEl.addEventListener('input', () => {
  readEditorToMarkdown();
  syncEditorFromMarkdown(true);
  scheduleAutosave();
  const tail = markdownSource.slice(-2);
  if (tail.endsWith('/')) showSlashMenu();
  else closeSlashMenu();
});

editorEl.addEventListener('paste', async (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const fileItem = items.find((x) => x.kind === 'file');
  if (!fileItem) return;

  event.preventDefault();
  const file = fileItem.getAsFile();
  if (!file) return;

  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

  const asset = { id: crypto.randomUUID(), name: file.name || `asset-${Date.now()}`, type: file.type || 'application/octet-stream', dataUrl, createdAt: Date.now() };
  setAssets([asset, ...getAssets()].slice(0, 100));
  renderAssets();

  markdownSource += asset.type.startsWith('image/') ? `\n![${asset.name}](${asset.dataUrl})\n` : `\n[${asset.name}](${asset.dataUrl})\n`;
  syncEditorFromMarkdown(true);
  updateStatus(`アセット保存: ${asset.name}`);
  scheduleAutosave();
});

document.querySelector('#saveBtn').addEventListener('click', () => saveCurrent().catch((e) => updateStatus(e.message)));
document.querySelector('#deleteBtn').addEventListener('click', () => deleteCurrent().catch((e) => updateStatus(e.message)));
document.querySelector('#metaSaveBtn').addEventListener('click', saveMetaFromForm);
metaMenuBtnEl.addEventListener('click', () => toggleMetaMenu());
themeToggleBtnEl.addEventListener('click', () => {
  const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

panelMenuBtnEl.addEventListener('click', () => {
  setSidebarOpen(!document.body.classList.contains('sidebar-open'));
});
mobileOverlayEl.addEventListener('click', () => setSidebarOpen(false));

document.addEventListener('click', (event) => {
  if (!(metaMenuEl.contains(event.target) || metaMenuBtnEl.contains(event.target))) {
    toggleMetaMenu(false);
  }
  if (!(slashMenuEl.contains(event.target)) && event.target !== editorEl) {
    closeSlashMenu();
  }
});

document.querySelector('#newBtn').addEventListener('click', clearEditor);
document.querySelector('#searchBtn').addEventListener('click', () => runSearch().catch((e) => updateStatus(e.message)));
document.querySelector('#aiSearchBtn').addEventListener('click', () => runAiSearch().catch((e) => updateStatus(e.message)));
document.querySelector('#reloadConflictBtn').addEventListener('click', () => renderConflicts().catch((e) => updateStatus(e.message)));
document.querySelector('#syncNowBtn').addEventListener('click', () => syncPendingUpdates().catch((e) => updateStatus(e.message)));
document.querySelector('#clearFilterBtn').addEventListener('click', () => {
  folderFilterEl.value = '';
  loadNotes().catch((e) => updateStatus(e.message));
  renderFolderTreeFromState();
});
document.querySelector('#vacuumBtn').addEventListener('click', async () => {
  try {
    await request('/admin/vacuum', { method: 'POST' });
    settingsStatusEl.textContent = 'VACUUMを実行しました';
  } catch {
    settingsStatusEl.textContent = 'VACUUM実行に失敗しました';
  }
});

folderFilterEl.addEventListener('change', () => {
  loadNotes().catch((e) => updateStatus(e.message));
  renderFolderTreeFromState();
});
autosaveSecEl.addEventListener('change', () => updateStatus(`自動保存: ${autosaveSecEl.value || 0}秒`));
titleEl.addEventListener('input', () => { scheduleAutosave(); renderPageMetaLine(); });
foldersEl.addEventListener('input', () => { scheduleAutosave(); renderPageMetaLine(); });
metaIconEl.addEventListener('input', renderPageMetaLine);
metaColorEl.addEventListener('input', renderPageMetaLine);
metaPinnedEl.addEventListener('change', renderPageMetaLine);

for (const btn of document.querySelectorAll('.write-btn')) {
  btn.addEventListener('click', () => insertWritingTemplate(btn.dataset.insert));
}

for (const btn of document.querySelectorAll('.icon-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.icon-btn').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`.panel[data-panel="${btn.dataset.panel}"]`)?.classList.add('active');
    closePanelsForMobile();
  });
}

window.addEventListener('online', () => {
  updateSyncStatus('online (syncing...)');
  syncPendingUpdates().catch(() => {});
});
window.addEventListener('offline', () => updateSyncStatus('offline'));
window.addEventListener('resize', () => {
  if (window.innerWidth > 980) setSidebarOpen(false);
  closeSlashMenu();
});

initTheme();
clearEditor();
renderAssets();
updateSyncStatus();
Promise.all([loadNotes(), loadFolderTree(), renderConflicts(), registerPwa()]).catch((e) => updateStatus(e.message));
