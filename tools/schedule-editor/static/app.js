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

// navigator.clipboard requires a secure context (https, or http://localhost) —
// this tool is normally opened over a plain http://<lan-ip> URL, where that
// API doesn't exist at all. Fall back to a hidden-textarea + execCommand,
// which works regardless.
async function copyToClipboard(text) {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = true; });
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
    if (btn.dataset.tab === "drills") refreshDrillList();
  });
});

// --- sessions tab ---

let drillsCache = [];
let categoryTitleByCode = {};
let editingOriginalDate = null; // null = creating new or duplicating
let loadedSession = null; // full session object last fetched, null for a brand-new session

async function loadDrillsCache() {
  const [{ data: drillsData }, { data: catData }] = await Promise.all([
    api("GET", "/api/drills"),
    api("GET", "/api/categories"),
  ]);
  drillsCache = drillsData.drills;
  categoryTitleByCode = {};
  for (const c of catData.categories) categoryTitleByCode[c.code] = c.title_zh;
}

async function refreshSessionList() {
  const { data } = await api("GET", "/api/sessions");
  const tbody = document.getElementById("session-list");
  tbody.innerHTML = "";
  for (const s of data.sessions) {
    const tr = document.createElement("tr");

    const dateTd = document.createElement("td");
    dateTd.textContent = s.date;

    const labelTd = document.createElement("td");
    labelTd.textContent = s.label;

    const editTd = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "編輯";
    editBtn.addEventListener("click", () => openSessionForm(s.date, { duplicate: false }));
    editTd.appendChild(editBtn);

    const dupTd = document.createElement("td");
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.textContent = "複製";
    dupBtn.addEventListener("click", () => openSessionForm(s.date, { duplicate: true }));
    dupTd.appendChild(dupBtn);

    tr.appendChild(dateTd);
    tr.appendChild(labelTd);
    tr.appendChild(editTd);
    tr.appendChild(dupTd);
    tbody.appendChild(tr);
  }
  return data.sessions.map((s) => s.date);
}

function blockRowElement(block) {
  const li = document.createElement("li");
  li.dataset.role = "block-row";

  const select = document.createElement("select");
  const byCategory = {};
  for (const d of drillsCache) {
    (byCategory[d.category_code] = byCategory[d.category_code] || []).push(d);
  }
  for (const code of Object.keys(byCategory)) {
    const group = document.createElement("optgroup");
    group.label = `${code} ${categoryTitleByCode[code] || ""}`;
    for (const d of byCategory[code]) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.hint ? `#${d.id} ${d.title_zh} — ${d.hint}` : `#${d.id} ${d.title_zh}`;
      if (block && block.drill_id === d.id) opt.selected = true;
      group.appendChild(opt);
    }
    select.appendChild(group);
  }

  const duration = document.createElement("input");
  duration.type = "number";
  duration.min = "1";
  duration.value = block ? (parseInt(block.duration, 10) || 20) : 20;
  const unit = document.createElement("span");
  unit.textContent = "分鐘";

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
  li.appendChild(unit);
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
    return { drill_id: Number(select.value), duration: `${input.value} 分鐘` };
  });
}

async function openSessionForm(date, { duplicate }) {
  await loadDrillsCache();
  const existingDates = await refreshSessionList();
  const form = document.getElementById("session-form");
  form.hidden = false;
  document.getElementById("f-blocks").innerHTML = "";
  document.getElementById("session-form-status").textContent = "";

  if (date) {
    const { data: session } = await api("GET", `/api/sessions/${date}`);
    document.getElementById("f-date").value = duplicate ? defaultNextSessionDate(existingDates) : session.date;
    document.getElementById("f-label").value = session.label;
    document.getElementById("f-warmup-duration").value = (session.warmup && session.warmup.duration) || "";
    document.getElementById("f-warmup-note").value = (session.warmup && session.warmup.note) || "";
    document.getElementById("f-rotation-note").value = session.rotation_note || "";
    for (const b of session.blocks) addBlockRow(b);
    editingOriginalDate = duplicate ? null : date;
    loadedSession = session;
    document.getElementById("session-form-title").textContent = duplicate ? "複製成新的一天" : `編輯 ${session.label}`;
    document.getElementById("delete-session-btn").hidden = duplicate;
  } else {
    document.getElementById("f-date").value = defaultNextSessionDate(existingDates);
    document.getElementById("f-label").value = "";
    document.getElementById("f-warmup-duration").value = "";
    document.getElementById("f-warmup-note").value = "";
    document.getElementById("f-rotation-note").value = "";
    editingOriginalDate = null;
    loadedSession = null;
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
  hideCommitArea();
});

async function submitSession(force) {
  const session = buildSessionPayload(loadedSession, {
    date: document.getElementById("f-date").value,
    label: document.getElementById("f-label").value,
    warmupDuration: document.getElementById("f-warmup-duration").value,
    warmupNote: document.getElementById("f-warmup-note").value,
    rotationNote: document.getElementById("f-rotation-note").value,
    blocks: readBlocksFromForm(),
  });
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
  hideCommitArea();
}

document.getElementById("session-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitSession(false);
});

refreshSessionList();

// --- drills tab ---

const DRILLPLOT_URL = "https://maikuru.github.io/drillplot/";
let drillPendingId = null; // the id a create/duplicate flow will save to
let diagramConfirmed = false;
let editingDrillId = null; // non-null = editing this existing drill (PUT), null = create/duplicate (POST)

async function refreshCategories(selectCode) {
  const { data } = await api("GET", "/api/categories");
  const select = document.getElementById("d-category");
  select.innerHTML = "";
  for (const c of data.categories) {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = `${c.code} ${c.title_zh}`;
    select.appendChild(opt);
  }
  const newOpt = document.createElement("option");
  newOpt.value = "__new__";
  newOpt.textContent = "+ 新增分類";
  select.appendChild(newOpt);
  if (selectCode) select.value = selectCode;
  return data.categories;
}

document.getElementById("d-category").addEventListener("change", (e) => {
  document.getElementById("d-new-category").hidden = e.target.value !== "__new__";
});

document.getElementById("d-cat-create-btn").addEventListener("click", async () => {
  const code = document.getElementById("d-cat-code").value;
  const { status, data } = await api("POST", "/api/categories", {
    code,
    title_zh: document.getElementById("d-cat-title-zh").value,
    title_en: document.getElementById("d-cat-title-en").value,
    focus: document.getElementById("d-cat-focus").value,
  });
  if (status !== 200) {
    document.getElementById("d-status").textContent = `新增分類失敗：${JSON.stringify(data)}`;
    return;
  }
  await refreshCategories(code);
  document.getElementById("d-new-category").hidden = true;
});

function addDynamicListItem(containerId, value) {
  const li = document.createElement("li");
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "刪除";
  del.addEventListener("click", () => li.remove());
  li.appendChild(input);
  li.appendChild(del);
  document.getElementById(containerId).appendChild(li);
}

document.getElementById("d-add-method-btn").addEventListener("click", () => addDynamicListItem("d-method"));
document.getElementById("d-add-point-btn").addEventListener("click", () => addDynamicListItem("d-points"));

function readDynamicList(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input`)).map((i) => i.value).filter((v) => v);
}

async function refreshDrillList() {
  const { data } = await api("GET", "/api/drills");
  const { data: catData } = await api("GET", "/api/categories");
  const titleByCode = {};
  for (const c of catData.categories) titleByCode[c.code] = c.title_zh;

  const tbody = document.getElementById("drill-list");
  tbody.innerHTML = "";
  for (const d of data.drills) {
    const tr = document.createElement("tr");

    const catTd = document.createElement("td");
    catTd.textContent = titleByCode[d.category_code] || d.category_code;

    const nameTd = document.createElement("td");
    nameTd.textContent = `#${d.id} ${d.title_zh}`;

    const editTd = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "編輯";
    editBtn.addEventListener("click", () => openDrillForm(d.id, { duplicate: false }));
    editTd.appendChild(editBtn);

    const dupTd = document.createElement("td");
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.textContent = "複製";
    dupBtn.addEventListener("click", () => openDrillForm(d.id, { duplicate: true }));
    dupTd.appendChild(dupBtn);

    tr.appendChild(catTd);
    tr.appendChild(nameTd);
    tr.appendChild(editTd);
    tr.appendChild(dupTd);
    tbody.appendChild(tr);
  }
}

async function openDrillForm(sourceId, { duplicate }) {
  await refreshDrillList();
  const form = document.getElementById("drill-form");
  form.hidden = false;
  document.getElementById("d-status").textContent = "";
  document.getElementById("d-method").innerHTML = "";
  document.getElementById("d-points").innerHTML = "";

  const editing = sourceId && !duplicate;
  editingDrillId = editing ? sourceId : null;

  document.getElementById("d-diagram-section").hidden = editing;
  document.getElementById("d-edit-diagram-note").hidden = !editing;

  let source = null;
  if (sourceId) {
    const { data } = await api("GET", `/api/drills/${sourceId}`);
    source = data;
  }

  await refreshCategories(source ? source.category_code : undefined);

  document.getElementById("d-title-zh").value = source ? source.title_zh : "";
  document.getElementById("d-title-en").value = source ? source.title_en : "";
  for (const m of (source ? source.method : [])) addDynamicListItem("d-method", m);
  for (const p of (source ? source.points : [])) addDynamicListItem("d-points", p);

  if (editing) {
    document.getElementById("drill-form-title").textContent = `編輯 #${sourceId} ${source.title_zh}`;
    document.getElementById("d-id-label").innerHTML = `id：<b>#${sourceId}</b>（不可變更）`;
    document.getElementById("d-save-btn").disabled = false;
  } else {
    document.getElementById("drill-form-title").textContent = duplicate ? `複製 #${sourceId} 建立新項目` : "新增訓練項目";
    await refreshNextId();
  }
}

document.getElementById("new-drill-btn").addEventListener("click", () => openDrillForm(null, { duplicate: false }));
document.getElementById("d-cancel-btn").addEventListener("click", () => {
  document.getElementById("drill-form").hidden = true;
});

async function refreshNextId() {
  const { data } = await api("GET", "/api/drills/next-id");
  drillPendingId = data.next_id;
  document.getElementById("d-id-label").innerHTML = `將配發 id：<b>#${drillPendingId}</b>`;
  diagramConfirmed = false;
  document.getElementById("d-diagram-status").textContent = "尚未檢查";
  document.getElementById("d-save-btn").disabled = true;
}

document.getElementById("d-open-drillplot-btn").addEventListener("click", async () => {
  const res = await fetch("/api/console-bridge-script");
  const script = await res.text();
  const ok = await copyToClipboard(script);
  window.open(DRILLPLOT_URL, "_blank");
  document.getElementById("d-status").textContent = ok
    ? "連動腳本已複製，貼到 drillplot 頁面的 DevTools Console"
    : "複製失敗——改用 GET /api/console-bridge-script 自己複製內容貼上";
});

document.getElementById("d-check-diagram-btn").addEventListener("click", async () => {
  const { data } = await api("GET", `/api/diagram/exists?drill_id=${drillPendingId}`);
  diagramConfirmed = data.exists;
  document.getElementById("d-diagram-status").textContent = data.exists
    ? `✅ 已找到 drill-${String(drillPendingId).padStart(2, "0")}.svg`
    : "❌ 還沒畫好";
  document.getElementById("d-save-btn").disabled = !data.exists;
});

document.getElementById("d-save-btn").addEventListener("click", async () => {
  const categoryCode = document.getElementById("d-category").value;
  const payload = {
    category_code: categoryCode,
    title_zh: document.getElementById("d-title-zh").value,
    title_en: document.getElementById("d-title-en").value,
    method: readDynamicList("d-method"),
    points: readDynamicList("d-points"),
  };
  const statusEl = document.getElementById("d-status");

  if (editingDrillId) {
    const { status, data } = await api("PUT", `/api/drills/${editingDrillId}`, payload);
    if (status !== 200) {
      statusEl.textContent = `存檔失敗：${JSON.stringify(data)}`;
      statusEl.className = "status-err";
      return;
    }
    statusEl.textContent = `已存檔（#${editingDrillId}）`;
  } else {
    if (!diagramConfirmed) return;
    const { status, data } = await api("POST", "/api/drills", payload);
    if (status !== 200) {
      statusEl.textContent = `存檔失敗：${JSON.stringify(data)}`;
      statusEl.className = "status-err";
      return;
    }
    statusEl.textContent = `已存檔（#${data.id}）`;
  }
  statusEl.className = "status-ok";
  document.getElementById("drill-form").hidden = true;
  refreshDrillList();
  hideCommitArea();
});

// --- action bar (test build / diff / commit & push) ---

function hideCommitArea() {
  document.getElementById("ab-commit-area").hidden = true;
}

document.getElementById("ab-build-btn").addEventListener("click", async () => {
  const { data } = await api("POST", "/api/build");
  const out = document.getElementById("ab-build-output");
  out.hidden = false;
  out.textContent = data.output;
  const status = document.getElementById("ab-status");
  if (data.ok) {
    status.textContent = "✅ build 成功";
    status.className = "status-ok";
    const { data: msg } = await api("GET", "/api/commit/suggested-message");
    document.getElementById("ab-commit-message").value = msg.message;
    document.getElementById("ab-commit-area").hidden = false;
  } else {
    status.textContent = "❌ build 失敗";
    status.className = "status-err";
    hideCommitArea();
  }
});

document.getElementById("ab-diff-btn").addEventListener("click", async () => {
  const { data } = await api("GET", "/api/diff");
  const out = document.getElementById("ab-diff-output");
  out.hidden = false;
  out.textContent = `${data.stat}\n${data.diff}`;
});

document.getElementById("ab-commit-push-btn").addEventListener("click", async () => {
  const status = document.getElementById("ab-status");
  const message = document.getElementById("ab-commit-message").value;
  const commitRes = await api("POST", "/api/commit", { message });
  if (commitRes.status !== 200) {
    status.textContent = `Commit 失敗：${JSON.stringify(commitRes.data)}`;
    status.className = "status-err";
    if (commitRes.status === 409) hideCommitArea();
    return;
  }
  const pushRes = await api("POST", "/api/push");
  if (pushRes.status !== 200) {
    status.textContent = `已 commit（${commitRes.data.commit}），但 push 失敗：${JSON.stringify(pushRes.data)}`;
    status.className = "status-err";
    return;
  }
  status.textContent = `已 commit 並 push（${commitRes.data.commit}）`;
  status.className = "status-ok";
  hideCommitArea();
});
