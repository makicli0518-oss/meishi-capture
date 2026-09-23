// アプリ設定（すべて公開情報。秘密の値は含まない）
export const CONFIG = {
  version: "0.1.4",
  // Entra ID アプリ登録「名刺撮影PWA」のアプリケーション (クライアント) ID
  clientId: "ee2e645e-96fe-491c-9d5d-98f6b7802010",
  // 個人 Microsoft アカウント専用
  authority: "https://login.microsoftonline.com/consumers",
  // Graph の委任スコープ（openid / profile / offline_access は MSAL が自動付与）
  scopes: ["Files.ReadWrite"],
  // OneDrive 上の保存先（ルートからの相対パス）
  folder: "名刺/未処理",
  // 画像圧縮
  image: { maxLongEdge: 2000, quality: 0.85, maxBytes: 2 * 1024 * 1024 },
  // 履歴に残す件数
  historyLimit: 50,
};
