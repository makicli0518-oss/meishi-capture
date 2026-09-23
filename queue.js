// 送信キュー（IndexedDB）。撮影直後に保存し、送信成功後に画像本体を削除する。
const DB_NAME = "meishi-capture";
const STORE = "items";

let dbPromise = null;
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("status", "status");
      store.createIndex("base", "base");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const wrap = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let out;
        Promise.resolve(fn(store)).then((v) => { out = v; }, reject);
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export function add(item) {
  return tx("readwrite", (s) => wrap(s.add(item)));
}

export function update(id, patch) {
  return tx("readwrite", async (s) => {
    const cur = await wrap(s.get(id));
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await wrap(s.put(next));
    return next;
  });
}

export function remove(id) {
  return tx("readwrite", (s) => wrap(s.delete(id)));
}

export function all() {
  return tx("readonly", (s) => wrap(s.getAll()));
}

export async function nextPending() {
  const items = await tx("readonly", (s) => wrap(s.index("status").getAll("pending")));
  items.sort((a, b) => a.createdAt - b.createdAt);
  return items[0] || null;
}

export function countBase(base) {
  return tx("readonly", (s) => wrap(s.index("base").count(base)));
}

export async function counts() {
  const items = await all();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const c = { done: 0, pending: 0, failed: 0, uploading: 0 };
  for (const it of items) {
    if (it.status === "done") {
      if ((it.doneAt || 0) >= startOfToday.getTime()) c.done++;
    } else if (it.status in c) {
      c[it.status]++;
    }
  }
  return c;
}

// 起動時: 前回「送信中」のまま終わったものを待機に戻す
export async function resetStale() {
  const items = await tx("readonly", (s) => wrap(s.index("status").getAll("uploading")));
  for (const it of items) await update(it.id, { status: "pending" });
}

export async function retryFailed() {
  const items = await tx("readonly", (s) => wrap(s.index("status").getAll("failed")));
  for (const it of items) await update(it.id, { status: "pending", error: "" });
  return items.length;
}

// 送信済レコードを新しい順に limit 件だけ残す
export async function prune(limit) {
  const items = await all();
  const done = items.filter((i) => i.status === "done").sort((a, b) => b.doneAt - a.doneAt);
  for (const it of done.slice(limit)) await remove(it.id);
}

export async function clearDone() {
  const items = await all();
  for (const it of items) if (it.status === "done") await remove(it.id);
}
