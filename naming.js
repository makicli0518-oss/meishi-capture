// ファイル名規則
//   表面: YYYYMMDD_HHMMSS.jpg（端末ローカル時刻）
//   裏面: 表面と同じ基底名 + _2.jpg（3枚目以降は _3, _4 ...）
//   クラウド側で同名衝突した場合: 基底名-2.jpg のように -n を付けて再送

const pad = (n) => String(n).padStart(2, "0");

export function formatBase(d) {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function withConflictSuffix(name, n) {
  return name.replace(/\.jpg$/i, `-${n}.jpg`);
}

export function timeLabel(base) {
  // "20260923_143012" -> "14:30:12"
  const m = /^\d{8}_(\d{2})(\d{2})(\d{2})$/.exec(base);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : base;
}
