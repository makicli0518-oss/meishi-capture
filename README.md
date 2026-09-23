# 名刺撮影 PWA（meishi-capture）

Android のホーム画面から起動し、名刺を撮影すると OneDrive の `名刺/未処理/` に自動保存する PWA。
ビルド不要（素の HTML / ES Modules）。認証ライブラリは `vendor/` に同梱。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` / `style.css` | 1 画面 UI（状態帯・カメラ・シャッター・裏面・履歴・メニュー） |
| `app.js` | 起動、撮影フロー、履歴、イベント |
| `auth.js` | MSAL.js によるサインインとトークン取得（個人 Microsoft アカウント） |
| `camera.js` | getUserMedia + ImageCapture。使えない端末は標準カメラに切替 |
| `image.js` | 長辺 2000px・JPEG 品質 0.85 に圧縮、サムネイル作成 |
| `naming.js` | `YYYYMMDD_HHMMSS.jpg`、裏面 `_2`、衝突時 `-n` |
| `queue.js` | IndexedDB の送信キュー（成功後に画像本体を削除） |
| `uploader.js` | Graph へ順次アップロード。圏外・期限切れは待機に戻す |
| `graph.js` | Microsoft Graph 単純アップロード、フォルダ作成 |
| `sw.js` / `manifest.webmanifest` | PWA（オフライン起動・ホーム画面追加） |
| `config.js` | クライアント ID、保存先、圧縮設定（秘密情報なし） |
| `serve.py` | 開発用ローカルサーバー（`http://localhost:5173/`） |
| `tools/make_icons.py` | アイコン生成 |

## ローカルで動かす

```bash
python serve.py
```

ブラウザで `http://localhost:5173/` を開く（`127.0.0.1` ではなく `localhost`。リダイレクト URI と一致させるため）。

## 公開（GitHub Pages）

1. このフォルダを GitHub リポジトリ `meishi-capture` に push。
2. Settings → Pages → Source: Deploy from a branch / `main` / `/ (root)`。
3. Entra ID の「認証」に `https://<user>.github.io/meishi-capture/` を SPA として追加。
4. スマホの Chrome で URL を開き、メニュー →「ホーム画面に追加」。

## 更新の反映

`sw.js` の `VERSION` と `config.js` の `version` を上げて push する。
アプリは起動時にネットワーク優先で読み込むため、次回起動で新版になる。
