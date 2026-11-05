import {
  BOUNDS,
  LIMITS,
  PATH_COLORS,
  arrowGeom,
  ballItems,
  countOffView,
  courtMarkup,
  courtView,
  drawOrder,
  emptySource,
  esc,
  hasShotGap,
  itemMarkup,
  nextShotNumber,
  parseSource,
  parseText,
  renderSvg,
  renumberShots,
  stringifySource,
  viewBox
} from "./chunk-YDA6FYBE.js";

// src/editor/model.ts
var KIND_NAME = {
  pA: "player A",
  pB: "player B",
  pC: "player C",
  pD: "player D",
  pCoach: "the coach",
  machine: "a ball machine",
  cone: "a cone",
  zone: "a target zone",
  mark: "a legend badge"
};
var KINDS = {
  pA: { type: "player", x: 0, y: 0, label: "A", team: "orange" },
  pB: { type: "player", x: 0, y: 0, label: "B", team: "orange" },
  pC: { type: "player", x: 0, y: 0, label: "C", team: "blue" },
  pD: { type: "player", x: 0, y: 0, label: "D", team: "blue" },
  pCoach: { type: "player", x: 0, y: 0, label: "Coach", team: "black" },
  machine: { type: "machine", x: 0, y: 0, angle: 0 },
  cone: { type: "cone", x: 0, y: 0 },
  zone: { type: "zone", x: 0, y: 0, w: 6, h: 4, label: "" },
  mark: { type: "mark", x: 0, y: 0, key: "1" }
};
function nextKey(source) {
  const used = /* @__PURE__ */ new Set();
  for (const it of source.items) {
    if (it.type === "ball") used.add(String(it.n));
    else if (it.key) used.add(it.key);
  }
  for (const e of source.legend ?? []) if (e.key) used.add(e.key);
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}
function metaOf(source) {
  const m = { title: source.title, caption: source.caption, view: source.view, side: source.side, orient: source.orient };
  if (source.showCaption) m.showCaption = true;
  if (source.courts) m.courts = source.courts.map((c) => ({ ...c }));
  if (source.legend) m.legend = source.legend.map((e) => ({ ...e }));
  return m;
}
var round2 = (v) => Math.round(v * 100) / 100;
var clamp = (v, a, b) => Math.min(b, Math.max(a, v));
var snapFt = (v, s = 0.25) => Math.round(v / s) * s;
var clampX = (v) => round2(clamp(snapFt(v), BOUNDS.xMin, BOUNDS.xMax));
var clampY = (v) => round2(clamp(snapFt(v), BOUNDS.yMin, BOUNDS.yMax));
var clone = (v) => JSON.parse(JSON.stringify(v));
var key = (e) => JSON.stringify(e);
var DrillModel = class {
  meta = { title: "", caption: "", view: "full", side: "bottom", orient: "portrait" };
  items = [];
  undoStack = [];
  redoStack = [];
  nextId = 1;
  /** Called after any change a user made, with the new source. */
  onChange;
  uid() {
    return "i" + this.nextId++;
  }
  byId(id) {
    return id === null ? void 0 : this.items.find((i) => i.id === id);
  }
  /** The court new pieces go on, when the diagram has several. */
  court = 1;
  snap(withMeta = false) {
    return withMeta ? { items: clone(this.items), meta: metaOf(this.meta) } : { items: clone(this.items) };
  }
  /** Records `before` as an undo step if anything changed since. */
  record(before) {
    if (key(before) === key(this.snap(before.meta !== void 0))) return false;
    this.undoStack.push(before);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }
  act(fn) {
    const before = this.snap();
    fn();
    this.record(before);
    this.onChange?.();
  }
  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }
  restore(e) {
    this.items = e.items;
    if (e.meta) this.meta = metaOf(e.meta);
    this.court = Math.min(this.court, this.meta.courts?.length ?? 1);
  }
  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    this.redoStack.push(this.snap(e.meta !== void 0));
    this.restore(e);
    this.onChange?.();
  }
  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    this.undoStack.push(this.snap(e.meta !== void 0));
    this.restore(e);
    this.onChange?.();
  }
  /** Replaces everything with a validated source. Undoable, including title and view. */
  load(source, { undoable }) {
    const before = this.snap(true);
    this.meta = metaOf(source);
    this.items = source.items.map((it) => ({ ...clone(it), id: this.uid() }));
    this.court = 1;
    if (undoable) {
      this.undoStack.push(before);
      this.redoStack = [];
    } else {
      this.undoStack = [];
      this.redoStack = [];
    }
  }
  /** The source, without editor ids. */
  toSource() {
    const items = this.items.map(({ id: _id, ...rest }) => clone(rest));
    return { ...emptySource(), ...metaOf(this.meta), items };
  }
  makeItem(kind, x, y) {
    const it = { ...clone(KINDS[kind]), id: this.uid() };
    if (it.type === "mark") it.key = nextKey({ items: this.items, legend: this.meta.legend });
    if (this.court > 1) it.court = this.court;
    const cx = clampX(x);
    const cy = clampY(y);
    if (it.type === "zone") {
      it.x = round2(clamp(cx - it.w / 2, BOUNDS.xMin, BOUNDS.xMax - it.w));
      it.y = round2(clamp(cy - it.h / 2, BOUNDS.yMin, BOUNDS.yMax - it.h));
    } else if ("x" in it) {
      it.x = cx;
      it.y = cy;
    }
    return it;
  }
  add(kind, x, y) {
    let made;
    this.act(() => {
      made = this.makeItem(kind, x, y);
      this.items.push(made);
    });
    return made;
  }
  /** Where a keyboard user's piece lands: spread across the visible court so they do not stack. */
  defaultSpot() {
    const v = courtView(this.meta.view, this.meta.side);
    const n = this.items.length;
    return { x: 10 + (n % 5 - 2) * 2.5, y: v.y + v.h / 2 + (n % 3 - 1) * 2 };
  }
  delete(id) {
    this.act(() => {
      this.items = this.items.filter((i) => i.id !== id);
    });
  }
  clear() {
    this.act(() => {
      this.items = [];
    });
  }
  /** Moves a piece by a distance in court feet, keeping it inside the bounds. */
  nudge(id, dx, dy) {
    const it = this.byId(id);
    if (!it) return;
    this.act(() => moveBy(it, dx, dy, it));
  }
  /** Adds an arrow (or a plain line) of the given kind with its start and end already set. */
  addArrow(tool, x1, y1, x2, y2) {
    const base = { id: this.uid(), x1: clampX(x1), y1: clampY(y1), x2: clampX(x2), y2: clampY(y2), ...this.court > 1 ? { court: this.court } : {} };
    if (tool === "move") return { type: "move", ...base };
    if (tool === "line") return { type: "line", ...base };
    return { type: "ball", ...base, curve: tool === "drop", bend: 1, n: Math.min(nextShotNumber(this.items), LIMITS.maxShot) };
  }
  /** The items on the court being edited. */
  onCourt() {
    return this.meta.courts ? this.items.filter((it) => (it.court ?? 1) === this.court) : this.items;
  }
  /** Swaps the shot number with the neighbouring shot. */
  shiftShot(id, dir) {
    this.act(() => {
      const bs = ballItems(this.items);
      const i = bs.findIndex((b2) => b2.id === id);
      const j = i + dir;
      const a = bs[i];
      const b = bs[j];
      if (!a || !b) return;
      const t = a.n;
      a.n = b.n;
      b.n = t;
    });
  }
  renumber() {
    this.act(() => renumberShots(this.items));
  }
};
function moveBy(it, dx, dy, from) {
  if ("x" in it && "x" in from) {
    const w = it.type === "zone" ? it.w : 0;
    const h = it.type === "zone" ? it.h : 0;
    it.x = round2(clamp(from.x + dx, BOUNDS.xMin, BOUNDS.xMax - w));
    it.y = round2(clamp(from.y + dy, BOUNDS.yMin, BOUNDS.yMax - h));
  } else if ("x1" in it && "x1" in from) {
    const minX = Math.min(from.x1, from.x2);
    const maxX = Math.max(from.x1, from.x2);
    const minY = Math.min(from.y1, from.y2);
    const maxY = Math.max(from.y1, from.y2);
    const sx = clamp(dx, BOUNDS.xMin - minX, BOUNDS.xMax - maxX);
    const sy = clamp(dy, BOUNDS.yMin - minY, BOUNDS.yMax - maxY);
    it.x1 = round2(from.x1 + sx);
    it.x2 = round2(from.x2 + sx);
    it.y1 = round2(from.y1 + sy);
    it.y2 = round2(from.y2 + sy);
  }
}

// src/editor/style.ts
var COLOR_TOKENS = [
  "font",
  "surface",
  "surface-sunken",
  "surface-raised",
  "border",
  "border-strong",
  "text",
  "text-muted",
  "accent",
  "accent-text",
  "accent-quiet",
  "danger",
  "danger-quiet",
  "focus",
  "stage-bg",
  "select"
];
var TOKENS = [...COLOR_TOKENS, "radius", "touch-target", "stage-height", "side-width"];
var LIGHT = {
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  surface: "#ffffff",
  "surface-sunken": "#f3f3ef",
  "surface-raised": "#ffffff",
  border: "#d8dbe0",
  "border-strong": "#8a9099",
  text: "#16191d",
  "text-muted": "#5b6169",
  accent: "#2d5a27",
  "accent-text": "#ffffff",
  "accent-quiet": "#e8f0e6",
  danger: "#a4262c",
  "danger-quiet": "#fbeaea",
  focus: "#1e4d8c",
  "stage-bg": "#e4e8e2",
  select: "#00a3b4"
};
var DARK = {
  surface: "#16191d",
  "surface-sunken": "#101316",
  "surface-raised": "#1d2126",
  border: "#2f343b",
  "border-strong": "#6b727c",
  text: "#eef0f2",
  "text-muted": "#a3aab3",
  accent: "#8cc97a",
  "accent-text": "#0f170d",
  "accent-quiet": "#1b2a18",
  danger: "#f1707a",
  "danger-quiet": "#2a1416",
  focus: "#8fb8f0",
  "stage-bg": "#0c0f11",
  select: "#7df9ff"
};
var decl = (m) => Object.entries(m).map(([k, v]) => `--_${k}: ${v};`).join(" ");
var alias = COLOR_TOKENS.map((k) => `--${k}: var(--drillplot-${k}, var(--_${k}));`).join(" ");
var CSS = `
:host { display: flex; flex-direction: column; color-scheme: light dark; ${decl(LIGHT)} }
@media (prefers-color-scheme: dark) { :host(:not([theme="light"])) { ${decl(DARK)} color-scheme: dark; } }
:host([theme="dark"]) { ${decl(DARK)} color-scheme: dark; }
:host([theme="light"]) { color-scheme: light; }
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.root { ${alias}
  --radius: var(--drillplot-radius, 6px); --touch: var(--drillplot-touch-target, 44px);
  display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; position: relative;
  font-family: var(--font); font-size: 16px; line-height: 1.4; color: var(--text);
  background: var(--surface); border: 1px solid var(--border); border-radius: calc(var(--radius) + 4px); overflow: hidden; }
button, input, select, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
h3 { font-size: 1rem; font-weight: 700; margin: 0 0 .5rem; }
.btn { min-height: var(--touch); padding: 0 .9rem; border: 1px solid var(--border-strong); background: var(--surface-raised); border-radius: var(--radius); cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.btn:hover:not(:disabled) { background: var(--surface-sunken); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.btn.primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.1); }
.btn.danger { color: var(--danger); border-color: var(--danger); }
.btn.sm { min-height: 36px; padding: 0 .7rem; font-size: .92rem; }
.btn[aria-pressed="true"], .btn[aria-pressed="true"]:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.tools { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; padding: .5rem .75rem; border-bottom: 1px solid var(--border); background: var(--surface-sunken); }
.sp { flex: 1; }
.seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface-raised); }
.seg input { position: absolute; opacity: 0; pointer-events: none; }
.seg label { min-height: var(--touch); padding: 0 .75rem; display: inline-flex; align-items: center; cursor: pointer; font-weight: 600; border-right: 1px solid var(--border); }
.seg label:first-of-type { border-radius: calc(var(--radius) - 1px) 0 0 calc(var(--radius) - 1px); }
.seg label:last-of-type { border-right: 0; border-radius: 0 calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0; }
.seg input:checked + label { background: var(--accent); color: var(--accent-text); }
.seg input:focus-visible + label { outline: 3px solid var(--focus); outline-offset: 2px; position: relative; z-index: 1; }
.sel, .field input[type=text], .field input[type=number], .field select, .field textarea, .ta { width: 100%; min-height: var(--touch); padding: 6px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface-raised); }
.sel { width: auto; padding: 0 .5rem; }
.confirm { display: inline-flex; flex-wrap: wrap; align-items: center; gap: .5rem; background: var(--danger-quiet); border: 1px solid var(--danger); border-radius: var(--radius); padding: 2px .5rem; }
/* The court area is --drillplot-stage-height tall, or fills the editor when the host gives the element a height.
   Its row never grows with the side panel, which scrolls on its own; the court then scales to fit both ways. */
.body { position: relative; flex: 1 1 var(--drillplot-stage-height, min(78vh, 760px)); min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) var(--drillplot-side-width, 340px); grid-template-rows: minmax(0, 1fr); }
.stage-col { min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--stage-bg); }
.stage-wrap { flex: 1 1 0; min-height: 0; min-width: 0; padding: .5rem; display: flex; }
.stage { display: block; width: 100%; height: 100%; min-height: 0; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: var(--radius); cursor: default; }
.stage.drawing { cursor: crosshair; }
.note { display: flex; justify-content: space-between; gap: .75rem; padding: 6px .75rem; font-size: .9rem; color: var(--text-muted); border-top: 1px solid var(--border); background: var(--surface); }
.side { min-height: 0; overflow: auto; padding: .75rem 1rem; border-left: 1px solid var(--border); display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label, .lbl { font-weight: 600; font-size: .92rem; }
.field textarea { min-height: 64px; resize: vertical; }
.row { display: flex; flex-wrap: wrap; gap: .5rem; }
.row > .field { flex: 1 1 5rem; }
.pal .btn { touch-action: none; user-select: none; -webkit-user-select: none; min-width: 48px; }
.dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border-strong); display: inline-block; flex: none; }
.dot.orange { background: #e69f00; } .dot.blue { background: #0072b2; } .dot.black { background: #1a1a1a; }
.dot.sq { border-radius: 3px; background: #3d3d3d; } .dot.cone { border-radius: 2px; background: #ff5a1f; } .dot.zone { border-radius: 3px; background: #ff922b; }
.dot.key { background: #fff; color: #1a1a1a; border-color: #1a1a1a; font-size: 11px; font-weight: 700; line-height: 14px; text-align: center; }
.legend-rows { display: flex; flex-direction: column; gap: .5rem; }
.legend-row { display: grid; grid-template-columns: 4.2rem minmax(0, 1fr) auto; gap: .4rem; align-items: end; }
.legend-row .wide { grid-column: 1 / -1; }
.hint { font-size: .92rem; color: var(--text-muted); margin: .5rem 0 0; min-height: 2.8em; }
.small { font-size: .88rem; color: var(--text-muted); margin: 0; }
.insp { border: 1px solid var(--border); border-radius: var(--radius); padding: .75rem; background: var(--surface-sunken); display: flex; flex-direction: column; gap: .75rem; margin-top: .5rem; }
.check { display: flex; align-items: center; gap: .5rem; min-height: var(--touch); font-weight: 600; }
.check input { width: 22px; height: 22px; accent-color: var(--accent); }
.foot { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; padding: .75rem 1rem; border-top: 1px solid var(--border); background: var(--surface-sunken); }
.sheet { position: absolute; inset: 0; z-index: 3; background: var(--surface); overflow: auto; padding: 1rem; display: flex; flex-direction: column; gap: .75rem; }
.sheet-head { display: flex; justify-content: space-between; align-items: center; gap: .75rem; flex-wrap: wrap; }
.sheet-head h3 { font-size: 1.2rem; margin: 0; }
.sheet-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 260px); gap: 1rem; }
.col { display: flex; flex-direction: column; gap: .75rem; min-width: 0; }
.ta { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .8rem; line-height: 1.35; min-height: 180px; resize: vertical; }
.preview { background: var(--stage-bg); border-radius: var(--radius); padding: .5rem; align-self: start; }
.preview svg { display: block; width: 100%; height: auto; max-height: 360px; }
.status { min-height: 1.4em; font-weight: 600; color: var(--accent); }
.status.err { color: var(--danger); }
.ghost { position: fixed; z-index: 50; pointer-events: none; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: var(--accent); color: var(--accent-text); display: grid; place-items: center; font-weight: 700; opacity: .85; font-size: .8rem; }
.sel-ring { fill: none; stroke: var(--select); stroke-width: .2px; stroke-dasharray: .5 .4; pointer-events: none; }
.handle { fill: #fff; stroke: #0b6c7a; stroke-width: .18px; cursor: grab; }
.piece { cursor: grab; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 760px) {
  .body { display: block; flex: none; }
  .stage-wrap { flex: none; height: var(--drillplot-stage-height, clamp(300px, 62vh, 560px)); }
  .side { border-left: 0; border-top: 1px solid var(--border); overflow: visible; }
  .sheet-grid { grid-template-columns: 1fr; }
  .foot .sp { display: none; }
  .note { flex-direction: column; gap: 0; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

// src/editor/template.ts
var TEMPLATE = `
<div class="root" part="root">
  <div class="tools" part="toolbar">
    <div class="seg" role="radiogroup" aria-label="Court view">
      <input type="radio" name="view" id="view-full" value="full"><label for="view-full">Full court</label>
      <input type="radio" name="view" id="view-half" value="half"><label for="view-half">Half court</label>
      <input type="radio" name="view" id="view-kitchen" value="kitchen"><label for="view-kitchen">Kitchen zoom</label>
    </div>
    <div class="seg" role="radiogroup" aria-label="Orientation">
      <input type="radio" name="orient" id="orient-portrait" value="portrait"><label for="orient-portrait">Portrait</label>
      <input type="radio" name="orient" id="orient-landscape" value="landscape"><label for="orient-landscape">Landscape</label>
    </div>
    <label class="check" for="mono"><input type="checkbox" id="mono"> Greyscale view</label>
    <select class="sel" id="half-side" aria-label="Which half to show" hidden>
      <option value="bottom">Bottom half</option>
      <option value="top">Top half</option>
    </select>
    <select class="sel" id="court-pick" aria-label="Court being edited" hidden></select>
    <span class="sp"></span>
    <button type="button" class="btn sm" id="undo">Undo</button>
    <button type="button" class="btn sm" id="redo">Redo</button>
    <button type="button" class="btn sm danger" id="delete">Delete</button>
    <button type="button" class="btn sm" id="clear">Clear</button>
    <span class="confirm" id="clear-confirm" hidden role="alert">
      <span>Clear the whole court?</span>
      <button type="button" class="btn sm danger" id="clear-yes">Yes, clear it</button>
      <button type="button" class="btn sm" id="clear-no">Keep it</button>
    </span>
  </div>

  <div class="body">
    <div class="stage-col">
      <div class="stage-wrap">
        <svg class="stage" id="stage" part="stage" xmlns="http://www.w3.org/2000/svg" viewBox="-2.5 -2.5 25 49" role="group" aria-label="Court drawing area. Use the piece list to select, arrow keys to nudge, Delete to remove." tabindex="0"></svg>
      </div>
      <div class="note"><span id="scale"></span><span id="offview"></span></div>
    </div>

    <div class="side" part="panel">
      <section aria-labelledby="h-details">
        <h3 id="h-details">Details</h3>
        <div class="field"><label for="title">Diagram title</label><input type="text" id="title" maxlength="120" autocomplete="off"></div>
        <div class="field" style="margin-top:8px"><label for="caption">Caption (optional)</label><textarea id="caption" maxlength="300"></textarea></div>
        <label class="check" for="show-caption"><input type="checkbox" id="show-caption"> Print the caption under the court</label>
      </section>

      <section class="pal" aria-labelledby="h-add">
        <h3 id="h-add">Add to the court</h3>
        <div class="row" role="group" aria-label="Players">
          <button type="button" class="btn sm" data-kind="pA"><span class="dot orange"></span>A</button>
          <button type="button" class="btn sm" data-kind="pB"><span class="dot orange"></span>B</button>
          <button type="button" class="btn sm" data-kind="pC"><span class="dot blue"></span>C</button>
          <button type="button" class="btn sm" data-kind="pD"><span class="dot blue"></span>D</button>
          <button type="button" class="btn sm" data-kind="pCoach"><span class="dot black"></span>Coach</button>
        </div>
        <div class="row" style="margin-top:8px" role="group" aria-label="Equipment">
          <button type="button" class="btn sm" data-kind="machine"><span class="dot sq"></span>Ball machine</button>
          <button type="button" class="btn sm" data-kind="cone"><span class="dot cone"></span>Cone</button>
          <button type="button" class="btn sm" data-kind="zone"><span class="dot zone"></span>Target zone</button>
          <button type="button" class="btn sm" data-kind="mark"><span class="dot key">1</span>Legend badge</button>
        </div>
        <h3 style="margin-top:14px">Draw arrows</h3>
        <div class="row" role="group" aria-label="Arrow tools">
          <button type="button" class="btn sm" data-tool="select" aria-pressed="true">Select and move</button>
          <button type="button" class="btn sm" data-tool="drive" aria-pressed="false">Drive (straight)</button>
          <button type="button" class="btn sm" data-tool="drop" aria-pressed="false">Drop or lob (curved)</button>
          <button type="button" class="btn sm" data-tool="move" aria-pressed="false">Movement (dashed)</button>
          <button type="button" class="btn sm" data-tool="line" aria-pressed="false">Line (no arrowhead)</button>
        </div>
        <p class="hint" id="hint" aria-live="polite"></p>
      </section>

      <section aria-labelledby="h-sel">
        <h3 id="h-sel">Pieces on the court</h3>
        <div class="field"><label for="pick">Select a piece</label><select id="pick"></select></div>
        <div class="insp" id="insp" hidden>
          <strong id="insp-name" aria-live="polite"></strong>
          <div class="field" id="g-label"><label for="sel-label" id="sel-label-l">Label</label><input type="text" id="sel-label" maxlength="8" autocomplete="off"></div>
          <div class="field" id="g-note"><label for="sel-note">Role under the disc (optional)</label><input type="text" id="sel-note" maxlength="16" autocomplete="off"></div>
          <div class="field" id="g-team"><label for="sel-team">Player color</label>
            <select id="sel-team"><option value="orange">Orange</option><option value="blue">Blue</option><option value="white">White</option><option value="black">Black</option></select>
            <span class="small">Four colors that stay apart for color-blind viewers and on a black and white printer.</span></div>
          <label class="check" id="g-ghost"><input type="checkbox" id="sel-ghost"> <span id="sel-ghost-l">Dashed outline</span></label>
          <div class="field" id="g-color"><label for="sel-color">Color</label>
            <select id="sel-color"><option value="">Default</option><option value="yellow">Yellow</option><option value="white">White</option><option value="orange">Orange</option><option value="red">Red</option><option value="pink">Pink</option><option value="green">Green</option><option value="black">Black</option></select></div>
          <label class="check" id="g-dash"><input type="checkbox" id="sel-dash"> Dashed (cooperative or optional)</label>
          <div class="field" id="g-alt"><label for="sel-alt">Either-or choice</label>
            <select id="sel-alt"><option value="">No: a shot in the sequence</option><option value="a">Choice a</option><option value="b">Choice b</option><option value="c">Choice c</option><option value="d">Choice d</option></select>
            <span class="small">Give two paths the same shot number and different letters to show one or the other.</span></div>
          <div id="g-ball">
            <label class="check"><input type="checkbox" id="sel-curve"> Curved (drop or lob)</label>
            <div class="row">
              <button type="button" class="btn sm" id="sel-flip">Flip the curve</button>
              <button type="button" class="btn sm" id="sel-earlier">Earlier shot</button>
              <button type="button" class="btn sm" id="sel-later">Later shot</button>
            </div>
          </div>
          <div class="field" id="g-key"><label for="sel-key">Legend badge (optional, up to 3 characters)</label><input type="text" id="sel-key" maxlength="3" autocomplete="off"></div>
          <div class="field" id="g-aim"><label for="sel-aim">Aim: <span id="sel-aim-v"></span> degrees</label><input type="range" id="sel-aim" min="0" max="359" step="1"></div>
          <div class="row" id="g-zone">
            <div class="field"><label for="sel-w">Width (ft)</label><input type="number" id="sel-w" min="1" max="20" step="0.5"></div>
            <div class="field"><label for="sel-h">Length (ft)</label><input type="number" id="sel-h" min="1" max="44" step="0.5"></div>
          </div>
          <div class="row" id="g-pos">
            <div class="field"><label for="sel-x">Across (ft)</label><input type="number" id="sel-x" step="0.25"></div>
            <div class="field"><label for="sel-y">Along (ft)</label><input type="number" id="sel-y" step="0.25"></div>
          </div>
          <div class="row" id="g-pos2">
            <div class="field"><label for="sel-x1">Start across</label><input type="number" id="sel-x1" step="0.25"></div>
            <div class="field"><label for="sel-y1">Start along</label><input type="number" id="sel-y1" step="0.25"></div>
            <div class="field"><label for="sel-x2">End across</label><input type="number" id="sel-x2" step="0.25"></div>
            <div class="field"><label for="sel-y2">End along</label><input type="number" id="sel-y2" step="0.25"></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="h-shots">
        <h3 id="h-shots">Shot numbers</h3>
        <p class="small" id="shots-note"></p>
        <button type="button" class="btn sm" id="renumber" style="margin-top:8px">Renumber shots</button>
      </section>
      <section aria-labelledby="h-legend">
        <h3 id="h-legend">Legend</h3>
        <p class="small">Notes printed under the court. A note's key matches a badge on the court or a shot number; leave the key empty to show a color swatch instead.</p>
        <div id="legend-rows" class="legend-rows"></div>
        <button type="button" class="btn sm" id="legend-add" style="margin-top:8px">Add a note</button>
      </section>

      <section aria-labelledby="h-courts">
        <h3 id="h-courts">Courts</h3>
        <div class="field"><label for="courts-n">Courts in this diagram</label>
          <select id="courts-n"><option value="1">One court</option><option value="2">Two courts</option><option value="3">Three courts</option><option value="4">Four courts</option></select>
          <span class="small" id="courts-note"></span></div>
        <div id="court-rows" class="legend-rows"></div>
      </section>

      <p class="small">Shortcuts: Delete removes the selected piece. Ctrl or Cmd + Z undoes, with Shift to redo. Ctrl or Cmd + S saves. Arrow keys nudge a selected piece half a foot. With an arrow tool chosen, Enter on the court adds an arrow you can then adjust.</p>
    </div>

    <div class="sheet" id="sheet-svg" hidden role="region" aria-labelledby="sheet-svg-h">
      <div class="sheet-head"><h3 id="sheet-svg-h">Get SVG</h3><button type="button" class="btn sm" id="sheet-svg-back">Back to drawing</button></div>
      <div class="sheet-grid">
        <div class="col">
          <div class="field"><label for="out-svg">SVG (court and pieces only, source embedded)</label><textarea class="ta" id="out-svg" readonly spellcheck="false"></textarea></div>
          <div class="row"><button type="button" class="btn primary" id="copy-svg">Copy SVG</button><span class="status" id="copy-svg-s" role="status"></span></div>
          <div class="field"><label for="out-json">Source (JSON), to reopen or edit later</label><textarea class="ta" id="out-json" readonly spellcheck="false" style="min-height:130px"></textarea></div>
          <div class="row"><button type="button" class="btn" id="copy-json">Copy source (JSON)</button><span class="status" id="copy-json-s" role="status"></span></div>
        </div>
        <div>
          <div class="preview" id="preview" role="img" aria-label="Preview of the exported SVG"></div>
          <p class="small" id="preview-note"></p>
        </div>
      </div>
    </div>

    <div class="sheet" id="sheet-open" hidden role="region" aria-labelledby="sheet-open-h">
      <div class="sheet-head"><h3 id="sheet-open-h">Open from source</h3><button type="button" class="btn sm" id="sheet-open-back">Back to drawing</button></div>
      <p class="small">Paste an SVG exported from here, or the JSON source. It replaces what is on the court (you can undo it).</p>
      <div class="field"><label for="open-input">SVG or JSON</label><textarea class="ta" id="open-input" spellcheck="false" style="min-height:260px"></textarea></div>
      <div class="row"><button type="button" class="btn primary" id="open-go">Open diagram</button><span class="status" id="open-s" role="status"></span></div>
    </div>
  </div>

  <div class="foot" part="footer">
    <button type="button" class="btn" id="open-svg">Get SVG</button>
    <button type="button" class="btn" id="open-src">Open from source</button>
    <span class="sp"></span>
    <button type="button" class="btn primary" id="save" part="save">Save</button>
  </div>
</div>
<div class="ghost" id="ghost" hidden></div>
`;

// src/editor/element.ts
function itemName(it) {
  switch (it.type) {
    case "player":
      return (it.ghost ? "Start position " : "Player ") + (it.label || "(no label)") + (it.note ? ", " + it.note : "");
    case "machine":
      return "Ball machine";
    case "cone":
      return "Cone" + (it.label ? " " + it.label : "");
    case "zone":
      return (it.ghost ? "Open space" : "Target zone") + (it.label ? " " + it.label : "");
    case "move":
      return "Movement arrow";
    case "ball":
      return (it.curve ? "Drop or lob " : "Drive ") + it.n + (it.alt ?? "");
    case "line":
      return "Line" + (it.label ? " " + it.label : "");
    case "mark":
      return "Legend badge " + it.key;
  }
}
function setOpt(obj, k, v) {
  if (v === "" || v === false || v === void 0) delete obj[k];
  else obj[k] = v;
}
var POINT_KINDS = /* @__PURE__ */ new Set(["player", "machine", "cone", "zone", "mark"]);
var KEYED = /* @__PURE__ */ new Set(["player", "machine", "cone", "zone", "move", "line", "mark"]);
var LABEL_MAX = { player: LIMITS.playerLabelLength, zone: LIMITS.zoneLabelLength, cone: LIMITS.coneLabelLength, line: LIMITS.lineLabelLength };
var DrillplotEditor = class extends HTMLElement {
  static observedAttributes = ["source", "greyscale", "save-label"];
  model = new DrillModel();
  sel = null;
  tool = "select";
  armed = null;
  mono = false;
  drag = null;
  quiet = 0;
  pickHtml = "";
  labelBefore = null;
  legendShape = "";
  courtShape = "";
  aimBefore = null;
  shadow;
  stage;
  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.shadow.innerHTML = `<style>${CSS}</style>${TEMPLATE}`;
    this.stage = this.$("stage");
    this.model.onChange = () => {
      if (!this.model.byId(this.sel)) this.sel = null;
      this.render();
      this.emitChange();
    };
    this.bind();
    this.loadFields();
    this.render();
  }
  connectedCallback() {
    this.render();
  }
  attributeChangedCallback(name, _old, value) {
    if (name === "source" && value) this.load(value);
    else if (name === "greyscale") {
      this.mono = value !== null;
      this.render();
    } else if (name === "save-label") this.$("save").textContent = value || "Save";
  }
  /* ---------- public API ---------- */
  get source() {
    return this.model.toSource();
  }
  set source(value) {
    if (value !== null) this.load(value);
  }
  get greyscale() {
    return this.mono;
  }
  set greyscale(on) {
    this.toggleAttribute("greyscale", on);
  }
  /** Replaces the drawing with a validated source. Does not fire `change`. */
  load(input) {
    const r = typeof input === "string" ? parseText(input) : parseSource(input);
    if (!r.ok) {
      this.dispatchEvent(new CustomEvent("source-error", { detail: { errors: r.errors } }));
      return r;
    }
    this.model.load(r.source, { undoable: false });
    this.sel = null;
    this.loadFields();
    this.render();
    return r;
  }
  getSource() {
    return this.model.toSource();
  }
  /** The export: always in color, the same as Get SVG. */
  getSvg() {
    return renderSvg(this.model.toSource());
  }
  /* ---------- plumbing ---------- */
  $(id) {
    const el = this.shadow.getElementById(id);
    if (!el) throw new Error("drillplot: missing #" + id);
    return el;
  }
  input(id) {
    return this.$(id);
  }
  all(sel) {
    return [...this.shadow.querySelectorAll(sel)];
  }
  emitChange() {
    if (this.quiet) return;
    this.dispatchEvent(new CustomEvent("change", { detail: { source: this.model.toSource() }, bubbles: true, composed: true }));
  }
  save() {
    this.dispatchEvent(new CustomEvent("save", { detail: { source: this.model.toSource(), svg: this.getSvg() }, bubbles: true, composed: true }));
  }
  get landscape() {
    return this.model.meta.orient === "landscape";
  }
  loadFields() {
    this.input("title").value = this.model.meta.title;
    this.$("caption").value = this.model.meta.caption;
  }
  /** Runs a change to the view settings, then redraws and tells the host. */
  setMeta(patch) {
    Object.assign(this.model.meta, patch);
    this.render();
    this.emitChange();
  }
  /* ---------- render ---------- */
  /** `full` false redraws only the court: used while a drag is in flight, so panels and live regions are not rewritten on every pointer move. */
  render(full = true) {
    const m = this.model;
    const v = viewBox(m.meta.view, m.meta.side, m.meta.orient);
    const ctx = { orient: m.meta.orient, greyscale: this.mono };
    this.stage.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    const world = this.landscape ? '<g data-world transform="rotate(-90)">' : "<g data-world>";
    this.stage.innerHTML = world + courtMarkup(courtView(m.meta.view, m.meta.side), ctx) + drawOrder(m.onCourt()).map((it) => `<g class="piece" data-id="${it.id}">${itemMarkup(it, ctx)}${this.hit(it)}</g>`).join("") + `<g>${this.overlay()}</g></g>`;
    this.stage.classList.toggle("drawing", this.tool !== "select" || !!this.armed);
    if (full) this.syncUI();
  }
  hit(it) {
    if (it.type === "line") return `<path d="M${it.x1} ${it.y1}L${it.x2} ${it.y2}" fill="none" stroke="transparent" stroke-width="2.4" pointer-events="stroke"/>`;
    if (it.type !== "move" && it.type !== "ball") return "";
    return `<path d="${arrowGeom(it).d}" fill="none" stroke="transparent" stroke-width="2.4" pointer-events="stroke"/>`;
  }
  overlay() {
    const it = this.model.byId(this.sel);
    if (!it) return "";
    const H = (name, x, y, sq = false) => sq ? `<rect class="handle" data-handle="${name}" x="${round2(x - 0.6)}" y="${round2(y - 0.6)}" width="1.2" height="1.2"/>` : `<circle class="handle" data-handle="${name}" cx="${round2(x)}" cy="${round2(y)}" r="0.75"/>`;
    switch (it.type) {
      case "player":
        return `<circle class="sel-ring" cx="${it.x}" cy="${it.y}" r="1.8"/>`;
      case "machine":
        return `<circle class="sel-ring" cx="${it.x}" cy="${it.y}" r="2.3"/>`;
      case "cone":
        return `<circle class="sel-ring" cx="${it.x}" cy="${it.y}" r="1.5"/>`;
      case "mark":
        return `<circle class="sel-ring" cx="${it.x}" cy="${it.y}" r="1.4"/>`;
      case "zone":
        return `<rect class="sel-ring" x="${it.x - 0.2}" y="${it.y - 0.2}" width="${it.w + 0.4}" height="${it.h + 0.4}"/>` + H("corner", it.x + it.w, it.y + it.h, true);
      default: {
        const g = arrowGeom(it.type === "ball" ? it : { ...it, curve: false });
        return `<path class="sel-ring" d="${g.d}" style="stroke-width:.9px;stroke-opacity:.5;stroke-dasharray:none"/>` + H("p1", it.x1, it.y1) + H("p2", it.x2, it.y2);
      }
    }
  }
  setIfIdle(id, val) {
    const el = this.input(id);
    if (this.shadow.activeElement !== el) el.value = String(val);
  }
  setText(id, text) {
    const el = this.$(id);
    if (el.textContent !== text) el.textContent = text;
  }
  syncUI() {
    const m = this.model;
    const it = m.byId(this.sel);
    const meta = m.meta;
    this.$("undo").disabled = !m.canUndo();
    this.$("redo").disabled = !m.canRedo();
    this.$("delete").disabled = !it;
    this.input("view-" + meta.view).checked = true;
    this.input("orient-" + meta.orient).checked = true;
    this.input("mono").checked = this.mono;
    const half = this.$("half-side");
    half.hidden = meta.view !== "half";
    half.value = meta.side;
    half.options[0].textContent = this.landscape ? "Right half" : "Bottom half";
    half.options[1].textContent = this.landscape ? "Left half" : "Top half";
    const off = countOffView({ view: meta.view, side: meta.side, items: m.onCourt() });
    this.setText("offview", off ? `${off} piece${off === 1 ? " is" : "s are"} outside this view` : "");
    this.setText("scale", meta.view === "full" ? "Drawn to scale: the court is 20 by 44 feet." : meta.view === "half" ? "Drawn to scale: one half, 20 by 22 feet." : "Drawn to scale: both kitchens (7 feet each) and the net.");
    this.all("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(!this.armed && b.dataset["tool"] === this.tool)));
    this.all("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset["kind"] === this.armed)));
    this.setText("hint", this.armed ? `Tap or click the court to place ${KIND_NAME[this.armed]}. You can also drag it there.` : this.tool === "drive" ? "Drag on the court from where the ball is hit to where it lands. A straight line, numbered in shot order." : this.tool === "drop" ? "Drag on the court from the hit to the landing spot. The arrow curves, like a drop or a lob." : this.tool === "move" ? "Drag to show where a player moves. Dashed arrow." : this.tool === "line" ? "Drag to draw a plain line, such as a line to split-step on." : "Drag a piece to move it. Drag the white handles to reshape an arrow or resize a zone. Drag a button above onto the court to add a piece.");
    const pick = this.$("pick");
    const pickHtml = `<option value="">${m.onCourt().length ? "Choose a piece" : "Nothing on the court yet"}</option>` + drawOrder(m.onCourt()).map((i) => `<option value="${i.id}">${esc(itemName(i))}</option>`).join("");
    if (pickHtml !== this.pickHtml) {
      this.pickHtml = pickHtml;
      pick.innerHTML = pickHtml;
    }
    pick.value = this.sel ?? "";
    this.setIfIdle("title", m.meta.title);
    this.setIfIdle("caption", m.meta.caption);
    this.input("show-caption").checked = !!meta.showCaption;
    this.syncLegend();
    this.syncCourts();
    this.$("insp").hidden = !it;
    if (it) {
      this.setText("insp-name", itemName(it));
      const labelMax = LABEL_MAX[it.type];
      this.$("g-label").hidden = labelMax === void 0;
      this.$("sel-label-l").textContent = it.type === "player" ? "Label" : it.type === "zone" ? "Zone label (optional)" : it.type === "cone" ? "Cone name (optional), such as T1" : "Line label (optional)";
      if (labelMax !== void 0) this.input("sel-label").maxLength = labelMax;
      this.$("g-team").hidden = it.type !== "player";
      this.$("g-note").hidden = it.type !== "player";
      this.$("g-ghost").hidden = !(it.type === "player" || it.type === "zone");
      this.$("sel-ghost-l").textContent = it.type === "zone" ? "Space left open (outline only)" : "Start position (dashed ring)";
      this.$("g-color").hidden = !(it.type === "ball" || it.type === "move" || it.type === "line");
      this.$("g-dash").hidden = !(it.type === "ball" || it.type === "line");
      this.$("g-alt").hidden = it.type !== "ball";
      this.$("g-key").hidden = !KEYED.has(it.type);
      if (it.type === "player") this.setIfIdle("sel-note", it.note ?? "");
      if (it.type === "player" || it.type === "zone") this.input("sel-ghost").checked = !!it.ghost;
      if (it.type === "ball" || it.type === "move" || it.type === "line") this.$("sel-color").value = it.color ?? "";
      if (it.type === "ball" || it.type === "line") this.input("sel-dash").checked = !!it.dash;
      if (it.type === "ball") this.$("sel-alt").value = it.alt ?? "";
      if (it.type !== "ball") this.setIfIdle("sel-key", it.key ?? "");
      this.$("g-ball").hidden = it.type !== "ball";
      this.$("g-aim").hidden = it.type !== "machine";
      this.$("g-zone").hidden = it.type !== "zone";
      this.$("g-pos").hidden = !POINT_KINDS.has(it.type);
      this.$("g-pos2").hidden = POINT_KINDS.has(it.type);
      if (it.type === "player" || it.type === "zone" || it.type === "cone" || it.type === "line") this.setIfIdle("sel-label", it.label ?? "");
      if (it.type === "player") this.$("sel-team").value = it.team;
      if (it.type === "ball") this.input("sel-curve").checked = it.curve;
      if (it.type === "machine") {
        this.setIfIdle("sel-aim", it.angle);
        this.$("sel-aim-v").textContent = String(it.angle);
      }
      if (it.type === "zone") {
        this.setIfIdle("sel-w", round2(it.w));
        this.setIfIdle("sel-h", round2(it.h));
      }
      if ("x" in it) {
        this.setIfIdle("sel-x", it.x);
        this.setIfIdle("sel-y", it.y);
      } else {
        this.setIfIdle("sel-x1", it.x1);
        this.setIfIdle("sel-y1", it.y1);
        this.setIfIdle("sel-x2", it.x2);
        this.setIfIdle("sel-y2", it.y2);
      }
    }
    const balls = ballItems(m.items);
    this.setText("shots-note", !balls.length ? "No ball paths yet. Each new one gets the next number." : hasShotGap(m.items) ? "Numbers skip a shot. Renumber to close the gap." : `${balls.length} shot${balls.length === 1 ? "" : "s"}, numbered 1 to ${balls.length}.`);
    this.$("renumber").disabled = !balls.length;
  }
  /** The legend editor: rows are rebuilt only when their number changes, so typing keeps its focus. */
  syncLegend() {
    const legend = this.model.meta.legend ?? [];
    const shape = String(legend.length);
    const box = this.$("legend-rows");
    if (shape !== this.legendShape) {
      this.legendShape = shape;
      const colors = '<option value="">No swatch</option>' + PATH_COLORS.map((c) => `<option value="${c}">${c[0].toUpperCase()}${c.slice(1)} swatch</option>`).join("");
      box.innerHTML = legend.map(
        (_, i) => `<div class="legend-row" data-i="${i}"><div class="field"><label for="lg-key-${i}">Key</label><input type="text" id="lg-key-${i}" data-f="key" maxlength="${LIMITS.keyLength}" autocomplete="off"></div><div class="field"><label for="lg-text-${i}">Note ${i + 1}</label><input type="text" id="lg-text-${i}" data-f="text" maxlength="${LIMITS.legendTextLength}" autocomplete="off"></div><button type="button" class="btn sm" data-remove aria-label="Remove note ${i + 1}">Remove</button><div class="field wide"><label class="sr" for="lg-color-${i}">Swatch for note ${i + 1}</label><select id="lg-color-${i}" data-f="color">${colors}</select></div></div>`
      ).join("");
    }
    legend.forEach((e, i) => {
      this.setIfIdle(`lg-key-${i}`, e.key ?? "");
      this.setIfIdle(`lg-text-${i}`, e.text);
      const sel = this.$(`lg-color-${i}`);
      sel.value = e.color ?? "";
      sel.disabled = !!e.key;
    });
    this.$("legend-add").disabled = legend.length >= LIMITS.legendEntries;
  }
  /** The courts editor and the toolbar's court picker. */
  syncCourts() {
    const m = this.model;
    const courts = m.meta.courts;
    const n = courts?.length ?? 1;
    const inUse = m.items.reduce((hi, it) => Math.max(hi, it.court ?? 1), 1);
    const count = this.$("courts-n");
    count.value = String(n);
    [...count.options].forEach((o) => o.disabled = +o.value < inUse);
    this.setText("courts-note", inUse > 1 ? `Court ${inUse} has pieces on it: delete them to have fewer courts.` : "");
    const pick = this.$("court-pick");
    pick.hidden = !courts;
    const box = this.$("court-rows");
    const shape = String(courts ? n : 0);
    if (shape !== this.courtShape) {
      this.courtShape = shape;
      box.innerHTML = (courts ?? []).map(
        (_, i) => `<div class="legend-row" data-i="${i}"><div class="field wide"><label for="ct-label-${i}">Court ${i + 1} heading</label><input type="text" id="ct-label-${i}" data-f="label" maxlength="${LIMITS.courtLabelLength}" autocomplete="off"></div>` + (i < n - 1 ? `<div class="field wide"><label for="ct-link-${i}">Between court ${i + 1} and ${i + 2}</label><input type="text" id="ct-link-${i}" data-f="link" maxlength="${LIMITS.courtLinkLength}" autocomplete="off"></div>` : "") + "</div>"
      ).join("");
    }
    (courts ?? []).forEach((ct, i) => {
      this.setIfIdle(`ct-label-${i}`, ct.label ?? "");
      if (i < n - 1) this.setIfIdle(`ct-link-${i}`, ct.link ?? "");
    });
    const opts = (courts ?? []).map((ct, i) => `<option value="${i + 1}">${esc(`Court ${i + 1}${ct.label ? ": " + ct.label : ""}`)}</option>`).join("");
    if (pick.innerHTML !== opts) pick.innerHTML = opts;
    pick.value = String(m.court);
  }
  /* ---------- court coordinates ---------- */
  toFt(cx, cy) {
    const w = this.stage.querySelector("[data-world]") ?? this.stage;
    const ctm = w.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  /* ---------- behaviour ---------- */
  place(kind, x, y) {
    const it = this.model.add(kind, x, y);
    this.sel = it.id;
    this.armed = null;
    this.render();
  }
  deleteSel() {
    if (this.sel) {
      this.model.delete(this.sel);
      this.sel = null;
      this.render();
    }
  }
  hideClearConfirm() {
    this.$("clear-confirm").hidden = true;
    this.$("clear").hidden = false;
  }
  showSheet(which) {
    this.$("sheet-svg").hidden = which !== "svg";
    this.$("sheet-open").hidden = which !== "open";
    if (which === "svg") {
      const source = this.model.toSource();
      const svg = renderSvg(source);
      this.$("out-svg").value = svg;
      this.$("out-json").value = stringifySource(source);
      this.$("preview").innerHTML = renderSvg(source, { greyscale: this.mono });
      this.$("preview-note").textContent = this.mono ? "Previewed in greyscale. The exported SVG keeps its colors." : "";
      this.$("copy-svg-s").textContent = "";
      this.$("copy-json-s").textContent = "";
      this.$("sheet-svg-back").focus();
    } else if (which === "open") {
      this.$("open-s").textContent = "";
      this.$("open-s").classList.remove("err");
      this.$("open-input").focus();
    }
  }
  async copy(text, ta, status) {
    status.classList.remove("err");
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Copied";
    } catch {
      ta.focus();
      ta.select();
      status.classList.add("err");
      status.textContent = "Copying is blocked here. The text is selected: press Ctrl+C or Cmd+C.";
    }
  }
  errorText(errors) {
    const first = errors.slice(0, 3).map((e) => e.path ? `${e.message} (${e.path})` : e.message);
    const more = errors.length - first.length;
    return first.join(" ") + (more > 0 ? ` And ${more} more.` : "");
  }
  /** Closes the open sheet and puts focus back on the button that opened it. */
  closeSheet() {
    const opener = this.$("sheet-svg").hidden ? "open-src" : "open-svg";
    this.showSheet(null);
    this.$(opener).focus();
  }
  sheetOpen() {
    return !this.$("sheet-svg").hidden || !this.$("sheet-open").hidden;
  }
  nudgeSel(dx, dy) {
    if (this.sel) this.model.nudge(this.sel, dx, dy);
  }
  bind() {
    const m = this.model;
    const stage = this.stage;
    stage.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this.hideClearConfirm();
      const p = this.toFt(e.clientX, e.clientY);
      const target = e.target;
      const hEl = target.closest("[data-handle]");
      const gEl = target.closest("[data-id]");
      const before = m.snap();
      if (hEl && m.byId(this.sel)) {
        this.drag = { mode: "handle", h: hEl.dataset["handle"] ?? "", before };
      } else if (this.armed) {
        this.place(this.armed, p.x, p.y);
        e.preventDefault();
        return;
      } else if (this.tool !== "select") {
        const sx = clampX(p.x);
        const sy = clampY(p.y);
        const it = m.addArrow(this.tool, sx, sy, sx, sy);
        m.items.push(it);
        this.sel = it.id;
        this.drag = { mode: "draw", before, id: it.id };
      } else if (gEl && gEl.dataset["id"]) {
        this.sel = gEl.dataset["id"];
        const cur2 = m.byId(this.sel);
        if (!cur2) return;
        this.drag = { mode: "move", before, p0: p, orig: JSON.parse(JSON.stringify(cur2)) };
      } else {
        this.sel = null;
        this.render();
        return;
      }
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      stage.focus({ preventScroll: true });
      this.render();
    });
    stage.addEventListener("pointermove", (e) => {
      const d = this.drag;
      if (!d) return;
      const p = this.toFt(e.clientX, e.clientY);
      const it = m.byId(this.sel);
      if (!it) return;
      if (d.mode === "move") {
        moveBy(it, snapFt(p.x - d.p0.x), snapFt(p.y - d.p0.y), d.orig);
      } else if ((d.mode === "draw" || d.mode === "handle" && d.h === "p2") && "x2" in it) {
        it.x2 = clampX(p.x);
        it.y2 = clampY(p.y);
      } else if (d.mode === "handle" && d.h === "p1" && "x1" in it) {
        it.x1 = clampX(p.x);
        it.y1 = clampY(p.y);
      } else if (d.mode === "handle" && d.h === "corner" && it.type === "zone") {
        it.w = round2(clamp(snapFt(p.x - it.x), LIMITS.zoneWidth.min, Math.min(LIMITS.zoneWidth.max, 22 - it.x)));
        it.h = round2(clamp(snapFt(p.y - it.y), LIMITS.zoneHeight.min, Math.min(LIMITS.zoneHeight.max, 46 - it.y)));
      }
      this.render(false);
    });
    const endDrag = () => {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      const it = m.byId(this.sel);
      if (d.mode === "draw" && it && "x2" in it && Math.hypot(it.x2 - it.x1, it.y2 - it.y1) < 1.5) {
        m.items = m.items.filter((i) => i.id !== it.id);
        this.sel = null;
        this.render();
        return;
      }
      if (m.record(d.before)) this.emitChange();
      this.render();
    };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") {
        if (this.armed) {
          const s = m.defaultSpot();
          this.place(this.armed, s.x, s.y);
          e.preventDefault();
        } else if (this.tool !== "select") {
          const v = courtView(m.meta.view, m.meta.side);
          const cy = v.y + v.h / 2;
          const it = m.addArrow(this.tool, 10, cy + 4, 10, cy - 4);
          m.act(() => m.items.push(it));
          this.sel = it.id;
          this.render();
          e.preventDefault();
        }
        return;
      }
      if (!this.sel) return;
      const base = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] };
      let step = base[e.key];
      if (!step) return;
      if (this.landscape) step = [-step[1], step[0]];
      e.preventDefault();
      this.nudgeSel(step[0], step[1]);
    });
    const ghost = this.$("ghost");
    this.all("[data-kind]").forEach((b) => {
      const kind = b.dataset["kind"];
      b.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const st = { x: e.clientX, y: e.clientY, moved: false };
        b.setPointerCapture(e.pointerId);
        const mv = (ev) => {
          if (!st.moved && Math.hypot(ev.clientX - st.x, ev.clientY - st.y) > 6) {
            st.moved = true;
            ghost.hidden = false;
            ghost.textContent = (b.textContent ?? "").trim().slice(0, 5);
          }
          if (st.moved) {
            ghost.style.left = ev.clientX + "px";
            ghost.style.top = ev.clientY + "px";
          }
        };
        const done = (ev, drop) => {
          b.removeEventListener("pointermove", mv);
          b.removeEventListener("pointerup", up);
          b.removeEventListener("pointercancel", cancel);
          ghost.hidden = true;
          if (!drop) return;
          if (st.moved) {
            const r = stage.getBoundingClientRect();
            if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
              const p = this.toFt(ev.clientX, ev.clientY);
              this.place(kind, p.x, p.y);
            }
          } else {
            this.armed = this.armed === kind ? null : kind;
            this.tool = "select";
            this.render();
          }
        };
        const up = (ev) => done(ev, true);
        const cancel = (ev) => done(ev, false);
        b.addEventListener("pointermove", mv);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", cancel);
      });
      b.addEventListener("click", (e) => {
        if (e.detail === 0) {
          const s = m.defaultSpot();
          this.place(kind, s.x, s.y);
        }
      });
    });
    this.all("[data-tool]").forEach(
      (b) => b.addEventListener("click", () => {
        this.tool = b.dataset["tool"];
        this.armed = null;
        this.render();
      })
    );
    this.all('input[name="view"]').forEach((r) => r.addEventListener("change", () => this.setMeta({ view: r.value })));
    this.all('input[name="orient"]').forEach((r) => r.addEventListener("change", () => this.setMeta({ orient: r.value })));
    this.$("half-side").addEventListener("change", (e) => this.setMeta({ side: e.target.value }));
    this.$("mono").addEventListener("change", (e) => {
      this.mono = e.target.checked;
      this.toggleAttribute("greyscale", this.mono);
    });
    this.$("undo").addEventListener("click", () => m.undo());
    this.$("redo").addEventListener("click", () => m.redo());
    this.$("delete").addEventListener("click", () => this.deleteSel());
    this.$("clear").addEventListener("click", () => {
      if (!m.items.length) return;
      this.$("clear").hidden = true;
      this.$("clear-confirm").hidden = false;
      this.$("clear-no").focus();
    });
    this.$("clear-no").addEventListener("click", () => {
      this.hideClearConfirm();
      this.$("clear").focus();
    });
    this.$("clear-yes").addEventListener("click", () => {
      this.sel = null;
      m.clear();
      this.hideClearConfirm();
      this.$("clear").focus();
    });
    this.$("title").addEventListener("input", (e) => {
      m.meta.title = e.target.value;
      this.emitChange();
    });
    this.$("caption").addEventListener("input", (e) => {
      m.meta.caption = e.target.value;
      this.emitChange();
    });
    this.$("pick").addEventListener("change", (e) => {
      this.sel = e.target.value || null;
      this.render();
    });
    const cur = () => m.byId(this.sel);
    const label = this.input("sel-label");
    label.addEventListener("focus", () => {
      this.labelBefore = m.snap();
    });
    label.addEventListener("input", () => {
      const it = cur();
      if (it && (it.type === "player" || it.type === "zone")) it.label = label.value;
      else if (it && (it.type === "cone" || it.type === "line")) setOpt(it, "label", label.value);
      else return;
      this.render();
    });
    label.addEventListener("change", () => {
      if (this.labelBefore && m.record(this.labelBefore)) this.emitChange();
      this.labelBefore = null;
      this.render();
    });
    this.$("sel-team").addEventListener(
      "change",
      (e) => m.act(() => {
        const it = cur();
        if (it?.type === "player") it.team = e.target.value;
      })
    );
    this.$("sel-curve").addEventListener(
      "change",
      (e) => m.act(() => {
        const it = cur();
        if (it?.type === "ball") it.curve = e.target.checked;
      })
    );
    this.$("sel-flip").addEventListener(
      "click",
      () => m.act(() => {
        const it = cur();
        if (it?.type === "ball") {
          it.curve = true;
          it.bend = it.bend === -1 ? 1 : -1;
        }
      })
    );
    this.$("sel-earlier").addEventListener("click", () => this.sel && m.shiftShot(this.sel, -1));
    this.$("sel-later").addEventListener("click", () => this.sel && m.shiftShot(this.sel, 1));
    const aim = this.input("sel-aim");
    aim.addEventListener("pointerdown", () => {
      this.aimBefore = m.snap();
    });
    aim.addEventListener("focus", () => {
      this.aimBefore = m.snap();
    });
    aim.addEventListener("input", () => {
      const it = cur();
      if (it?.type === "machine") {
        it.angle = +aim.value;
        this.render();
      }
    });
    aim.addEventListener("change", () => {
      if (this.aimBefore && m.record(this.aimBefore)) this.emitChange();
      this.aimBefore = null;
      this.render();
    });
    ["sel-w", "sel-h"].forEach(
      (id) => this.$(id).addEventListener(
        "change",
        (e) => m.act(() => {
          const it = cur();
          if (it?.type !== "zone") return;
          const raw = +e.target.value || 1;
          if (id === "sel-w") it.w = round2(clamp(raw, LIMITS.zoneWidth.min, LIMITS.zoneWidth.max));
          else it.h = round2(clamp(raw, LIMITS.zoneHeight.min, LIMITS.zoneHeight.max));
        })
      )
    );
    ["sel-x", "sel-y", "sel-x1", "sel-y1", "sel-x2", "sel-y2"].forEach(
      (id) => this.$(id).addEventListener(
        "change",
        (e) => m.act(() => {
          const it = cur();
          const raw = e.target.value;
          if (!it || raw.trim() === "" || !Number.isFinite(+raw)) return;
          const key2 = id.slice(4);
          const v = key2.startsWith("x") ? clampX(+raw) : clampY(+raw);
          it[key2] = v;
        })
      )
    );
    this.$("renumber").addEventListener("click", () => m.renumber());
    const textField = (id, apply) => {
      const el = this.input(id);
      let before = null;
      el.addEventListener("focus", () => {
        before = m.snap();
      });
      el.addEventListener("input", () => {
        const it = cur();
        if (!it) return;
        apply(it, el.value);
        this.render();
      });
      el.addEventListener("change", () => {
        if (before && m.record(before)) this.emitChange();
        before = null;
        this.render();
      });
    };
    textField("sel-note", (it, v) => it.type === "player" && setOpt(it, "note", v));
    textField("sel-key", (it, v) => {
      if (it.type === "mark") {
        if (v.trim()) it.key = v;
      } else if (it.type !== "ball") setOpt(it, "key", v.trim() ? v : "");
    });
    this.$("sel-ghost").addEventListener(
      "change",
      (e) => m.act(() => {
        const it = cur();
        if (it?.type === "player" || it?.type === "zone") setOpt(it, "ghost", e.target.checked);
      })
    );
    this.$("sel-color").addEventListener(
      "change",
      (e) => m.act(() => {
        const it = cur();
        if (it?.type === "ball" || it?.type === "move" || it?.type === "line") setOpt(it, "color", e.target.value);
      })
    );
    this.$("sel-dash").addEventListener(
      "change",
      (e) => m.act(() => {
        const it = cur();
        if (it?.type === "ball" || it?.type === "line") setOpt(it, "dash", e.target.checked);
      })
    );
    this.$("sel-alt").addEventListener(
      "change",
      (e) => m.act(() => {
        const it = cur();
        if (it?.type === "ball") setOpt(it, "alt", e.target.value);
      })
    );
    this.$("show-caption").addEventListener("change", (e) => this.setMeta({ showCaption: e.target.checked || void 0 }));
    const legendBox = this.$("legend-rows");
    const legendAt = (t) => {
      const el = t;
      const row = el.closest("[data-i]");
      return row && el.dataset["f"] ? { i: +(row.dataset["i"] ?? 0), f: el.dataset["f"], el } : null;
    };
    const legendEdit = (e) => {
      const at = legendAt(e.target);
      const entry = at && m.meta.legend?.[at.i];
      if (!at || !entry) return;
      if (at.f === "text") entry.text = at.el.value;
      else setOpt(entry, at.f, at.f === "key" && !at.el.value.trim() ? "" : at.el.value);
      this.render();
      this.emitChange();
    };
    legendBox.addEventListener("input", legendEdit);
    legendBox.addEventListener("change", (e) => e.target.tagName === "SELECT" && legendEdit(e));
    legendBox.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove]");
      const row = btn?.closest("[data-i]");
      if (!row || !m.meta.legend) return;
      m.meta.legend.splice(+(row.dataset["i"] ?? 0), 1);
      if (!m.meta.legend.length) delete m.meta.legend;
      this.render();
      this.emitChange();
      this.$("legend-add").focus();
    });
    this.$("legend-add").addEventListener("click", () => {
      const legend = m.meta.legend ??= [];
      if (legend.length >= LIMITS.legendEntries) return;
      legend.push({ key: nextKey({ items: m.items, legend }), text: "" });
      this.render();
      this.emitChange();
      this.$(`lg-text-${legend.length - 1}`).focus();
    });
    this.$("courts-n").addEventListener("change", (e) => {
      const n = +e.target.value;
      const old = m.meta.courts ?? [];
      if (n <= 1) delete m.meta.courts;
      else m.meta.courts = Array.from({ length: n }, (_, i) => old[i] ?? { label: `Court ${i + 1}` });
      m.court = Math.min(m.court, n);
      this.sel = null;
      this.render();
      this.emitChange();
    });
    this.$("court-rows").addEventListener("input", (e) => {
      const el = e.target;
      const i = +(el.closest("[data-i]")?.dataset["i"] ?? -1);
      const ct = m.meta.courts?.[i];
      if (!ct || el.dataset["f"] !== "label" && el.dataset["f"] !== "link") return;
      setOpt(ct, el.dataset["f"], el.value);
      this.render(false);
      this.emitChange();
    });
    this.$("court-pick").addEventListener("change", (e) => {
      m.court = +e.target.value || 1;
      this.sel = null;
      this.render();
    });
    const back = (id) => this.$(id).addEventListener("click", () => this.closeSheet());
    this.$("open-svg").addEventListener("click", () => this.showSheet("svg"));
    this.$("open-src").addEventListener("click", () => this.showSheet("open"));
    back("sheet-svg-back");
    back("sheet-open-back");
    this.$("copy-svg").addEventListener("click", () => void this.copy(this.$("out-svg").value, this.$("out-svg"), this.$("copy-svg-s")));
    this.$("copy-json").addEventListener("click", () => void this.copy(this.$("out-json").value, this.$("out-json"), this.$("copy-json-s")));
    this.$("open-go").addEventListener("click", () => {
      const s = this.$("open-s");
      const r = parseText(this.$("open-input").value);
      if (r.ok) {
        m.load(r.source, { undoable: true });
        this.sel = null;
        this.loadFields();
        this.render();
        this.emitChange();
        s.classList.remove("err");
        s.textContent = `Opened "${r.source.title || "Untitled"}". Go back to drawing to keep working.`;
      } else {
        s.classList.add("err");
        s.textContent = this.errorText(r.errors);
      }
    });
    this.$("save").addEventListener("click", () => this.save());
    this.shadow.addEventListener("keydown", (ev) => {
      const e = ev;
      const t = e.composedPath()[0];
      const tag = t?.tagName;
      const editable = !!t && (tag === "INPUT" && t.type !== "checkbox" && t.type !== "range" && t.type !== "radio" || tag === "TEXTAREA" || tag === "SELECT");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.save();
        return;
      }
      if (e.key === "Escape") {
        if (this.sheetOpen()) {
          this.closeSheet();
          return;
        }
        if (!this.$("clear-confirm").hidden) {
          this.hideClearConfirm();
          return;
        }
        if (this.armed || this.tool !== "select" || this.sel) {
          this.armed = null;
          this.tool = "select";
          this.sel = null;
          this.render();
        }
        return;
      }
      if (mod && !editable && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) m.redo();
        else m.undo();
        return;
      }
      if (mod && !editable && e.key.toLowerCase() === "y") {
        e.preventDefault();
        m.redo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !editable && this.sel && !this.sheetOpen() && tag !== "BUTTON") {
        e.preventDefault();
        this.deleteSel();
      }
    });
  }
};

// src/editor/index.ts
function defineDrillplotEditor(name = "drillplot-editor") {
  if (typeof customElements === "undefined" || customElements.get(name)) return;
  customElements.define(name, name === "drillplot-editor" ? DrillplotEditor : class extends DrillplotEditor {
  });
}
defineDrillplotEditor();
export {
  DrillModel,
  DrillplotEditor,
  TOKENS,
  defineDrillplotEditor
};
//# sourceMappingURL=editor.js.map