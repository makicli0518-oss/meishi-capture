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
