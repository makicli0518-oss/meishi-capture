// Microsoft Graph へのアップロード（端末 → Graph 直送。中継サーバーなし）
const BASE = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(status, body) {
    let code = "", message = "";
    try {
      const j = JSON.parse(body);
      code = (j.error && j.error.code) || "";
      message = (j.error && j.error.message) || "";
    } catch (_) { /* 本文が JSON でない */ }
    super(`Graph ${status} ${code} ${message}`.trim());
    this.name = "GraphError";
    this.status = status;
    this.code = code;
  }
}

function encodePath(path) {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

// 小さいファイルの単純アップロード。同名があれば { conflict: true } を返す。
export async function uploadFile(token, folder, name, blob) {
  const url = `${BASE}/me/drive/root:/${encodePath(folder + "/" + name)}:/content?@microsoft.graph.conflictBehavior=fail`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (res.status === 409) return { conflict: true };
  if (!res.ok) throw new GraphError(res.status, await res.text().catch(() => ""));
  return await res.json();
}

// アップロード後の実在確認（id で取得。無ければ GraphError 404）
export async function getItem(token, id) {
  const res = await fetch(`${BASE}/me/drive/items/${encodeURIComponent(id)}?$select=id,name,size,parentReference`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new GraphError(res.status, await res.text().catch(() => ""));
  return await res.json();
}

// 保存先フォルダを段階的に作る（存在すればそのまま）
export async function ensureFolder(token, folder) {
  const parts = folder.split("/").filter(Boolean);
  let parent = "";
  for (const part of parts) {
    const url = parent
      ? `${BASE}/me/drive/root:/${encodePath(parent)}:/children`
      : `${BASE}/me/drive/root/children`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: part, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (!res.ok && res.status !== 409) throw new GraphError(res.status, await res.text().catch(() => ""));
    parent = parent ? `${parent}/${part}` : part;
  }
}
