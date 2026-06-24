/* global XLSX */
const TBPHTC_URL = "https://tracuuhoadon.gdt.gov.vn/tbphtc.html";
const KEY = "MST_JOB_V2";

/** ===== LICENSE (GAS) ===== **/
const LICENSE_OK_KEY = "LICENSE_OK_V1";
const CLIENT_ID_KEY = "LICENSE_CLIENT_ID_V1";
const DEVICE_ID_KEY = "LICENSE_DEVICE_ID_V1";

// Public repo note:
// Replace this placeholder with your own license verification endpoint before using the extension.
// Example: https://your-domain.com/verify or your Google Apps Script /exec URL.
const LICENSE_VERIFY_URL = "YOUR_LICENSE_VERIFY_ENDPOINT";

function $(id) { return document.getElementById(id); }
function setStatus(s) { $("status").textContent = s; }

async function isLicensed() {
  const obj = await chrome.storage.local.get([LICENSE_OK_KEY]);
  return obj[LICENSE_OK_KEY] === true;
}

function genClientId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function getOrCreateClientId() {
  const got = await chrome.storage.local.get([CLIENT_ID_KEY]);
  if (got[CLIENT_ID_KEY]) return got[CLIENT_ID_KEY];
  const id = genClientId();
  await chrome.storage.local.set({ [CLIENT_ID_KEY]: id });
  return id;
}

async function getOrCreateDeviceId() {
  const got = await chrome.storage.local.get([DEVICE_ID_KEY]);
  if (got[DEVICE_ID_KEY]) return got[DEVICE_ID_KEY];

  // phòng trường hợp background chưa kịp set
  const id = "dev_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: id });
  return id;
}

async function verifyPasswordWithServer(password) {
  const clientId = await getOrCreateClientId();
  const deviceId = await getOrCreateDeviceId();

  const mf = chrome.runtime.getManifest();
  const payload = {
    password: String(password || "").trim(),
    clientId,
    deviceId,
    ext: mf.name,
    version: mf.version,
    ts: Date.now()
  };

  const res = await fetch(LICENSE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  let data = null;
  try { data = await res.json(); } catch {}

  if (!res.ok || !data || data.ok !== true) {
    const msg = (data && data.message) ? data.message : `Server từ chối (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function setMainLocked(locked) {
  const main = $("mainUI");
  const lic = $("licenseBox");
  if (lic) lic.style.display = locked ? "block" : "none";
  if (main) main.style.display = locked ? "none" : "block";
}

async function initLicenseUI() {
  const ok = await isLicensed();
  if (ok) {
    setMainLocked(false);
    return;
  }

  setMainLocked(true);
  const msg = $("licenseMsg");
  const btn = $("activate");
  const inp = $("licensePassword");

  if (msg) msg.textContent = "";
  if (btn) {
    btn.onclick = async () => {
      try {
        const pw = String(inp?.value || "").trim();
        if (!pw) {
          if (msg) msg.textContent = "Bạn chưa nhập mật khẩu.";
          return;
        }
        btn.disabled = true;
        if (msg) msg.textContent = "Đang xác thực...";

        await verifyPasswordWithServer(pw);

        await chrome.storage.local.set({ [LICENSE_OK_KEY]: true });

        if (msg) msg.textContent =
          "Kích hoạt thành công.\n" +
          "Máy này đã được phép dùng.\n" +
          "Password hệ thống đã tự đổi và sẽ gửi mail cho bạn (owner).";

        setTimeout(() => location.reload(), 500);
      } catch (e) {
        if (msg) msg.textContent = "Kích hoạt thất bại: " + (e?.message || String(e));
        btn.disabled = false;
      }
    };
  }
}
/** ========================= **/

function isDateVN(s) {
  return /^([0-2]\d|3[01])\/(0\d|1[0-2])\/\d{4}$/.test(String(s || "").trim());
}
function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function toText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(Math.trunc(v));
  return String(v).trim();
}

async function getJob() {
  return (await chrome.storage.local.get([KEY]))[KEY] || null;
}
async function setJob(job) {
  await chrome.storage.local.set({ [KEY]: job });
}
async function clearJob() {
  await chrome.storage.local.remove([KEY]);
}

async function getOrCreateTBPHTCTab() {
  const exact = await chrome.tabs.query({ url: TBPHTC_URL });
  if (exact.length) return exact[0];

  const domainTabs = await chrome.tabs.query({ url: "https://tracuuhoadon.gdt.gov.vn/*" });
  if (domainTabs.length) {
    await chrome.tabs.update(domainTabs[0].id, { url: TBPHTC_URL, active: false });
    await new Promise(r => setTimeout(r, 800));
    return await chrome.tabs.get(domainTabs[0].id);
  }

  const tab = await chrome.tabs.create({ url: TBPHTC_URL, active: false });
  await new Promise(r => setTimeout(r, 800));
  return tab;
}

async function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function detectCols(headers) {
  let mstKey = null;
  let nameKey = null;

  for (const h of headers) {
    const t = norm(h);
    if (!mstKey && (t === "mst" || t.includes("mã số thuế") || t.includes("ma so thue") || t.includes("tax"))) mstKey = h;
    if (!nameKey && (t.includes("công ty") || t.includes("cong ty") || t.includes("tên") || t.includes("ten") || t.includes("doanh nghiệp") || t.includes("doanh nghiep"))) nameKey = h;
  }

  if (!mstKey) {
    for (const h of headers) {
      if (norm(h).includes("mst")) { mstKey = h; break; }
    }
  }
  return { mstKey, nameKey };
}

function buildQueue(rows, mstKey, nameKey) {
  const q = [];
  for (const r of rows) {
    const mst = toText(r[mstKey]);
    if (!mst) continue;
    q.push({ mst, inputName: nameKey ? toText(r[nameKey]) : "" });
  }
  return q;
}

function resultsToXlsxBlob(results) {
  const rows = results.map(r => ({
    "MST": r.mst || "",
    "Tên Doanh Nghiệp": r.name || "",
    "Trạng thái": r.status || ""
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "KetQua");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename, saveAs: true });
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function refreshUI() {
  const job = await getJob();
  if (!job) {
    setStatus("Chưa có job.");
    $("start").disabled = true;
    $("pause").disabled = true;
    $("download").disabled = true;
    return;
  }

  const total = job.queue?.length || 0;
  const done = job.results?.length || 0;
  const idx = job.index || 0;

  let s = "";
  s += `Tổng MST: ${total}\n`;
  s += `Đã xử lý: ${done}\n`;
  s += `Con trỏ: ${idx}/${total}\n`;
  s += `Ngày: ${job.fromDate} -> ${job.toDate}\n`;
  s += `Trạng thái: ${job.running ? "RUNNING" : (job.paused ? "PAUSED" : "READY")}\n`;
  if (job.pauseReason) s += `Lý do: ${job.pauseReason}\n`;
  if (job.last) s += `Log: ${job.last}\n`;

  setStatus(s);

  $("start").disabled = job.running || !total;
  $("pause").disabled = !job.running;
  $("download").disabled = done === 0;
}

async function main() {
  // ✅ luôn khởi tạo license UI trước
  await initLicenseUI();

  // nếu chưa licensed, UI main bị ẩn rồi, khỏi chạy tiếp
  if (!(await isLicensed())) return;

  $("open").onclick = async () => {
    const tab = await getOrCreateTBPHTCTab();
    await chrome.tabs.update(tab.id, { active: true });
  };

  $("reset").onclick = async () => {
    await clearJob();
    await refreshUI();
  };

  $("file").addEventListener("change", async (e) => {
    try {
      const f = e.target.files?.[0];
      if (!f) return;

      const fromDate = $("fromDate").value.trim();
      const toDate = $("toDate").value.trim();
      if (!isDateVN(fromDate) || !isDateVN(toDate)) {
        throw new Error("Sai định dạng ngày. Dùng dd/mm/yyyy");
      }

      const ab = await f.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

      if (!rows.length) throw new Error("Excel rỗng.");

      const headers = Object.keys(rows[0] || {});
      const { mstKey, nameKey } = detectCols(headers);
      if (!mstKey) throw new Error("Không tìm thấy cột MST trong file.");

      const queue = buildQueue(rows, mstKey, nameKey);
      if (!queue.length) throw new Error("Không có MST nào hợp lệ trong file.");

      const job = {
        fromDate,
        toDate,
        queue,
        index: 0,
        results: [],
        running: false,
        paused: false,
        pauseReason: "",
        last: `Loaded ${queue.length} MST (mstKey=${mstKey}, nameKey=${nameKey || "N/A"})`
      };

      await setJob(job);
      $("start").disabled = false;
      await refreshUI();
    } catch (err) {
      setStatus("Lỗi đọc Excel: " + (err?.message || String(err)));
    }
  });

  $("start").onclick = async () => {
    const job = await getJob();
    if (!job) return;

    const fromDate = $("fromDate").value.trim();
    const toDate = $("toDate").value.trim();
    if (!isDateVN(fromDate) || !isDateVN(toDate)) {
      setStatus("Sai định dạng ngày. Dùng dd/mm/yyyy");
      return;
    }

    // ❗ KHÔNG set RUNNING trước khi content xác nhận
    job.fromDate = fromDate;
    job.toDate = toDate;
    job.running = false;
    job.paused = false;
    job.pauseReason = "";
    job.last = "Start (pending)";
    await setJob(job);

    const tab = await getOrCreateTBPHTCTab();

    let resp = null;
    let ok = false;

    for (let i = 0; i < 8; i++) {
      try {
        resp = await sendToTab(tab.id, { type: "RUN" });
        ok = true;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (!ok) {
      job.running = false;
      job.paused = true;
      job.pauseReason = "Không gửi được message tới content.js. Hãy refresh trang tbphtc (1 lần) rồi Start lại.";
      job.last = "SendMessage failed";
      await setJob(job);
      await refreshUI();
      return;
    }

    // ✅ content trả Not licensed / No job / started
    if (!resp || resp.ok !== true || resp.started !== true) {
      job.running = false;
      job.paused = true;
      job.pauseReason = resp?.error || "Content không start được (mở trang tbphtc và nhập CAPTCHA).";
      job.last = "Start refused";
      await setJob(job);
      await refreshUI();
      return;
    }

    // content đã start → giờ mới bật RUNNING
    job.running = true;
    job.paused = false;
    job.pauseReason = "";
    job.last = "Start";
    await setJob(job);

    await refreshUI();
  };

  $("pause").onclick = async () => {
    const job = await getJob();
    if (!job) return;

    job.running = false;
    job.paused = true;
    job.pauseReason = "manual";
    job.last = "Paused";
    await setJob(job);

    try {
      const tab = await getOrCreateTBPHTCTab();
      await sendToTab(tab.id, { type: "PAUSE" });
    } catch {}

    await refreshUI();
  };

  $("download").onclick = async () => {
    const job = await getJob();
    if (!job?.results?.length) return;

    const blob = resultsToXlsxBlob(job.results);
    await downloadBlob(blob, `ket-qua-tra-mst_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  setInterval(refreshUI, 800);
  await refreshUI();
}

document.addEventListener("DOMContentLoaded", main);
