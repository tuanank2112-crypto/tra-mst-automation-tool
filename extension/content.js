const KEY = "MST_JOB_V2";
const LICENSE_OK_KEY = "LICENSE_OK_V1";

let stop = false;
let runToken = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function $(sel) { return document.querySelector(sel); }

function fold(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function setVal(el, v) {
  el.focus();
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function getJob() {
  return (await chrome.storage.local.get([KEY]))[KEY] || null;
}
async function setJob(job) {
  await chrome.storage.local.set({ [KEY]: job });
}

function getFormEls() {
  const tin = $("#tin");
  const ngayTu = $("#ngayTu");
  const ngayDen = $("#ngayDen");
  const captcha = $("#captchaCodeVerify");
  const searchBtn = $("#searchBtn");
  return { tin, ngayTu, ngayDen, captcha, searchBtn };
}

function isGarbageText(s) {
  const t = fold(s);
  if (!t) return true;
  const compact = t.replace(/\s+/g, "");
  if (compact.includes("trangchu") && compact.includes("tracuuthongbaophathanhhoadon")) return true;
  if (compact.includes("tracuuthongbaophathanhhoadon")) return true;
  if (t.length > 350) return true;
  return false;
}

function xpathText(xpath) {
  try {
    const node = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
    if (!node) return "";
    return (node.innerText || node.textContent || "").trim();
  } catch {
    return "";
  }
}

function cleanNameFromRaw(raw, mst) {
  const r = String(raw || "").trim();
  if (!r || isGarbageText(r)) return "";

  if (r.includes("/")) {
    const parts = r.split("/").map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.slice(1).join(" / ").trim();
  }
  if (r.includes("-")) {
    const parts = r.split("-").map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.slice(1).join(" - ").trim();
  }
  return r;
}

function extractResultFromKetQua(mst) {
  const mstDigits = digitsOnly(mst);
  const mst10 = mstDigits.slice(0, 10);

  const rawMaTen = xpathText(
    "//td[contains(normalize-space(.),'Mã / Tên đơn vị phát hành')]/following-sibling::td[1]"
  ) || xpathText(
    "//td[contains(normalize-space(.),'Mã / Tên')]/following-sibling::td[1]"
  );

  const rawStatus = xpathText(
    "//td[contains(normalize-space(.),'Trạng thái hoạt động')]/following-sibling::td[1]"
  ) || xpathText(
    "//td[normalize-space(.)='Trạng thái']/following-sibling::td[1]"
  );

  const maTenDigits = digitsOnly(rawMaTen);
  const maTenOk = maTenDigits.includes(mstDigits) || (mst10 && maTenDigits.includes(mst10));
  const status = String(rawStatus || "").trim();

  if (!maTenOk) return null;
  if (!status || isGarbageText(status)) return null;

  const name = cleanNameFromRaw(rawMaTen, mst);
  return { name: name || "", status };
}

async function waitForResultReady(mst, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = extractResultFromKetQua(mst);
    if (res && res.status) return { ok: true, res };
    await sleep(250);
  }
  return { ok: false, timeout: true };
}

async function runLoop(myToken) {
  stop = false;

  while (!stop && myToken === runToken) {
    const job = await getJob();
    if (!job || !job.running) return;

    if (!location.href.includes("/tbphtc.html")) {
      location.href = "https://tracuuhoadon.gdt.gov.vn/tbphtc.html";
      await sleep(1500);
      continue;
    }

    const total = job.queue.length;
    const i = job.index || 0;

    if (i >= total) {
      job.running = false;
      job.paused = false;
      job.pauseReason = "";
      job.last = "Done";
      await setJob(job);
      return;
    }

    const item = job.queue[i];
    const mst = item.mst;

    try {
      const { tin, ngayTu, ngayDen, captcha, searchBtn } = getFormEls();
      if (!tin || !ngayTu || !ngayDen || !searchBtn) {
        job.running = false;
        job.paused = true;
        job.pauseReason = "Không tìm thấy input/nút theo selector (#tin, #ngayTu, #ngayDen, #searchBtn).";
        job.last = `Stop at MST=${mst}`;
        await setJob(job);
        return;
      }

      if (captcha && !captcha.value.trim()) {
        job.running = false;
        job.paused = true;
        job.pauseReason = `Cần nhập CAPTCHA 1 lần. Đang đứng tại MST=${mst}`;
        job.last = "Need CAPTCHA";
        await setJob(job);
        return;
      }

      setVal(tin, mst);
      setVal(ngayTu, job.fromDate);
      setVal(ngayDen, job.toDate);

      searchBtn.click();

      let waited = await waitForResultReady(mst, 60000);
      if (waited.timeout) {
        await sleep(800);
        searchBtn.click();
        waited = await waitForResultReady(mst, 60000);
      }

      let name = String(item.inputName || "").trim();
      let status = "TIMEOUT - Chưa đọc được kết quả";

      if (waited.ok && waited.res) {
        status = waited.res.status || status;
        if (waited.res.name && !isGarbageText(waited.res.name)) {
          name = waited.res.name;
        }
      }

      job.results.push({ mst, name, status: String(status).trim() });
      job.index = i + 1;
      job.last = `OK ${job.index}/${total} MST=${mst} => ${status}`;
      await setJob(job);

      await sleep(900);

    } catch (e) {
      job.results.push({
        mst,
        name: String(item.inputName || "").trim(),
        status: `ERROR: ${String(e?.message || e)}`
      });
      job.index = i + 1;
      job.last = `ERROR ${job.index}/${total} MST=${mst}`;
      await setJob(job);
      await sleep(500);
    }
  }
}

async function isLicensed_() {
  const obj = await chrome.storage.local.get([LICENSE_OK_KEY]);
  return obj[LICENSE_OK_KEY] === true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // ✅ khóa chạy nếu chưa license
    const ok = await isLicensed_();
    if (!ok) return { ok: false, error: "Not licensed" };

    if (msg?.type === "RUN") {
      const job = await getJob();
      if (!job) return { ok: false, error: "No job" };

      job.running = true;
      job.paused = false;
      job.pauseReason = "";
      job.last = "Running";
      await setJob(job);

      runToken++;
      runLoop(runToken);

      return { ok: true, started: true };
    }

    if (msg?.type === "PAUSE") {
      stop = true;
      const job = await getJob();
      if (!job) return { ok: false, error: "No job" };

      job.running = false;
      job.paused = true;
      job.pauseReason = "manual";
      job.last = "Paused";
      await setJob(job);

      return { ok: true };
    }

    return { ok: true };
  })()
    .then(sendResponse)
    .catch(e => sendResponse({ ok: false, error: String(e) }));

  return true;
});
