import type { NPCState, PlayerState, WorldState } from "@core/state";
import { ClientConfig } from "@config/index";
import { request as wxRequest } from "@utils/wxHelpers";

/** 逻辑层预处理后的既定事实，供 LLM 基于事实做文学化叙事 */
export interface LogicalResults {
  /** 经过的年数（时间跳跃） */
  time_passed?: number;
  /** 经过的月数（用于细粒度推进） */
  time_passed_months?: number;
  /** 推进后的时间，供 event_context 与 LLM 同步 */
  new_time?: { year: number; month: number };
  /** 属性增益（如修炼、闭关导致） */
  attribute_gained?: Partial<Record<"strength" | "intelligence" | "charm" | "luck", number>>;
  /** 该时间跨度内发生的世界大事（来自 worldTimeline） */
  world_changes?: string[];
  /** 民间传闻 1～2 条（基于当前年份邻近时间线事件），供 NPC 对话中自然提及 */
  folk_rumors?: string[];
  /** 本回合动作体力消耗，用于扣减 stamina（行动力）；不足时 preAdjudicator 可置 logic_override */
  stamina_cost?: number;
  /** 本回合恶行导致的恶名增加值（纵火、劫掠、行刺等），由预裁决检测意图后写入 */
  infamy_delta?: number;
  /** 本回合破坏动作针对的势力 id（如烧某城粮仓则将该势力加入玩家 hostile_factions） */
  hostile_faction_add?: string;
  /** 环境音效触发标签，如 "war" | "history" | "calm" */
  audio_trigger?: string;
  /** 成功率修正（-1～1）：重伤/断粮/中毒时战斗与移动强制 -0.5，供叙事与判定使用 */
  success_rate_modifier?: number;
  /** 生理成功率因子 0～1：Actual_Success_Rate = Base_Rate * physiological_success_factor，由健康度与饥饿度计算 */
  physiological_success_factor?: number;
  /** 健康度变化量（本回合），应用后若 ≤0 可触发游戏终止 */
  health_delta?: number;
  /** 若为 true 或非空，表示本回合玩家殒命/游戏终止，前端应展示结束界面 */
  game_over_reason?: string;
}

/** 当玩家意图不可能实现时，强制 LLM 描写失败 */
export interface LogicOverride {
  /** 原因标识，如 "impossible_battle" | "beyond_timeline" */
  reason: string;
  /** 给模型的简短说明 */
  instruction: string;
}

/** 三国结构化数据库上下文，供 LLM 参考以保持叙事与史实一致；血缘与阵营锁定，严禁幻觉 */
export interface LogicDbContext {
  /** 货币购买力硬约束说明，防止「五金买五十金物资」等数值崩坏 */
  purchasing_power_instruction?: string;
  regions: Array<{
    id: number;
    name: string;
    type: string;
    landscape_description?: string;
    landmarks?: string[];
    ownerId: number;
    loyalty: number;
  }>;
  npcs: Array<{
    id: number;
    name: string;
    str: number;
    int: number;
    currentRegion: string;
    personality_traits?: string[];
    speech_style?: string;
    birth_year: number;
    death_year: number;
    /** 当前年份下的年龄，未满 15 不可出仕 */
    age?: number;
    /** 是否已满 15 岁可出仕 */
    can_serve?: boolean;
    /** 父亲 NPC id，锁定血缘，如曹丕必为曹操之子 */
    father_id: number | null;
    /** 当前所属阵营/势力 id，锁定阵营 */
    owner_faction_id: number;
  }>;
}

export interface AdjudicationRequest {
  player_state: PlayerState;
  world_state: WorldState;
  npc_state: NPCState[];
  event_context?: Record<string, unknown>;
  player_intent: string;
  /** 逻辑层预处理结果：既定事实，叙事必须基于此 */
  logical_results?: LogicalResults;
  /** 存在时表示逻辑层判定为不可能，LLM 必须描写失败 */
  logic_override?: LogicOverride;
  /** 三国结构化数据库（城池、武将），供 LLM 参考以修正叙事幻觉 */
  logic_db?: LogicDbContext;
}

/** 建议动作项：支持志向高亮标记 */
export type SuggestedActionItem = string | { text: string; is_aspiration_focused?: boolean };

export interface AdjudicationResponse {
  result?: {
    narrative?: string;
    effects?: string[];
    /** 与当前叙事衔接的 3 条后续可选动作；可为字符串或带 is_aspiration_focused 的对象 */
    suggested_actions?: SuggestedActionItem[];
    /** 重要剧情转折时由服务端返回的阶段性目标，将合并入 player.active_goals 以引导后续叙事 */
    suggested_goals?: string[];
  };
  state_changes?: {
    player?: string[];
    world?: Partial<WorldState>;
  };
  /** 环境音效触发，由逻辑层或服务端注入 */
  audio_trigger?: string;
}

/** 将 suggested_actions 规范为统一结构，便于渲染与点击 */
export function normalizeSuggestedActions(
  raw: SuggestedActionItem[] | undefined
): Array<{ text: string; is_aspiration_focused: boolean }> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .slice(0, 3)
    .map((s) => {
      if (typeof s === "string") return { text: s.trim(), is_aspiration_focused: false };
      if (s && typeof s === "object" && typeof (s as { text?: string }).text === "string") {
        const o = s as { text: string; is_aspiration_focused?: boolean };
        return { text: String(o.text).trim(), is_aspiration_focused: !!o.is_aspiration_focused };
      }
      return null;
    })
    .filter((x): x is { text: string; is_aspiration_focused: boolean } => x != null);
}

function isCloudAvailable(): boolean {
  return typeof wx !== "undefined" && typeof (wx as { cloud?: { callFunction?: unknown } }).cloud?.callFunction === "function";
}

export async function callAdjudication(payload: AdjudicationRequest): Promise<AdjudicationResponse> {
  const { CLOUD_ENV, ADJUDICATION_API, MAX_RETRIES, RETRY_DELAY, REQUEST_TIMEOUT } = ClientConfig;

  const useCloud = isCloudAvailable() && CLOUD_ENV;
  if (useCloud) {
    let attempt = 0;
    let lastError: unknown = null;
    const cloudCall = (): Promise<AdjudicationResponse> =>
      (wx as { cloud: { callFunction: (o: { name: string; data: unknown }) => Promise<{ result?: unknown }> } })
        .cloud.callFunction({ name: "adjudication", data: payload })
        .then((r) => {
          const data = r?.result as AdjudicationResponse | undefined;
          if (data && typeof data === "object" && data.result) {
            const nar = data.result.narrative;
            if (nar == null || String(nar).trim() === "") {
              if (ClientConfig.DEBUG) {
                console.warn("[adjudication] 云函数返回的 result.narrative 为空，原始 data:", JSON.stringify(data).slice(0, 300));
              }
              data.result.narrative = "（未收到剧情，请查看云函数日志或重试）";
            }
            return data;
          }
          throw new Error("云函数返回格式异常");
        });
    while (attempt <= MAX_RETRIES) {
      try {
        return await cloudCall();
      } catch (err) {
        lastError = err;
        attempt += 1;
        if (attempt > MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("云函数调用失败");
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
        const data = res.data as AdjudicationResponse;
        if (data?.result && (data.result.narrative == null || String(data.result.narrative).trim() === "")) {
          if (ClientConfig.DEBUG) {
            console.warn("[adjudication] HTTP 返回的 result.narrative 为空");
          }
          data.result.narrative = "（未收到剧情，请检查裁决 API 或重试）";
        }
        return data;
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
