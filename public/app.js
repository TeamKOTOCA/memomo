const noteList = document.querySelector('#noteList');
const titleEl = document.querySelector('#title');
const foldersEl = document.querySelector('#folders');
const editorEl = document.querySelector('#editor');
const statusEl = document.querySelector('#status');
const folderFilterEl = document.querySelector('#folderFilter');
const queryEl = document.querySelector('#query');
const searchResultEl = document.querySelector('#searchResult');
const aiQueryEl = document.querySelector('#aiQuery');
const aiSummaryEl = document.querySelector('#aiSummary');
const assetListEl = document.querySelector('#assetList');
const autosaveSecEl = document.querySelector('#autosaveSec');
const settingsStatusEl = document.querySelector('#settingsStatus');

let selectedNote = null;
let autosaveTimer = null;
let markdownSource = '';

function splitCsv(text) {
  return (text || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function updateStatus(text) {
  statusEl.textContent = text;
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function renderLiveMarkdown(source) {
  const escaped = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith('### ')) return `<div class="line-h3">${line}</div>`;
      if (line.startsWith('## ')) return `<div class="line-h2">${line}</div>`;
      if (line.startsWith('# ')) return `<div class="line-h1">${line}</div>`;
      if (/^\s*[-*]\s+/.test(line)) return `<div class="line-list">${line}</div>`;
      if (/^\s*`.+`\s*$/.test(line)) return `<div><span class="line-code">${line}</span></div>`;
      if (!line.trim()) return '<div><br /></div>';
      return `<div>${line}</div>`;
    })
    .join('');
}

function syncEditorFromMarkdown(moveCaretToEnd = false) {
  editorEl.innerHTML = renderLiveMarkdown(markdownSource);
  if (moveCaretToEnd) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function readEditorToMarkdown() {
  markdownSource = editorEl.innerText.replace(/\u00a0/g, '');
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
      const md = asset.type.startsWith('image/')
        ? `\n![${asset.name}](${asset.dataUrl})\n`
        : `\n[${asset.name}](${asset.dataUrl})\n`;
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

async function loadNotes() {
  const folder = folderFilterEl.value.trim();
  const query = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  const data = await request(`/notes${query}`);
  noteList.innerHTML = '';

  for (const note of data.notes || []) {
    const btn = document.createElement('button');
    btn.className = 'note-btn';
    btn.innerHTML = `<strong>${note.title}</strong><div class="muted">v${note.version} / ${(note.folders || []).join(', ')}</div><div>${note.content_preview}</div>`;
    if (selectedNote && selectedNote.id === note.id) btn.classList.add('active');
    btn.addEventListener('click', () => openNote(note.id));
    noteList.appendChild(btn);
  }
}

async function openNote(id) {
  const note = await request(`/notes/${encodeURIComponent(id)}`);
  selectedNote = note;
  titleEl.value = note.title;
  foldersEl.value = (note.folders || []).join(', ');
  markdownSource = note.content || '';
  syncEditorFromMarkdown();
  updateStatus(`編集中: ${note.id} (v${note.version})`);
  await loadNotes();
}

function clearEditor() {
  selectedNote = null;
  titleEl.value = '';
  foldersEl.value = '';
  markdownSource = '';
  syncEditorFromMarkdown();
  updateStatus('新規メモモード');
  loadNotes().catch((e) => updateStatus(e.message));
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

  if (!selectedNote) {
    const created = await request('/notes', { method: 'POST', body: JSON.stringify(payload) });
    updateStatus(`作成しました: ${created.id}`);
    await openNote(created.id);
    return;
  }

  try {
    const updated = await request(`/notes/${encodeURIComponent(selectedNote.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...payload, version: selectedNote.version }),
    });
    updateStatus(`保存しました: v${updated.version}`);
    await openNote(selectedNote.id);
  } catch (error) {
    updateStatus(`保存失敗: ${error.message}`);
  }
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
  const body = await request(`/search?q=${encodeURIComponent(q)}`);
  searchResultEl.innerHTML = '';
  for (const hit of body.hits || []) {
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

editorEl.addEventListener('input', () => {
  readEditorToMarkdown();
  syncEditorFromMarkdown(true);
  scheduleAutosave();
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

  const asset = {
    id: crypto.randomUUID(),
    name: file.name || `asset-${Date.now()}`,
    type: file.type || 'application/octet-stream',
    dataUrl,
    createdAt: Date.now(),
  };

  setAssets([asset, ...getAssets()].slice(0, 100));
  renderAssets();

  markdownSource += asset.type.startsWith('image/')
    ? `\n![${asset.name}](${asset.dataUrl})\n`
    : `\n[${asset.name}](${asset.dataUrl})\n`;

  syncEditorFromMarkdown(true);
  updateStatus(`アセット保存: ${asset.name}`);
  scheduleAutosave();
});

document.querySelector('#saveBtn').addEventListener('click', () => saveCurrent().catch((e) => updateStatus(e.message)));
document.querySelector('#newBtn').addEventListener('click', clearEditor);
document.querySelector('#searchBtn').addEventListener('click', () => runSearch().catch((e) => updateStatus(e.message)));
document.querySelector('#aiSearchBtn').addEventListener('click', () => runAiSearch().catch((e) => updateStatus(e.message)));
document.querySelector('#vacuumBtn').addEventListener('click', () => {
  settingsStatusEl.textContent = 'VACUUMはサーバ定期実行対象です（UIからは通知のみ）。';
});
folderFilterEl.addEventListener('change', () => loadNotes().catch((e) => updateStatus(e.message)));
autosaveSecEl.addEventListener('change', () => updateStatus(`自動保存: ${autosaveSecEl.value || 0}秒`));
titleEl.addEventListener('input', scheduleAutosave);
foldersEl.addEventListener('input', scheduleAutosave);

for (const btn of document.querySelectorAll('.icon-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.icon-btn').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`.panel[data-panel="${btn.dataset.panel}"]`)?.classList.add('active');
  });
}

clearEditor();
renderAssets();
loadNotes().catch((e) => updateStatus(e.message));
