function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Default date for a new or duplicated session: the same weekday,
// one week after the latest existing session.
function defaultNextSessionDate(existingDates) {
  if (!existingDates.length) return "";
  const latest = existingDates.slice().sort().slice(-1)[0];
  return addDays(latest, 7);
}

if (typeof module !== "undefined") {
  module.exports = { addDays, defaultNextSessionDate };
}
