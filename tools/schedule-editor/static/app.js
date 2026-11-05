// --- shared ---

async function api(method, path, body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* no JSON body */ }
  return { status: res.status, ok: res.ok, data };
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = true; });
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
  });
});

// --- sessions tab ---

let drillsCache = [];
let editingOriginalDate = null; // null = creating new or duplicating

async function loadDrillsCache() {
  const { data } = await api("GET", "/api/drills");
  drillsCache = data.drills;
}

async function refreshSessionList() {
  const { data } = await api("GET", "/api/sessions");
  const list = document.getElementById("session-list");
  list.innerHTML = "";
  for (const s of data.sessions) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = `${s.label}（${s.date}）`;
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "編輯";
    editBtn.addEventListener("click", () => openSessionForm(s.date, { duplicate: false }));
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.textContent = "複製成新的一天";
    dupBtn.addEventListener("click", () => openSessionForm(s.date, { duplicate: true }));
    li.appendChild(span);
    li.appendChild(editBtn);
    li.appendChild(dupBtn);
    list.appendChild(li);
  }
}

function blockRowElement(block) {
  const li = document.createElement("li");
  li.dataset.role = "block-row";

  const select = document.createElement("select");
  for (const d of drillsCache) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `#${d.id} ${d.title_zh}`;
    if (block && block.drill_id === d.id) opt.selected = true;
    select.appendChild(opt);
  }

  const duration = document.createElement("input");
  duration.type = "text";
  duration.placeholder = "時長，例：20 分鐘";
  duration.value = block ? block.duration : "";

  const up = document.createElement("button");
  up.type = "button";
  up.textContent = "↑";
  up.addEventListener("click", () => {
    if (li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
  });

  const down = document.createElement("button");
  down.type = "button";
  down.textContent = "↓";
  down.addEventListener("click", () => {
    if (li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
  });

  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "刪除";
  del.addEventListener("click", () => li.remove());

  li.appendChild(select);
  li.appendChild(duration);
  li.appendChild(up);
  li.appendChild(down);
  li.appendChild(del);
  return li;
}

function addBlockRow(block) {
  document.getElementById("f-blocks").appendChild(blockRowElement(block));
}

document.getElementById("add-block-btn").addEventListener("click", () => addBlockRow(null));

function readBlocksFromForm() {
  return Array.from(document.querySelectorAll('#f-blocks li[data-role="block-row"]')).map((li) => {
    const select = li.querySelector("select");
    const input = li.querySelector("input");
    return { drill_id: Number(select.value), duration: input.value };
  });
}

async function openSessionForm(date, { duplicate }) {
  await loadDrillsCache();
  const form = document.getElementById("session-form");
  form.hidden = false;
  document.getElementById("f-blocks").innerHTML = "";
  document.getElementById("session-form-status").textContent = "";

  if (date) {
    const { data: session } = await api("GET", `/api/sessions/${date}`);
    document.getElementById("f-date").value = duplicate ? "" : session.date;
    document.getElementById("f-label").value = session.label;
    document.getElementById("f-warmup-duration").value = (session.warmup && session.warmup.duration) || "";
    document.getElementById("f-warmup-note").value = (session.warmup && session.warmup.note) || "";
    document.getElementById("f-rotation-note").value = session.rotation_note || "";
    for (const b of session.blocks) addBlockRow(b);
    editingOriginalDate = duplicate ? null : date;
    document.getElementById("session-form-title").textContent = duplicate ? "複製成新的一天" : `編輯 ${session.label}`;
    document.getElementById("delete-session-btn").hidden = duplicate;
  } else {
    document.getElementById("f-date").value = "";
    document.getElementById("f-label").value = "";
    document.getElementById("f-warmup-duration").value = "";
    document.getElementById("f-warmup-note").value = "";
    document.getElementById("f-rotation-note").value = "";
    editingOriginalDate = null;
    document.getElementById("session-form-title").textContent = "新增一天";
    document.getElementById("delete-session-btn").hidden = true;
  }
}

document.getElementById("new-session-btn").addEventListener("click", () => openSessionForm(null, { duplicate: false }));
document.getElementById("cancel-session-btn").addEventListener("click", () => {
  document.getElementById("session-form").hidden = true;
});

document.getElementById("delete-session-btn").addEventListener("click", async () => {
  if (!editingOriginalDate) return;
  if (!confirm(`確定要刪除 ${editingOriginalDate} 的課表嗎？`)) return;
  await api("DELETE", `/api/sessions/${editingOriginalDate}`);
  document.getElementById("session-form").hidden = true;
  refreshSessionList();
});

async function submitSession(force) {
  const session = {
    date: document.getElementById("f-date").value,
    label: document.getElementById("f-label").value,
    warmup: {
      duration: document.getElementById("f-warmup-duration").value,
      note: document.getElementById("f-warmup-note").value,
    },
    rotation_note: document.getElementById("f-rotation-note").value,
    blocks: readBlocksFromForm(),
  };
  const { status, data } = await api("POST", "/api/sessions", {
    session, original_date: editingOriginalDate, force,
  });
  const statusEl = document.getElementById("session-form-status");
  if (status === 409) {
    if (confirm(`已經有這天的課表（${data.existing.label}），要覆蓋嗎？`)) {
      return submitSession(true);
    }
    statusEl.textContent = "已取消存檔";
    statusEl.className = "status-err";
    return;
  }
  if (status !== 200) {
    statusEl.textContent = `存檔失敗：${JSON.stringify(data)}`;
    statusEl.className = "status-err";
    return;
  }
  statusEl.textContent = "已存檔";
  statusEl.className = "status-ok";
  document.getElementById("session-form").hidden = true;
  refreshSessionList();
}

document.getElementById("session-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitSession(false);
});

refreshSessionList();
