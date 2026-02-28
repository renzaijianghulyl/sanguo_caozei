/**
 * 核心引擎 2.0 凭证与向量/模型配置：从环境或安全存储读取，不提交密钥到版本库。
 * Zilliz Cloud: Collection caozei, Dimension 1024, Metric Cosine.
 * Embedding: deepseek-embed；对话: deepseek-v3。
 */

const _env: Record<string, string | undefined> = (() => {
  try {
    const g =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof self !== "undefined"
          ? self
          : {};
    const p = (g as Record<string, unknown>).process;
    return p && typeof p === "object" && p !== null && "env" in p
      ? ((p as { env: Record<string, string | undefined> }).env ?? {})
      : {};
  } catch {
    return {};
  }
})();

export interface VectorMemoryCredentials {
  /** Zilliz Cloud 公网 endpoint，如 https://xxx.serverless.ali-cn-hangzhou.cloud.zilliz.com.cn */
  zillizEndpoint: string;
  /** Zilliz API Key */
  zillizApiKey: string;
  /** DeepSeek API Key（用于 embedding 与对话） */
  deepseekApiKey: string;
  /** 集合名，默认 caozei */
  collectionName: string;
  /** 向量维度，默认 1024 */
  dimension: number;
}

export interface EmbeddingConfig {
  /** 模型名，如 deepseek-embed */
  model: string;
  apiKey: string;
}

/** 从环境变量读取向量记忆配置；未配置时返回空字符串，调用方需做 no-op 判断 */
export function getVectorMemoryConfig(): VectorMemoryCredentials {
  return {
    zillizEndpoint: _env.ZILLIZ_ENDPOINT ?? _env.VECTOR_ENDPOINT ?? "",
    zillizApiKey: _env.ZILLIZ_API_KEY ?? _env.VECTOR_API_KEY ?? "",
    deepseekApiKey: _env.DEEPSEEK_API_KEY ?? "",
    collectionName: _env.VECTOR_COLLECTION ?? "caozei",
    dimension: 1024
  };
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const apiKey = _env.DEEPSEEK_API_KEY ?? "";
  return { model: "deepseek-embed", apiKey };
}

/** 是否已配置向量记忆（endpoint + key 均非空） */
export function isVectorMemoryConfigured(): boolean {
  const c = getVectorMemoryConfig();
  return Boolean(c.zillizEndpoint && c.zillizApiKey);
}
