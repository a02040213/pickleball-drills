// Builds the POST /api/sessions payload for the session form.
//
// `loaded` is the full session object as last fetched from the server
// (or null when creating a brand-new session) — spread first so any
// field the form doesn't expose (export_header, export_footer, or any
// future per-session key) survives an edit instead of being dropped.
function buildSessionPayload(loaded, form) {
  const payload = loaded ? Object.assign({}, loaded) : {};
  payload.date = form.date;
  payload.label = form.label;
  payload.warmup = { duration: form.warmupDuration, note: form.warmupNote };
  payload.rotation_note = form.rotationNote;
  payload.blocks = form.blocks;
  return payload;
}

if (typeof module !== "undefined") {
  module.exports = { buildSessionPayload };
}
