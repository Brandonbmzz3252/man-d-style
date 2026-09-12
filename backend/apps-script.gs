// MAN-D-STYLE availability + admin backend (Google Apps Script)
// 1) Spreadsheet -> Extensions -> Apps Script
// 2) Paste this whole file, Save
// 3) Deploy -> New deployment -> Web app (Execute as: Me, Who has access: Anyone)
//    OR: Deploy -> Manage deployments -> Edit -> New version (after edits)
// 4) Copy the /exec URL into config.js (window.MDS_BACKEND_URL)
//
// Admin credentials:
//   - Default staff password:  Mandy@1234   (changeable via the Staff panel)
//   - Master key (overrides everything): ZetaZoe@1234

var ADMIN_HASH_KEY = "MDS_ADMIN_HASH";
var MASTER_HASH_KEY = "MDS_MASTER_HASH";

function hashPw(pw) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, pw || "", Utilities.Charset.UTF_8
  );
  return digest.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

function getAdminHash() {
  var props = PropertiesService.getScriptProperties();
  var h = props.getProperty(ADMIN_HASH_KEY);
  if (!h) {
    h = hashPw("Mandy@1234");
    props.setProperty(ADMIN_HASH_KEY, h);
  }
  return h;
}

function setAdminHash(h) {
  PropertiesService.getScriptProperties().setProperty(ADMIN_HASH_KEY, h);
}

function getMasterHash() {
  var props = PropertiesService.getScriptProperties();
  var h = props.getProperty(MASTER_HASH_KEY);
  if (!h) {
    h = hashPw("ZetaZoe@1234");
    props.setProperty(MASTER_HASH_KEY, h);
  }
  return h;
}

function verifyRole(pw) {
  if (!pw) return null;
  if (hashPw(pw) === getAdminHash()) return "admin";
  if (hashPw(pw) === getMasterHash()) return "master";
  return null;
}

function doGet() {
  return jsonOut({ ok: true, bookings: getAllBookings() });
}

function doPost(e) {
  var b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) {
    return jsonOut({ ok: false, error: "bad_json" });
  }

  if (b.action === "login") return adminLogin(b.pw);
  if (b.action === "list") return adminList(b.pw);
  if (b.action === "delete") return adminDelete(b.pw, b.date, b.time);
  if (b.action === "changePw") return adminChangePw(b.pw, b.oldPw, b.newPw);

  // ---- public booking flow ----
  if (!b.date || !b.time) return jsonOut({ ok: false, error: "missing_date_or_time" });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (isSlotTaken(b.date, b.time)) {
      return jsonOut({ ok: false, taken: true, reason: "blocked" });
    }
    var sheet = getSheet();
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

/* ---- admin ---- */

function adminLogin(pw) {
  var role = verifyRole(pw);
  if (!role) return jsonOut({ ok: false });
  return jsonOut({ ok: true, role: role });
}

function adminList(pw) {
  if (!verifyRole(pw)) return jsonOut({ ok: false, error: "unauthorized" });

  var rows = getAllBookingsFull();
  var today = todayStr();
  var upcoming = rows
    .filter(function (r) { return r.date >= today; })
    .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });

  var clients = {};
  rows.forEach(function (r) {
    var key = (r.phone || "").replace(/[^0-9]/g, "") || (r.name || "?");
    if (!clients[key]) clients[key] = { name: r.name || "", phone: r.phone || "", count: 0 };
    clients[key].count++;
    if (r.name) clients[key].name = r.name;
  });

  var clientList = Object.keys(clients).map(function (k) {
    var c = clients[k];
    var stamps = c.count % 5;
    c.stamps = stamps;
    c.freeNext = stamps === 4; // 4 done -> 5th is free
    return c;
  }).sort(function (a, b) { return b.count - a.count; });

  return jsonOut({ ok: true, bookings: upcoming, clients: clientList });
}

function adminDelete(pw, date, time) {
  if (!verifyRole(pw)) return jsonOut({ ok: false, error: "unauthorized" });
  if (!date || !time) return jsonOut({ ok: false, error: "missing_date_or_time" });

  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (String(row[3]) === String(date) && String(row[4]) === String(time)) {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }
  return jsonOut({ ok: true, removed: removed });
}

function adminChangePw(pw, oldPw, newPw) {
  var role = verifyRole(pw);
  if (!role) return jsonOut({ ok: false, error: "unauthorized" });

  if (!newPw || String(newPw).length < 6) return jsonOut({ ok: false, error: "weak" });

  // Master key can change the password without knowing the old one.
  if (role !== "master") {
    if (!oldPw || hashPw(oldPw) !== getAdminHash()) {
      return jsonOut({ ok: false, error: "bad_old" });
    }
  }
  setAdminHash(hashPw(String(newPw)));
  return jsonOut({ ok: true });
}

/* ---- availability rules ---- */
//  Mon-Fri (weekday): only ONE booking per day (time slots are too close).
//  Saturday: bookings must be at least 3 hours apart from each other.
function isSlotTaken(date, time) {
  if (isWeekday(date)) {
    return getAllBookings().some(function (e) { return e.date === date; });
  }
  var t = toMin(time);
  return getAllBookings().some(function (e) {
    if (e.date !== date) return false;
    var bt = toMin(e.time);
    return t >= bt && t < bt + 180; // next 3 hours blocked
  });
}

function isWeekday(date) {
  var p = date.split("-").map(Number);
  var wd = new Date(p[0], p[1] - 1, p[2]).getDay();
  return wd >= 1 && wd <= 5;
}

function toMin(t) {
  var p = t.split(":").map(Number);
  return p[0] * 60 + p[1];
}

function todayStr() {
  var d = new Date();
  function pad2(n) { return ("0" + n).slice(-2); }
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/* ---- sheet helpers ---- */

function getAllBookings() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var bookings = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[3] || !row[4]) continue;
    bookings.push({ date: String(row[3]), time: String(row[4]), service: String(row[1] || "") });
  }
  return bookings;
}

function getAllBookingsFull() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[3] || !r[4]) continue;
    rows.push({
      date: String(r[3]),
      time: String(r[4]),
      service: String(r[1] || ""),
      price: String(r[2] || ""),
      name: String(r[5] || ""),
      phone: String(r[6] || ""),
      notes: String(r[7] || "")
    });
  }
  return rows;
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Bookings");
  if (sh) return sh;
  var created = ss.insertSheet("Bookings");
  created.appendRow(["ts", "service", "price", "date", "time", "name", "phone", "notes"]);
  return created;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}