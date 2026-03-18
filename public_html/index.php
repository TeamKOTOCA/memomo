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
  <main class="max-w-7xl mx-auto p-4 md:p-8">
    <header class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-xl font-bold" id="site-title">MEMOMO / 爆速メモ</h1>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400" id="save-status">未保存</span>
        <button id="settings-btn" class="text-xs px-3 py-1 rounded bg-slate-800 hidden">初期設定</button>
        <button id="logout-btn" class="text-xs px-3 py-1 rounded bg-slate-800 hidden">ログアウト</button>
      </div>
    </header>

    <section id="setup-panel" class="hidden max-w-2xl rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
      <h2 class="font-semibold text-lg">初期設定</h2>
      <p class="text-xs text-slate-400">管理者アカウント・基本設定・ソーシャルログインをここで設定できます。</p>
      <div class="grid md:grid-cols-2 gap-3">
        <input id="setup-site-name" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm" placeholder="サイト名" value="MEMOMO" />
        <input id="setup-default-tag" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm" placeholder="デフォルトタグ" value="inbox" />
        <input id="setup-admin-email" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm" placeholder="管理者Email" />
        <input id="setup-admin-password" type="password" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm" placeholder="管理者パスワード" />
      </div>
      <div class="border border-slate-800 rounded p-3 space-y-2">
        <label class="text-sm font-medium"><input id="google-enabled" type="checkbox" class="mr-2">Googleログイン有効化</label>
        <div class="grid md:grid-cols-3 gap-2">
          <input id="google-client-id" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs" placeholder="Google Client ID" />
          <input id="google-client-secret" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs" placeholder="Google Client Secret" />
          <input id="google-redirect-uri" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs" placeholder="Google Redirect URI" />
        </div>
      </div>
      <div class="border border-slate-800 rounded p-3 space-y-2">
        <label class="text-sm font-medium"><input id="github-enabled" type="checkbox" class="mr-2">GitHubログイン有効化</label>
        <div class="grid md:grid-cols-3 gap-2">
          <input id="github-client-id" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs" placeholder="GitHub Client ID" />
          <input id="github-client-secret" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs" placeholder="GitHub Client Secret" />
          <input id="github-redirect-uri" class="rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs" placeholder="GitHub Redirect URI" />
        </div>
      </div>
      <button id="setup-save-btn" class="rounded bg-emerald-600 px-4 py-2 text-sm">初期設定を保存</button>
      <p id="setup-msg" class="text-xs text-rose-300"></p>
    </section>

    <section id="login-panel" class="max-w-md rounded-xl border border-slate-800 bg-slate-900/80 p-5">
      <h2 class="font-semibold mb-3">ログイン</h2>
      <input id="email" class="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm mb-2" placeholder="Email" />
      <input id="password" type="password" class="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm mb-3" placeholder="Password" />
      <button id="login-btn" class="w-full rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm">ログイン</button>
      <div id="social-buttons" class="mt-3 grid gap-2"></div>
      <p id="login-msg" class="text-xs text-rose-300 mt-2"></p>
    </section>

    <section id="app-panel" class="hidden grid lg:grid-cols-[280px_1fr_320px] gap-4">
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

      <aside class="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <h2 class="text-sm font-semibold mb-2">監視ダッシュボード</h2>
        <div class="space-y-2 mb-3">
          <input id="monitor-name" class="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs" placeholder="表示名" />
          <select id="monitor-type" class="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"><option value="url">URL</option><option value="ip">IP</option></select>
          <input id="monitor-value" class="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs" placeholder="https://example.com" />
          <button id="monitor-add-btn" class="w-full rounded bg-slate-800 px-2 py-1 text-xs">監視対象を追加</button>
        </div>
        <ul id="monitor-list" class="space-y-2 text-xs"></ul>
      </aside>
    </section>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const saveStatus = $('save-status');
    const noteList = $('note-list');
    let editor;
    let saveTimer = null;
    let currentNoteId = null;
    let setupCompleted = true;

    const ListTool = window.EditorjsList || window.List;

    async function api(action, method = 'GET', body = null) {
      const res = await fetch(`/api.php?action=${action}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
      });
      return res.json();
    }

    function getProviderPayload(name) {
      return {
        enabled: $(`${name}-enabled`).checked,
        client_id: $(`${name}-client-id`).value.trim(),
        client_secret: $(`${name}-client-secret`).value.trim(),
        redirect_uri: $(`${name}-redirect-uri`).value.trim(),
      };
    }

    async function loadSetupStatus() {
      const status = await api('setup.status');
      setupCompleted = !!status.setup_completed;
      if (status.settings?.site_name) $('site-title').textContent = `${status.settings.site_name} / 爆速メモ`;

      if (!setupCompleted) {
        $('setup-panel').classList.remove('hidden');
        $('login-panel').classList.add('hidden');
        return;
      }

      $('settings-btn').classList.remove('hidden');
      $('setup-site-name').value = status.settings?.site_name || 'MEMOMO';
      $('setup-default-tag').value = status.settings?.default_tag || 'inbox';
      for (const provider of (status.providers || [])) {
        if (provider.provider === 'google' || provider.provider === 'github') {
          $(`${provider.provider}-enabled`).checked = Number(provider.enabled) === 1;
          $(`${provider.provider}-client-id`).value = provider.client_id || '';
          $(`${provider.provider}-redirect-uri`).value = provider.redirect_uri || '';
        }
      }
    }

    async function loadSocialButtons() {
      const data = await api('auth.providers');
      const wrap = $('social-buttons');
      wrap.innerHTML = '';
      for (const provider of (data.providers || [])) {
        const btn = document.createElement('button');
        btn.className = 'w-full rounded bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm';
        btn.textContent = `${provider.provider} でログイン`;
        btn.addEventListener('click', async () => {
          const start = await fetch(`/api.php?action=auth.social.start&provider=${provider.provider}`).then((r) => r.json());
          if (start.ok && start.url) location.href = start.url;
        });
        wrap.appendChild(btn);
      }
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
        tag_path: $('tag-path').value.trim() || $('setup-default-tag').value.trim() || 'inbox',
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

    async function loadMonitors() {
      const data = await api('monitor.list');
      if (!data.ok) return;
      const list = $('monitor-list');
      list.innerHTML = '';
      for (const t of data.targets) {
        const color = t.last_status === 'up' ? 'text-emerald-300' : (t.last_status === 'down' ? 'text-rose-300' : 'text-slate-300');
        const item = document.createElement('li');
        item.className = 'rounded border border-slate-800 p-2';
        item.innerHTML = `<div class="font-medium">${escapeHtml(t.target_name)}</div><div class="${color}">${escapeHtml(t.last_status)}</div><div class="text-slate-400">${escapeHtml(t.target_value)}</div>`;
        list.appendChild(item);
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
      return String(value)
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
        tools: { header: window.Header, ...(ListTool ? { list: { class: ListTool, inlineToolbar: true } } : {}) },
        data: { blocks: [{ type: 'paragraph', data: { text: '' } }] },
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
      await loadMonitors();
      return true;
    }

    $('setup-save-btn').addEventListener('click', async () => {
      const payload = {
        site_name: $('setup-site-name').value.trim(),
        default_tag: $('setup-default-tag').value.trim(),
        admin_email: $('setup-admin-email').value.trim(),
        admin_password: $('setup-admin-password').value,
        providers: { google: getProviderPayload('google'), github: getProviderPayload('github') },
      };
      const action = setupCompleted ? 'setup.update' : 'setup.initialize';
      const res = await api(action, 'POST', payload);
      $('setup-msg').textContent = res.ok ? '保存しました' : (res.error || '保存失敗');
      if (res.ok && !setupCompleted) location.reload();
    });

    $('settings-btn').addEventListener('click', () => $('setup-panel').classList.toggle('hidden'));

    $('monitor-add-btn').addEventListener('click', async () => {
      const res = await api('monitor.save', 'POST', {
        target_name: $('monitor-name').value,
        target_type: $('monitor-type').value,
        target_value: $('monitor-value').value,
      });
      if (res.ok) {
        $('monitor-name').value = '';
        $('monitor-value').value = '';
        loadMonitors();
      }
    });

    $('tag-path').addEventListener('input', (e) => { renderBreadcrumb(e.target.value); scheduleSave(); });
    $('note-title').addEventListener('input', scheduleSave);

    $('new-note-btn').addEventListener('click', async () => {
      currentNoteId = null;
      $('note-title').value = '';
      $('tag-path').value = $('setup-default-tag').value || 'inbox';
      renderBreadcrumb($('tag-path').value);
      await editor.render({ blocks: [{ type: 'paragraph', data: { text: '' } }] });
      saveStatus.textContent = '新規メモ';
    });

    $('login-btn').addEventListener('click', async () => {
      $('login-msg').textContent = '';
      const res = await api('auth.login', 'POST', { email: $('email').value, password: $('password').value });
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

    (async () => {
      await loadSetupStatus();
      await loadSocialButtons();
      renderBreadcrumb($('tag-path').value || '');
      await checkAuth();
    })();
  </script>
</body>
</html>
