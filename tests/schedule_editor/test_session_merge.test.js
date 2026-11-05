const test = require("node:test");
const assert = require("node:assert");
const { buildSessionPayload } = require("../../tools/schedule-editor/static/session-merge.js");

test("preserves export_header/export_footer from the loaded session", () => {
  const loaded = {
    date: "2026-11-06", label: "11/6",
    export_header: "自訂標題", export_footer: "自訂結尾",
    warmup: { duration: "10 分鐘", note: "舊備註" },
    rotation_note: "舊輪替說明",
    blocks: [{ drill_id: 1, duration: "20 分鐘" }],
  };
  const form = {
    date: "2026-11-06", label: "11/6（改過）",
    warmupDuration: "15 分鐘", warmupNote: "新備註",
    rotationNote: "新輪替說明",
    blocks: [{ drill_id: 2, duration: "30 分鐘" }],
  };
  const payload = buildSessionPayload(loaded, form);
  assert.strictEqual(payload.export_header, "自訂標題");
  assert.strictEqual(payload.export_footer, "自訂結尾");
  assert.strictEqual(payload.label, "11/6（改過）");
  assert.strictEqual(payload.warmup.note, "新備註");
  assert.deepStrictEqual(payload.blocks, [{ drill_id: 2, duration: "30 分鐘" }]);
});

test("brand-new session (no loaded row) carries no stray export fields", () => {
  const form = {
    date: "2026-12-25", label: "12/25",
    warmupDuration: "10 分鐘", warmupNote: "熱身",
    rotationNote: "", blocks: [],
  };
  const payload = buildSessionPayload(null, form);
  assert.strictEqual(payload.export_header, undefined);
  assert.strictEqual(payload.export_footer, undefined);
  assert.strictEqual(payload.date, "2026-12-25");
});
