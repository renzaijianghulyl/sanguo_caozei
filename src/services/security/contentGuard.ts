type GuardResult = {
  allowed: boolean;
  reason?: string;
  text?: string;
};

const LOCAL_BLOCKLIST = [
  "作弊器",
  "外挂",
  "暴恐",
  "低俗",
  "赌博",
  "政治敏感",
  "涉黄",
  "违法",
  "恐怖袭击",
  "色情",
  "反动",
  "暴力",
  "血腥",
  "毒品",
  "诈骗",
  "传销",
  "邪教",
  "分裂",
  "颠覆"
];

function hitsBlockList(text: string): boolean {
  const normalized = text.toLowerCase();
  return LOCAL_BLOCKLIST.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function runMsgSecCheck(content: string): Promise<boolean> {
  const w = typeof wx !== "undefined" ? (wx as any) : null;
  const fn = w?.security?.msgSecCheck;
  if (typeof fn !== "function") return Promise.resolve(true);
  return new Promise((resolve) => {
    fn({
      data: { content, version: 2, scene: 2, openid: "" },
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

export async function ensurePlayerInputSafe(text: string): Promise<GuardResult> {
  if (!text.trim()) {
    return { allowed: false, reason: "请输入有效内容" };
  }
  if (hitsBlockList(text)) {
    return { allowed: false, reason: "输入内容涉及敏感词，已被拦截" };
  }
  const remoteOk = await runMsgSecCheck(text);
  if (!remoteOk) {
    return { allowed: false, reason: "内容未通过平台审核，请调整后再试" };
  }
  return { allowed: true };
}

export async function sanitizeNarrative(text: string): Promise<GuardResult> {
  if (hitsBlockList(text)) {
    return { allowed: false, reason: "生成内容包含敏感信息，已自动屏蔽" };
  }
  const remoteOk = await runMsgSecCheck(text);
  if (!remoteOk) {
    return { allowed: false, reason: "生成内容未通过审核，已替换为系统回复" };
  }
  return { allowed: true, text };
}
