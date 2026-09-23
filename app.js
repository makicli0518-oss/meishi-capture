import { CONFIG } from "./config.js";
import * as auth from "./auth.js";
import * as camera from "./camera.js";
import * as queue from "./queue.js";
import * as uploader from "./uploader.js";
import { compress, thumbnail } from "./image.js";
import { formatBase, timeLabel } from "./naming.js";

const $ = (id) => document.getElementById(id);
const els = {
  loading: $("view-loading"), signin: $("view-signin"), cameraView: $("view-camera"),
  video: $("video"), flash: $("flash"), hint: $("camera-hint"), file: $("file-fallback"),
  controls: $("controls"), back: $("btn-back"), shutter: $("btn-shutter"), historyBtn: $("btn-history"),
  history: $("history"), historyList: $("history-list"), menu: $("menu"), banner: $("banner"),
  log: $("log"), logText: $("log-text"),
  toast: $("toast"), net: $("net"),
  cntDone: $("cnt-done"), cntPending: $("cnt-pending"), cntFailed: $("cnt-failed"),
};

let currentBase = null;        // 直前に撮った表面の基底名（裏面はこれに紐づく）
let facing = "environment";
let useFallback = false;
let busy = false;
let lastWarm = 0;
const usedBases = new Set();

// ---------- 表示ユーティリティ ----------
let toastTimer = null;
function toast(msg, kind = "info", ms = 2500) {
  els.toast.textContent = msg;
  els.toast.className = kind === "err" ? "err" : "";
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), ms);
}
function showView(name) {
  els.loading.hidden = name !== "loading";
  els.signin.hidden = name !== "signin";
  els.cameraView.hidden = name !== "camera";
  els.controls.hidden = name !== "camera";
}
function openPanel(el) { el.hidden = false; }
function closePanels() { els.history.hidden = true; els.menu.hidden = true; els.log.hidden = true; }

function renderLog() {
  const lines = uploader.readLog().map((e) => {
    const d = new Date(e.t);
    const p = (n) => String(n).padStart(2, "0");
    const t = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const extra = Object.entries(e).filter(([k]) => !["t", "name", "event"].includes(k)).map(([k, v]) => `${k}=${v}`).join(" ");
    return `${t} ${e.event.padEnd(11)} ${e.name || ""} ${extra}`;
  });
  els.logText.textContent = lines.length ? lines.join("\n") : "まだ送信していません";
}

async function refresh() {
  const c = await queue.counts();
  els.cntDone.textContent = c.done;
  els.cntPending.textContent = c.pending + c.uploading;
  els.cntFailed.textContent = c.failed;
  els.net.classList.toggle("off", !navigator.onLine);

  if (uploader.state.needsAuth) {
    els.banner.textContent = "サインインの有効期限が切れました。ここをタップして再サインイン";
    els.banner.className = "err";
    els.banner.hidden = false;
  } else if (!navigator.onLine && c.pending + c.uploading > 0) {
    els.banner.textContent = `圏外です。${c.pending + c.uploading} 件は電波が戻り次第送信します`;
    els.banner.className = "";
    els.banner.hidden = false;
  } else if (c.failed > 0) {
    els.banner.textContent = `${c.failed} 件の送信に失敗しました。履歴から再送できます`;
    els.banner.className = "err";
    els.banner.hidden = false;
  } else {
    els.banner.hidden = true;
  }

  els.back.disabled = !currentBase;
  els.back.textContent = currentBase ? `裏面を撮る (${timeLabel(currentBase)})` : "裏面を撮る";
  if (!els.history.hidden) renderHistory();
}

const mb = (n) => (n / 1024 / 1024).toFixed(2);

// ---------- 撮影 ----------
async function allocateBase(date) {
  let d = date;
  let base = formatBase(d);
  while (usedBases.has(base) || (await queue.countBase(base)) > 0) {
    d = new Date(d.getTime() + 1000);
    base = formatBase(d);
  }
  usedBases.add(base);
  return base;
}

async function handleShot(blob, side) {
  let base, name, kind;
  if (side === "back" && currentBase) {
    base = currentBase;
    const n = (await queue.countBase(base)) + 1;
    name = `${base}_${n}.jpg`;
    kind = "back";
  } else {
    base = await allocateBase(new Date());
    name = `${base}.jpg`;
    kind = "front";
    currentBase = base;
  }
  const [small, thumb] = await Promise.all([compress(blob, CONFIG.image), thumbnail(blob)]);
  await queue.add({ name, base, side: kind, blob: small, size: small.size, thumb, status: "pending", createdAt: Date.now(), attempts: 0 });
  toast(`${name}（${mb(small.size)} MB）を保存しました`);
  refresh();
  uploader.run(refresh);
}

async function shoot(side) {
  if (busy) return;
  if (useFallback) {
    els.file.dataset.side = side;
    els.file.click();
    return;
  }
  busy = true;
  els.shutter.disabled = true;
  els.back.disabled = true;
  try {
    els.flash.classList.add("on");
    setTimeout(() => els.flash.classList.remove("on"), 120);
    const blob = await camera.capture(els.video);
    await handleShot(blob, side);
  } catch (e) {
    console.error(e);
    toast(`撮影エラー: ${e.message || e}`, "err", 4000);
  } finally {
    busy = false;
    els.shutter.disabled = false;
    refresh();
  }
}

els.file.addEventListener("change", async () => {
  const f = els.file.files && els.file.files[0];
  const side = els.file.dataset.side || "front";
  els.file.value = "";
  if (!f) return;
  try { await handleShot(f, side); }
  catch (e) { console.error(e); toast(`保存エラー: ${e.message || e}`, "err", 4000); }
});

async function startCamera() {
  els.hint.hidden = true;
  if (!camera.isSupported()) { enableFallback("この端末ではブラウザ内カメラが使えないため、標準カメラで撮影します"); return; }
  try {
    await camera.start(els.video, facing);
    useFallback = false;
  } catch (e) {
    console.warn("camera start failed", e);
    enableFallback(e.name === "NotAllowedError"
      ? "カメラの使用が許可されていません。標準カメラで撮影します（設定でカメラを許可すると切り替わります）"
      : "ブラウザ内カメラを開けないため、標準カメラで撮影します");
  }
}
function enableFallback(msg) {
  useFallback = true;
  camera.stop();
  els.hint.textContent = msg;
  els.hint.hidden = false;
}

// ---------- 履歴 ----------
const STATUS_LABEL = { done: "送信済", pending: "待機中", uploading: "送信中…", failed: "失敗" };
async function renderHistory() {
  const items = (await queue.all()).sort((a, b) => b.createdAt - a.createdAt);
  els.historyList.innerHTML = "";
  if (!items.length) {
    els.historyList.innerHTML = '<li class="muted">まだ撮影していません</li>';
    return;
  }
  for (const it of items) {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = it.thumb || "";
    img.alt = "";
    const meta = document.createElement("div");
    meta.className = "meta";
    const nm = document.createElement("div");
    nm.className = "name";
    nm.textContent = it.name;
    const st = document.createElement("div");
    st.className = `st ${it.status}`;
    st.textContent = STATUS_LABEL[it.status] + (it.error ? `: ${it.error}` : "") + (it.size ? `  ${mb(it.size)} MB` : "");
    meta.append(nm, st);
    li.append(img, meta);
    if (it.status === "failed") {
      const retry = document.createElement("button");
      retry.textContent = "再送";
      retry.onclick = async () => { await queue.update(it.id, { status: "pending", error: "" }); refresh(); uploader.run(refresh); };
      const del = document.createElement("button");
      del.textContent = "削除";
      del.onclick = async () => { if (confirm(`${it.name} を端末から削除します。よろしいですか？`)) { await queue.remove(it.id); refresh(); } };
      li.append(retry, del);
    }
    els.historyList.append(li);
  }
}

// ---------- テスト送信（PC での動作確認用） ----------
async function testUpload() {
  const c = document.createElement("canvas");
  c.width = 800; c.height = 480;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#0f6e56"; ctx.lineWidth = 8; ctx.strokeRect(20, 20, c.width - 40, c.height - 40);
  ctx.fillStyle = "#111"; ctx.font = "bold 40px sans-serif";
  ctx.fillText("名刺撮影 テスト", 60, 140);
  ctx.font = "28px sans-serif";
  ctx.fillText(new Date().toLocaleString("ja-JP"), 60, 220);
  ctx.fillText(`version ${CONFIG.version}`, 60, 280);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
  const base = `test_${formatBase(new Date())}`;
  const thumb = await thumbnail(blob);
  await queue.add({ name: `${base}.jpg`, base, side: "test", blob, size: blob.size, thumb, status: "pending", createdAt: Date.now(), attempts: 0 });
  toast("テスト画像を送信キューに入れました");
  refresh();
  uploader.run(refresh);
}

// ---------- イベント ----------
els.shutter.addEventListener("click", () => shoot("front"));
els.back.addEventListener("click", () => shoot("back"));
els.historyBtn.addEventListener("click", () => { closePanels(); renderHistory(); openPanel(els.history); });
$("btn-menu").addEventListener("click", () => {
  closePanels();
  const a = auth.getAccount();
  $("m-info").textContent = `${a ? a.username : "未サインイン"} / 保存先 ${CONFIG.folder} / v${CONFIG.version}`;
  openPanel(els.menu);
});
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePanels));
$("btn-login").addEventListener("click", () => auth.login().catch((e) => toast(String(e), "err")));
els.banner.addEventListener("click", () => { if (uploader.state.needsAuth) auth.interactiveRenew(); });
$("m-retry").addEventListener("click", async () => { const n = await queue.retryFailed(); closePanels(); toast(`${n} 件を再送します`); refresh(); uploader.run(refresh); });
$("m-test").addEventListener("click", () => { closePanels(); testUpload().catch((e) => toast(String(e), "err")); });
$("m-flip").addEventListener("click", () => { closePanels(); facing = facing === "environment" ? "user" : "environment"; startCamera(); });
$("m-log").addEventListener("click", () => { closePanels(); renderLog(); openPanel(els.log); });
$("log-clear").addEventListener("click", () => { if (confirm("送信ログを消去しますか？")) { uploader.clearLog(); renderLog(); } });
$("m-clear").addEventListener("click", async () => { await queue.clearDone(); closePanels(); refresh(); toast("送信済の履歴を消去しました"); });
$("m-logout").addEventListener("click", () => { if (confirm("サインアウトしますか？ 次回起動時に再サインインが必要になります。")) auth.logout(); });
document.addEventListener("keydown", (e) => { if (e.code === "Space" && !els.cameraView.hidden && e.target === document.body) { e.preventDefault(); shoot("front"); } });

window.addEventListener("online", () => { refresh(); uploader.run(refresh); });
window.addEventListener("offline", refresh);
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || els.cameraView.hidden) return;
  if (!useFallback && (!els.video.srcObject || els.video.srcObject.getVideoTracks().every((t) => t.readyState === "ended"))) startCamera();
  if (Date.now() - lastWarm > 10 * 60 * 1000) { lastWarm = Date.now(); auth.ensureFreshToken().catch(() => {}); }
  uploader.run(refresh);
});
setInterval(() => { if (navigator.onLine) uploader.run(refresh); }, 60 * 1000);

// ---------- 起動 ----------
async function main() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("sw", e));
  showView("loading");
  let account = null;
  try {
    account = await auth.initAuth();
  } catch (e) {
    console.error(e);
    showView("signin");
    const err = $("signin-error");
    err.textContent = `サインインに失敗しました: ${e.errorMessage || e.message || e}`;
    err.hidden = false;
    return;
  }
  if (!account) { showView("signin"); return; }

  await queue.resetStale();
  showView("camera");
  await refresh();
  lastWarm = Date.now();
  auth.ensureFreshToken().catch(() => {});  // 必要ならここでリダイレクト（撮影前）
  uploader.run(refresh);
  startCamera();
}
main();
