/* ---- MAN-D-STYLE staff panel ---- */
const STAFF_HINT = "Staff access for MAN-D-STYLE only. Master key unlocks everything.";

let staffToken = "";          // the role proof, held in memory only
let staffRole = "";

function staffAPI(payload) {
  const url = window.MDS_BACKEND_URL;
  if (!url) return Promise.resolve({ ok: false, error: "no_backend" });
  return fetch(url, {
    method: "POST",
    body: JSON.stringify(payload)
  })
    .then((res) => res.json())
    .catch(() => ({ ok: false, error: "network" }));
}

function showStaffPanel() {
  $("staff-login").classList.add("hidden");
  $("staff-panel").classList.remove("hidden");
  $("staff-role").textContent = staffRole === "master" ? "Master access" : "Staff access";
}

function showStaffLogin() {
  $("staff-panel").classList.add("hidden");
  $("staff-login").classList.remove("hidden");
}

$("staff-hint").textContent = STAFF_HINT;

$("staff-login-btn").addEventListener("click", async () => {
  const pw = $("staff-pw").value.trim();
  if (!pw) { flash("Please enter your staff password."); return; }
  const res = await staffAPI({ action: "login", pw });
  if (res && res.ok && res.role) {
    staffToken = pw;
    staffRole = res.role;
    $("staff-pw").value = "";
    showStaffPanel();
    await refreshStaff();
  } else {
    flash("Incorrect password.");
    $("staff-pw").value = "";
  }
});

$("staff-pw").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("staff-login-btn").click();
});

$("staff-logout").addEventListener("click", () => {
  staffToken = "";
  staffRole = "";
  showStaffLogin();
});

$("staff-changepw").addEventListener("click", async () => {
  const oldPw = $("staff-oldpw").value.trim();
  const newPw = $("staff-newpw").value.trim();
  if (newPw.length < 6) { flash("New password must be at least 6 characters."); return; }
  const res = await staffAPI({ action: "changePw", pw: staffToken, oldPw, newPw });
  if (res && res.ok) {
    flash("Password updated.");
    $("staff-oldpw").value = "";
    $("staff-newpw").value = "";
  } else if (res.error) {
    flash(res.error === "unauthorized" ? "Session expired — log in again." : res.error === "weak" ? "New password too weak." : res.error === "bad_old" ? "Wrong current password." : "Password update failed.");
  } else {
    flash("Password update failed.");
  }
});

async function refreshStaff() {
  const res = await staffAPI({ action: "list", pw: staffToken });
  if (!res || !res.ok) {
    flash("Session expired — log in again.");
    showStaffLogin();
    return;
  }
  renderStaffClients(res.clients || []);
  renderStaffBookings(res.bookings || []);
}

/* ---- clients & loyalty ---- */
function freeBadge(c) {
  if (c.freeNext) return `<span class="free-badge">NEXT FREE</span>`;
  return `<span class="stamps-inline">${c.stamps}/4 stamps</span>`;
}

function renderStaffClients(clients) {
  const wrap = $("staff-clients");
  if (!clients.length) {
    wrap.innerHTML = `<div class="empty">No bookings yet.<br>Client counts and loyalty will appear here.</div>`;
    return;
  }
  wrap.innerHTML = clients.map((c) => `
    <div class="staff-row">
      <div class="staff-who">
        <strong>${esc(c.name) || "Client"}</strong>
        <span>${c.count} booking${c.count === 1 ? "" : "s"}</span>
      </div>
      <div class="staff-right">${freeBadge(c)}</div>
    </div>`).join("");
}

/* ---- upcoming bookings ---- */
function renderStaffBookings(bookings) {
  const wrap = $("staff-bookings");
  if (!bookings.length) {
    wrap.innerHTML = `<div class="empty">No upcoming bookings.<br>New appointments will appear here.</div>`;
    return;
  }
  wrap.innerHTML = bookings.map((b, i) => `
    <div class="staff-bk" data-i="${i}">
      <div class="staff-bk-top">
        <strong>${fmtLong(b.date)} &middot; ${b.time}</strong>
        <span class="bk-price">${b.price || b.service || ""}</span>
      </div>
      <div class="staff-bk-sub">
        <span>${esc(b.name)}</span>
        <span>${esc(b.phone)}</span>
        <span>${esc(b.service)}</span>
      </div>
      <div class="staff-bk-note">${esc(b.notes)}</div>
      <button class="bk-del" data-date="${b.date}" data-time="${b.time}">Cancel booking</button>
    </div>`).join("");

  wrap.querySelectorAll(".bk-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const date = btn.dataset.date;
      const time = btn.dataset.time;
      if (!confirm(`Cancel the booking for ${fmtLong(date)} at ${time}?\nThe slot will reopen for others.`)) return;
      const res = await staffAPI({ action: "delete", pw: staffToken, date, time });
      if (res && res.ok) {
        flash("Booking cancelled — slot reopened.");
        await refreshStaff();
        syncBookings();
      } else {
        flash("Could not cancel the booking.");
      }
    });
  });
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

/* ---- show/hide password (eye) ---- */
document.querySelectorAll(".pw-eye").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.querySelector(btn.dataset.eye);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.querySelector("use").setAttribute("href", show ? "#eye-off" : "#eye");
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
});