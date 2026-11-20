const $ = (id) => document.getElementById(id);
const app = $("app"), list = $("list"), empty = $("empty");
const search = $("search"), titleEl = $("title"), bodyEl = $("body");
const fields = $("fields"), placeholder = $("placeholder");
const statusEl = $("status"), dateEl = $("date"), pinBtn = $("pinBtn");

let notes = [];
let current = null;      // note being edited
let saveTimer = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(res.status);
  return res.status === 204 ? null : res.json();
}

function fmtDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function render() {
  list.innerHTML = "";
  empty.hidden = notes.length > 0;
  for (const n of notes) {
    const li = document.createElement("li");
    if (current && n.id === current.id) li.className = "active";
    const t = document.createElement("div");
    t.className = "t";
    if (n.pinned) {
      const p = document.createElement("span");
      p.className = "pin"; p.textContent = "●";
      t.append(p);
    }
    t.append(n.title || firstLine(n.body) || "New note");
    const m = document.createElement("div");
    m.className = "m";
    m.textContent = `${fmtDate(n.updated_at)}  ${preview(n)}`;
    li.append(t, m);
    li.onclick = () => open(n);
    list.append(li);
  }
}

const firstLine = (s) => s.trim().split("\n")[0].slice(0, 80);
const preview = (n) => (n.title ? firstLine(n.body) : n.body.trim().split("\n")[1] || "") || "No additional text";

async function load() {
  try {
    notes = await api(`/api/notes?q=${encodeURIComponent(search.value)}`);
    statusEl.textContent = "";
  } catch {
    statusEl.textContent = "Offline";
  }
  render();
}

function open(n) {
  flush();
  current = n;
  titleEl.value = n.title;
  bodyEl.value = n.body;
  dateEl.textContent = new Date(n.created_at).toLocaleString([], { dateStyle: "long", timeStyle: "short" });
  pinBtn.classList.toggle("on", n.pinned);
  fields.hidden = false;
  placeholder.hidden = true;
  app.classList.add("editing", "has-note");
  render();
}

function close() {
  flush();
  current = null;
  fields.hidden = true;
  placeholder.hidden = false;
  app.classList.remove("editing", "has-note");
  render();
}

function scheduleSave() {
  if (!current) return;
  statusEl.textContent = "Editing…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}

function flush() {
  if (saveTimer) { clearTimeout(saveTimer); save(); }
}

async function save() {
  saveTimer = null;
  if (!current) return;
  const note = current;
  try {
    const updated = await api(`/api/notes/${note.id}`, {
      method: "PUT",
      body: { title: note.title, body: note.body, pinned: note.pinned },
    });
    // Keep local edits made while the request was in flight.
    note.updated_at = updated.updated_at;
    statusEl.textContent = "Saved";
    notes.sort((a, b) => (b.pinned - a.pinned) || b.updated_at.localeCompare(a.updated_at));
    render();
  } catch {
    statusEl.textContent = "Couldn't save — check connection";
  }
}

titleEl.addEventListener("input", () => { if (current) current.title = titleEl.value; scheduleSave(); });
bodyEl.addEventListener("input", () => { if (current) current.body = bodyEl.value; scheduleSave(); });
titleEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); bodyEl.focus(); } });

$("newBtn").onclick = async () => {
  search.value = "";
  flush();
  current = null;           // stop typing from landing in the previous note
  titleEl.value = bodyEl.value = "";
  const n = await api("/api/notes", { method: "POST", body: {} });
  // Carry over anything typed while the note was being created.
  const typedTitle = titleEl.value, typedBody = bodyEl.value;
  n.title = typedTitle; n.body = typedBody;
  notes.unshift(n);
  notes.sort((a, b) => (b.pinned - a.pinned) || b.updated_at.localeCompare(a.updated_at));
  open(n);
  if (typedTitle || typedBody) scheduleSave(); else titleEl.focus();
};

$("backBtn").onclick = close;

pinBtn.onclick = () => {
  if (!current) return;
  current.pinned = !current.pinned;
  pinBtn.classList.toggle("on", current.pinned);
  clearTimeout(saveTimer);
  save();
};

$("deleteBtn").onclick = async () => {
  if (!current || !confirm("Delete this note?")) return;
  clearTimeout(saveTimer); saveTimer = null;
  await api(`/api/notes/${current.id}`, { method: "DELETE" });
  notes = notes.filter((n) => n.id !== current.id);
  current = null;
  close();
};

let searchTimer;
search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 200); });

// Cmd+N on an iPad keyboard creates a note.
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") { e.preventDefault(); $("newBtn").click(); }
});

// Save when the app is backgrounded.
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

load();
