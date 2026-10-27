// Kanban Board — tareas con arrastrar/soltar y guardado en localStorage.

const STORE_KEY = "kanban.tasks.v1";
const COLS = ["todo", "doing", "done"];
const PRIO_LABEL = { high: "Alta", med: "Media", low: "Baja" };

let tasks = load();

const els = {
  title: document.getElementById("newTitle"),
  prio: document.getElementById("newPriority"),
  col: document.getElementById("newColumn"),
  add: document.getElementById("addBtn"),
  counter: document.getElementById("counter"),
  clearDone: document.getElementById("clearDone"),
  tpl: document.getElementById("cardTpl")
};

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  // Semillas de ejemplo la primera vez
  return [
    { id: uid(), text: "Diseñar la landing", prio: "high", col: "todo" },
    { id: uid(), text: "Reunión con el equipo", prio: "med", col: "todo" },
    { id: uid(), text: "Montar el entorno de pruebas", prio: "med", col: "doing" },
    { id: uid(), text: "Configurar el repositorio", prio: "low", col: "done" }
  ];
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(tasks)); } catch (e) {}
}

function uid() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addTask() {
  const text = els.title.value.trim();
  if (!text) { els.title.focus(); return; }
  tasks.push({ id: uid(), text, prio: els.prio.value, col: els.col.value });
  els.title.value = "";
  els.title.focus();
  save();
  render();
}

function removeTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  save();
  render();
}

function moveTask(id, col) {
  const t = tasks.find(x => x.id === id);
  if (t && t.col !== col) { t.col = col; save(); render(); }
}

function makeCard(t) {
  const node = els.tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = t.id;
  node.classList.add("p-" + t.prio);
  if (t.col === "done") node.classList.add("p-done");
  node.querySelector(".card-text").textContent = t.text;
  const badge = node.querySelector(".badge");
  badge.textContent = PRIO_LABEL[t.prio];
  badge.classList.add(t.prio);
  node.querySelector(".del").addEventListener("click", () => removeTask(t.id));

  // Drag
  node.addEventListener("dragstart", e => {
    node.classList.add("dragging");
    e.dataTransfer.setData("text/plain", t.id);
    e.dataTransfer.effectAllowed = "move";
  });
  node.addEventListener("dragend", () => node.classList.remove("dragging"));
  return node;
}

function render() {
  COLS.forEach(col => {
    const body = document.querySelector(`[data-dropzone="${col}"]`);
    body.innerHTML = "";
    const items = tasks.filter(t => t.col === col);
    if (items.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "Sin tareas";
      body.appendChild(hint);
    } else {
      items.forEach(t => body.appendChild(makeCard(t)));
    }
    document.querySelector(`[data-count="${col}"]`).textContent = items.length;
  });
  els.counter.textContent = tasks.length + (tasks.length === 1 ? " tarea" : " tareas");
}

// Zonas de drop
document.querySelectorAll("[data-dropzone]").forEach(zone => {
  zone.addEventListener("dragover", e => {
    e.preventDefault();
    zone.classList.add("drag-over");
    e.dataTransfer.dropEffect = "move";
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    moveTask(id, zone.dataset.dropzone);
  });
});

els.add.addEventListener("click", addTask);
els.title.addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });
els.clearDone.addEventListener("click", () => {
  tasks = tasks.filter(t => t.col !== "done");
  save();
  render();
});

render();
