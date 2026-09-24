const WHATSAPP_NUMBER = "27747257566";
const STORAGE_KEY = "mds_bookings";
const APP_VERSION = "1.4";

/* Polyfills for older Android / in-app browsers — a missing method here
   used to crash the whole app at load. */
if (!String.prototype.padStart) {
  String.prototype.padStart = function (len, ch) {
    let s = String(this);
    while (s.length < len) s = (ch || "0") + s;
    return s;
  };
}
if (!String.prototype.padEnd) {
  String.prototype.padEnd = function (len, ch) {
    let s = String(this);
    while (s.length < len) s = s + (ch || " ");
    return s;
  };
}
if (!Array.prototype.includes) {
  Array.prototype.includes = function (x) { return this.indexOf(x) !== -1; };
}

/* ---- diagnostics: shows any runtime error as a small red bar so a broken
   page can be reported instead of silently failing. Removable at any time. ---- */
window.__mds = { errors: [], ready: false };
function renderDbg() {
  if (!window.__mds.errors.length) return;
  let el = document.getElementById("mds-dbg");
  if (!el) {
    el = document.createElement("div");
    el.id = "mds-dbg";
    el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#7a1c1c;color:#fff;font:12px/1.4 monospace;padding:8px 12px;word-break:break-all;";
    document.body.appendChild(el);
  }
  el.textContent = "ERROR: " + window.__mds.errors.join(" | ");
}
window.addEventListener("error", function (e) {
  window.__mds.errors.push(String((e && e.message) || ""));
  renderDbg();
});
window.addEventListener("unhandledrejection", function (e) {
  window.__mds.errors.push("rejection: " + String((e && e.reason)));
  renderDbg();
});

const SERVICES = [
  { id: "short", name: "Short", price: "R160", kidsPrice: "R120" },
  { id: "medium", name: "Medium", price: "R180", kidsPrice: "R140" },
  { id: "long", name: "Long", price: "R200", kidsPrice: "R160" },
  { id: "wbf", name: "W/B/ Flat iron", price: "" }
];

const TIMES = []; // placeholder (unused; times now depend on weekday)

const ADDONS = [
  { id: "trim",  name: "Trim",                  dur: "",       price: 35 },
  { id: "ns30",  name: "Neck & Shoulder",       dur: "30 min", price: 180, group: "Massage" },
  { id: "ns40",  name: "Neck & Shoulder",       dur: "40 min", price: 200, group: "Massage" },
  { id: "hns30", name: "Head, Neck & Shoulder", dur: "30 min", price: 200, group: "Massage" },
  { id: "hns40", name: "Head, Neck & Shoulder", dur: "40 min", price: 220, group: "Massage" }
];

function weekday(iso) {
  const parts = iso.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
}

function timesForDate(iso) {
  const wd = weekday(iso);
  if (wd === 0) return [];                // Sunday closed
  if (wd === 6) return ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];
  return ["16:00","17:00","18:00"];       // Mon–Fri 4pm–6pm
}

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const state = {
  service: null,
  price: "",
  kids: false,
  addons: [],
  date: "",
  time: "",
  name: "",
  phone: "",
  notes: ""
};

const $ = (id) => document.getElementById(id);

/* Hardened storage — in-app browsers (WhatsApp/Gmail), private mode and some
   privacy settings throw on localStorage access, which must never kill the app. */
function lsGet(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch (e) {}
}

/* ---- app theme (mirrors the Expo app's 4 themes) ---- */
const THEME_KEY = "mds_theme";
const THEME_OPTIONS = [
  { name: "emerald", label: "Emerald", swatch: ["#14301F", "#D4A657", "#F5EFE0"] },
  { name: "royal", label: "Royal Plum", swatch: ["#241744", "#C79A4B", "#F4EEFA"] },
  { name: "ocean", label: "Deep Ocean", swatch: ["#123648", "#3FB4AD", "#EFF5F7"] },
  { name: "ember", label: "Ember", swatch: ["#421A12", "#E0792C", "#F9F0E4"] }
];
const THEME_META = { emerald: "#14301F", royal: "#241744", ocean: "#123648", ember: "#421A12" };

function currentTheme() {
  const t = lsGet(THEME_KEY) || "emerald";
  return THEME_OPTIONS.some((x) => x.name === t) ? t : "emerald";
}

function applyTheme(name) {
  document.documentElement.dataset.theme = name;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_META[name] || "#14301F");
}

function renderThemeList() {
  const list = $("theme-list");
  if (!list) return;
  const t = currentTheme();
  list.innerHTML = THEME_OPTIONS.map((x) => `
    <a class="contact-row${t === x.name ? " active" : ""}" href="#contact" data-theme="${x.name}" aria-pressed="${t === x.name}">
      <span class="theme-swatches">${x.swatch.map((c) => `<span class="theme-chip" style="background:${c}"></span>`).join("")}</span>
      <span class="th-info" style="flex:1"><span class="c-primary">${x.label}</span><span class="c-sub">${t === x.name ? "Active now" : "Tap to apply"}</span></span>
      ${t === x.name ? '<svg class="ic sm"><use href="#check"/></svg>' : ""}
    </a>`).join("");
}

applyTheme(currentTheme());

document.addEventListener("click", (e) => {
  const pick = e.target.closest("[data-theme]");
  if (!pick) return;
  e.preventDefault();
  const name = pick.dataset.theme;
  lsSet(THEME_KEY, name);
  applyTheme(name);
  renderThemeList();
});

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtLong(iso) {
  const parts = iso.split("-");
  return `${pad(parseInt(parts[2], 10))} ${MONTHS[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
}

/* ---- service thumbnail photos (back-of-head views, local) ---- */
const HAIR_PHOTO = {
  short:  "img/short.jpg",
  medium: "img/medium.jpg",
  long:   "img/long.jpg"
};

function serviceCardHTML(svc, mode) {
  const isWbf = svc.id === "wbf";
  const showPrice = (state.kids && svc.kidsPrice) ? svc.kidsPrice : svc.price;

  if (isWbf) {
    return `
      <div class="wbf-card"${mode === "wiz" ? ' data-wbf="1"' : ""}>
        <div class="wbf-title">W / B / F</div>
        <div class="wbf-sub">WASH &nbsp;&bull;&nbsp; BLOW &nbsp;&bull;&nbsp; FLAT IRON</div>` + (mode === "wiz" ? "" : '<a href="#booking" class="book-link" data-book="wbf">Book this &rarr;</a>') + `
      </div>`;
  }

  const right = mode === "wiz"
    ? '<span class="radio"></span>'
    : `<a href="#booking" class="book-link" data-book="${svc.id}">Book this &rarr;</a>`;

  const priceLabel = state.kids && svc.kidsPrice
    ? `${svc.kidsPrice} <span class="kids-note">(Kids)</span>`
    : showPrice;

  return `
    <div class="service-card" data-id="${svc.id}"${mode === "wiz" ? ' data-wiz="1"' : ""}>
      <span class="svc-thumb"><img src="${HAIR_PHOTO[svc.id] || ""}" alt="${svc.name}" loading="lazy"></span>
      <span class="svc-info"><div class="svc-name">${svc.name}</div><div class="svc-price">${priceLabel}</div></span>
      ${right}
    </div>`;
}

function renderServices() {
  $("service-list-wiz").innerHTML = SERVICES.map((s) => serviceCardHTML(s, "wiz")).join("");
  $("kids-toggle").classList.toggle("active", state.kids);
  refreshWizardSelection();
}

function refreshWizardSelection() {
  document.querySelectorAll("#service-list-wiz [data-wiz], #service-list-wiz [data-wbf]").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === state.service || el.dataset.wbf === "1" && state.service === "wbf");
  });
}

function addonCardHTML(a) {
  const selected = state.addons.includes(a.id);
  return `
    <div class="addon-card${selected ? " selected" : ""}" data-addon="${a.id}">
      <span class="chk"><svg class="ic"><use href="#check"/></svg></span>
      <span class="addon-info">
        <span class="addon-name">${a.name}</span>${a.dur ? `<span class="addon-dur">${a.dur}</span>` : ""}
      </span>
      <span class="addon-price">R${a.price}</span>
    </div>`;
}

function renderAddons() {
  const rows = [];
  let lastGroup = null;
  ADDONS.forEach((a) => {
    if (a.group && a.group !== lastGroup) {
      rows.push(`<div class="addon-group">${a.group}</div>`);
    }
    lastGroup = a.group || null;
    rows.push(addonCardHTML(a));
  });
  $("service-list-addons").innerHTML = rows.join("");
}

function updateLiveTotal() {
  const t = priceNumber(state.price) + addonTotal();
  const row = $("step-total-row");
  if (t > 0) {
    $("step-total").textContent = `R${t}`;
    row.style.display = "";
  } else {
    row.style.display = "none";
  }
}

function toggleAddon(id) {
  const ix = state.addons.indexOf(id);
  if (ix === -1) state.addons.push(id);
  else state.addons.splice(ix, 1);
  renderAddons();
}

function addonTotal() {
  return state.addons.reduce((sum, id) => {
    const a = ADDONS.find((x) => x.id === id);
    return sum + (a ? a.price : 0);
  }, 0);
}

function priceNumber(s) {
  const n = parseInt(String(s || "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

document.addEventListener("click", (e) => {
  const addonCard = e.target.closest("#service-list-addons [data-addon]");
  if (addonCard) { toggleAddon(addonCard.dataset.addon); }
});

function selectService(id) {
  if (state.service === id) {
    state.service = null;
    state.price = "";
  } else {
    const svc = SERVICES.find((s) => s.id === id);
    if (!svc) return;
    state.service = svc.id;
    state.price = (state.kids && svc.kidsPrice) ? svc.kidsPrice : svc.price;
  }
  refreshWizardSelection();
  updateLiveTotal();
}

$("kids-toggle").addEventListener("click", () => {
  state.kids = $("kids-input").checked;
  applyKidsState();
});

function applyKidsState() {
  $("kids-input").checked = state.kids;
  state.price = "";
  if (state.service) {
    const svc = SERVICES.find((s) => s.id === state.service);
    state.price = (state.kids && svc.kidsPrice) ? svc.kidsPrice : svc.price;
  }
  renderServices();
  updateLiveTotal();
}

document.addEventListener("click", (e) => {
  const wizCard = e.target.closest("#service-list-wiz [data-wiz]");
  if (wizCard) { selectService(wizCard.dataset.id); return; }

  const wizWbf = e.target.closest("#service-list-wiz [data-wbf]");
  if (wizWbf) { selectService("wbf"); return; }

  const bookLink = e.target.closest("[data-book]");
  if (bookLink) { selectService(bookLink.dataset.book); }
});

/* ---- wizard navigation ---- */
function goStep(n) {
  const panels = document.querySelectorAll(".step");
  panels.forEach((el, i) => {
    el.classList.toggle("active", (i + 1) === n);
  });
  if (n === 2) { renderCalendar(); renderTimes(); }
  /* The step panels are in-flow (display:none/block), so switching steps
     changes the booking card's height and the sections below it shift up,
     making it look like the page jumped to Appointments. Scroll the active
     step back into view so the user always lands on the current step. */
  const panel = panels[n - 1];
  if (panel) {
    const y = panel.getBoundingClientRect().top + window.pageYOffset - 10;
    try { window.scrollTo({ top: y, behavior: "smooth" }); }
    catch (e) { window.scrollTo(0, y); }
  }
}

$("next-1").addEventListener("click", () => {
  if (!state.service && !state.addons.length) { flash("Please select a service or an additional service."); return; }
  goStep(2);
});

$("back-2").addEventListener("click", () => goStep(1));
$("next-2").addEventListener("click", () => {
  if (!state.date) { flash("Please pick a date."); return; }
  if (!state.time) { flash("Please pick a time."); return; }
  goStep(3);
});
$("back-3").addEventListener("click", () => goStep(2));

/* ---- calendar ---- */
let calYear;
let calMonth;

function renderCalendar() {
  const now = new Date();
  if (calYear === undefined) {
    calYear = now.getFullYear();
    calMonth = now.getMonth();
  }

  $("cal-prev").disabled = new Date(calYear, calMonth, 1) <= new Date(now.getFullYear(), now.getMonth(), 1);
  $("cal-label").textContent = `${MONTHS[calMonth]} ${calYear}`;

  const offset = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const days = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayISO();
  let html = "";

  for (let i = 0; i < offset; i++) html += `<span class="cal-cell dim"></span>`;

  for (let d = 1; d <= days; d++) {
    const iso = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const wd = weekday(iso);
    const closed = wd === 0 ? " none" : "";
    const disabled = iso < today ? " none" : "";
    const selected = iso === state.date ? " selected" : "";
    html += `<span class="cal-cell${disabled}${closed}${selected}" data-date="${iso}">${d}</span>`;
  }

  $("cal-grid").innerHTML = html;
}

$("cal-prev").addEventListener("click", () => {
  if (calMonth === 0) { calMonth = 11; calYear--; } else { calMonth--; }
  renderCalendar();
});

$("cal-next").addEventListener("click", () => {
  if (calMonth === 11) { calMonth = 0; calYear++; } else { calMonth++; }
  renderCalendar();
});

$("cal-grid").addEventListener("click", (e) => {
  const cell = e.target.closest(".cal-cell");
  if (!cell || cell.classList.contains("dim") || cell.classList.contains("none")) return;
  state.date = cell.dataset.date;
  state.time = "";
  renderCalendar();
  renderTimes();
});

/* ---- time pills ---- */
let remoteBookings = [];

async function syncBookings() {
  const url = window.MDS_BACKEND_URL;
  if (!url) { remoteBookings = []; renderTimes(); return; }
  try {
    const res = await fetch(url);
    const data = await res.json();
    remoteBookings = data && data.ok && Array.isArray(data.bookings) ? data.bookings : [];
  } catch (e) {
    remoteBookings = [];
  }
  renderTimes();
}

function bookedWindow(dateISO, checkTime, gapMin) {
  const all = getBookings().concat(remoteBookings);
  if (isWeekday(dateISO)) {
    // Mon-Fri: any existing booking fills the whole day
    return all.some((b) => b.date === dateISO);
  }
  // Saturday: each client takes 3 hours, so nothing may START within
  // 3 hours before OR after an existing booking (no overlaps).
  const t = toMinutes(checkTime);
  return all.some((b) => {
    if (b.date !== dateISO) return false;
    const bt = toMinutes(b.time);
    return t >= bt - gapMin && t < bt + gapMin;
  });
}

function isWeekday(iso) {
  const wd = weekday(iso);
  return wd >= 1 && wd <= 5;
}

function renderTimes() {
  const times = timesForDate(state.date || todayISO());
  const gapMin = 180;

  $("time-grid").innerHTML = times.map((t) => {
    const booked = bookedWindow(state.date || todayISO(), t, gapMin);
    return `<button type="button" class="time-pill${t === state.time && !booked ? " selected" : ""}${booked ? " booked" : ""}" data-time="${t}"${booked ? " disabled" : ""}>${t}</button>`;
  }).join("");
}

$("time-grid").addEventListener("click", (e) => {
  const pill = e.target.closest(".time-pill");
  if (!pill || pill.disabled) return;
  state.time = pill.dataset.time;
  renderTimes();
});

/* ---- confirm booking ---- */
function buildMessage(name, phone, service, price, date, time, notes, addons, total) {
  const lines = [
    "*NEW HAIR BOOKING*",
    "",
    `Name: ${name}`,
    `Contact: ${phone}`,
    addons && addons.length ? `Service: ${service}` : `Service: ${service}${price ? " (" + price + ")" : ""}`
  ];
  if (addons && addons.length) {
    lines.push("Additional:");
    addons.forEach((a) => lines.push(`  - ${a.name}${a.dur ? " (" + a.dur + ")" : ""}: R${a.price}`));
  }
  if (total) lines.push(`Total: ${total}`);
  lines.push(`Date: ${fmtLong(date)}`);
  lines.push(`Time: ${time}`);
  if (notes) lines.push(`Notes: ${notes}`);
  lines.push("", "Please confirm my appointment. Thank you!");
  return lines.join("\n");
}

function flash(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(flash.timeout);
  flash.timeout = setTimeout(() => toast.classList.remove("show"), 2600);
}

$("confirm-btn").addEventListener("click", async (e) => {
  state.name = $("det-name").value.trim();
  state.phone = $("det-phone").value.trim();
  state.notes = $("det-notes").value.trim();

  if (!state.name) { flash("Please enter your full name."); return; }
  if (!state.phone || !/^[0-9+\-\s]{7,15}$/.test(state.phone)) { flash("Please enter a valid contact number."); return; }

  const svc = SERVICES.find((s) => s.id === state.service);
  const addons = state.addons.map((id) => ADDONS.find((a) => a.id === id)).filter(Boolean);
  const mainPrice = state.price;
  const total = priceNumber(mainPrice) + addonTotal();
  const totalLabel = total > 0 ? `R${total}` : "";
  const addonsLabel = addons.map((a) => `${a.name}${a.dur ? " (" + a.dur + ")" : ""} R${a.price}`).join(", ");

  const booking = {
    service: svc ? svc.name : (addons.length ? "Additional services" : ""),
    price: totalLabel,
    date: state.date,
    time: state.time,
    name: state.name,
    phone: state.phone,
    notes: state.notes,
    ts: Date.now()
  };

  const btn = $("confirm-btn");
  btn.disabled = true;
  btn.textContent = "Booking…";

  // Complete the booking FIRST, then send the WhatsApp message — never the
  // other way round (a lost WhatsApp tab must not orphan the booking).
  try {
    // Fresh server check — someone else may have taken the slot since page load.
    await syncBookings();
    if (bookedWindow(state.date, state.time, 180)) {
      flash("Sorry, that time was just booked. Please pick another.");
      state.time = "";
      renderTimes();
      btn.disabled = false;
      btn.textContent = "Confirm Booking";
      return;
    }

    const accepted = await pushBooking(booking);
    if (accepted === false) {
      flash("Sorry, that time was just booked. Please pick another.");
      state.time = "";
      renderTimes();
      btn.disabled = false;
      btn.textContent = "Confirm Booking";
      return;
    }

    saveBooking(booking);

    $("sm-date").textContent = fmtLong(state.date);
    $("sm-time").textContent = state.time;
    $("sm-service").textContent = `${booking.service}${booking.price ? " (" + booking.price + ")" : ""}`;
    $("sm-name").textContent = booking.name;
    $("sm-phone").textContent = booking.phone;

    const addonsRow = $("sm-addons-row");
    const totalRow = $("sm-total-row");
    if (addons.length) {
      $("sm-addons").innerHTML = addons.map((a) => `${a.name}${a.dur ? " (" + a.dur + ")" : ""} - R${a.price}`).join("<br>");
      addonsRow.style.display = "";
    } else {
      addonsRow.style.display = "none";
    }
    if (totalLabel) {
      $("sm-total").textContent = totalLabel;
      totalRow.style.display = "";
    } else {
      totalRow.style.display = "none";
    }

    goStep(4);

    // Booking is saved — now go straight into WhatsApp. On phones, launch the
    // app via a native deep-link (Android intent / iOS whatsapp://) so no
    // wa.me "Go to WhatsApp / Open WhatsApp / Download" page ever appears.
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildMessage(booking.name, booking.phone, booking.service, booking.price, booking.date, booking.time, booking.notes, addons, totalLabel))}`;
    $("wa-open").href = url;
    smartWhatsAppOpen(url);
  } catch (err) {
    flash("Something went wrong sending the booking. Please try again.");
  }
  btn.disabled = false;
  btn.textContent = "Confirm Booking";

  // Fresh start for the next booking.
  state.service = null;
  state.addons = [];
  state.date = "";
  state.time = "";
  state.kids = false;
  applyKidsState();
  renderAddons();
});

/* ---- appointments ---- */
function getBookings() {
  try { return JSON.parse(lsGet(STORAGE_KEY)) || []; }
  catch (e) { return []; }
}

function saveBooking(b) {
  const all = getBookings();
  all.push(b);
  lsSet(STORAGE_KEY, JSON.stringify(all));
}

async function pushBooking(b) {
  const url = window.MDS_BACKEND_URL;
  if (!url) return true; // local-only mode: no server to arbitrate
  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(b)
    });
    const data = await res.json();
    if (data && data.ok) return true;
    return false; // server said taken / unavailable
  } catch (e) {
    // Backend unreachable — accept rather than block the customer's booking.
    return true;
  }
}

/* this client's own bookings, fresh from the sheet (null = sheet unreachable) */
async function myBookings() {
  const url = window.MDS_BACKEND_URL;
  if (!url) return null;
  const phones = [...new Set(getBookings().map((b) => b.phone).filter(Boolean))];
  if (!phones.length) return [];
  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ action: "myBookings", phone: phones[0] })
    });
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.bookings)) return data.bookings;
    return null;
  } catch (e) { return null; }
}

/* free this client's booking on the sheet (staff panel + slots update instantly) */
async function freeSlotOnSheet(b) {
  const url = window.MDS_BACKEND_URL;
  if (!url) { return; }
  try {
    await fetch(url, {
      method: "POST",
      body: JSON.stringify({ action: "cancel", date: b.date, time: b.time, phone: b.phone })
    });
  } catch (e) {}
}

function buildCancelMessage(b) {
  const lines = [
    "*BOOKING CANCELLED*",
    "",
    `Name: ${b.name}`,
    `Contact: ${b.phone}`,
    `Service: ${b.service}${b.price ? " (" + b.price + ")" : ""}`,
    `Date: ${fmtLong(b.date)}`,
    `Time: ${b.time}`
  ];
  if (b.notes) lines.push(`Notes: ${b.notes}`);
  lines.push("");
  return lines.join("\n");
}

async function renderAppointments(view) {
  // Prefer fresh server truth so a staff-side cancellation disappears here too.
  // Only fall back to localStorage when the sheet is unreachable (server === null).
  const server = await myBookings();
  const local = getBookings();
  const merged = (server !== null ? server : local).filter((b) => {
    if (view === "past") return b.date < todayISO();
    return b.date >= todayISO();
  });

  const wrap = $("appt-list");

  if (!merged.length) {
    wrap.innerHTML = `<div class="empty">No ${view === "past" ? "past" : "upcoming"} appointments yet.<br>Your bookings will show up here.</div>`;
    return;
  }

  const sorted = merged.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  wrap.innerHTML = sorted.map((b) => {
    const parts = b.date.split("-");
    const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildCancelMessage(b))}`;
    return `
      <div class="appt-card">
        <div class="appt-date">
          <div class="d">${parseInt(parts[2], 10)}</div>
          <div class="m">${MONTHS_SHORT[parseInt(parts[1], 10) - 1]}</div>
          <div class="y">${parts[0]}</div>
        </div>
        <div class="appt-info">
          <div class="time">${b.time}</div>
          <div class="svc">${b.service}${b.price ? " (" + b.price + ")" : ""}</div>
        </div>
        <a class="view-btn cancel-appt" href="${wa}" target="_blank" rel="noopener">Cancel</a>
      </div>`;
  }).join("");

  wrap.querySelectorAll(".cancel-appt").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("Cancel this appointment?\nA cancellation notification will be sent, and the slot will reopen.")) return;
      const ix = [...wrap.querySelectorAll(".cancel-appt")].indexOf(a);
      const b = sorted[ix];
      smartWhatsAppOpen(a.href); // straight into WhatsApp — no interstitial
      local.forEach((lb) => {
        if (lb.date === b.date && lb.time === b.time && lb.name === b.name) {
          const all = getBookings().filter((x) => !(x.date === lb.date && x.time === lb.time && x.name === lb.name && x.phone === lb.phone));
          lsSet(STORAGE_KEY, JSON.stringify(all));
        }
      });
      await freeSlotOnSheet(b);
      await renderAppointments(apptView);
      syncBookings();
      flash("Booking cancelled — slot reopened.");
    });
  });
}

let apptView = "upcoming";
$("tg-up").addEventListener("click", () => {
  apptView = "upcoming";
  $("tg-up").classList.add("active");
  $("tg-past").classList.remove("active");
  renderAppointments(apptView);
});
$("tg-past").addEventListener("click", () => {
  apptView = "past";
  $("tg-past").classList.add("active");
  $("tg-up").classList.remove("active");
  renderAppointments(apptView);
});

/* ---- drawer ---- */
const burger = $("burger");
const drawer = $("drawer");
const drawerBack = $("drawer-back");

burger.addEventListener("click", () => {
  drawer.classList.toggle("open");
  drawerBack.classList.toggle("open");
});
drawerBack.addEventListener("click", closeDrawer);
drawer.addEventListener("click", (e) => {
  if (e.target.tagName === "A") closeDrawer();
});

function closeDrawer() {
  drawer.classList.remove("open");
  drawerBack.classList.remove("open");
}

/* ---- WhatsApp deep-links ---- 
   Launch WhatsApp directly instead of showing the wa.me interstitial page.
   - Android: intent:// scheme opens the app straight away, falls back to the
     browser if WhatsApp isn't installed.
   - iOS: whatsapp:// scheme jumps straight into the app.
   - Desktop: wa.me in the same tab (WhatsApp Web / QR). */
function smartWhatsAppOpen(url) {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) {
    window.location.href = url.replace("https://wa.me/", "intent://wa.me/") + "#Intent;scheme=https;package=com.whatsapp;end";
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    const m = url.match(/[?&]text=([^&]*)/);
    window.location.href = `whatsapp://send?phone=${WHATSAPP_NUMBER}&text=${m ? m[1] : ""}`;
  } else {
    window.location.href = url;
  }
}

/* ---- bottom nav active state ---- */
document.querySelectorAll(".bn-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".bn-item").forEach((x) => x.classList.remove("active"));
    item.classList.add("active");
  });
});

/* ---- in-page navigation ---- 
   Native anchor jumps (#booking, bottom tabs, drawer) silently fail in many
   in-app/WebView browsers, so ALL same-page links are scrolled to manually. */
function scrollToSection(id, el) {
  try {
    window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset, behavior: "smooth" });
  } catch (e) {
    window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset);
  }
}

document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute("href").slice(1);
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  scrollToSection(id, target);
  if (a.classList.contains("bn-item")) {
    document.querySelectorAll(".bn-item").forEach((x) => x.classList.remove("active"));
    a.classList.add("active");
  }
});

/* ---- auto-update: checks version.json; reloads when a new version is deployed ---- */
const MDS_VER_KEY = "mds_seen_version";
const MDS_VER_INTERVAL = 5 * 60 * 1000;

async function mdsCheckUpdate() {
  try {
    const u = new URL("version.json", location.href);
    u.searchParams.set("t", String(Date.now()));
    const res = await fetch(u, { cache: "no-store" });
    const data = await res.json();
    const deployed = Number(data.seq) || 0;
    const seen = Number(lsGet(MDS_VER_KEY)) || 0;
    if (deployed <= 0) return;
    if (!seen) { lsSet(MDS_VER_KEY, String(deployed)); return; }
    if (deployed > seen) {
      lsSet(MDS_VER_KEY, String(deployed));
      flash("New version available - updating\u2026");
      setTimeout(() => location.reload(), 1500);
    }
  } catch (e) { /* offline or host unreachable - ignore, retry later */ }
}

/* ---- init ---- */
try {
  mdsCheckUpdate();
  setInterval(mdsCheckUpdate, MDS_VER_INTERVAL);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) mdsCheckUpdate();
  });

  renderServices();
  renderAddons();
  renderTimes();
  renderCalendar();
  renderAppointments("upcoming");
  syncBookings();
  renderThemeList();
  $("year").textContent = new Date().getFullYear();
  $("app-version").textContent = `MAN-D-STYLE v${APP_VERSION}`;
  window.__mds.ready = true;
} catch (err) {
  window.__mds.errors.push("init: " + (err && err.message));
  renderDbg();
}