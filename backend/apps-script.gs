// MAN-D-STYLE availability backend (Google Apps Script)
// 1) Spreadsheet -> Extensions -> Apps Script
// 2) Paste this whole file, Save
// 3) Deploy -> New deployment -> Web app
//    - Execute as: Me,  Who has access: Anyone
// 4) Copy the /exec URL into config.js (window.MDS_BACKEND_URL)
// NOTE: after editing this file, Deploy -> Manage deployments ->
//       Edit -> New version (otherwise the old cached code keeps running)

function doGet() {
  return jsonOut({ ok: true, bookings: getAllBookings() });
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) {
    return jsonOut({ ok: false, error: "bad_json" });
  }
  if (!b.date || !b.time) return jsonOut({ ok: false, error: "missing_date_or_time" });

  // Serialise concurrent bookings so two people can't grab the same slot.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (isSlotTaken(b.date, b.time)) {
      return jsonOut({ ok: false, taken: true, reason: "blocked" });
    }
    const sheet = getSheet();
    sheet.appendRow([
      new Date(),        // A timestamp
      b.service || "",   // B service
      b.price || "",     // C price
      b.date,            // D date (YYYY-MM-DD)
      b.time,            // E time (HH:MM)
      b.name || "",      // F name
      b.phone || "",     // G phone
      b.notes || ""      // H notes
    ]);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: "lock_timeout" });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Rules:
//  - Mon-Fri (weekday): only ONE booking per day (time slots are too close).
//  - Saturday: bookings must be at least 3 hours apart from each other.
function isSlotTaken(date, time) {
  if (isWeekday(date)) {
    return getAllBookings().some((e) => e.date === date);
  }
  const t = toMin(time);
  return getAllBookings().some((e) => {
    if (e.date !== date) return false;
    const bt = toMin(e.time);
    return t >= bt && t < bt + 180; // next 3 hours blocked
  });
}

function isWeekday(date) {
  const p = date.split("-").map(Number);
  const wd = new Date(p[0], p[1] - 1, p[2]).getDay();
  return wd >= 1 && wd <= 5;
}

function toMin(t) {
  const p = t.split(":").map(Number);
  return p[0] * 60 + p[1];
}

function getAllBookings() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const bookings = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[3] || !row[4]) continue;                 // must have date + time
    bookings.push({ date: String(row[3]), time: String(row[4]), service: String(row[2] || "") });
  }
  return bookings;
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Bookings");
  if (sh) return sh;
  const created = ss.insertSheet("Bookings");
  created.appendRow(["ts", "service", "price", "date", "time", "name", "phone", "notes"]);
  return created;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}