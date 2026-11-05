const test = require("node:test");
const assert = require("node:assert");
const { addDays, defaultNextSessionDate } = require("../../tools/schedule-editor/static/date-utils.js");

test("addDays adds whole days across a month boundary", () => {
  assert.strictEqual(addDays("2026-11-27", 7), "2026-12-04");
});

test("defaultNextSessionDate is the latest existing date plus 7 days", () => {
  assert.strictEqual(defaultNextSessionDate(["2026-11-06", "2026-11-13"]), "2026-11-20");
});

test("defaultNextSessionDate with no existing sessions returns empty string", () => {
  assert.strictEqual(defaultNextSessionDate([]), "");
});
