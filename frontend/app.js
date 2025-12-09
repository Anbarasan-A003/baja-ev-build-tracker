// app.js - Final Secure + Stable Version

const apiCall = (path, opts = {}) =>
  fetch(path, opts).then(async r => {
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) return r.json();
    return r;
  });

/* DOM references */
const userBox = document.getElementById("userBox");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const loginModal = document.getElementById("loginModal");
const doLoginBtn = document.getElementById("doLogin");
const closeLoginBtn = document.getElementById("closeLogin");

const sectionEl = document.getElementById("section");
const titleEl = document.getElementById("title");
const descEl = document.getElementById("description");
const assigneeEl = document.getElementById("assignee");
const statusEl = document.getElementById("status");
const percentEl = document.getElementById("percent");
const amountEl = document.getElementById("amount");
const imagesEl = document.getElementById("images");

const addBtn = document.getElementById("addBtn");
const exportBtn = document.getElementById("exportBtn");
const refreshBtn = document.getElementById("refreshBtn");

const workTracking = document.getElementById("workTracking");
const costSummaryContainer = document.getElementById("costSummaryContainer");
const timelineWrap = document.getElementById("timeline");
const entriesWrap = document.getElementById("entries");

let pmToBuy = document.getElementById("pmToBuy");
let pmPurchased = document.getElementById("pmPurchased");

let state = { entries: [] };
let currentUser = null;
let editingId = null;

/* ---------------- AUTH ---------------- */
async function whoami() {
  try {
    const resp = await apiCall("/api/whoami");
    currentUser = resp.user || null;
  } catch {
    currentUser = null;
  }
  updateAuthUI();
}

function updateAuthUI() {
  if (currentUser) {
    userBox.textContent = `${currentUser.name} (${currentUser.role})`;
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
  } else {
    userBox.textContent = "Not signed in";
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
  }
}

loginBtn.addEventListener("click", () => {
  loginModal.style.display = "flex";
});

closeLoginBtn.addEventListener("click", () => {
  loginModal.style.display = "none";
});

doLoginBtn.addEventListener("click", async () => {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!username || !password) return alert("Enter username & password");

  const res = await apiCall("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (res.ok) {
    currentUser = res.user;
    loginModal.style.display = "none";
    loadState();
  } else {
    alert("Login failed");
  }
});

logoutBtn.addEventListener("click", async () => {
  await apiCall("/api/logout", { method: "POST" }).catch(() => {});
  currentUser = null;
  updateAuthUI();
  state = { entries: [] };
  renderAll();
});

/* ---------------- LOAD STATE ---------------- */
async function loadState() {
  if (!currentUser) return;

  try {
    state = await apiCall("/api/state");
  } catch {
    state = { entries: [] };
  }

  renderAll();
}

/* ---------------- UPLOAD FILES ---------------- */
async function uploadFiles(list) {
  const urls = [];
  if (!list || !list.length) return urls;

  for (const f of list) {
    const fd = new FormData();
    fd.append("image", f);

    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (j.ok && j.url) urls.push(j.url);
    } catch {}
  }
  return urls;
}

/* ---------------- ADD / UPDATE ENTRY ---------------- */
async function submitForm() {
  if (!currentUser) return alert("Login required");
  if (!titleEl.value.trim()) return alert("Title required");

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
    await apiCall("/api/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  clearForm();
  loadState();
}

addBtn.addEventListener("click", submitForm);

function clearForm() {
  sectionEl.selectedIndex = 0;
  titleEl.value = "";
  descEl.value = "";
  assigneeEl.value = "";
  statusEl.selectedIndex = 0;
  percentEl.value = 0;
  amountEl.value = 0;
  imagesEl.value = "";
}

/* ---------------- RENDER EVERYTHING ---------------- */
function renderAll() {
  updateAuthUI();

  if (!currentUser) {
    entriesWrap.innerHTML = "<div class='small'>Login to see data</div>";
    workTracking.innerHTML = "";
    costSummaryContainer.innerHTML = "";
    timelineWrap.innerHTML = "";
    pmToBuy.innerHTML = "";
    pmPurchased.innerHTML = "";
    return;
  }

  renderWorkTracking();
  renderCostSummary();
  renderTimeline();
  renderEntries();
  renderPurchaseManager();
}

/* ---------------- WORK TRACKING ---------------- */
function renderWorkTracking() {
  workTracking.innerHTML = "";

  const agg = {};

  for (const e of state.entries) {
    if (["Items to Purchase", "Purchased Items"].includes(e.section)) continue;

    const s = e.section;
    if (!agg[s]) agg[s] = { count: 0, done: 0, totalPercent: 0 };

    agg[s].count++;
    agg[s].totalPercent += e.percent;
    if (e.status === "Done") agg[s].done++;
  }

  for (const sys in agg) {
    const v = agg[sys];
    const avg = Math.round(v.totalPercent / v.count);

    const div = document.createElement("div");
    div.innerHTML = `
      <strong>${sys}</strong>
      <div class="small">Items: ${v.count} • Done: ${v.done}</div>
      <div class="progressOuter"><div class="progressInner" style="width:${avg}%"></div></div>
      <div class="small">${avg}% completed</div>
    `;
    workTracking.appendChild(div);
  }
}

/* ---------------- COST SUMMARY ---------------- */
function renderCostSummary() {
  const toBuy = state.entries.filter(e => e.section === "Items to Purchase");
  const purchased = state.entries.filter(e => e.section === "Purchased Items");

  const amtToBuy = toBuy.reduce((s, x) => s + Number(x.amount), 0);
  const amtPurchased = purchased.reduce((s, x) => s + Number(x.amount), 0);

  costSummaryContainer.innerHTML = `
    <strong>Cost Summary</strong>
    <div class="small">Items to Buy: ${toBuy.length}</div>
    <div class="small">Purchased Items: ${purchased.length}</div>
    <div class="small">Amount To Buy: ₹${amtToBuy.toFixed(2)}</div>
    <div class="small">Amount Purchased: ₹${amtPurchased.toFixed(2)}</div>
    <div class="small">Total Spent: ₹${amtPurchased.toFixed(2)}</div>
  `;
}

/* ---------------- TIMELINE ---------------- */
function renderTimeline() {
  timelineWrap.innerHTML = "";
  const events = [];

  for (const e of state.entries)
    for (const t of e.timeline || [])
      events.push({
        ts: t.ts,
        note: `${e.section} — ${e.title}: ${t.note}`
      });

  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  if (!events.length) {
    timelineWrap.innerHTML = "<div class='small'>No timeline events.</div>";
    return;
  }

  for (const ev of events) {
    const d = document.createElement("div");
    d.className = "timelineItem";
    d.innerHTML = `
      <div class="time">${new Date(ev.ts).toLocaleString()}</div>
      <div>${ev.note}</div>
    `;
    timelineWrap.appendChild(d);
  }
}

/* ---------------- ENTRIES LIST ---------------- */
function renderEntries() {
  entriesWrap.innerHTML = "";

  if (!state.entries.length) {
    entriesWrap.innerHTML = "<div class='small'>No entries yet.</div>";
    return;
  }

  [...state.entries].reverse().forEach(e => {
    const div = document.createElement("div");
    div.className = "entry";
    div.innerHTML = `
      <div>
        <strong>${e.title}</strong>
        <div class="small">${e.section} • ${e.assignee}</div>
        <div class="small">${new Date(e.createdAt).toLocaleString()}</div>
        <div class="small">${e.description}</div>
        <div class="small">₹${e.amount.toFixed(2)}</div>

        <div>${(e.images || [])
          .map(u => `<img class="thumb" src="${u}">`)
          .join("")}</div>

        <div class="progressOuter">
          <div class="progressInner" style="width:${e.percent}%"></div>
        </div>
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
  if (
    !currentUser ||
    !(
      currentUser.role === "captain" ||
      currentUser.username === e.assignee ||
      currentUser.role === "mechanical" ||
      currentUser.role === "electrical"
    )
  )
    return "";

  return `
    <button onclick="selectForEdit(${e.id})">Update</button>
    <button onclick="deleteEntry(${e.id})">Delete</button>
  `;
}

async function deleteEntry(id) {
  if (!confirm("Delete this entry?")) return;
  await apiCall(`/api/entry/${id}`, { method: "DELETE" });
  loadState();
}

/* ---------------- PURCHASE MANAGER ---------------- */
function renderPurchaseManager() {
  pmToBuy.innerHTML = "";
  pmPurchased.innerHTML = "";

  const toBuy = state.entries.filter(e => e.section === "Items to Purchase");
  const purchased = state.entries.filter(e => e.section === "Purchased Items");

  toBuy.forEach(item => {
    pmToBuy.insertAdjacentHTML(
      "beforeend",
      `
      <div class="pmItem">
        <div class="pmLeft">
          <div class="pmTitle">${escapeHtml(item.title)}</div>
          <div class="small">${escapeHtml(item.description || "")}</div>
          <div class="pmAmount">₹${item.amount.toFixed(2)}</div>
        </div>

        <div class="pmBtns">
          <button data-act="edit" data-id="${item.id}">Edit</button>
          <button data-act="mark" data-id="${item.id}">Mark Purchased</button>
        </div>
      </div>
    `
    );
  });

  purchased.forEach(item => {
    pmPurchased.insertAdjacentHTML(
      "beforeend",
      `
      <div class="pmItem">
        <div class="pmLeft">
          <div class="pmTitle">${escapeHtml(item.title)}</div>
          <div class="small">${escapeHtml(item.description || "")}</div>
          <div class="pmAmount">₹${item.amount.toFixed(2)}</div>
        </div>

        <div class="pmBtns">
          <button data-act="edit" data-id="${item.id}">Edit</button>
          <button data-act="back" data-id="${item.id}">Move to To-Buy</button>
        </div>
      </div>
    `
    );
  });

  pmToBuy.onclick = e => handlePMClick(e, "toBuy");
  pmPurchased.onclick = e => handlePMClick(e, "purchased");
}

async function handlePMClick(evt) {
  const btn = evt.target.closest("button");
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const act = btn.dataset.act;

  if (act === "mark") {
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
  }

  if (act === "back") {
    await apiCall(`/api/entry/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "Items to Purchase",
        status: "Pending",
        percent: 0,
        timelineNote: "Moved back to To-Buy"
      })
    });
  }

  if (act === "edit") {
    selectForEdit(id);
  }

  loadState();
}

/* ---------------- EDIT ENTRY ---------------- */
function selectForEdit(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return alert("Entry not found");

  sectionEl.value = e.section;
  titleEl.value = e.title;
  descEl.value = e.description;
  assigneeEl.value = e.assignee;
  statusEl.value = e.status;
  percentEl.value = e.percent;
  amountEl.value = e.amount;

  editingId = id;
  addBtn.textContent = "Update Entry";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- EXPORT / REFRESH ---------------- */
exportBtn.addEventListener("click", () => {
  if (!currentUser) return alert("Login required");
  window.location = "/api/export";
});

refreshBtn.addEventListener("click", () => {
  if (!currentUser) return alert("Login required");
  loadState();
});

/* ---------------- HELPERS ---------------- */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------------- START ---------------- */
whoami().then(() => {
  if (currentUser) loadState();
});
