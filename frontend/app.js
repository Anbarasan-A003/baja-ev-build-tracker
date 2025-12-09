// app.js - FINAL VERSION with Auto Login Popup + Responsive Fix

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

let pmToBuy = document.getElementById('pmToBuy');
let pmPurchased = document.getElementById('pmPurchased');

let state = { entries: [] };
let currentUser = null;
let editingId = null;

/* ---------- AUTH ---------- */
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
  } else {
    userBox.textContent = 'Not signed in';
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
  }
}

/* ---------- AUTO LOGIN POPUP ---------- */
async function loadState() {
  await whoami();

  if (!currentUser) {
    loginModal.style.display = "flex";
    document.querySelector("main").style.display = "none";
    return;
  }

  // Logged → show dashboard
  document.querySelector("main").style.display = "grid";

  try {
    state = await apiCall('/api/state');
  } catch {
    state = { entries: [] };
  }
  renderAll();
}

/* ---------- LOGIN HANDLER ---------- */
loginBtn.addEventListener("click", () => {
  loginModal.style.display = "flex";
});

closeLoginBtn.addEventListener("click", () => {
  loginModal.style.display = "none";
});

doLoginBtn.addEventListener('click', async () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!username || !password) return alert('Enter username & password');

  const res = await apiCall('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (res.ok) {
    currentUser = res.user;
    loginModal.style.display = 'none';

    // SHOW UI IMMEDIATELY
    document.querySelector("main").style.display = "grid";

    await loadState();
  } else {
    alert('Login failed');
  }
});

/* ---------- LOGOUT ---------- */
logoutBtn.addEventListener('click', async () => {
  await apiCall('/api/logout', { method: 'POST' }).catch(() => {});
  currentUser = null;
  document.querySelector("main").style.display = "none";
  loginModal.style.display = "flex";
});

/* ---------- File Uploads ---------- */
async function uploadFiles(list) {
  const urls = [];
  if (!list || !list.length) return urls;

  for (const file of list) {
    const fd = new FormData();
    fd.append("image", file);

    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (j.ok && j.url) urls.push(j.url);
    } catch {}
  }
  return urls;
}

/* ---------- Add / Edit ---------- */
async function submitForm() {
  if (!currentUser) return alert('Login first!');
  if (!titleEl.value.trim()) return alert('Title required');

  let uploaded = [];
  if (imagesEl.files?.length) {
    uploaded = await uploadFiles(imagesEl.files);
  }

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
    await apiCall(`/api/entry/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, timelineNote: "Updated via UI" })
    });

    editingId = null;
    addBtn.textContent = "Add Entry";
  } else {
    await apiCall('/api/entry', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  clearForm();
  await loadState();
}

/* ---------- CLEAR FORM ---------- */
function clearForm() {
  titleEl.value = "";
  descEl.value = "";
  assigneeEl.value = "";
  percentEl.value = 0;
  amountEl.value = 0;
  imagesEl.value = "";
  sectionEl.selectedIndex = 0;
  statusEl.selectedIndex = 0;
}

addBtn.addEventListener("click", submitForm);

/* ---------- RENDERERS (unchanged logic) ---------- */
function renderAll() {
  updateAuthUI();
  renderPurchaseManager();
  renderWorkTracking();
  renderCostSummary();
  renderTimeline();
  renderEntries();
}

/* ---------- Purchase Manager (same logic as before) ---------- */
function renderPurchaseManager() {
  pmToBuy.innerHTML = "";
  pmPurchased.innerHTML = "";

  const toBuy = state.entries.filter(e => e.section === "Items to Purchase");
  const purchased = state.entries.filter(e => e.section === "Purchased Items");

  toBuy.forEach(item => {
    pmToBuy.insertAdjacentHTML("beforeend", `
      <div class="pmItem">
        <div>
          <strong>${item.title}</strong>
          <div class="small">${item.description}</div>
          <div class="small">₹${item.amount}</div>
        </div>
        <button onclick="markPurchased(${item.id})">Mark Purchased</button>
      </div>
    `);
  });

  purchased.forEach(item => {
    pmPurchased.insertAdjacentHTML("beforeend", `
      <div class="pmItem">
        <div>
          <strong>${item.title}</strong>
          <div class="small">${item.description}</div>
          <div class="small">₹${item.amount}</div>
        </div>
        <button onclick="moveBack(${item.id})">Move Back</button>
      </div>
    `);
  });
}

async function markPurchased(id) {
  await apiCall(`/api/entry/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      section: "Purchased Items",
      status: "Done",
      percent: 100,
      timelineNote: "Marked purchased"
    })
  });
  loadState();
}

async function moveBack(id) {
  await apiCall(`/api/entry/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      section: "Items to Purchase",
      status: "Pending",
      percent: 0,
      timelineNote: "Moved back"
    })
  });
  loadState();
}

/* ---------- Timeline / Entries ---------- */
function renderTimeline() {
  timelineWrap.innerHTML = "";
  const events = [];

  for (const e of state.entries)
    for (const t of e.timeline)
      events.push({ ts: t.ts, note: `${e.section} — ${e.title}: ${t.note}` });

  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  events.forEach(ev => {
    timelineWrap.insertAdjacentHTML("beforeend", `
      <div class="timelineItem">
        <div class="time">${new Date(ev.ts).toLocaleString()}</div>
        <div>${ev.note}</div>
      </div>
    `);
  });
}

function renderEntries() {
  entriesWrap.innerHTML = "";
  [...state.entries].reverse().forEach(e => {
    entriesWrap.insertAdjacentHTML("beforeend", `
      <div class="entryListItem">
        <strong>${e.title}</strong>
        <div class="small">${e.section} • ${e.assignee}</div>
        <div>${e.description}</div>
        <div class="small">₹${e.amount}</div>
      </div>
    `);
  });
}

/* ---------- START ---------- */
loadState();
