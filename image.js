// 画像の縮小・再エンコード（EXIF の向きを反映）
async function toBitmap(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch (_) {
    return await createImageBitmap(blob);
  }
}
const toBlob = (canvas, q) => new Promise((r) => canvas.toBlob(r, "image/jpeg", q));

// crop: { x, y, w, h, videoAspect } を 0〜1 の割合で指定すると、その範囲だけを切り出す。
// 撮影画像とプレビュー映像の縦横比が違う場合は、中心が同じで画角が広い方向に余白があるとみなして補正する。
export function resolveCrop(crop, imgW, imgH) {
  if (!crop || !(crop.w > 0) || !(crop.h > 0)) return { sx: 0, sy: 0, sw: imgW, sh: imgH };
  let { x, y, w, h } = crop;
  const pA = imgW / imgH;
  const vA = crop.videoAspect || pA;
  if (Math.abs(pA - vA) / vA > 0.02) {
    if (pA > vA) { const k = vA / pA; x = (1 - k) / 2 + x * k; w *= k; }
    else { const k = pA / vA; y = (1 - k) / 2 + y * k; h *= k; }
  }
  const sx = Math.max(0, Math.round(x * imgW));
  const sy = Math.max(0, Math.round(y * imgH));
  const sw = Math.min(imgW - sx, Math.round(w * imgW));
  const sh = Math.min(imgH - sy, Math.round(h * imgH));
  if (sw < 16 || sh < 16) return { sx: 0, sy: 0, sw: imgW, sh: imgH };
  return { sx, sy, sw, sh };
}

export async function compress(blob, { maxLongEdge, quality, maxBytes }, crop = null) {
  const bmp = await toBitmap(blob);
  const { sx, sy, sw, sh } = resolveCrop(crop, bmp.width, bmp.height);
  const scale = Math.min(1, maxLongEdge / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
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
