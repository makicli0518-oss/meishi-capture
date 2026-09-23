// カメラ（getUserMedia + ImageCapture）。使えない端末では <input type=file capture> に切替える。
let stream = null;
let track = null;
let imageCapture = null;

export function isSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function start(video, facing = "environment") {
  stop();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: 4096 }, height: { ideal: 3072 } },
  });
  track = stream.getVideoTracks()[0];
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.focusMode && caps.focusMode.includes("continuous")) {
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    }
  } catch (e) {
    console.warn("focus constraint", e);
  }
  imageCapture = "ImageCapture" in window ? new ImageCapture(track) : null;
  video.srcObject = stream;
  await video.play().catch(() => {});
}

export function stop() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  track = null;
  imageCapture = null;
}

export function facingMode() {
  return track && track.getSettings ? track.getSettings().facingMode : undefined;
}

export async function capture(video) {
  if (imageCapture) {
    try {
      const caps = await imageCapture.getPhotoCapabilities().catch(() => null);
      const opts = caps && caps.imageWidth ? { imageWidth: caps.imageWidth.max } : {};
      return await imageCapture.takePhoto(opts);
    } catch (e) {
      console.warn("takePhoto failed, retrying plain", e);
      try {
        return await imageCapture.takePhoto();
      } catch (e2) {
        console.warn("takePhoto (plain) failed, falling back to canvas", e2);
      }
    }
  }
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  if (!c.width) throw new Error("カメラ映像がまだ準備できていません");
  c.getContext("2d").drawImage(video, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.95));
  if (!blob) throw new Error("撮影に失敗しました");
  return blob;
}

// 画面上の枠（guideEl）が、カメラ映像のどの範囲に当たるかを 0〜1 の割合で返す。
// video は object-fit: cover で表示されている前提。margin は枠に対する余白の割合。
export function guideCropFraction(video, guideEl, margin = 0.04) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const er = video.getBoundingClientRect();
  const gr = guideEl.getBoundingClientRect();
  if (!er.width || !er.height || !gr.width || !gr.height) return null;
  const scale = Math.max(er.width / vw, er.height / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offX = er.left + (er.width - dispW) / 2;
  const offY = er.top + (er.height - dispH) / 2;
  let x = (gr.left - offX) / dispW;
  let y = (gr.top - offY) / dispH;
  let w = gr.width / dispW;
  let h = gr.height / dispH;
  x -= w * margin;
  y -= h * margin;
  w *= 1 + 2 * margin;
  h *= 1 + 2 * margin;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const x0 = clamp(x);
  const y0 = clamp(y);
  const x1 = clamp(x + w);
  const y1 = clamp(y + h);
  if (x1 - x0 < 0.05 || y1 - y0 < 0.05) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, videoAspect: vw / vh };
}
