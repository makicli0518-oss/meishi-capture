// キューを順番に送る。ネットワーク断・サインイン切れでは「待機」のまま止め、後で再開する。
// 送信後は Graph の応答（サイズ・id）と実在確認で成功を検証する。
import { CONFIG } from "./config.js";
import * as queue from "./queue.js";
import { getToken, AuthRequiredError } from "./auth.js";
import { uploadFile, ensureFolder, getItem, GraphError } from "./graph.js";
import { withConflictSuffix } from "./naming.js";

let running = false;
export const state = { needsAuth: false, lastError: "" };
const RECHECK_DELAY_MS = 60 * 1000;

// ---------- 送信ログ（端末内・直近 60 件） ----------
const LOG_KEY = "meishi.uploadLog";
export function readLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch (_) { return []; }
}
function log(entry) {
  const list = readLog();
  list.unshift({ t: new Date().toISOString(), ...entry });
  try { localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 60))); } catch (_) { /* 容量超過などは無視 */ }
}
export function clearLog() { localStorage.removeItem(LOG_KEY); }

function isTransient(e) {
  if (e instanceof TypeError) return true; // fetch のネットワークエラー
  if (e instanceof GraphError && (e.status === 429 || e.status >= 500)) return true;
  return false;
}

async function uploadWithChecks(token, item, folderState) {
  let name = item.name;
  let res = null;
  for (let n = 2; n < 20; n++) {
    try {
      res = await uploadFile(token, CONFIG.folder, name, item.blob);
    } catch (e) {
      if (e instanceof GraphError && e.status === 404 && !folderState.checked) {
        await ensureFolder(token, CONFIG.folder);
        folderState.checked = true;
        res = await uploadFile(token, CONFIG.folder, name, item.blob);
      } else {
        throw e;
      }
    }
    if (!res.conflict) break;
    log({ name, event: "conflict" });
    name = withConflictSuffix(item.name, n);
  }
  if (res.conflict) throw new Error("同名ファイルが多すぎます");

  // 検証 1: 応答の名前とサイズ
  if (res.name && res.name !== name) throw new Error(`応答の名前が不一致 (${res.name})`);
  if (typeof res.size === "number" && res.size !== item.blob.size) {
    throw new Error(`サイズ不一致 (OneDrive ${res.size} / 端末 ${item.blob.size})`);
  }
  // 検証 2: 実在確認
  if (!res.id) throw new Error("応答に id がありません");
  const check = await getItem(token, res.id);
  if (check.size !== item.blob.size) throw new Error(`確認時サイズ不一致 (${check.size})`);
  return { name, id: res.id, size: check.size, path: check.parentReference && check.parentReference.path };
}

export async function run(notify = () => {}) {
  if (running) return;
  running = true;
  try {
    const folderState = { checked: false };
    while (navigator.onLine) {
      const item = await queue.nextPending();
      if (!item) break;
      await queue.update(item.id, { status: "uploading" });
      notify();
      const started = Date.now();
      try {
        const token = await getToken();
        state.needsAuth = false;
        const r = await uploadWithChecks(token, item, folderState);
        await queue.update(item.id, { status: "done", name: r.name, remoteId: r.id, doneAt: Date.now(), recheckAt: Date.now() + RECHECK_DELAY_MS, error: "" });
        log({ name: r.name, event: "done", id: r.id, size: r.size, path: r.path, ms: Date.now() - started });
        state.lastError = "";
      } catch (e) {
        console.warn("upload failed", item.name, e);
        const attempts = (item.attempts || 0) + 1;
        const msg = e.message || String(e);
        if (e instanceof AuthRequiredError || (e instanceof GraphError && e.status === 401)) {
          state.needsAuth = true;
          log({ name: item.name, event: "auth", error: msg });
          await queue.update(item.id, { status: "pending", attempts });
          break;
        }
        if (isTransient(e)) {
          state.lastError = "ネットワーク待ち";
          log({ name: item.name, event: "retry-later", error: msg });
          await queue.update(item.id, { status: "pending", attempts });
          break;
        }
        state.lastError = msg;
        log({ name: item.name, event: "failed", error: msg, ms: Date.now() - started });
        await queue.update(item.id, { status: "failed", attempts, error: msg });
      }
      notify();
    }
    await queue.prune(CONFIG.historyLimit);
  } finally {
    running = false;
    notify();
  }
}

// 送信成功から一定時間後に OneDrive 上の実在を再確認する。
// 存在すれば端末内の画像本体を削除、消えていれば自動で再送キューに戻す。
let rechecking = false;
export async function recheck(notify = () => {}) {
  if (rechecking || !navigator.onLine) return;
  rechecking = true;
  try {
    const items = (await queue.all()).filter((i) => i.status === "done" && i.blob && i.remoteId && (i.recheckAt || 0) <= Date.now());
    if (!items.length) return;
    let token;
    try { token = await getToken(); } catch (_) { return; }
    for (const it of items) {
      try {
        const remote = await getItem(token, it.remoteId);
        if (remote.deleted || remote.size !== it.blob.size) throw new GraphError(404, "");
        await queue.update(it.id, { blob: null });
        log({ name: it.name, event: "verified", id: it.remoteId });
      } catch (e) {
        if (e instanceof GraphError && e.status === 404) {
          log({ name: it.name, event: "vanished", id: it.remoteId, error: "OneDrive から消えていたため再送" });
          await queue.update(it.id, { status: "pending", remoteId: null, error: "" });
        } else {
          log({ name: it.name, event: "recheck-error", error: e.message || String(e) });
        }
      }
    }
    notify();
    await run(notify);
  } finally {
    rechecking = false;
  }
}
