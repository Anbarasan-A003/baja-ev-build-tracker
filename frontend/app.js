// app.js - fully fixed + clean purchase manager + stable event delegation

const apiCall = (path, opts = {}) =>
  fetch(path, opts).then(async r => {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) return r.json();
    return r;
  });

/* DOM refs */
const userBox = document.getElementById('userBox');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

const loginModal = document.getElementById('loginModal');
const doLoginBtn = document.getElementById('doLogin');
const closeLoginBtn = document.getElementById('closeLogin');

const sectionEl = document.getElementById('section');
const titleEl = document.getElementById('title');
const descEl = document.getElementById('description');
const assigneeEl = document.getElementById('assignee');
const statusEl = document.getElementById('status');
const percentEl = document.getElementById('percent');
const amountEl = document.getElementById('amount');
const imagesEl = document.getElementById('images');

const addBtn = document.getElementById('addBtn');
const exportBtn = document.getElementById('exportBtn');
const refreshBtn = document.getElementById('refreshBtn');

const workTracking = document.getElementById('workTracking');
const costSummaryContainer = document.getElementById('costSummaryContainer');
const timelineWrap = document.getElementById('timeline');
const entriesWrap = document.getElementById('entries');

let pmToBuy = document.getElementById('pmToBuy');          // CHANGED const -> let
let pmPurchased = document.getElementById('pmPurchased');  // CHANGED const -> let

let state = { entries: [] };
let currentUser = null;
let editingId = null;

/* ---------- Auth ---------- */
async function whoami() {
  try {
    const resp = await apiCall('/api/whoami');
    currentUser = resp.user || null;
  } catch {
    currentUser = null;
  }
  updateAuthUI();
}

function updateAuthUI() {
  if (currentUser) {
    userBox.textContent = `${currentUser.name} (${currentUser.role})`;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    closeLoginBtn.style.display = 'inline-block';
  } else {
    userBox.textContent = 'Not signed in';
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
    closeLoginBtn.style.display = 'none';
  }
}

loginBtn.addEventListener('click', () => loginModal.style.display = 'flex');
closeLoginBtn.addEventListener('click', () => loginModal.style.display = 'none');

doLoginBtn.addEventListener('click', async () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!username || !password) return alert('Enter username & password');

  const res = await apiCall('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (res && res.ok) {
    currentUser = res.user;
    loginModal.style.display = 'none';
    await loadState();
  } else alert('Login failed');
});

logoutBtn.addEventListener('click', async () => {
  await apiCall('/api/logout', { method: 'POST' }).catch(() => {});
  currentUser = null;
  updateAuthUI();
  state = { entries: [] };
  renderAll();
});

/* ---------- Load State ---------- */
async function loadState() {
  await whoami();
  try {
    state = await apiCall('/api/state');
  } catch {
    state = { entries: [] };
  }
  renderAll();
}

/* ---------- Upload image files ---------- */
async function uploadFiles(list) {
  const urls = [];
  if (!list || !list.length) return urls;

  for (const file of list) {
    const fd = new FormData();
    fd.append('image', file);

    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (j?.ok && j.url) urls.push(j.url);
    } catch (e) { console.warn('upload failed:', file.name); }
  }
  return urls;
}

/* ---------- Add / Update entry ---------- */
async function submitForm() {
  if (!currentUser) return alert('Login required');
  if (!titleEl.value.trim()) return alert('Title required');

  let uploaded = [];
  if (imagesEl.files?.length) uploaded = await uploadFiles(imagesEl.files);

  const body = {
    section: sectionEl.value,
    title: titleEl.value,
    description: descEl.value,
    assignee: assigneeEl.value || currentUser.username,
    status: statusEl.value,
    percent: Number(percentEl.value),
    amount: Number(amountEl.value),
    images: uploaded
  };

  if (editingId) {
    await apiCall('/api/entry/' + editingId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, timelineNote: 'Updated via UI' })
    });

    editingId = null;
    addBtn.textContent = 'Add Entry';

  } else {
    await apiCall('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  clearForm();
  await loadState();
}

addBtn.addEventListener('click', submitForm);

function cancelEdit() {
  editingId = null;
  addBtn.textContent = 'Add Entry';
  clearForm();
}

function clearForm() {
  titleEl.value = '';
  descEl.value = '';
  assigneeEl.value = '';
  percentEl.value = 0;
  amountEl.value = 0;
  imagesEl.value = '';
  sectionEl.selectedIndex = 0;
  statusEl.selectedIndex = 0;
}

/* ---------- Render All ---------- */
function renderAll() {
  updateAuthUI();
  renderPurchaseManager();
  renderWorkTracking();
  renderCostSummary();
  renderTimeline();
  renderEntries();
}

/* ---------- Work Tracking ---------- */
function renderWorkTracking() {
  workTracking.innerHTML = '';

  const agg = {};
  for (const e of state.entries) {
    const s = e.section;
    if (s === 'Items to Purchase' || s === 'Purchased Items') continue;

    if (!agg[s]) agg[s] = { count: 0, done: 0, totalPercent: 0 };
    agg[s].count++;
    agg[s].totalPercent += e.percent;
    if (e.status === 'Done') agg[s].done++;
  }

  for (const sys in agg) {
    const v = agg[sys];
    const avg = Math.round(v.totalPercent / v.count);

    const div = document.createElement('div');
    div.innerHTML = `
      <strong>${sys}</strong>
      <div class="small">Items: ${v.count} • Done: ${v.done}</div>
      <div class="progressOuter"><div class="progressInner" style="width:${avg}%"></div></div>
      <div class="small">${avg}% completed</div>`;
    workTracking.appendChild(div);
  }
}

/* ---------- Cost Summary ---------- */
function renderCostSummary() {
  const toBuy = state.entries.filter(e => e.section === 'Items to Purchase');
  const purchased = state.entries.filter(e => e.section === 'Purchased Items');

  const amtToBuy = toBuy.reduce((s, x) => s + Number(x.amount), 0);
  const amtPurchased = purchased.reduce((s, x) => s + Number(x.amount), 0);

  costSummaryContainer.innerHTML = `
    <strong>Cost Summary</strong>
    <div class="small">Items to Purchase: ${toBuy.length}</div>
    <div class="small">Purchased Items: ${purchased.length}</div>
    <div class="small">Amount To Buy: ₹${amtToBuy.toFixed(2)}</div>
    <div class="small">Amount Purchased: ₹${amtPurchased.toFixed(2)}</div>
    <div class="small">Total Spent: ₹${amtPurchased.toFixed(2)}</div>
  `;
}

/* ---------- Timeline ---------- */
function renderTimeline() {
  timelineWrap.innerHTML = '';
  const events = [];

  for (const e of state.entries)
    for (const t of e.timeline || [])
      events.push({ ts: t.ts, note: `${e.section} — ${e.title}: ${t.note}` });

  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  if (!events.length) {
    timelineWrap.innerHTML = '<div class="small">No timeline events.</div>';
    return;
  }

  for (const ev of events) {
    const d = document.createElement('div');
    d.className = 'timelineItem';
    d.innerHTML = `
      <div class="time">${new Date(ev.ts).toLocaleString()}</div>
      <div>${ev.note}</div>`;
    timelineWrap.appendChild(d);
  }
}

/* ---------- Entries List ---------- */
function renderEntries() {
  entriesWrap.innerHTML = '';

  if (!state.entries.length) {
    entriesWrap.innerHTML = '<div class="small">No entries yet.</div>';
    return;
  }

  [...state.entries].reverse().forEach(e => {
    const div = document.createElement('div');
    div.className = 'entry';

    div.innerHTML = `
      <div>
        <strong>${e.title}</strong>
        <div class="small">${e.section} • ${e.assignee} • ${new Date(e.createdAt).toLocaleString()}</div>
        <div class="small">${e.description}</div>
        <div class="small">Amount: ₹${e.amount.toFixed(2)}</div>
        <div>${(e.images || []).map(u => `<img class="thumb" src="${u}">`).join('')}</div>
        <div class="progressOuter"><div class="progressInner" style="width:${e.percent}%"></div></div>
      </div>

      <div>
        <div class="small">${e.status} • ${e.percent}%</div>
        ${renderEntryActions(e)}
      </div>
    `;

    entriesWrap.appendChild(div);
  });
}

function renderEntryActions(e) {
  const canModify =
    currentUser &&
    (currentUser.role === 'captain' ||
     currentUser.role === 'mechanical' ||
     currentUser.role === 'electrical' ||
     currentUser.username === e.assignee);

  if (!canModify) return '';

  return `
    <button onclick="selectForEdit(${e.id})">Update</button>
    <button onclick="deleteEntry(${e.id})">Delete</button>
  `;
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;
  await apiCall('/api/entry/' + id, { method: 'DELETE' });
  await loadState();
}

/* ---------- Purchase Manager ---------- */
function renderPurchaseManager() {
  pmToBuy.innerHTML = '';
  pmPurchased.innerHTML = '';

  const toBuy = state.entries.filter(e => e.section === 'Items to Purchase');
  const purchased = state.entries.filter(e => e.section === 'Purchased Items');

  // To Buy list
  toBuy.forEach(item => {
    pmToBuy.insertAdjacentHTML('beforeend', `
      <div class="pmItem">
        <div class="pmLeft">
          <div class="pmTitle">${escapeHtml(item.title)}</div>
          <div class="small">${escapeHtml(item.description || '')}</div>
          <div class="pmAmount">₹${item.amount.toFixed(2)}</div>
        </div>

        <div class="pmBtns">
          <button data-action="edit" data-id="${item.id}">Edit</button>
          <button data-action="mark" data-id="${item.id}">Mark Purchased</button>
        </div>
      </div>
    `);
  });

  // Purchased list
  purchased.forEach(item => {
    pmPurchased.insertAdjacentHTML('beforeend', `
      <div class="pmItem">
        <div class="pmLeft">
          <div class="pmTitle">${escapeHtml(item.title)}</div>
          <div class="small">${escapeHtml(item.description || '')}</div>
          <div class="pmAmount">₹${item.amount.toFixed(2)}</div>
        </div>

        <div class="pmBtns">
          <button data-action="edit" data-id="${item.id}">Edit</button>
          <button data-action="moveback" data-id="${item.id}">Move to To-Buy</button>
        </div>
      </div>
    `);
  });

  attachPMListeners(pmToBuy);
  attachPMListeners(pmPurchased);
}

/* FIXED Purchase Manager - No DOM destruction */
function attachPMListeners(container) {
  container.onclick = async evt => {
    const btn = evt.target.closest('button');
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    if (action === 'mark') {
      if (!confirm('Mark as Purchased?')) return;

      await apiCall('/api/entry/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'Purchased Items',
          status: 'Done',
          percent: 100,
          timelineNote: 'Marked purchased'
        })
      });
      await loadState();
    }

    if (action === 'moveback') {
      await apiCall('/api/entry/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'Items to Purchase',
          status: 'Pending',
          percent: 0,
          timelineNote: 'Moved back to To-Buy'
        })
      });
      await loadState();
    }

    if (action === 'edit') selectForEdit(id);
  };
}

/* ---------- Edit selection ---------- */
function selectForEdit(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return alert('Entry not found');

  sectionEl.value = e.section;
  titleEl.value = e.title;
  descEl.value = e.description;
  assigneeEl.value = e.assignee;
  statusEl.value = e.status;
  percentEl.value = e.percent;
  amountEl.value = e.amount;

  editingId = e.id;
  addBtn.textContent = 'Update Entry';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Events ---------- */
exportBtn.addEventListener('click', () => window.location = '/api/export');
refreshBtn.addEventListener('click', () => loadState());

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && editingId) cancelEdit();
});

/* ---------- Start ---------- */
loadState();

/* ---------- Helper ---------- */
function escapeHtml(s) {
  if (!s && s !== 0) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
