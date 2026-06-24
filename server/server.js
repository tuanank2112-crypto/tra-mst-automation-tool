const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
app.use(express.json({ limit: "64kb" }));

/**
 * YÊU CẦU: Node.js 18+ (để có fetch sẵn).
 *
 * ENV:
 *  - PORT=3000
 *  - ADMIN_KEY=... (để gọi /admin/get và /admin/set)
 *  - TELEGRAM_BOT_TOKEN=... (tuỳ chọn)
 *  - TELEGRAM_CHAT_ID=... (tuỳ chọn)
 */
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "CHANGE_ME_ADMIN_KEY";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const STATE_FILE = path.join(__dirname, "db.json");

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const obj = JSON.parse(raw);
    if (obj && typeof obj.currentPassword === "string") return obj;
  } catch {}
  return { currentPassword: "Change123", activations: [] };
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function randomPassword8() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];

  // đảm bảo có ít nhất 1 chữ và 1 số
  if (!/[A-Za-z]/.test(out)) out = "A" + out.slice(1);
  if (!/[0-9]/.test(out)) out = out.slice(0, 7) + "1";
  return out;
}

async function telegramNotify(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
    });
    return res.ok;
  } catch {
    return false;
  }
}

// CORS (đơn giản cho extension dev). Khi bạn lên Web Store thì nên siết lại.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * POST /verify
 * body: { password, clientId, ext, version, ts }
 * Nếu đúng: rotate password và notify cho chủ sở hữu (Telegram hoặc console log)
 * KHÔNG trả mật khẩu mới cho client.
 */
app.post("/verify", async (req, res) => {
  const pw = String(req.body?.password || "").trim();
  const clientId = String(req.body?.clientId || "").trim();
  const ext = String(req.body?.ext || "").trim();
  const version = String(req.body?.version || "").trim();

  if (!pw) return res.status(400).json({ ok: false, message: "Thiếu password." });

  const state = readState();
  if (pw !== state.currentPassword) {
    return res.status(401).json({ ok: false, message: "Sai mật khẩu" });
  }

  const newPw = randomPassword8();
  state.currentPassword = newPw;
  state.activations = state.activations || [];
  state.activations.push({
    at: new Date().toISOString(),
    clientId,
    ext,
    version
  });
  writeState(state);

  const note = [
    "✅ Có người vừa kích hoạt extension",
    ext ? `Ext: ${ext} v${version || "?"}` : "",
    clientId ? `Client: ${clientId}` : "",
    `⏭ Mật khẩu mới: ${newPw}`
  ].filter(Boolean).join("\n");

  const notified = await telegramNotify(note);
  if (!notified) {
    console.log(note);
  }

  return res.json({ ok: true });
});

/** Admin: xem mật khẩu hiện tại (dùng khi Telegram lỗi) */
app.get("/admin/get", (req, res) => {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(403).json({ ok: false, message: "Forbidden" });

  const state = readState();
  res.json({ ok: true, currentPassword: state.currentPassword });
});

/** Admin: set password thủ công */
app.post("/admin/set", (req, res) => {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(403).json({ ok: false, message: "Forbidden" });

  const pw = String(req.body?.password || "").trim();
  const ok = pw.length === 8 && /^[A-Za-z0-9]{8}$/.test(pw) && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
  if (!ok) {
    return res.status(400).json({
      ok: false,
      message: "Password phải đúng 8 ký tự, chỉ chữ+số, và có cả chữ lẫn số."
    });
  }

  const state = readState();
  state.currentPassword = pw;
  writeState(state);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`License server running on port ${PORT}`);
});
