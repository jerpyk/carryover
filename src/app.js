(() => {
'use strict';
const C = window.Carryover;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtN = n => n.toLocaleString();
const PAGE = 300;

const S = { convs: [], byId: new Map(), groups: [], groupOf: new Map(), selected: new Set(), active: 'all', query: '', limit: PAGE, maxStep: 1, hay: new Map() };
let sample = null, downloads = null;

// ---------- capabilities (light up when available) ----------
if (window.claude && typeof window.claude.use === 'function') {
  window.claude.use('sample').then(s => { sample = s; if (s) document.querySelectorAll('.ai').forEach(b => b.classList.remove('hidden')); refreshAiButtons(); }).catch(() => {});
  window.claude.use('downloads').then(d => { downloads = d; }).catch(() => {});
}
function refreshAiButtons() {
  const anyProjects = S.groups.some(g => g.kind !== 'general');
  $('#nameAll').classList.toggle('hidden', !sample || !anyProjects);
}

let toastEl = null, toastTimer = null;
function toast(msg, ms = 3200) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}
const fmtSize = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

// ---------- steps ----------
function go(n) {
  S.maxStep = Math.max(S.maxStep, n);
  for (let i = 1; i <= 4; i++) $('#step' + i).classList.toggle('hidden', i !== n);
  document.querySelectorAll('.steps button').forEach(b => {
    const k = +b.dataset.step;
    b.disabled = k > S.maxStep;
    if (k === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  if (n === 3) renderStats();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.steps button').forEach(b => b.addEventListener('click', () => go(+b.dataset.step)));

// ---------- loading ----------
const drop = $('#drop'), fileIn = $('#file'), st = $('#loadStatus');
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', ev => handleFiles([...ev.dataTransfer.files]));
drop.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fileIn.click(); } });
fileIn.addEventListener('change', () => handleFiles([...fileIn.files]));
const getMcpFiles = async () => (window.CARRYOVER_GET_MCP ? window.CARRYOVER_GET_MCP() : window.MCP_FILES);
if ($('#sampleBtn')) $('#sampleBtn').addEventListener('click', () => ingest(window.SAMPLE_EXPORT, 'sample data'));

function setStatus(msg, err) { st.innerHTML = msg; st.classList.toggle('err', !!err); }

async function handleFiles(files) {
  if (!files.length) return;
  setStatus('<span class="spin"></span> Reading your export…');
  try {
    let raw = [];
    for (const f of files) raw = raw.concat(await readOne(f));
    if (!raw.length) throw new Error('No conversations found in that file.');
    ingest(raw, files.map(f => f.name).join(', '));
  } catch (e) {
    console.error(e);
    setStatus('⚠️ ' + esc(e.message || e) + ' Make sure it is the .zip from ChatGPT\'s "Export data" email.', true);
  }
}

async function readOne(f) {
  const name = f.name.toLowerCase();
  if (name.endsWith('.zip')) {
    if (!window.JSZip) throw new Error('The zip library did not load. Check your connection and reload.');
    const zip = await JSZip.loadAsync(f);
    const entries = Object.values(zip.files).filter(z => !z.dir);
    const convFiles = entries.filter(z => /(^|\/)conversations(-\d+)?\.json$/i.test(z.name)).sort((a, b) => a.name.localeCompare(b.name));
    let raw = [];
    if (convFiles.length) {
      for (const [i, z] of convFiles.entries()) {
        setStatus(`<span class="spin"></span> Reading ${esc(z.name)} (${i + 1}/${convFiles.length})…`);
        const data = JSON.parse(await z.async('string'));
        raw = raw.concat(Array.isArray(data) ? data : (data.conversations || []));
      }
      return raw;
    }
    const html = entries.find(z => /(^|\/)chat\.html$/i.test(z.name));
    if (html) return C.extractFromChatHtml(await html.async('string'));
    throw new Error('This zip has no conversations.json or chat.html.');
  }
  const text = await f.text();
  if (name.endsWith('.html') || name.endsWith('.htm')) return C.extractFromChatHtml(text);
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : (data.conversations || []);
}

function ingest(raw, label) {
  const convs = C.normalize(raw);
  if (!convs.length) { setStatus('⚠️ Found the file, but no readable conversations in it.', true); return; }
  ingestNormalized(convs, label);
}

function ingestNormalized(convs, label, projectsMeta) {
  convs = [...convs].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  S.convs = convs;
  S.byId = new Map(convs.map(c => [c.id, c]));
  S.hay = new Map();
  S.groups = C.initialGroups(convs, projectsMeta);
  S.groupOf = new Map();
  S.groups.forEach(g => g.convIds.forEach(id => S.groupOf.set(id, g.id)));
  S.selected = new Set(convs.map(c => c.id));
  S.active = 'all'; S.query = ''; $('#search').value = ''; S.limit = PAGE;
  const nProj = S.groups.filter(g => g.kind === 'project').length;
  const unnamed = S.groups.filter(g => g.kind === 'project' && !g.namedFromSource).length;
  $('#projBanner').classList.toggle('hidden', !unnamed);
  setStatus(`✅ Loaded <b>${fmtN(convs.length)}</b> chats from ${esc(label)}, with <b>${nProj}</b> project${nProj === 1 ? '' : 's'} detected.`);
  refreshAiButtons();
  renderAll();
  go(2);
}

// ---------- organize ----------
function groupById(id) { return S.groups.find(g => g.id === id); }
function rebuildConvIds() {
  S.groups.forEach(g => g.convIds = []);
  for (const c of S.convs) { const g = groupById(S.groupOf.get(c.id)); if (g) g.convIds.push(c.id); }
}
function hayOf(c) {
  let h = S.hay.get(c.id);
  if (!h) { h = (c.title + '\n' + c.messages.map(m => m.text).join('\n')).toLowerCase(); S.hay.set(c.id, h); }
  return h;
}
function visible() {
  const q = S.query.trim().toLowerCase();
  return S.convs.filter(c => (S.active === 'all' || S.groupOf.get(c.id) === S.active) && (!q || hayOf(c).includes(q)));
}

function renderGroups() {
  const sel = id => S.groups.find(g => g.id === id).convIds.filter(x => S.selected.has(x)).length;
  const items = [`<li><button aria-pressed="${S.active === 'all'}" data-g="all"><span class="gname">All chats</span><span class="cnt">${fmtN(S.selected.size)}/${fmtN(S.convs.length)}</span></button></li>`];
  for (const g of S.groups) {
    const kind = g.kind === 'project' ? '<span class="kind project">Project</span>' : g.kind === 'gpt' ? '<span class="kind">GPT</span>' : g.kind === 'custom' ? '<span class="kind">New</span>' : '';
    items.push(`<li><button aria-pressed="${S.active === g.id}" data-g="${esc(g.id)}">${kind}<span class="gname" title="${esc(g.name)}">${esc(g.name)}</span><span class="cnt">${fmtN(sel(g.id))}/${fmtN(g.convIds.length)}</span></button></li>`);
  }
  $('#glist').innerHTML = items.join('');
  const opts = ['<option value="">Move shown to…</option>'].concat(S.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`));
  $('#bulkMove').innerHTML = opts.join('');
}

function renderDetail() {
  const g = groupById(S.active);
  $('#gdetail').classList.toggle('hidden', !g);
  if (!g) return;
  if (document.activeElement !== $('#gName')) $('#gName').value = g.name;
  if (document.activeElement !== $('#gSummary')) $('#gSummary').value = g.summary || '';
  $('#gDelete').classList.toggle('hidden', g.kind === 'general');
  $('#gStatus').textContent = '';
  const extra = [];
  if (g.chatgptInstructions) extra.push('✅ Your ChatGPT project instructions will be carried into PROJECT_INSTRUCTIONS.md.');
  if (g.chatgptFiles && g.chatgptFiles.length) extra.push(`📎 ${g.chatgptFiles.length} project file${g.chatgptFiles.length === 1 ? '' : 's'} (${g.chatgptFiles.slice(0, 3).join(', ')}${g.chatgptFiles.length > 3 ? '…' : ''}) will be listed in INDEX.md for you to re-upload.`);
  $('#gExtra').innerHTML = extra.map(esc).join('<br>');
  $('#gExtra').classList.toggle('hidden', !extra.length);
}

function renderRows() {
  const list = visible();
  const shown = list.slice(0, S.limit);
  const gopts = S.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  $('#rows').innerHTML = shown.map(c => {
    const on = S.selected.has(c.id);
    return `<tr class="${on ? '' : 'off'}" data-id="${esc(c.id)}">
      <td><input type="checkbox" ${on ? 'checked' : ''} aria-label="Include ${esc(c.title)}"></td>
      <td class="t"><button data-open="1">${esc(c.title)}</button></td>
      <td><select aria-label="Group">${gopts}</select></td>
      <td class="d">${(c.updated || '').slice(0, 10)}</td>
      <td class="m">${c.messages.length}</td></tr>`;
  }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">No chats match.</td></tr>`;
  $('#rows').querySelectorAll('tr[data-id]').forEach(tr => { tr.querySelector('select').value = S.groupOf.get(tr.dataset.id); });
  $('#moreWrap').classList.toggle('hidden', list.length <= S.limit);
  $('#moreBtn').textContent = `Show more (${fmtN(list.length - S.limit)} left)`;
  const chars = [...S.selected].reduce((n, id) => n + (S.byId.get(id)?.chars || 0), 0);
  $('#selSummary').textContent = `${fmtN(S.selected.size)} of ${fmtN(S.convs.length)} chats included · about ${fmtN(Math.round(chars / 4))} tokens`;
}
function renderAll() { rebuildConvIds(); renderGroups(); renderDetail(); renderRows(); }

$('#glist').addEventListener('click', e => {
  const b = e.target.closest('button[data-g]'); if (!b) return;
  S.active = b.dataset.g; S.limit = PAGE; renderGroups(); renderDetail(); renderRows();
});
$('#rows').addEventListener('change', e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  const id = tr.dataset.id;
  if (e.target.type === 'checkbox') { e.target.checked ? S.selected.add(id) : S.selected.delete(id); tr.classList.toggle('off', !e.target.checked); rebuildConvIds(); renderGroups(); renderRows(); }
  if (e.target.tagName === 'SELECT') { S.groupOf.set(id, e.target.value); renderAll(); }
});
$('#rows').addEventListener('click', e => { const b = e.target.closest('button[data-open]'); if (b) openPreview(b.closest('tr').dataset.id); });
let qTimer; $('#search').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.query = e.target.value; S.limit = PAGE; renderRows(); }, 160); });
$('#moreBtn').addEventListener('click', () => { S.limit += PAGE; renderRows(); });
$('#selVis').addEventListener('click', () => { visible().forEach(c => S.selected.add(c.id)); renderAll(); });
$('#deselVis').addEventListener('click', () => { visible().forEach(c => S.selected.delete(c.id)); renderAll(); });
$('#bulkMove').addEventListener('change', e => {
  const to = e.target.value; if (!to) return;
  const vis = visible(); vis.forEach(c => S.groupOf.set(c.id, to));
  toast(`Moved ${vis.length} chat${vis.length === 1 ? '' : 's'} to "${groupById(to).name}"`);
  renderAll();
});
$('#addGroup').addEventListener('click', () => {
  const g = { id: 'grp-new-' + Date.now(), sourceId: null, kind: 'custom', name: `New group ${S.groups.filter(x => x.kind === 'custom').length + 1}`, summary: '', convIds: [] };
  S.groups.splice(S.groups.length - 1, 0, g);
  S.active = g.id; renderAll();
  $('#gName').focus(); $('#gName').select();
  toast('Group created. Move chats into it with the Group column or "Move shown to…".');
});
$('#gName').addEventListener('input', e => { const g = groupById(S.active); if (g) { g.name = e.target.value || 'Untitled group'; renderGroups(); } });
$('#gName').addEventListener('change', () => renderRows());
$('#gSummary').addEventListener('input', e => { const g = groupById(S.active); if (g) g.summary = e.target.value; });
$('#gSelAll').addEventListener('click', () => { const g = groupById(S.active); g.convIds.forEach(id => S.selected.add(id)); renderAll(); });
$('#gSelNone').addEventListener('click', () => { const g = groupById(S.active); g.convIds.forEach(id => S.selected.delete(id)); renderAll(); });
$('#gDelete').addEventListener('click', () => {
  const g = groupById(S.active); if (!g || g.kind === 'general') return;
  const other = S.groups.find(x => x.kind === 'general');
  g.convIds.forEach(id => S.groupOf.set(id, other.id));
  S.groups = S.groups.filter(x => x !== g); S.active = 'all';
  toast(`Deleted "${g.name}". Its chats moved to "${other.name}".`);
  renderAll(); refreshAiButtons();
});
$('#bannerX').addEventListener('click', () => $('#projBanner').classList.add('hidden'));
$('#toStep3').addEventListener('click', () => {
  if (!S.selected.size) { toast('Include at least one chat first.'); return; }
  go(3);
});

// ---------- preview ----------
const dlg = $('#dlg');
function openPreview(id) {
  const c = S.byId.get(id);
  $('#dlgTitle').textContent = c.title;
  const g = groupById(S.groupOf.get(id));
  $('#dlgBody').innerHTML = `<p style="margin:0 0 14px;color:var(--muted);font-size:13px">${esc(g ? g.name : '')} · started ${esc((c.created || '').slice(0, 10))} · ${c.messages.length} messages${c.model ? ' · ' + esc(c.model) : ''}</p>` +
    c.messages.slice(0, 200).map(m => `<div class="msg ${m.role}"><div class="who">${m.role === 'user' ? 'You' : 'ChatGPT'}</div><pre>${esc(m.text.length > 6000 ? m.text.slice(0, 6000) + '\n…' : m.text)}</pre></div>`).join('') +
    (c.messages.length > 200 ? `<p style="color:var(--muted)">…${c.messages.length - 200} more messages in the export.</p>` : '');
  dlg.showModal();
}
$('#dlgClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

// ---------- Claude-powered naming / summary ----------
function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in reply');
  return JSON.parse(m[0]);
}
async function aiForGroup(g) {
  const convs = g.convIds.map(id => S.byId.get(id));
  const prompt = `Below are the titles and opening messages of chats from one ChatGPT project belonging to a student who is moving to Claude.

${C.digestForSummary(convs)}

Return only JSON: {"name": "...", "summary": "..."}
- "name": a short, specific project name of at most 5 words, e.g. "Calculus II homework".
- "summary": 2 to 4 sentences in the first person ("I'm ...") describing what this project is about, the recurring topics, and any goals or context Claude should know. Plain text, no lists. Only state what the chats support.`;
  const res = await sample(prompt, { modelTier: 'quick' });
  return parseJSON(res.text);
}
const isDefaultName = g => /^(ChatGPT project|Custom GPT|New group) \d+$/.test(g.name);
$('#gAi').addEventListener('click', async () => {
  const g = groupById(S.active); if (!g || !sample) return;
  const b = $('#gAi'); b.disabled = true; $('#gStatus').innerHTML = '<span class="spin"></span> Asking Claude…';
  try {
    const r = await aiForGroup(g);
    if (r.summary) g.summary = r.summary;
    let note = '✅ Done. Edit anything you like.';
    if (r.name) {
      if (isDefaultName(g)) g.name = r.name;
      else if (r.name !== g.name) note = `✅ Summary written. Suggested name: "${r.name}" (kept yours).`;
    }
    renderGroups(); renderDetail(); renderRows();
    $('#gStatus').textContent = note;
  } catch (e) {
    $('#gStatus').textContent = e && e.code === 'not_granted' ? 'Claude access was not granted.' : e && e.code === 'rate_limited' ? 'Too many requests. Try again in a minute.' : 'Could not get a summary. Try again.';
  } finally { b.disabled = false; }
});
$('#nameAll').addEventListener('click', async () => {
  const todo = S.groups.filter(g => g.kind !== 'general' && isDefaultName(g));
  if (!todo.length) { toast('All groups already have custom names.'); return; }
  const b = $('#nameAll'); b.disabled = true;
  let done = 0;
  for (const g of todo) {
    b.innerHTML = `<span class="spin"></span> Naming ${done + 1}/${todo.length}…`;
    try { const r = await aiForGroup(g); if (r.name) g.name = r.name; if (r.summary && !g.summary) g.summary = r.summary; done++; renderAll(); }
    catch (e) { if (e && (e.code === 'not_granted' || e.code === 'rate_limited')) { toast(e.code === 'rate_limited' ? 'Claude is rate-limited; try again shortly.' : 'Claude access was not granted.'); break; } }
  }
  b.disabled = false; b.textContent = '✨ Suggest names with Claude';
  toast(`Named ${done} group${done === 1 ? '' : 's'}. Check them against your ChatGPT sidebar.`);
});

// ---------- export ----------
function opts() {
  return {
    mode: document.querySelector('input[name=mode]:checked').value,
    fileStyle: document.querySelector('input[name=style]:checked').value,
    singleName: $('#singleName').value,
    includeArchive: $('#incMcp').checked
  };
}
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { $('#singleNameWrap').classList.toggle('hidden', opts().mode !== 'single'); renderStats(); }));
function renderStats() {
  rebuildConvIds();
  const live = S.groups.filter(g => g.convIds.some(id => S.selected.has(id)));
  const chars = [...S.selected].reduce((n, id) => n + (S.byId.get(id)?.chars || 0), 0);
  const msgs = [...S.selected].reduce((n, id) => n + (S.byId.get(id)?.messages.length || 0), 0);
  const nProj = opts().mode === 'single' ? 1 : live.length;
  $('#stats').innerHTML = [
    [fmtN(S.selected.size), 'chats'], [fmtN(msgs), 'messages'], [fmtN(nProj), nProj === 1 ? 'Claude project' : 'Claude projects'], ['~' + fmtN(Math.round(chars / 4)), 'tokens of text']
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
}

function treeOf(paths) {
  const lines = [];
  let prev = [];
  for (const p of [...paths].sort()) {
    const parts = p.split('/');
    let i = 0; while (i < parts.length - 1 && prev[i] === parts[i]) i++;
    for (; i < parts.length; i++) lines.push('  '.repeat(i) + parts[i] + (i < parts.length - 1 ? '/' : ''));
    prev = parts;
  }
  return lines.join('\n');
}

function startHere(o) {
  return `# Your Claude migration kit

Made with Carryover on ${new Date().toISOString().slice(0, 10)}.

## Import your chats into Claude
${o.mode === 'single' ? 'The `claude-project-…` folder is one Claude project.' : 'Every folder inside `claude-projects/` is one Claude project.'} For each one:

1. Go to https://claude.ai/projects and create a new project with the folder's name.
2. Open \`PROJECT_INSTRUCTIONS.md\` and paste the text under the line into the project's instructions.
3. Upload the \`chats-part-*.md\` files (or the files in \`chats/\`) and \`INDEX.md\` to the project's files.

Then start a chat in the project and ask something like: "What did I work on in these chats? List the main topics with dates."

## Bring your ChatGPT memory too
Claude's built-in memory import covers preferences and personal context (not chat logs): https://claude.com/import-memory
${o.includeArchive ? `
## Search everything with MCP (Claude Desktop / Claude Code)
See \`mcp-server/README.md\`. It gives Claude tools to search and read every chat in \`chatgpt-archive.json\`.
` : ''}`;
}

$('#buildBtn').addEventListener('click', async () => {
  const b = $('#buildBtn'), bs = $('#buildStatus');
  b.disabled = true; bs.classList.remove('err'); bs.innerHTML = '<span class="spin"></span> Building your kit…';
  try {
    await new Promise(r => setTimeout(r, 30));
    rebuildConvIds();
    const o = opts();
    const files = C.buildFiles(S.groups, S.convs, S.selected, o);
    if (o.includeArchive) for (const [p, content] of Object.entries(await getMcpFiles())) files.push({ path: 'mcp-server/' + p, content });
    files.push({ path: 'START_HERE.md', content: startHere(o) });
    const zip = new JSZip();
    const root = 'claude-migration-kit/';
    files.forEach(f => zip.file(root + f.path, f.content));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, m => { bs.innerHTML = `<span class="spin"></span> Compressing… ${Math.round(m.percent)}%`; });
    $('#tree').textContent = treeOf(files.map(f => root + f.path));
    $('#tree').classList.remove('hidden');
    const name = 'claude-migration-kit.zip';
    if (downloads) {
      try {
        await downloads.save({ filename: name, data: blob });
        bs.innerHTML = `✅ Saved <b>${name}</b> (${fmtSize(blob.size)}). Unzip it, then continue to step 4.`;
      } catch (e) {
        bs.textContent = e && e.code === 'declined' ? 'Download cancelled. Click the button again when ready.' : 'Download is not available here (' + (e && e.code || 'error') + ').';
        if (e && e.code !== 'declined') bs.classList.add('err');
      }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      bs.innerHTML = `✅ <b>${name}</b> (${fmtSize(blob.size)}) is ready. Unzip it, then continue to step 4.`;
    }
    S.maxStep = Math.max(S.maxStep, 4);
    document.querySelectorAll('.steps button').forEach(x => { x.disabled = +x.dataset.step > S.maxStep; });
  } catch (e) {
    console.error(e); bs.classList.add('err'); bs.textContent = '⚠️ Could not build the kit: ' + (e.message || e);
  } finally { b.disabled = false; }
});
$('#toStep4').addEventListener('click', () => go(4));
window.CarryoverApp = { ingestNormalized, handleFiles, go };

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  try { await navigator.clipboard.writeText($('#' + b.dataset.copy).textContent); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); }
  catch { toast('Copy blocked here. Select the text and copy it manually.'); }
});
})();
