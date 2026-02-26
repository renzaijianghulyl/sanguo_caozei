/**
 * 隐私同意状态持久化。微信小游戏使用 wx.setStorageSync / getStorageSync，
 * 语义等同 Web 的 localStorage，键名 privacy_agreed。
 */

const KEY = "privacy_agreed";

export function getPrivacyAgreed(): boolean {
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") return false;
  try {
    const v = wx.getStorageSync(KEY);
    return v === true || v === "true";
  } catch {
    return false;
  }
}

export function setPrivacyAgreed(agreed: boolean): void {
  if (typeof wx === "undefined" || typeof wx.setStorageSync !== "function") return;
  try {
    wx.setStorageSync(KEY, agreed);
  } catch {
    /* ignore */
  }
}
