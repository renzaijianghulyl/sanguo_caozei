import { ClientConfig } from "@config/index";

let rewardedAd: WechatMiniprogram.RewardedVideoAd | null = null;
let adReady = false;
let adInitAttempted = false;
const AD_COOLDOWN_MS = 120_000;
let lastAdShownAt = 0;

function createAdInstance(): void {
  if (rewardedAd || adInitAttempted) return;
  adInitAttempted = true;
  if (typeof wx === "undefined" || typeof wx.createRewardedVideoAd !== "function") return;
  try {
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: ClientConfig.AD_UNIT_ID });
    rewardedAd.onLoad(() => {
      adReady = true;
    });
    rewardedAd.onError(() => {
      adReady = false;
    });
    rewardedAd.onClose(() => {
      adReady = true;
    });
  } catch {
    rewardedAd = null;
  }
}

export function initRewardedAd(): void {
  /* 不再在启动时初始化，改为首次请求时延迟初始化，避免未配置广告时 -12001 报错 */
}

export function requestRewardedAd(trigger: string): void {
  const now = Date.now();
  if (now - lastAdShownAt < AD_COOLDOWN_MS) {
    console.log(`[ads] trigger=${trigger}, cooldown active (${Math.ceil((AD_COOLDOWN_MS - (now - lastAdShownAt)) / 1000)}s remaining)`);
    return;
  }
  createAdInstance();
  if (!rewardedAd || !adReady) {
    console.log(`[ads] trigger=${trigger}, but rewarded ad not ready`);
    return;
  }
  rewardedAd
    .show()
    .then(() => {
      lastAdShownAt = Date.now();
      adReady = false;
    })
    .catch(() => {
      rewardedAd
        ?.load()
        .then(() => rewardedAd?.show())
        .catch((err: unknown) => {
          console.warn("[ads] failed to show rewarded ad:", err);
        });
    });
}
