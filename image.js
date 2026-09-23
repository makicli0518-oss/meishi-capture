// 画像の縮小・再エンコード（EXIF の向きを反映）
async function toBitmap(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch (_) {
    return await createImageBitmap(blob);
  }
}
const toBlob = (canvas, q) => new Promise((r) => canvas.toBlob(r, "image/jpeg", q));

export async function compress(blob, { maxLongEdge, quality, maxBytes }) {
  const bmp = await toBitmap(blob);
  const scale = Math.min(1, maxLongEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  let q = quality;
  let out = null;
  for (let i = 0; i < 4; i++) {
    out = await toBlob(c, q);
    if (!out) throw new Error("JPEG 変換に失敗しました");
    if (out.size <= maxBytes) break;
    q = Math.max(0.5, q - 0.1);
  }
  return out;
}

export async function thumbnail(blob, size = 160) {
  const bmp = await toBitmap(blob);
  const scale = size / Math.max(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c.toDataURL("image/jpeg", 0.6);
}
