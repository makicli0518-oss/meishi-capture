// Microsoft サインイン（MSAL.js, Auth Code + PKCE）
// vendor/msal-browser.min.js がグローバル msal を定義する
import { CONFIG } from "./config.js";

const redirectUri = new URL("./", location.href).href; // 例: https://user.github.io/meishi-capture/
let pca = null;

export async function initAuth() {
  pca = new msal.PublicClientApplication({
    auth: {
      clientId: CONFIG.clientId,
      authority: CONFIG.authority,
      redirectUri,
      postLogoutRedirectUri: redirectUri,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      // PWA を閉じても保持する。初回サインインで「サインインの状態を維持」= はい を選ぶこと
      cacheLocation: "localStorage",
    },
    system: {
      loggerOptions: { logLevel: msal.LogLevel.Warning, loggerCallback: (_l, m) => console.warn(m) },
    },
  });
  await pca.initialize();
  const result = await pca.handleRedirectPromise();
  if (result && result.account) {
    pca.setActiveAccount(result.account);
  } else if (!pca.getActiveAccount()) {
    const accounts = pca.getAllAccounts();
    if (accounts.length) pca.setActiveAccount(accounts[0]);
  }
  return pca.getActiveAccount();
}

export function getAccount() {
  return pca ? pca.getActiveAccount() : null;
}

export function login() {
  return pca.loginRedirect({ scopes: CONFIG.scopes, prompt: "select_account" });
}

export function logout() {
  return pca.logoutRedirect({ account: pca.getActiveAccount() });
}

export class AuthRequiredError extends Error {
  constructor(msg) { super(msg || "サインインが必要です"); this.name = "AuthRequiredError"; }
}

// アクセストークンを無音で取得。対話が必要なら AuthRequiredError を投げる（勝手に画面遷移しない）
export async function getToken() {
  const account = pca.getActiveAccount();
  if (!account) throw new AuthRequiredError();
  try {
    const r = await pca.acquireTokenSilent({ scopes: CONFIG.scopes, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) throw new AuthRequiredError(e.errorMessage);
    throw e;
  }
}

// 対話が必要な場合にリダイレクトでサインインし直す（撮影前の起動時に呼ぶ）
export function interactiveRenew() {
  const account = pca.getActiveAccount();
  return pca.acquireTokenRedirect({
    scopes: CONFIG.scopes,
    account,
    loginHint: account ? account.username : undefined,
  });
}

// 起動時の先回り更新: 今後 2 時間は無音でトークンを取れる状態にする。
// 無理なら true を返す代わりにリダイレクトへ進む（撮影前なので画像を失わない）。
export async function ensureFreshToken() {
  const account = pca.getActiveAccount();
  if (!account) return false;
  if (!navigator.onLine) return true; // 圏外: キューに溜めるだけ
  try {
    await pca.acquireTokenSilent({
      scopes: CONFIG.scopes,
      account,
      forceRefresh: true,
      refreshTokenExpirationOffsetSeconds: 2 * 60 * 60,
    });
    return true;
  } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) {
      await interactiveRenew();
      return false;
    }
    console.warn("token warm-up failed", e);
    return true; // ネットワーク一時障害など。後で再試行
  }
}
