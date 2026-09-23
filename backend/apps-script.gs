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
  migratePhones();
  return jsonOut({ ok: true, bookings: getAllBookings(), availability: listAvailabilityData() });
}

function canonPhone(p) {
  var d = String(p || "").replace(/[^0-9]/g, "");
  if (!d) return d;
  if (d.charAt(0) === "0") d = "27" + d.slice(1);
  else if (d.charAt(0) !== "2" && d.length <= 10) d = "27" + d;
  return d;
}

// One-time + ongoing guard: rewrites saved phone numbers into one consistent
// 27XXXXXXXXX format so lookups, admin and WhatsApp always agree.
function migratePhones() {
  try {
    var sh = getSheet();
    var data = sh.getDataRange().getValues();
    var changed = false;
    for (var i = 1; i < data.length; i++) {
      var raw = data[i][6];
      if (!raw) continue;
      var c = canonPhone(raw);
      if (c !== String(raw || "")) {
        data[i][6] = c;
        changed = true;
      }
    }
    if (changed && data.length > 1) {
      sh.getRange(2, 1, data.length - 1, sh.getLastColumn()).setValues(data.slice(1));
    }
  } catch (err) {}
}

function doPost(e) {
  var b = {};
  migratePhones();
  try { b = JSON.parse(e.postData.contents); } catch (err) {
    return jsonOut({ ok: false, error: "bad_json" });
  }

  if (b.action === "login") return adminLogin(b.pw);
  if (b.action === "list") return adminList(b.pw);
  if (b.action === "delete") return adminDelete(b.pw, b.date, b.time);
  if (b.action === "changePw") return adminChangePw(b.pw, b.oldPw, b.newPw);
  if (b.action === "listSpecials") return listSpecials();
  if (b.action === "addSpecial") return addSpecial(b);
  if (b.action === "deleteSpecial") return deleteSpecial(b);
  if (b.action === "updateSpecial") return updateSpecial(b);
  if (b.action === "setAvailability") return setAvailability(b);
  if (b.action === "clearAvailability") return clearAvailability(b);
  if (b.action === "registerPush") return registerPush(b);
  if (b.action === "sendTestPush") return sendTestPush(b);
  if (b.action === "cancel") return publicCancel(b);
  if (b.action === "myBookings") return publicMyBookings(b);

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
      canonPhone(b.phone), // G phone (canonical 27XXXXXXXXX)
      b.notes || ""      // H notes
    ]);
    try { sendBookingEmail(b); } catch (err) {}
    try { sendBookingPush(b); } catch (err) {}
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
  var nowTime = nowTimeStr();

  var upcoming = [];
  var done = [];
  rows.forEach(function (r) {
    if (r.date < today || (r.date === today && r.time <= nowTime)) {
      done.push(r);
    } else {
      upcoming.push(r);
    }
  });

  function byTime(a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }
  upcoming.sort(byTime);
  done.sort(byTime);

  var clients = {};
  rows.forEach(function (r) {
    var key = canonPhone(r.phone) || (r.name || "?");
    if (!clients[key]) clients[key] = { name: r.name || "", phone: key, count: 0 };
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

  return jsonOut({ ok: true, bookings: upcoming, done: done, clients: clientList });
}

function adminDelete(pw, date, time) {
  if (!verifyRole(pw)) return jsonOut({ ok: false, error: "unauthorized" });
  if (!date || !time) return jsonOut({ ok: false, error: "missing_date_or_time" });

  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (fmtDate(row[3]) === String(date) && fmtTime(row[4]) === String(time)) {
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

/* ---- specials (admin manages, clients read) ---- */
function getSpecialsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Specials");
  if (sh) return sh;
  var created = ss.insertSheet("Specials");
  created.appendRow(["id", "title", "body", "price", "validUntil", "active", "created"]);
  return created;
}

function listSpecials() {
  var sh = getSpecialsSheet();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[0] && !r[1]) continue;
    out.push({
      id: String(r[0] || ""),
      title: String(r[1] || ""),
      body: String(r[2] || ""),
      price: String(r[3] || ""),
      validUntil: String(r[4] || ""),
      active: r[5] === true || String(r[5]).toLowerCase() === "true" || r[5] === 1 || r[5] === "1"
    });
  }
  return jsonOut({ ok: true, specials: out });
}

function addSpecial(b) {
  if (!verifyRole(b.pw)) return jsonOut({ ok: false, error: "unauthorized" });
  var title = String(b.title || "").trim();
  if (!title) return jsonOut({ ok: false, error: "missing_title" });
  var active = b.active === false ? false : true;
  var special = {
    id: Utilities.getUuid().slice(0, 8),
    title: title,
    body: String(b.body || ""),
    price: String(b.price || ""),
    validUntil: String(b.validUntil || ""),
    active: active
  };
  getSpecialsSheet().appendRow([
    special.id, special.title, special.body, special.price, special.validUntil, active, new Date()
  ]);
  return jsonOut({ ok: true, special: special });
}

function deleteSpecial(b) {
  if (!verifyRole(b.pw)) return jsonOut({ ok: false, error: "unauthorized" });
  if (!b.id) return jsonOut({ ok: false, error: "missing_id" });
  var sh = getSpecialsSheet();
  var data = sh.getDataRange().getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(b.id)) {
      sh.deleteRow(i + 1);
      removed++;
    }
  }
  return jsonOut({ ok: true, removed: removed });
}

function updateSpecial(b) {
  if (!verifyRole(b.pw)) return jsonOut({ ok: false, error: "unauthorized" });
  if (!b.id) return jsonOut({ ok: false, error: "missing_id" });
  var title = String(b.title || "").trim();
  if (!title) return jsonOut({ ok: false, error: "missing_title" });
  var sh = getSpecialsSheet();
  var data = sh.getDataRange().getValues();
  var active = true;
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(b.id)) {
      data[i][1] = title;
      data[i][2] = String(b.body || "");
      data[i][3] = String(b.price || "");
      data[i][4] = String(b.validUntil || "");
      active = data[i][5] === true || String(data[i][5]).toLowerCase() === "true" || data[i][5] === 1 || data[i][5] === "1";
      found = true;
      break;
    }
  }
  if (!found) return jsonOut({ ok: false, error: "not_found" });
  var lastCol = Math.max(sh.getLastColumn(), 7);
  var rows = data.slice(1).map(function (r) {
    var row = [];
    for (var c = 0; c < lastCol; c++) row.push(c < r.length ? r[c] : "");
    return row;
  });
  if (rows.length > 0) sh.getRange(2, 1, rows.length, lastCol).setValues(rows);
  return jsonOut({
    ok: true,
    special: {
      id: String(b.id),
      title: title,
      body: String(b.body || ""),
      price: String(b.price || ""),
      validUntil: String(b.validUntil || ""),
      active: active
    }
  });
}

/* ---- availability overrides (admin chooses exact slots for a date) ----
   A date with no row keeps the default rules (see isSlotTaken). */
function getAvailabilitySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Availability");
  if (sh) return sh;
  var created = ss.insertSheet("Availability");
  created.appendRow(["date", "times", "updated"]);
  return created;
}

function listAvailabilityData() {
  var sh = getAvailabilitySheet();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var d = fmtDate(r[0]);
    if (!d) continue;
    var times = String(r[1] || "").split(",").map(function (t) {
      return String(t).trim();
    }).filter(function (t) { return t; });
    times.sort();
    out.push({ date: d, times: times });
  }
  return out;
}

function getOverride(date) {
  var list = listAvailabilityData();
  for (var i = 0; i < list.length; i++) {
    if (list[i].date === String(date)) return list[i].times;
  }
  return null;
}

function setAvailability(b) {
  if (!verifyRole(b.pw)) return jsonOut({ ok: false, error: "unauthorized" });
  var date = String(b.date || "").trim();
  if (!date) return jsonOut({ ok: false, error: "missing_date" });
  var times = Array.isArray(b.times)
    ? b.times.map(function (t) { return String(t).trim(); }).filter(function (t) { return t; })
    : [];
  times.sort();
  var sh = getAvailabilitySheet();
  var data = sh.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (fmtDate(data[i][0]) === date) sh.deleteRow(i + 1);
  }
  sh.appendRow([date, times.join(","), new Date()]);
  return jsonOut({ ok: true, date: date, times: times });
}

function clearAvailability(b) {
  if (!verifyRole(b.pw)) return jsonOut({ ok: false, error: "unauthorized" });
  var date = String(b.date || "").trim();
  if (!date) return jsonOut({ ok: false, error: "missing_date" });
  var sh = getAvailabilitySheet();
  var data = sh.getDataRange().getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (fmtDate(data[i][0]) === date) {
      sh.deleteRow(i + 1);
      removed++;
    }
  }
  return jsonOut({ ok: true, removed: removed });
}

/* ---- push notifications (admin devices get a buzz/ring on new bookings) ---- */
var PUSH_TOKENS_KEY = "MDS_PUSH_TOKENS";

function registerPush(b) {
  if (!verifyRole(b.pw)) return jsonOut({ ok: false, error: "unauthorized" });
  var token = String(b.token || "").trim();
  if (!token) return jsonOut({ ok: false, error: "missing_token" });
  var props = PropertiesService.getScriptProperties();
  var list = [];
  try { list = JSON.parse(props.getProperty(PUSH_TOKENS_KEY) || "[]"); } catch (e) { list = []; }
  if (list.indexOf(token) === -1) {
    list.push(token);
    props.setProperty(PUSH_TOKENS_KEY, JSON.stringify(list));
  }
  return jsonOut({ ok: true, count: list.length });
}

function sendBookingPush(b) {
  var tokens = [];
  try {
    tokens = JSON.parse(PropertiesService.getScriptProperties().getProperty(PUSH_TOKENS_KEY) || "[]");
  } catch (e) { tokens = []; }
  if (!tokens.length) return;
  var messages = tokens.map(function (t) {
    return {
      to: t,
      sound: "default",
      title: "New booking - " + (b.name || "Client"),
      body: (b.service || "Appointment") + (b.price ? " (" + b.price + ")" : "") +
        " - " + fmtLongDate(b.date) + " at " + b.time,
      priority: "high",
      channelId: "bookings",
      data: { type: "booking" }
    };
  });
  try {
    var resp = UrlFetchApp.fetch("https://exp.host/--/api/v2/push/send", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(messages),
      muteHttpExceptions: true
    });
    PropertiesService.getScriptProperties().setProperty("MDS_LAST_PUSH",
      JSON.stringify({ at: new Date().toISOString(), code: resp.getResponseCode(), body: resp.getContentText() }));
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty("MDS_LAST_PUSH",
      JSON.stringify({ at: new Date().toISOString(), error: String(err) }));
  }
}

function sendTestPush(b) {
  if (!verifyRole(b.pw)) return jsonOut({ ok: false, error: "unauthorized" });
  var tokens = [];
  try {
    tokens = JSON.parse(PropertiesService.getScriptProperties().getProperty(PUSH_TOKENS_KEY) || "[]");
  } catch (e) { tokens = []; }
  if (!tokens.length) return jsonOut({ ok: false, error: "no_tokens_registered" });
  var messages = tokens.map(function (t) {
    return {
      to: t,
      sound: "default",
      title: "MAN-D-STYLE test",
      body: "Push delivery is working.",
      priority: "high",
      channelId: "bookings",
      data: { type: "test" }
    };
  });
  try {
    var resp = UrlFetchApp.fetch("https://exp.host/--/api/v2/push/send", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(messages),
      muteHttpExceptions: true
    });
    return jsonOut({ ok: true, http: resp.getResponseCode(), body: resp.getContentText() });
  } catch (err) {
    return jsonOut({ ok: false, error: "fetch_failed", detail: String(err) });
  }
}

// Run this once in the Apps Script editor to grant UrlFetchApp (push) access.
function authCheck() {
  var r = UrlFetchApp.fetch("https://exp.host/--/api/v2/push/send", { muteHttpExceptions: true });
  return "http " + r.getResponseCode();
}

/* ---- public: client cancels own booking ---- */
function publicCancel(b) {
  if (!b.date || !b.time || !b.phone) return jsonOut({ ok: false, error: "missing" });
  var phoneKey = canonPhone(b.phone);
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var rowPhone = canonPhone(row[6]);
    if (fmtDate(row[3]) === String(b.date) && fmtTime(row[4]) === String(b.time) && phoneKey && rowPhone === phoneKey) {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }
  return jsonOut({ ok: true, removed: removed });
}

/* ---- public: this client's own bookings (matches by phone) ---- */
function publicMyBookings(b) {
  if (!b.phone) return jsonOut({ ok: true, bookings: [] });
  var phoneKey = canonPhone(b.phone);
  var out = getAllBookingsFull().filter(function (r) {
    return canonPhone(r.phone) === phoneKey;
  });
  return jsonOut({ ok: true, bookings: out });
}

/* ---- availability rules ---- */
//  Mon-Fri (weekday): only ONE booking per day (time slots are too close).
//  Saturday: each client takes 3 hours, so nothing may START within
//            3 hours before OR after an existing booking (no overlaps).
function isSlotTaken(date, time) {
  var bookings = getAllBookings();
  // A custom schedule means each chosen slot stands on its own.
  if (getOverride(date) !== null) {
    return bookings.some(function (e) { return e.date === date && e.time === time; });
  }
  if (isWeekday(date)) {
    return bookings.some(function (e) { return e.date === date; });
  }
  var t = toMin(time);
  return bookings.some(function (e) {
    if (e.date !== date) return false;
    var bt = toMin(e.time);
    return t >= bt - 180 && t < bt + 180; // 3h before..3h after fully blocked
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

function nowTimeStr() {
  var d = new Date();
  function pad2(n) { return ("0" + n).slice(-2); }
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

/* ---- new-booking email alert (owner) ---- */
var OWNER_EMAIL = "petersenmandy1986@gmail.com";
var SALON_NAME = "MAN-D-STYLE";

function pad2(n) { return ("0" + n).slice(-2); }

function fmtLongDate(iso) {
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var p = String(iso).split("-").map(Number);
  return pad2(p[2]) + " " + MONTHS[(p[1] || 1) - 1] + " " + p[0];
}

function sendBookingEmail(b) {
  var date = fmtLongDate(b.date);
  var greeting = "Hi " + (b.name || "there");
  var confirmation = greeting + ",\n\n" +
    "Thank you for booking with " + SALON_NAME + ".\n\n" +
    "Your booking is confirmed for " + date + " at " + b.time + ".\n\n" +
    "We appreciate your support.";

  var waLink = "https://wa.me/" + canonPhone(b.phone);
  var body =
    "NEW BOOKING\n==========\n" +
    "Name:    " + b.name + "\n" +
    "Phone:   " + b.phone + "\n" +
    "Service: " + b.service + (b.price ? " (" + b.price + ")" : "") + "\n" +
    "Date:    " + date + "\n" +
    "Time:    " + b.time + "\n" +
    "Notes:   " + (b.notes || "-") + "\n\n" +
    "==========\nCOPY & PASTE THIS TO THE CLIENT ON WHATSAPP:\n==========\n\n" +
    confirmation + "\n\n" +
    "Reply in this chat button: " + waLink;

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: "New booking: " + (b.name || "") + " - " + date + " at " + b.time,
    body: body
  });
}

/* ---- sheet helpers ---- */

function getAllBookings() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var bookings = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[3] && !row[4]) continue;
    var d = fmtDate(row[3]);
    var t = fmtTime(row[4]);
    if (!d || !t) continue;
    bookings.push({ date: d, time: t, service: String(row[1] || "") });
  }
  return bookings;
}

function getAllBookingsFull() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var d = fmtDate(r[3]);
    var t = fmtTime(r[4]);
    if (!d || !t) continue;
    rows.push({
      date: d,
      time: t,
      service: String(r[1] || ""),
      price: String(r[2] || ""),
      name: String(r[5] || ""),
      phone: String(r[6] || ""),
      notes: String(r[7] || "")
    });
  }
  return rows;
}

// Google Sheets auto-converts appended strings like "2026-09-17" into real
// date cells and "16:00" into time cells. Normalize them back to plain text
// so every read is the exact same string the client sent.
function fmtDate(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var s = String(v || "").trim();
  return s;
}

function fmtTime(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "HH:mm");
  }
  var s = String(v || "").trim();
  return s;
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