// キューを順番に送る。ネットワーク断・サインイン切れでは「待機」のまま止め、後で再開する。
import { CONFIG } from "./config.js";
import * as queue from "./queue.js";
import { getToken, AuthRequiredError } from "./auth.js";
import { uploadFile, ensureFolder, GraphError } from "./graph.js";
import { withConflictSuffix } from "./naming.js";

let running = false;
export const state = { needsAuth: false, lastError: "" };

function isTransient(e) {
  if (e instanceof TypeError) return true; // fetch のネットワークエラー
  if (e instanceof GraphError && (e.status === 429 || e.status >= 500)) return true;
  return false;
}

export async function run(notify = () => {}) {
  if (running) return;
  running = true;
  try {
    let folderChecked = false;
    while (navigator.onLine) {
      const item = await queue.nextPending();
      if (!item) break;
      await queue.update(item.id, { status: "uploading" });
      notify();
      try {
        const token = await getToken();
        state.needsAuth = false;
        let name = item.name;
        let res = null;
        for (let n = 2; n < 20; n++) {
          try {
            res = await uploadFile(token, CONFIG.folder, name, item.blob);
          } catch (e) {
            if (e instanceof GraphError && e.status === 404 && !folderChecked) {
              await ensureFolder(token, CONFIG.folder);
              folderChecked = true;
              res = await uploadFile(token, CONFIG.folder, name, item.blob);
            } else {
              throw e;
            }
          }
          if (!res.conflict) break;
          name = withConflictSuffix(item.name, n);
        }
        if (res.conflict) throw new Error("同名ファイルが多すぎます");
        await queue.update(item.id, { status: "done", name, blob: null, doneAt: Date.now(), error: "" });
        state.lastError = "";
      } catch (e) {
        console.warn("upload failed", item.name, e);
        const attempts = (item.attempts || 0) + 1;
        if (e instanceof AuthRequiredError || (e instanceof GraphError && e.status === 401)) {
          state.needsAuth = true;
          await queue.update(item.id, { status: "pending", attempts });
          break;
        }
        if (isTransient(e)) {
          state.lastError = "ネットワーク待ち";
          await queue.update(item.id, { status: "pending", attempts });
          break;
        }
        state.lastError = e.message || String(e);
        await queue.update(item.id, { status: "failed", attempts, error: state.lastError });
      }
      notify();
    }
    await queue.prune(CONFIG.historyLimit);
  } finally {
    running = false;
    notify();
  }
}
