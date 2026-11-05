// src/format/limits.ts
var COURT = { width: 20, length: 44, netY: 22, kitchen: 7 };
var MARGIN = 2;
var BOUNDS = {
  xMin: -MARGIN,
  xMax: COURT.width + MARGIN,
  yMin: -MARGIN,
  yMax: COURT.length + MARGIN
};
var LIMITS = {
  maxItems: 200,
  /** Highest shot number. */
  maxShot: 200,
  titleLength: 120,
  captionLength: 300,
  playerLabelLength: 8,
  zoneLabelLength: 24,
  zoneWidth: { min: 1, max: COURT.width },
  zoneHeight: { min: 1, max: COURT.length },
  /** Since 0.2. */
  noteLength: 16,
  coneLabelLength: 6,
  lineLabelLength: 24,
  keyLength: 3,
  legendEntries: 20,
  legendTextLength: 100,
  courts: { min: 1, max: 4 },
  courtLabelLength: 24,
  courtLinkLength: 40
};
var FORMAT_NAME = "drill-diagram";
var FORMAT_VERSION = 1;
var PLAYER_COLORS = ["orange", "blue", "white", "black"];
var LEGACY_TEAMS = {
  t1: "orange",
  t2: "blue",
  coach: "black"
};
var PATH_COLORS = ["yellow", "white", "orange", "red", "pink", "green", "black"];

// src/format/parse.ts
var round2 = (v) => Math.round(v * 100) / 100;
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var len = (s) => [...s].length;
var BAD_ONE_LINE = /[\u0000-\u001F\u007F\uFFFE\uFFFF\uD800-\uDFFF]/u;
var BAD_MULTI_LINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF\uD800-\uDFFF]/u;
var MESSAGES = {
  not_json: "That is not valid JSON.",
  not_an_object: "A drill diagram is a JSON object.",
  wrong_format: "That does not look like a drill diagram.",
  unsupported_version: "This diagram was made with a newer version of the format.",
  not_text: "This value must be text.",
  title_too_long: `The title is longer than ${LIMITS.titleLength} characters.`,
  caption_too_long: `The caption is longer than ${LIMITS.captionLength} characters.`,
  label_too_long: "A label is too long.",
  bad_character: "Text may not contain control characters or broken Unicode (a caption may have line breaks and tabs).",
  bad_view: 'The view must be "full", "half" or "kitchen".',
  bad_side: 'The side must be "bottom" or "top".',
  bad_orient: 'The orientation must be "portrait" or "landscape".',
  items_not_array: "The items must be a list.",
  too_many_items: `A diagram holds at most ${LIMITS.maxItems} items.`,
  item_not_object: "Each item must be an object.",
  unknown_item_type: "Unknown item type.",
  not_a_number: "This value must be a finite number.",
  out_of_bounds: "This position is outside the court and its margin.",
  bad_size: "This size is out of range.",
  bad_angle: "The angle must be from 0 up to (not including) 360 degrees.",
  bad_team: 'The player color must be "orange", "blue", "white" or "black".',
  bad_bend: "The bend must be 1 or -1.",
  bad_shot_number: `A shot number must be a whole number from 1 to ${LIMITS.maxShot}.`,
  not_boolean: "This value must be true or false.",
  bad_color: `The color must be one of ${PATH_COLORS.map((c) => `"${c}"`).join(", ")}.`,
  bad_key: `A legend key must be 1 to ${LIMITS.keyLength} characters of text on one line.`,
  bad_alt: "An alternative must be one lower-case letter, a to z.",
  bad_court: "The court must be a whole number from 1 to the number of courts.",
  bad_courts: `The courts must be a list of ${LIMITS.courts.min} to ${LIMITS.courts.max} objects.`,
  bad_legend: `The legend must be a list of at most ${LIMITS.legendEntries} notes, each an object with text.`,
  no_svg_source: "That SVG has no diagram source in it. Only SVGs made by drillplot can be reopened.",
  bad_svg_source: "The source inside that SVG is damaged.",
  empty_input: "Paste an SVG or JSON first."
};
var Collector = class {
  errors = [];
  add(key2, path) {
    this.errors.push({ key: key2, path, message: MESSAGES[key2] });
  }
};
var X = [BOUNDS.xMin, BOUNDS.xMax];
var Y = [BOUNDS.yMin, BOUNDS.yMax];
function num(c, v, path, range, rangeKey = "out_of_bounds") {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    c.add("not_a_number", path);
    return void 0;
  }
  if (range && (v < range[0] || v > range[1])) {
    c.add(rangeKey, path);
    return void 0;
  }
  return round2(v);
}
function text(c, v, path, max, tooLong, multiLine = false) {
  if (v === void 0) return "";
  if (typeof v !== "string") {
    c.add("not_text", path);
    return "";
  }
  if (len(v) > max) {
    c.add(tooLong, path);
    return "";
  }
  if ((multiLine ? BAD_MULTI_LINE : BAD_ONE_LINE).test(v)) {
    c.add("bad_character", path);
    return "";
  }
  return v;
}
function team(c, v, path) {
  if (v === void 0) return "orange";
  if (typeof v === "string") {
    if (PLAYER_COLORS.includes(v)) return v;
    const legacy = Object.hasOwn(LEGACY_TEAMS, v) ? LEGACY_TEAMS[v] : void 0;
    if (legacy) return legacy;
  }
  c.add("bad_team", path);
  return "orange";
}
function optText(c, raw, k, path, max) {
  if (raw[k] === void 0) return void 0;
  const t = text(c, raw[k], `${path}/${k}`, max, "label_too_long");
  return t === "" ? void 0 : t;
}
function optFlag(c, raw, k, path) {
  const v = raw[k];
  if (v === void 0) return void 0;
  if (typeof v !== "boolean") c.add("not_boolean", `${path}/${k}`);
  return v === true ? true : void 0;
}
function optColor(c, raw, path) {
  const v = raw["color"];
  if (v === void 0) return void 0;
  if (typeof v === "string" && PATH_COLORS.includes(v)) return v;
  c.add("bad_color", `${path}/color`);
  return void 0;
}
function key(c, v, path) {
  if (typeof v === "string" && v.trim() !== "" && len(v) <= LIMITS.keyLength && !BAD_ONE_LINE.test(v)) return v;
  c.add("bad_key", path);
  return void 0;
}
function optKey(c, raw, path) {
  return raw["key"] === void 0 ? void 0 : key(c, raw["key"], `${path}/key`);
}
function optCourt(c, raw, path, courts) {
  const v = raw["court"];
  if (v === void 0) return void 0;
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= courts) return v;
  c.add("bad_court", `${path}/court`);
  return void 0;
}
function withExtras(it, extras) {
  for (const [k, v] of Object.entries(extras)) if (v !== void 0) it[k] = v;
  return it;
}
function item(c, raw, path, courts = 1) {
  if (!isObj(raw)) {
    c.add("item_not_object", path);
    return void 0;
  }
  const before = c.errors.length;
  let out;
  switch (raw["type"]) {
    case "player": {
      const x = num(c, raw["x"], `${path}/x`, X);
      const y = num(c, raw["y"], `${path}/y`, Y);
      const label = text(c, raw["label"], `${path}/label`, LIMITS.playerLabelLength, "label_too_long");
      const t = team(c, raw["team"], `${path}/team`);
      out = withExtras(
        { type: "player", x: x ?? 0, y: y ?? 0, label, team: t },
        { note: optText(c, raw, "note", path, LIMITS.noteLength), ghost: optFlag(c, raw, "ghost", path), key: optKey(c, raw, path) }
      );
      break;
    }
    case "machine": {
      const x = num(c, raw["x"], `${path}/x`, X);
      const y = num(c, raw["y"], `${path}/y`, Y);
      let a = 0;
      const rawAngle = raw["angle"];
      if (rawAngle !== void 0) {
        if (typeof rawAngle !== "number" || !Number.isFinite(rawAngle)) c.add("not_a_number", `${path}/angle`);
        else if (rawAngle < 0 || rawAngle >= 360) c.add("bad_angle", `${path}/angle`);
        else a = round2(rawAngle) % 360;
      }
      out = withExtras({ type: "machine", x: x ?? 0, y: y ?? 0, angle: a }, { key: optKey(c, raw, path) });
      break;
    }
    case "cone": {
      const x = num(c, raw["x"], `${path}/x`, X);
      const y = num(c, raw["y"], `${path}/y`, Y);
      out = withExtras({ type: "cone", x: x ?? 0, y: y ?? 0 }, { label: optText(c, raw, "label", path, LIMITS.coneLabelLength), key: optKey(c, raw, path) });
      break;
    }
    case "zone": {
      const x = num(c, raw["x"], `${path}/x`, X);
      const y = num(c, raw["y"], `${path}/y`, Y);
      const w = num(c, raw["w"], `${path}/w`, [LIMITS.zoneWidth.min, LIMITS.zoneWidth.max], "bad_size");
      const h = num(c, raw["h"], `${path}/h`, [LIMITS.zoneHeight.min, LIMITS.zoneHeight.max], "bad_size");
      const label = text(c, raw["label"], `${path}/label`, LIMITS.zoneLabelLength, "label_too_long");
      out = withExtras({ type: "zone", x: x ?? 0, y: y ?? 0, w: w ?? 1, h: h ?? 1, label }, { ghost: optFlag(c, raw, "ghost", path), key: optKey(c, raw, path) });
      break;
    }
    case "mark": {
      const x = num(c, raw["x"], `${path}/x`, X);
      const y = num(c, raw["y"], `${path}/y`, Y);
      const k = key(c, raw["key"], `${path}/key`);
      out = { type: "mark", x: x ?? 0, y: y ?? 0, key: k ?? "" };
      break;
    }
    case "move":
    case "ball":
    case "line": {
      const x1 = num(c, raw["x1"], `${path}/x1`, X);
      const y1 = num(c, raw["y1"], `${path}/y1`, Y);
      const x2 = num(c, raw["x2"], `${path}/x2`, X);
      const y2 = num(c, raw["y2"], `${path}/y2`, Y);
      const pts = { x1: x1 ?? 0, y1: y1 ?? 0, x2: x2 ?? 0, y2: y2 ?? 0 };
      if (raw["type"] === "move") {
        out = withExtras({ type: "move", ...pts }, { color: optColor(c, raw, path), key: optKey(c, raw, path) });
        break;
      }
      if (raw["type"] === "line") {
        out = withExtras(
          { type: "line", ...pts },
          { color: optColor(c, raw, path), dash: optFlag(c, raw, "dash", path), label: optText(c, raw, "label", path, LIMITS.lineLabelLength), key: optKey(c, raw, path) }
        );
        break;
      }
      let curve = false;
      if (raw["curve"] !== void 0) {
        if (typeof raw["curve"] === "boolean") curve = raw["curve"];
        else c.add("not_boolean", `${path}/curve`);
      }
      let bend = 1;
      if (raw["bend"] !== void 0) {
        if (raw["bend"] === 1 || raw["bend"] === -1) bend = raw["bend"];
        else c.add("bad_bend", `${path}/bend`);
      }
      let n = 1;
      if (typeof raw["n"] === "number" && Number.isInteger(raw["n"]) && raw["n"] >= 1 && raw["n"] <= LIMITS.maxShot) n = raw["n"];
      else c.add("bad_shot_number", `${path}/n`);
      let alt;
      if (raw["alt"] !== void 0) {
        if (typeof raw["alt"] === "string" && /^[a-z]$/.test(raw["alt"])) alt = raw["alt"];
        else c.add("bad_alt", `${path}/alt`);
      }
      const ball = { type: "ball", ...pts, curve, bend, n };
      out = withExtras(ball, { color: optColor(c, raw, path), dash: optFlag(c, raw, "dash", path), alt });
      break;
    }
    default:
      c.add("unknown_item_type", `${path}/type`);
      return void 0;
  }
  const court = optCourt(c, raw, path, courts);
  if (out && court !== void 0) out.court = court;
  return c.errors.length > before ? void 0 : out;
}
function courtList(c, v) {
  if (v === void 0) return void 0;
  if (!Array.isArray(v) || v.length < LIMITS.courts.min || v.length > LIMITS.courts.max || !v.every(isObj)) {
    c.add("bad_courts", "/courts");
    return void 0;
  }
  return v.map((r, i) => {
    const label = text(c, r["label"], `/courts/${i}/label`, LIMITS.courtLabelLength, "label_too_long");
    const link = text(c, r["link"], `/courts/${i}/link`, LIMITS.courtLinkLength, "label_too_long");
    return { ...label ? { label } : {}, ...link ? { link } : {} };
  });
}
function legendList(c, v) {
  if (v === void 0) return void 0;
  if (!Array.isArray(v) || v.length > LIMITS.legendEntries || !v.every(isObj)) {
    c.add("bad_legend", "/legend");
    return void 0;
  }
  return v.map((r, i) => {
    const k = optKey(c, r, `/legend/${i}`);
    const color = optColor(c, r, `/legend/${i}`);
    const t = text(c, r["text"] ?? null, `/legend/${i}/text`, LIMITS.legendTextLength, "label_too_long");
    return { ...k !== void 0 ? { key: k } : {}, ...color ? { color } : {}, text: t };
  });
}
function parseSource(input) {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return fail("not_json", "");
    }
  }
  if (!isObj(value)) return fail("not_an_object", "");
  const c = new Collector();
  if (value["format"] !== FORMAT_NAME) c.add("wrong_format", "/format");
  if (value["format"] === FORMAT_NAME && value["version"] !== FORMAT_VERSION) c.add("unsupported_version", "/version");
  const title = text(c, value["title"], "/title", LIMITS.titleLength, "title_too_long");
  const caption = text(c, value["caption"], "/caption", LIMITS.captionLength, "caption_too_long", true);
  let view = "full";
  if (value["view"] !== void 0) {
    if (value["view"] === "full" || value["view"] === "half" || value["view"] === "kitchen") view = value["view"];
    else c.add("bad_view", "/view");
  }
  let side = "bottom";
  if (value["side"] !== void 0) {
    if (value["side"] === "bottom" || value["side"] === "top") side = value["side"];
    else c.add("bad_side", "/side");
  }
  let orient = "portrait";
  if (value["orient"] !== void 0) {
    if (value["orient"] === "portrait" || value["orient"] === "landscape") orient = value["orient"];
    else c.add("bad_orient", "/orient");
  }
  const showCaption = optFlag(c, value, "showCaption", "");
  const courts = courtList(c, value["courts"]);
  const legend = legendList(c, value["legend"]);
  const items = [];
  const raw = value["items"];
  if (!Array.isArray(raw)) c.add("items_not_array", "/items");
  else if (raw.length > LIMITS.maxItems) c.add("too_many_items", "/items");
  else
    raw.forEach((r, i) => {
      const it = item(c, r, `/items/${i}`, courts?.length ?? 1);
      if (it) items.push(it);
    });
  if (c.errors.length) return { ok: false, errors: c.errors };
  const source = { format: FORMAT_NAME, version: FORMAT_VERSION, title, caption, view, side, orient, items };
  if (showCaption) source.showCaption = true;
  if (courts) source.courts = courts;
  if (legend) source.legend = legend;
  return { ok: true, source };
}
function fail(key2, path) {
  return { ok: false, errors: [{ key: key2, path, message: MESSAGES[key2] }] };
}
function validateSource(input) {
  const r = parseSource(input);
  return r.ok ? [] : r.errors;
}
function errorMessage(key2) {
  return MESSAGES[key2];
}
function emptySource() {
  return { format: FORMAT_NAME, version: FORMAT_VERSION, title: "", caption: "", view: "full", side: "bottom", orient: "portrait", items: [] };
}

// src/format/open.ts
var decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k === "lt") return "<";
  if (k === "gt") return ">";
  if (k === "amp") return "&";
  if (k === "quot") return '"';
  if (k === "apos") return "'";
  const code = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
  return Number.isFinite(code) && code <= 1114111 ? String.fromCodePoint(code) : m;
});
function extractSourceText(svg) {
  const raw = metadataText(svg);
  if (raw === null) return null;
  const inner = raw.trim();
  if (!inner) return null;
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(inner);
  return cdata && cdata[1] !== void 0 ? cdata[1] : decodeEntities(inner);
}
function metadataText(svg) {
  const closeTag = /<\/metadata>/gi;
  const closeTagFrom = (p) => {
    closeTag.lastIndex = p;
    return closeTag.exec(svg)?.index ?? -1;
  };
  let close = -2;
  const closeFrom = (p) => {
    if (close !== -1 && close < p) close = svg.indexOf("-->", p);
    return close;
  };
  let i = 0;
  for (; ; ) {
    const lt = svg.indexOf("<", i);
    if (lt < 0) return null;
    if (svg.startsWith("<!--", lt)) {
      const end = closeFrom(lt + 4);
      i = end < 0 ? lt + 4 : end + 3;
      continue;
    }
    const next = svg[lt + 9];
    if (svg.slice(lt, lt + 9).toLowerCase() === "<metadata" && next !== void 0 && /[\s>]/.test(next)) {
      const open = svg.indexOf(">", lt + 9);
      if (open < 0) return null;
      let text2 = "";
      let j = open + 1;
      let end = closeTagFrom(j);
      for (; ; ) {
        if (end < 0) return null;
        const c = svg.indexOf("<!--", j);
        const cEnd = c >= 0 && c < end ? closeFrom(c + 4) : -1;
        if (cEnd < 0) return text2 + svg.slice(j, end);
        text2 += svg.slice(j, c);
        j = cEnd + 3;
        if (j > end) end = closeTagFrom(j);
      }
    }
    i = lt + 1;
  }
}
function fail2(key2) {
  return { ok: false, errors: [{ key: key2, path: "", message: errorMessage(key2) }] };
}
function parseText(input) {
  const t = input.trim();
  if (!t) return fail2("empty_input");
  if (t.startsWith("<")) {
    const inner = extractSourceText(t);
    if (inner === null) return fail2("no_svg_source");
    try {
      JSON.parse(inner);
    } catch {
      return fail2("bad_svg_source");
    }
    return parseSource(inner);
  }
  return parseSource(t);
}
var KEY_ORDER = {
  player: ["type", "x", "y", "label", "team", "note", "ghost", "key", "court"],
  machine: ["type", "x", "y", "angle", "key", "court"],
  cone: ["type", "x", "y", "label", "key", "court"],
  zone: ["type", "x", "y", "w", "h", "label", "ghost", "key", "court"],
  move: ["type", "x1", "y1", "x2", "y2", "color", "key", "court"],
  ball: ["type", "x1", "y1", "x2", "y2", "curve", "bend", "n", "color", "dash", "alt", "court"],
  line: ["type", "x1", "y1", "x2", "y2", "color", "dash", "label", "key", "court"],
  mark: ["type", "x", "y", "key", "court"]
};
var present = (rec, keys) => Object.fromEntries(keys.filter((k) => k in rec && rec[k] !== void 0).map((k) => [k, rec[k]]));
function canonical(source) {
  const items = source.items.map((it) => {
    const order = KEY_ORDER[it.type] ?? [];
    return present(it, order);
  });
  const { format, version, title, caption, view, side, orient } = source;
  const extra = present(
    {
      showCaption: source.showCaption || void 0,
      courts: source.courts?.map((ct) => present(ct, ["label", "link"])),
      legend: source.legend?.map((e) => present(e, ["key", "color", "text"]))
    },
    ["showCaption", "courts", "legend"]
  );
  return { format, version, title, caption, view, side, orient, ...extra, items };
}
function stringifySource(source) {
  return JSON.stringify(canonical(source), null, 1);
}

// src/format/shots.ts
function ballItems(items) {
  return items.map((it, i) => [it, i]).filter((p) => p[0].type === "ball").sort((a, b) => a[0].n - b[0].n || (a[0].alt ?? "").localeCompare(b[0].alt ?? "") || a[1] - b[1]).map((p) => p[0]);
}
function slots(items) {
  const out = [];
  let slot = 0;
  let prev;
  for (const b of ballItems(items)) {
    if (!(prev && b.alt !== void 0 && prev.alt !== void 0 && b.n === prev.n)) slot++;
    out.push([b, slot]);
    prev = b;
  }
  return out;
}
function nextShotNumber(items) {
  return items.reduce((m, it) => it.type === "ball" ? Math.max(m, it.n) : m, 0) + 1;
}
function hasShotGap(items) {
  return slots(items).some(([b, s]) => b.n !== s);
}
function renumberShots(items) {
  for (const [b, s] of slots(items)) b.n = s;
}

// src/render/geometry.ts
var round22 = (v) => Math.round(v * 100) / 100;
var VIEWS = {
  full: { x: -2.5, y: -2.5, w: 25, h: 49 },
  kitchen: { x: -2.5, y: 13, w: 25, h: 18 },
  halfBottom: { x: -2.5, y: 19.5, w: 25, h: 27 },
  halfTop: { x: -2.5, y: -2.5, w: 25, h: 27 }
};
function courtView(view, side) {
  if (view === "half") return side === "top" ? VIEWS.halfTop : VIEWS.halfBottom;
  return VIEWS[view];
}
function viewBox(view, side, orient) {
  const v = courtView(view, side);
  return orient === "landscape" ? { x: v.y, y: -(v.x + v.w), w: v.h, h: v.w } : { ...v };
}
function arrowGeom(it) {
  const { x1, y1, x2, y2 } = it;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = Math.hypot(dx, dy) || 1;
  let cx = null;
  let cy = null;
  if (it.curve) {
    const k = 0.22 * len2 * (it.bend === -1 ? -1 : 1);
    cx = (x1 + x2) / 2 + -dy / len2 * k;
    cy = (y1 + y2) / 2 + dx / len2 * k;
  }
  const tx = cx === null ? dx : x2 - cx;
  const ty = cy === null ? dy : y2 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const head = Math.min(1.3, len2 * 0.6);
  const hw = 0.55;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const poly = `${round22(x2)},${round22(y2)} ${round22(bx - uy * hw)},${round22(by + ux * hw)} ${round22(bx + uy * hw)},${round22(by - ux * hw)}`;
  const d = cx === null || cy === null ? `M${round22(x1)} ${round22(y1)}L${round22(bx)} ${round22(by)}` : `M${round22(x1)} ${round22(y1)}Q${round22(cx)} ${round22(cy)} ${round22(bx)} ${round22(by)}`;
  const mx = cx === null ? (x1 + x2) / 2 : 0.25 * x1 + 0.5 * cx + 0.25 * x2;
  const my = cy === null ? (y1 + y2) / 2 : 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  return { poly, d, mx, my };
}
var LAYER = { zone: 0, line: 1, cone: 2, machine: 3, player: 4, move: 5, ball: 6, mark: 7 };
function drawOrder(items) {
  return items.map((it, i) => [it, i]).sort((a, b) => LAYER[a[0].type] - LAYER[b[0].type] || a[1] - b[1]).map((p) => p[0]);
}
function anchor(it) {
  return "x" in it ? { x: it.x, y: it.y } : { x: (it.x1 + it.x2) / 2, y: (it.y1 + it.y2) / 2 };
}
function countOffView(source) {
  const v = courtView(source.view, source.side);
  return source.items.filter((it) => {
    const { x, y } = anchor(it);
    return x < v.x || x > v.x + v.w || y < v.y || y > v.y + v.h;
  }).length;
}

// src/render/markup.ts
var FONT = "Arial, Helvetica, 'Helvetica Neue', sans-serif";
var COLOR = {
  grass: "#3d7a4a",
  court: "#2b6ca3",
  kitchen: "#1f5788",
  line: "#ffffff",
  netFill: "#f4f4f0",
  netEdge: "#1a1a1a",
  ball: "#e6f23a",
  ink: "#1a1a1a",
  move: "#ffffff",
  cone: "#ff5a1f",
  zone: "#ff922b",
  zoneOpacity: 0.38,
  machine: "#3d3d3d",
  machineInk: "#222222",
  white: "#ffffff",
  outline: "#ffffff",
  label: "#ffffff",
  labelOpacity: 0.55,
  badge: "#1a1a1a",
  moveDash: "0.7 0.55",
  pathDash: "0.8 0.6",
  ghostDash: "0.45 0.35",
  keyFill: "#ffffff",
  paper: "#ffffff"
};
var PATH_PALETTE = {
  yellow: ["#e6f23a", "#1a1a1a", "#e6f23a"],
  white: ["#ffffff", "#1a1a1a", "#ffffff"],
  orange: ["#e69f00", "#1a1a1a", "#e69f00"],
  red: ["#ff6a3d", "#1a1a1a", "#ff6a3d"],
  pink: ["#ff8fd0", "#1a1a1a", "#ff8fd0"],
  green: ["#5fd38d", "#1a1a1a", "#5fd38d"],
  black: ["#1a1a1a", "#ffffff", "#1a1a1a"]
};
var PLAYER_PALETTE = {
  orange: ["#e69f00", "#1a1a1a", "#ffffff"],
  blue: ["#0072b2", "#ffffff", "#ffffff"],
  white: ["#ffffff", "#1a1a1a", "#1a1a1a"],
  black: ["#1a1a1a", "#ffffff", "#ffffff"]
};
var XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\uD800-\uDFFF]/gu;
var esc = (s) => String(s).replace(XML_ILLEGAL, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function toGrey(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || m[1] === void 0) return hex;
  const n = parseInt(m[1], 16);
  const y = Math.round(0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255));
  return "#" + y.toString(16).padStart(2, "0").repeat(3);
}
var mk = (ctx) => ({
  c: (hex) => ctx.greyscale ? toGrey(hex) : hex,
  /** keeps text upright when the court is turned */
  up: (x, y) => ctx.orient === "landscape" ? ` transform="rotate(90 ${round22(x)} ${round22(y)})"` : ""
});
function pageOffset(orient, x, y, dx, dy) {
  return orient === "landscape" ? { x: x - dy, y: y + dx } : { x: x + dx, y: y + dy };
}
function keyBadge(key2, x, y, ctx, r = 0.75) {
  const { c, up } = mk(ctx);
  const n = [...key2].length;
  const fs = round22((n <= 1 ? 1.25 : n === 2 ? 1 : 0.8) * r);
  return `<circle cx="${round22(x)}" cy="${round22(y)}" r="${r}" fill="${c(COLOR.keyFill)}" stroke="${c(COLOR.ink)}" stroke-width="0.12"/><text x="${round22(x)}" y="${round22(y)}" dy="0.35em" font-size="${fs}" font-weight="700" fill="${c(COLOR.ink)}" text-anchor="middle" font-family="${FONT}"${up(x, y)}>${esc(key2)}</text>`;
}
function shotBadge(label, x, y, color, ctx) {
  const { c, up } = mk(ctx);
  const [stroke, fill, ink] = PATH_PALETTE[color ?? "yellow"];
  const fs = [...label].length > 1 ? 0.9 : 1.1;
  return `<circle cx="${round22(x)}" cy="${round22(y)}" r="0.85" fill="${c(fill)}" stroke="${c(stroke)}" stroke-width="0.12"/><text x="${round22(x)}" y="${round22(y)}" dy="0.35em" font-size="${fs}" font-weight="700" fill="${c(ink)}" text-anchor="middle" font-family="${FONT}"${up(x, y)}>${esc(label)}</text>`;
}
function haloText(text2, x, y, size, anchor2, ctx) {
  const { c, up } = mk(ctx);
  return `<text x="${round22(x)}" y="${round22(y)}" dy="0.35em" font-size="${size}" font-weight="700" fill="${c(COLOR.white)}" stroke="${c(COLOR.ink)}" stroke-width="0.2" paint-order="stroke" text-anchor="${anchor2}" font-family="${FONT}"${up(x, y)}>${esc(text2)}</text>`;
}
var shotLabel = (it) => String(Math.trunc(Number(it.n)) || 1) + (it.alt ?? "");
function courtMarkup(v, ctx) {
  const { c, up } = mk(ctx);
  const ln = `stroke="${c(COLOR.line)}" stroke-width="0.2" fill="none"`;
  const kl = (y) => `<text x="10" y="${y}" dy="0.35em" font-size="1.3" fill="${c(COLOR.label)}" fill-opacity="${COLOR.labelOpacity}" text-anchor="middle" font-family="${FONT}"${up(10, y)}>Kitchen</text>`;
  return `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${c(COLOR.grass)}"/><rect x="0" y="0" width="20" height="44" fill="${c(COLOR.court)}"/><rect x="0" y="15" width="20" height="7" fill="${c(COLOR.kitchen)}"/><rect x="0" y="22" width="20" height="7" fill="${c(COLOR.kitchen)}"/><rect x="0" y="0" width="20" height="44" ${ln}/><path d="M0 15H20M0 29H20M10 0V15M10 29V44" ${ln}/>` + kl(18.5) + kl(25.5) + `<rect x="-1" y="21.82" width="22" height="0.36" fill="${c(COLOR.netFill)}" stroke="${c(COLOR.netEdge)}" stroke-width="0.07"/>`;
}
function itemMarkup(it, ctx) {
  const { c, up } = mk(ctx);
  switch (it.type) {
    case "zone": {
      let s = it.ghost ? `<rect x="${round22(it.x)}" y="${round22(it.y)}" width="${round22(it.w)}" height="${round22(it.h)}" fill="none" stroke="${c(COLOR.zone)}" stroke-width="0.2" stroke-dasharray="${COLOR.pathDash}"/>` : `<rect x="${round22(it.x)}" y="${round22(it.y)}" width="${round22(it.w)}" height="${round22(it.h)}" fill="${c(COLOR.zone)}" fill-opacity="${COLOR.zoneOpacity}" stroke="${c(COLOR.zone)}" stroke-width="0.2"/>`;
      if (it.label) {
        const cx = it.x + it.w / 2;
        const cy = it.y + it.h / 2;
        s += `<text x="${round22(cx)}" y="${round22(cy)}" dy="0.35em" font-size="1.1" font-weight="700" fill="${c(COLOR.white)}" stroke="${c(COLOR.ink)}" stroke-width="0.2" paint-order="stroke" text-anchor="middle" font-family="${FONT}"${up(cx, cy)}>${esc(it.label)}</text>`;
      }
      if (it.key) s += keyBadge(it.key, it.x + 0.9, it.y + 0.9, ctx);
      return s;
    }
    case "cone": {
      let s = `<polygon points="${round22(it.x)},${round22(it.y - 1)} ${round22(it.x + 0.85)},${round22(it.y + 0.8)} ${round22(it.x - 0.85)},${round22(it.y + 0.8)}" fill="${c(COLOR.cone)}" stroke="${c(COLOR.outline)}" stroke-width="0.12" stroke-linejoin="round"/>`;
      if (it.label) {
        const p = pageOffset(ctx.orient, it.x, it.y, 1.1, 0);
        s += haloText(it.label, p.x, p.y, 1, "start", ctx);
      }
      if (it.key) {
        const p = pageOffset(ctx.orient, it.x, it.y, 0, -1.9);
        s += keyBadge(it.key, p.x, p.y, ctx);
      }
      return s;
    }
    case "machine": {
      let s = `<g transform="translate(${round22(it.x)} ${round22(it.y)}) rotate(${round22(it.angle)})"><rect x="-0.3" y="-1.9" width="0.6" height="1.2" fill="${c(COLOR.machineInk)}" stroke="${c(COLOR.outline)}" stroke-width="0.1"/><rect x="-1.1" y="-0.9" width="2.2" height="1.9" rx="0.3" fill="${c(COLOR.machine)}" stroke="${c(COLOR.outline)}" stroke-width="0.12"/><circle cx="0" cy="0.1" r="0.6" fill="${c(COLOR.ball)}"/></g>`;
      if (it.key) {
        const p = pageOffset(ctx.orient, it.x, it.y, 1.5, -1.5);
        s += keyBadge(it.key, p.x, p.y, ctx);
      }
      return s;
    }
    case "player": {
      const f = PLAYER_PALETTE[it.team] ?? PLAYER_PALETTE.orange;
      const n = [...it.label].length;
      const fs = n <= 1 ? 1.5 : n === 2 ? 1.15 : n === 3 ? 0.9 : 0.68;
      let s = it.ghost ? `<circle cx="${round22(it.x)}" cy="${round22(it.y)}" r="1.3" fill="none" stroke="${c(COLOR.white)}" stroke-width="0.18" stroke-dasharray="${COLOR.ghostDash}"/>` + (n ? `<text x="${round22(it.x)}" y="${round22(it.y)}" dy="0.35em" font-size="${fs}" font-weight="700" fill="${c(COLOR.white)}" fill-opacity="0.85" text-anchor="middle" font-family="${FONT}"${up(it.x, it.y)}>${esc(it.label)}</text>` : "") : `<circle cx="${round22(it.x)}" cy="${round22(it.y)}" r="1.3" fill="${c(f[0])}" stroke="${c(f[2])}" stroke-width="0.14"/>` + (n ? `<text x="${round22(it.x)}" y="${round22(it.y)}" dy="0.35em" font-size="${fs}" font-weight="700" fill="${c(f[1])}" text-anchor="middle" font-family="${FONT}"${up(it.x, it.y)}>${esc(it.label)}</text>` : "");
      if (it.note) {
        const p = pageOffset(ctx.orient, it.x, it.y, 0, 2.05);
        s += haloText(it.note, p.x, p.y, 0.9, "middle", ctx);
      }
      if (it.key) {
        const p = pageOffset(ctx.orient, it.x, it.y, 1.2, -1.2);
        s += keyBadge(it.key, p.x, p.y, ctx);
      }
      return s;
    }
    case "move": {
      const g = arrowGeom(it);
      const col = c(it.color ? PATH_PALETTE[it.color][0] : COLOR.move);
      return `<path d="${g.d}" fill="none" stroke="${col}" stroke-width="0.24" stroke-dasharray="${COLOR.moveDash}"/><polygon points="${g.poly}" fill="${col}"/>` + (it.key ? keyBadge(it.key, g.mx, g.my, ctx) : "");
    }
    case "ball": {
      const g = arrowGeom(it);
      if (it.color === void 0 && !it.dash && it.alt === void 0) {
        return `<path d="${g.d}" fill="none" stroke="${c(COLOR.ball)}" stroke-width="0.3" stroke-linecap="round"/><polygon points="${g.poly}" fill="${c(COLOR.ball)}"/><circle cx="${round22(g.mx)}" cy="${round22(g.my)}" r="0.85" fill="${c(COLOR.badge)}" stroke="${c(COLOR.ball)}" stroke-width="0.12"/><text x="${round22(g.mx)}" y="${round22(g.my)}" dy="0.35em" font-size="1.1" font-weight="700" fill="${c(COLOR.ball)}" text-anchor="middle" font-family="${FONT}"${up(g.mx, g.my)}>${Math.trunc(Number(it.n)) || 1}</text>`;
      }
      const col = c(PATH_PALETTE[it.color ?? "yellow"][0]);
      const dash = it.dash ? ` stroke-dasharray="${COLOR.pathDash}"` : ' stroke-linecap="round"';
      return `<path d="${g.d}" fill="none" stroke="${col}" stroke-width="0.3"${dash}/><polygon points="${g.poly}" fill="${col}"/>` + shotBadge(shotLabel(it), g.mx, g.my, it.color, ctx);
    }
    case "line": {
      const col = c(PATH_PALETTE[it.color ?? "white"][0]);
      const dash = it.dash ? ` stroke-dasharray="${COLOR.pathDash}"` : ' stroke-linecap="round"';
      let s = `<path d="M${round22(it.x1)} ${round22(it.y1)}L${round22(it.x2)} ${round22(it.y2)}" fill="none" stroke="${col}" stroke-width="0.24"${dash}/>`;
      const mx = (it.x1 + it.x2) / 2;
      const my = (it.y1 + it.y2) / 2;
      if (it.label) {
        const p = pageOffset(ctx.orient, mx, my, 0, -0.85);
        s += haloText(it.label, p.x, p.y, 0.95, "middle", ctx);
      }
      if (it.key) s += keyBadge(it.key, it.x1, it.y1, ctx);
      return s;
    }
    case "mark":
      return keyBadge(it.key, it.x, it.y, ctx, 0.9);
  }
}

// src/render/svg.ts
function embedSource(source) {
  return stringifySource(source).replace(/[￾￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
var PAPER = "#ffffff";
var INK = "#1a1a1a";
var GAP = { portrait: 6, landscape: 4 };
var HEAD = 2.2;
var TEXT_SIZE = 1;
var LINE_HEIGHT = 1.4;
var CHAR_WIDTH = 0.53;
function wrapText(text2, width, size = TEXT_SIZE) {
  const max = Math.max(8, Math.floor(width / (size * CHAR_WIDTH)));
  const out = [];
  for (const para of text2.split(/\r\n|\r|\n/)) {
    let line = "";
    for (const word of para.split(/[ \t]+/).filter(Boolean)) {
      if (!line) line = word;
      else if ([...line].length + 1 + [...word].length <= max) line += " " + word;
      else {
        out.push(line);
        line = word;
      }
      while ([...line].length > max) {
        out.push([...line].slice(0, max).join(""));
        line = [...line].slice(max).join("");
      }
    }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}
function textLine(s, x, y, ctx, opts = "") {
  const ink = ctx.greyscale ? toGrey(INK) : INK;
  return `<text x="${round22(x)}" y="${round22(y)}" font-size="${TEXT_SIZE}" fill="${ink}" font-family="${FONT}"${opts}>${esc(s)}</text>`;
}
function footer(source, x, top, width, ctx) {
  const pad = 0.8;
  let y = top + pad;
  let svg = "";
  const itemKeys = new Set(source.items.flatMap((it) => "key" in it && it.key ? [it.key] : []));
  const shots = new Map(source.items.flatMap((it) => it.type === "ball" ? [[shotLabel(it), it]] : []));
  for (const e of source.legend ?? []) {
    const lines = wrapText(e.text, width - pad * 2 - 2.2);
    const cy = y + 0.75;
    const flat = { ...ctx, orient: "portrait" };
    if (e.key !== void 0) {
      const shot = itemKeys.has(e.key) ? void 0 : shots.get(e.key);
      svg += shot ? shotBadge(e.key, x + pad + 0.85, cy, shot.color, flat) : keyBadge(e.key, x + pad + 0.85, cy, flat);
    } else if (e.color) {
      const col = ctx.greyscale ? toGrey(PATH_PALETTE[e.color][0]) : PATH_PALETTE[e.color][0];
      const edge = ctx.greyscale ? toGrey(INK) : INK;
      svg += `<rect x="${round22(x + pad)}" y="${round22(cy - 0.3)}" width="1.7" height="0.6" fill="${col}" stroke="${edge}" stroke-width="0.06"/>`;
    }
    lines.forEach((l, i) => svg += textLine(l, x + pad + 2.2, cy + i * LINE_HEIGHT, ctx, ' dy="0.35em"'));
    y += Math.max(1, lines.length) * LINE_HEIGHT + 0.5;
  }
  if (source.showCaption && source.caption) {
    if (source.legend?.length) y += 0.3;
    const lines = wrapText(source.caption, width - pad * 2);
    lines.forEach((l, i) => svg += textLine(l, x + pad, y + 0.75 + i * LINE_HEIGHT, ctx, ' dy="0.35em" font-style="italic"'));
    y += lines.length * LINE_HEIGHT + 0.3;
  }
  return { svg, h: svg ? round22(y - top + pad - 0.5) : 0 };
}
function courtGroup(source, items, ctx) {
  const world = source.orient === "landscape" ? '<g transform="rotate(-90)">' : "<g>";
  return world + courtMarkup(courtView(source.view, source.side), ctx) + "\n" + drawOrder(items).map((it) => itemMarkup(it, ctx)).join("\n") + "\n</g>";
}
function courtLayout(source) {
  const v = viewBox(source.view, source.side, source.orient);
  const n = source.courts?.length ?? 1;
  const across = source.orient === "portrait";
  const head = source.courts?.some((ct) => ct.label) ? HEAD : 0;
  const gap = GAP[source.orient];
  const offsets = Array.from({ length: n }, (_, i) => across ? { x: i * (v.w + gap), y: 0 } : { x: 0, y: i * (v.h + gap + head) });
  const frame = {
    x: v.x,
    y: v.y - head,
    w: across ? n * v.w + (n - 1) * gap : v.w,
    h: head + (across ? v.h : n * v.h + (n - 1) * (gap + head))
  };
  return { frame, offsets, head };
}
function multiCourt(source, ctx) {
  const { frame, offsets, head } = courtLayout(source);
  const v = viewBox(source.view, source.side, source.orient);
  const courts = source.courts ?? [{}];
  const across = source.orient === "portrait";
  const gap = GAP[source.orient];
  const ink = ctx.greyscale ? toGrey(INK) : INK;
  let body = "";
  courts.forEach((ct, i) => {
    const o = offsets[i] ?? { x: 0, y: 0 };
    const mine = source.items.filter((it) => (it.court ?? 1) === i + 1);
    body += `<svg x="${round22(v.x + o.x)}" y="${round22(v.y + o.y)}" width="${v.w}" height="${v.h}" viewBox="${v.x} ${v.y} ${v.w} ${v.h}">` + courtGroup(source, mine, ctx) + "</svg>\n";
    if (ct.label) body += `<text x="${round22(v.x + o.x + v.w / 2)}" y="${round22(v.y + o.y - 0.8)}" font-size="1.3" font-weight="700" fill="${ink}" text-anchor="middle" font-family="${FONT}">${esc(ct.label)}</text>
`;
    if (i === courts.length - 1) return;
    const gx = across ? v.x + o.x + v.w : v.x;
    const gy = across ? v.y + o.y : v.y + o.y + v.h;
    const cx = across ? gx + gap / 2 : gx + v.w / 2;
    const cy = across ? gy + v.h / 2 : gy + gap / 2 + (head ? 0.2 : 0);
    const lines = ct.link ? across ? wrapText(ct.link, gap - 0.6, 0.85) : [ct.link] : [];
    const arrow = across ? `<path d="M${round22(cx - 1.6)} ${round22(cy)}H${round22(cx + 0.9)}" stroke="${ink}" stroke-width="0.24"/><polygon points="${round22(cx + 1.7)},${round22(cy)} ${round22(cx + 0.8)},${round22(cy - 0.5)} ${round22(cx + 0.8)},${round22(cy + 0.5)}" fill="${ink}"/>` : `<path d="M${round22(cx)} ${round22(cy - 1.4)}V${round22(cy + 0.6)}" stroke="${ink}" stroke-width="0.24"/><polygon points="${round22(cx)},${round22(cy + 1.4)} ${round22(cx - 0.5)},${round22(cy + 0.5)} ${round22(cx + 0.5)},${round22(cy + 0.5)}" fill="${ink}"/>`;
    body += arrow;
    lines.forEach((l, j) => {
      const tx = across ? cx : cx + 1.2;
      const ty = across ? cy - 1.2 - (lines.length - j) * 1.1 + 0.55 : cy;
      body += `<text x="${round22(tx)}" y="${round22(ty)}" dy="0.35em" font-size="0.85" font-weight="700" fill="${ink}" text-anchor="${across ? "middle" : "start"}" font-family="${FONT}">${esc(l)}</text>`;
    });
    body += "\n";
  });
  return { body, frame };
}
function renderSvg(source, options = {}) {
  const greyscale = options.greyscale === true;
  const ctx = { orient: source.orient, greyscale };
  const title = source.title || "Drill diagram";
  const head = (v) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" width="${Math.round(v.w * 16)}" height="${Math.round(v.h * 16)}" role="img" aria-label="${esc(title)}" font-family="${FONT}">
<title>${esc(title)}</title>
` + (source.caption ? `<desc>${esc(source.caption)}</desc>
` : "") + `<metadata>${embedSource(source)}</metadata>
`;
  const extras = !!source.courts || !!source.legend?.length || !!source.showCaption && !!source.caption;
  if (!extras) {
    return head(viewBox(source.view, source.side, source.orient)) + courtGroup(source, source.items, ctx) + "\n</svg>";
  }
  const { body, frame } = source.courts ? multiCourt(source, ctx) : { body: courtGroup(source, source.items, ctx) + "\n", frame: viewBox(source.view, source.side, source.orient) };
  const foot = footer(source, frame.x, frame.y + frame.h, frame.w, ctx);
  const page = { ...frame, h: round22(frame.h + foot.h) };
  const paper = ctx.greyscale ? toGrey(PAPER) : PAPER;
  return head(page) + `<rect x="${page.x}" y="${page.y}" width="${page.w}" height="${page.h}" fill="${paper}"/>
` + body + foot.svg + (foot.svg ? "\n" : "") + "</svg>";
}

export {
  COURT,
  MARGIN,
  BOUNDS,
  LIMITS,
  FORMAT_NAME,
  FORMAT_VERSION,
  PLAYER_COLORS,
  LEGACY_TEAMS,
  PATH_COLORS,
  parseSource,
  validateSource,
  errorMessage,
  emptySource,
  extractSourceText,
  parseText,
  stringifySource,
  ballItems,
  nextShotNumber,
  hasShotGap,
  renumberShots,
  VIEWS,
  courtView,
  viewBox,
  arrowGeom,
  drawOrder,
  countOffView,
  PATH_PALETTE,
  PLAYER_PALETTE,
  esc,
  toGrey,
  courtMarkup,
  itemMarkup,
  embedSource,
  renderSvg
};
//# sourceMappingURL=chunk-YDA6FYBE.js.map