<?php

declare(strict_types=1);
?>
<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MEMOMO</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/@editorjs/editorjs@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/@editorjs/header@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/@editorjs/list@latest"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <main class="max-w-6xl mx-auto p-4 md:p-8">
    <header class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-xl font-bold">MEMOMO / 爆速メモ</h1>
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400" id="save-status">未保存</span>
        <button id="logout-btn" class="text-xs px-3 py-1 rounded bg-slate-800 hidden">ログアウト</button>
      </div>
    </header>

    <section id="login-panel" class="max-w-md rounded-xl border border-slate-800 bg-slate-900/80 p-5">
      <h2 class="font-semibold mb-3">ログイン</h2>
      <input id="email" class="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm mb-2" placeholder="Email" />
      <input id="password" type="password" class="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm mb-3" placeholder="Password" />
      <button id="login-btn" class="w-full rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm">ログイン</button>
      <p id="login-msg" class="text-xs text-rose-300 mt-2"></p>
    </section>

    <section id="app-panel" class="hidden grid md:grid-cols-[280px_1fr] gap-4">
      <aside class="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-semibold">メモ一覧</h2>
          <button id="new-note-btn" class="text-xs px-2 py-1 rounded bg-slate-800">新規</button>
        </div>
        <ul id="note-list" class="space-y-2 text-sm"></ul>
      </aside>

      <section class="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <input id="note-title" class="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm mb-2" placeholder="メモタイトル" />
        <label class="block text-xs mb-2 text-slate-400">階層タグ (例: work/project/task)</label>
        <input id="tag-path" class="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm mb-2" placeholder="inbox/daily" />
        <div id="tag-breadcrumb" class="text-xs text-emerald-300 mb-4"></div>
        <div id="editorjs"></div>
      </section>
    </section>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const saveStatus = $('save-status');
    const noteList = $('note-list');

    let editor;
    let saveTimer = null;
    let currentNoteId = null;

    const ListTool = window.EditorjsList || window.List;

    async function api(action, method = 'GET', body = null) {
      const res = await fetch(`/api.php?action=${action}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
      });
      return res.json();
    }

    function renderBreadcrumb(path) {
      const chunks = path.split('/').map(v => v.trim()).filter(Boolean);
      $('tag-breadcrumb').textContent = chunks.length ? chunks.join(' > ') : 'タグ未設定';
    }

    function scheduleSave() {
      saveStatus.textContent = '保存中...';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNote, 1200);
    }

    async function saveNote() {
      if (!editor) return;
      const content = await editor.save();
      const payload = {
        id: currentNoteId,
        title: $('note-title').value.trim() || '無題メモ',
        tag_path: $('tag-path').value.trim() || 'inbox',
        content_json: content,
      };

      const data = await api('memo.save', 'POST', payload);
      if (data.ok) {
        currentNoteId = data.id;
        saveStatus.textContent = '保存済み';
        loadNotes();
      } else {
        saveStatus.textContent = '保存失敗';
      }
    }

    async function loadNotes() {
      const data = await api('memo.list');
      if (!data.ok) return;
      noteList.innerHTML = '';
      for (const note of data.notes) {
        const li = document.createElement('li');
        li.innerHTML = `<button class="w-full text-left rounded border border-slate-800 hover:border-slate-600 px-2 py-1"><div class="font-medium truncate">${escapeHtml(note.title || '無題')}</div><div class="text-xs text-slate-400 truncate">${escapeHtml(note.tag_path)}</div></button>`;
        li.querySelector('button').addEventListener('click', () => loadNote(note.id));
        noteList.appendChild(li);
      }
    }

    async function loadNote(id) {
      const data = await fetch(`/api.php?action=memo.load&id=${id}`).then(r => r.json());
      if (!data.ok) return;
      currentNoteId = data.note.id;
      $('note-title').value = data.note.title || '';
      $('tag-path').value = data.note.tag_path || '';
      renderBreadcrumb($('tag-path').value);
      await editor.render(data.note.content_json || { blocks: [] });
      saveStatus.textContent = '読込済み';
    }

    function escapeHtml(value) {
      return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    async function bootEditor() {
      editor = new EditorJS({
        holder: 'editorjs',
        autofocus: true,
        tools: {
          header: window.Header,
          ...(ListTool ? { list: { class: ListTool, inlineToolbar: true } } : {}),
        },
        data: {
          blocks: [
            { type: 'header', data: { text: '最速メモ開始', level: 2 } },
            { type: 'paragraph', data: { text: 'ログイン後に編集し、自動保存されます。' } },
          ],
        },
        onChange: () => scheduleSave(),
      });
      await editor.isReady;
    }

    async function checkAuth() {
      const me = await api('auth.me');
      if (!me.ok) return false;
      $('login-panel').classList.add('hidden');
      $('app-panel').classList.remove('hidden');
      $('logout-btn').classList.remove('hidden');
      if (!editor) await bootEditor();
      await loadNotes();
      return true;
    }

    $('tag-path').addEventListener('input', (e) => {
      renderBreadcrumb(e.target.value);
      scheduleSave();
    });
    $('note-title').addEventListener('input', scheduleSave);

    $('new-note-btn').addEventListener('click', async () => {
      currentNoteId = null;
      $('note-title').value = '';
      $('tag-path').value = 'inbox';
      renderBreadcrumb('inbox');
      await editor.render({ blocks: [{ type: 'paragraph', data: { text: '' } }] });
      saveStatus.textContent = '新規メモ';
    });

    $('login-btn').addEventListener('click', async () => {
      $('login-msg').textContent = '';
      const res = await api('auth.login', 'POST', {
        email: $('email').value,
        password: $('password').value,
      });
      if (!res.ok) {
        $('login-msg').textContent = res.error || 'ログイン失敗';
        return;
      }
      await checkAuth();
    });

    $('logout-btn').addEventListener('click', async () => {
      await api('auth.logout', 'POST');
      location.reload();
    });

    renderBreadcrumb($('tag-path').value || '');
    checkAuth();
  </script>
</body>
</html>
