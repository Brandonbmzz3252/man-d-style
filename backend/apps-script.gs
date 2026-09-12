// MAN-D-STYLE availability backend (Google Apps Script)
// 1) New spreadsheet -> Extensions -> Apps Script
// 2) Paste this whole file, Save
// 3) Deploy -> New deployment -> Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 4) Copy the /exec URL into config.js (window.MDS_BACKEND_URL)

function doGet() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const bookings = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[3] || !row[4]) continue;                 // must have date + time
    bookings.push({
      date: String(row[3]),
      time: String(row[4]),
      service: String(row[2] || "")
    });
  }
  return jsonOut({ ok: true, bookings: bookings });
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) {
    return jsonOut({ ok: false, error: "bad_json" });
  }
  if (!b.date || !b.time) return jsonOut({ ok: false, error: "missing_date_or_time" });
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