import { ClientConfig } from "@config/index";
import { request as wxRequest } from "@utils/wxHelpers";

export interface RequestOptions<TPayload> {
  url?: string;
  payload: TPayload;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

export async function postJson<TResponse, TPayload = unknown>({
  url = ClientConfig.ADJUDICATION_API,
  payload,
  retries = ClientConfig.MAX_RETRIES,
  retryDelay = ClientConfig.RETRY_DELAY,
  timeout = ClientConfig.REQUEST_TIMEOUT
}: RequestOptions<TPayload>): Promise<TResponse> {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    try {
      const response = await wxRequest<TResponse>({
        url,
        data: payload,
        method: "POST",
        timeout,
        header: {
          "Content-Type": "application/json"
        }
      });

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response.data;
      }
      throw new Error(`请求失败: ${response.statusCode}`);
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt > retries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("请求失败且无可用错误信息");
}
