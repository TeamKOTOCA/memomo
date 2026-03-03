const memoContent = document.querySelector('#memoContent');
const memoTags = document.querySelector('#memoTags');
const saveResult = document.querySelector('#saveResult');
const query = document.querySelector('#query');
const filterTags = document.querySelector('#filterTags');
const summary = document.querySelector('#summary');
const results = document.querySelector('#results');

function splitTags(text) {
  return (text || '').split(',').map((x) => x.trim()).filter(Boolean);
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

document.querySelector('#aiTagBtn').addEventListener('click', async () => {
  const content = memoContent.value.trim();
  if (!content) return;
  const { body } = await postJson('/ai/tags', { content });
  memoTags.value = (body.tags || []).join(', ');
});

document.querySelector('#saveBtn').addEventListener('click', async () => {
  const content = memoContent.value.trim();
  if (!content) return;
  const payload = {
    content,
    tags: splitTags(memoTags.value),
    device_id: 'web-ui',
  };
  const { body } = await postJson('/quick-memo', payload);
  saveResult.textContent = JSON.stringify(body, null, 2);
});

document.querySelector('#searchBtn').addEventListener('click', async () => {
  const q = query.value.trim();
  if (!q) return;
  const tags = splitTags(filterTags.value).join(',');
  const url = tags ? `/search?q=${encodeURIComponent(q)}&tags=${encodeURIComponent(tags)}` : `/search?q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const body = await res.json();

  summary.textContent = body.summary || '';
  results.innerHTML = '';
  for (const hit of body.hits || []) {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<div><strong>${hit.id}</strong> v${hit.version}</div>
      <div class="muted">tags: ${(hit.tags || []).join(', ')}</div>
      <div>${hit.content_preview}</div>`;
    results.appendChild(div);
  }
});
