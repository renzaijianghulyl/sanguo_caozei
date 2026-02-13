import type { NPCState, PlayerState, WorldState } from "@core/state";
import { ClientConfig } from "@config/index";
import { request as wxRequest } from "@utils/wxHelpers";

export interface AdjudicationRequest {
  player_state: PlayerState;
  world_state: WorldState;
  npc_state: NPCState[];
  event_context?: Record<string, unknown>;
  player_intent: string;
}

export interface AdjudicationResponse {
  result?: {
    narrative?: string;
    effects?: string[];
  };
  state_changes?: {
    player?: string[];
    world?: Partial<WorldState>;
  };
}

function isCloudAvailable(): boolean {
  return typeof wx !== "undefined" && typeof (wx as { cloud?: { callFunction?: unknown } }).cloud?.callFunction === "function";
}

export async function callAdjudication(payload: AdjudicationRequest): Promise<AdjudicationResponse> {
  const { CLOUD_ENV, ADJUDICATION_API, MAX_RETRIES, RETRY_DELAY, REQUEST_TIMEOUT } = ClientConfig;

  const useCloud = isCloudAvailable() && CLOUD_ENV;
  if (useCloud) {
    try {
      const r = await (wx as { cloud: { callFunction: (o: { name: string; data: unknown }) => Promise<{ result?: unknown }> } })
        .cloud.callFunction({ name: "adjudication", data: payload });
      const data = r?.result as AdjudicationResponse | undefined;
      if (data && typeof data === "object" && data.result) {
        return data;
      }
      throw new Error("云函数返回格式异常");
    } catch (err) {
      throw err instanceof Error ? err : new Error("云函数调用失败");
    }
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= MAX_RETRIES) {
    try {
      const res = await wxRequest<AdjudicationResponse>({
        url: ADJUDICATION_API,
        data: payload,
        method: "POST",
        timeout: REQUEST_TIMEOUT,
        header: { "Content-Type": "application/json" }
      });

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return res.data;
      }
      throw new Error(`裁决 API 返回 ${res.statusCode}`);
    } catch (err) {
      lastError = err;
      attempt += 1;
      if (attempt > MAX_RETRIES) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("裁决请求失败");
}
