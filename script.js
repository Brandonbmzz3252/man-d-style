const WHATSAPP_NUMBER = "27747257566";
const STORAGE_KEY = "mds_bookings";

const SERVICES = [
  { id: "short", name: "Short", price: "R160" },
  { id: "medium", name: "Medium", price: "R180" },
  { id: "long", name: "Long", price: "R200" },
  { id: "wbf", name: "W/B/ Flat iron", price: "" }
];

const TIMES = []; // placeholder (unused; times now depend on weekday)

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
  date: "",
  time: "",
  name: "",
  phone: "",
  notes: ""
};

const $ = (id) => document.getElementById(id);

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

  return `
    <div class="service-card" data-id="${svc.id}"${mode === "wiz" ? ' data-wiz="1"' : ""}>
      <span class="svc-thumb"><img src="${HAIR_PHOTO[svc.id] || ""}" alt="${svc.name}" loading="lazy"></span>
      <span class="svc-info"><div class="svc-name">${svc.name}</div><div class="svc-price">${svc.price}</div></span>
      ${right}
    </div>`;
}

function renderServices() {
  $("service-list-wiz").innerHTML = SERVICES.map((s) => serviceCardHTML(s, "wiz")).join("");
  refreshWizardSelection();
}

function refreshWizardSelection() {
  document.querySelectorAll("#service-list-wiz [data-wiz], #service-list-wiz [data-wbf]").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === state.service || el.dataset.wbf === "1" && state.service === "wbf");
  });
}

function selectService(id) {
  const svc = SERVICES.find((s) => s.id === id);
  if (!svc) return;
  state.service = svc.id;
  state.price = svc.price;
  refreshWizardSelection();
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
  document.querySelectorAll(".step").forEach((el, i) => {
    el.classList.toggle("active", (i + 1) === n);
  });
  if (n === 2) { renderCalendar(); renderTimes(); }
}

$("next-1").addEventListener("click", () => {
  if (!state.service) { flash("Please select a service first."); return; }
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
  return all.some((b) => {
    if (b.date !== dateISO) return false;
    const t = toMinutes(checkTime);
    const bt = toMinutes(b.time);
    return t >= bt && t < bt + gapMin;
  });
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
function buildMessage(name, phone, service, price, date, time, notes) {
  const lines = [
    "*NEW HAIR BOOKING*",
    "",
    `Name: ${name}`,
    `Contact: ${phone}`,
    `Service: ${service}${price ? " (" + price + ")" : ""}`,
    `Date: ${fmtLong(date)}`,
    `Time: ${time}`
  ];
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

$("confirm-btn").addEventListener("click", () => {
  state.name = $("det-name").value.trim();
  state.phone = $("det-phone").value.trim();
  state.notes = $("det-notes").value.trim();

  if (!state.name) { flash("Please enter your full name."); return; }
  if (!state.phone || !/^[0-9+\-\s]{7,15}$/.test(state.phone)) { flash("Please enter a valid contact number."); return; }

  const svc = SERVICES.find((s) => s.id === state.service);

  const booking = {
    service: svc ? svc.name : "",
    price: svc ? svc.price : "",
    date: state.date,
    time: state.time,
    name: state.name,
    phone: state.phone,
    notes: state.notes,
    ts: Date.now()
  };

  saveBooking(booking);
  pushBooking(booking);

  $("sm-date").textContent = fmtLong(state.date);
  $("sm-time").textContent = state.time;
  $("sm-service").textContent = `${booking.service}${booking.price ? " (" + booking.price + ")" : ""}`;
  $("sm-name").textContent = booking.name;
  $("sm-phone").textContent = booking.phone;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildMessage(booking.name, booking.phone, booking.service, booking.price, booking.date, booking.time, booking.notes))}`;
  window.open(url, "_blank");

  goStep(4);
});

/* ---- appointments ---- */
function getBookings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch (e) { return []; }
}

function saveBooking(b) {
  const all = getBookings();
  all.push(b);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

async function pushBooking(b) {
  const url = window.MDS_BACKEND_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      body: JSON.stringify(b)
    });
    syncBookings();
  } catch (e) {
    /* offline / backend unavailable — booking stays local */
  }
}

function viewURL(b) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildMessage(b.name, b.phone, b.service, b.price, b.date, b.time, b.notes))}`;
}

function renderAppointments(view) {
  const list = getBookings().filter((b) => {
    if (view === "past") return b.date < todayISO();
    return b.date >= todayISO();
  });

  const wrap = $("appt-list");

  if (!list.length) {
    wrap.innerHTML = `<div class="empty">No ${view === "past" ? "past" : "upcoming"} appointments yet.<br>Your bookings will show up here.</div>`;
    return;
  }

  const sorted = list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  wrap.innerHTML = sorted.map((b) => {
    const parts = b.date.split("-");
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
        <a class="view-btn" href="${viewURL(b)}" target="_blank" rel="noopener">View</a>
      </div>`;
  }).join("");
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

/* ---- bottom nav active state ---- */
document.querySelectorAll(".bn-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".bn-item").forEach((x) => x.classList.remove("active"));
    item.classList.add("active");
  });
});

/* ---- init ---- */
renderServices();
renderTimes();
renderCalendar();
renderAppointments("upcoming");
syncBookings();
$("year").textContent = new Date().getFullYear();