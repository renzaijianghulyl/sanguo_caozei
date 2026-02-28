/**
 * 核心引擎 2.0 语义记忆：对话裁决后摘要写入 Zilliz，对话前按 NPC/地点检索相关记忆。
 * Metadata：npc_ids, region_id, year, session_id。实际 embedding/Zilliz 建议在云函数中完成，本模块提供接口与可选客户端封装。
 */

import { isVectorMemoryConfigured } from "@config/credentials";

export interface SaveInteractionMetadata {
  /** 关联武将 ID，多个用逗号分隔，如 "2001,2005" */
  npc_ids: string;
  /** 区域 id 或 key */
  region_id: string;
  /** 记忆发生的虚拟年份 */
  year: number;
  /** 玩家存档 ID，多存档隔离 */
  session_id: string;
  /** 记忆类型：default | interpersonal（与某 NPC 深度交流后写入，检索时优先召回以支撑第二人称化台词） */
  memory_type?: "default" | "interpersonal";
}

export interface RetrieveMemoriesOpts {
  /** 当前对话 NPC id */
  npc_id: string;
  /** 当前区域 id，可选 */
  region_id?: string;
  /** 当前存档 session_id，可选 */
  session_id?: string;
  /** 返回条数，默认 3 */
  limit?: number;
  /** 是否优先召回 type=origin 的初始设定记忆并置于首位，默认 true */
  include_origin?: boolean;
}

/**
 * 语义记忆管理器接口：可由云函数或小程序侧实现。
 */
export interface IVectorMemoryManager {
  /**
   * 对话裁决后，将剧情摘要转为向量存入 Zilliz。
   * @param summary - 摘要文本（时间+地点+人物+事件）
   * @param metadata - npc_ids, region_id, year, session_id
   */
  saveInteraction(summary: string, metadata: SaveInteractionMetadata): Promise<void>;

  /**
   * 双模型异步流程：将本轮对话原文交给云函数，由 GLM-4-Flash 总结成约 50 字后 Embed 并存入 Zilliz。
   * 可选；未实现时调用方可用 saveInteraction(摘要, metadata) 替代。
   */
  saveDialogueAndSummarize?(dialogue: string, metadata: SaveInteractionMetadata): Promise<void>;

  /**
   * 对话开始前，按 npc_id（及可选 region_id、session_id）检索相关记忆。
   * 若实现支持 memory_type，会强制召回该 session 下 type=origin 的初始设定（若有）并置于首位。
   * @returns 最相关的若干条记忆摘要文本
   */
  retrieveRelevantMemories(opts: RetrieveMemoriesOpts): Promise<string[]>;

  /**
   * 将玩家进入游戏时输入的「个人设定」（如：曹操之子、隐居名士）存为一条 type=origin 的永久记忆。
   * 可选；未实现时 no-op。
   */
  saveOriginSetting?(content: string, meta: { session_id: string }): Promise<void>;

  /**
   * 将客观战报列表交给云函数，由 GLM-4-Flash 改写为江湖传闻后以 type=global_rumor 存入向量库。
   * 可选；未实现时 no-op。
   */
  literarizeAndSaveRumors?(reports: string[], meta: SaveInteractionMetadata): Promise<void>;

  /**
   * 按 session_id 删除该存档下的全部向量记忆。用户重新开始游戏时调用，实现「新游戏即清空历史记忆」。
   * 可选；未实现时仅不执行删除，不影响其它流程。
   */
  deleteBySessionId?(session_id: string): Promise<void>;
}

/**
 * 默认实现：未配置凭证时 no-op；已配置时通过云函数或 HTTP 调用后端（由调用方注入）。
 */
export function createVectorMemoryManager(handler: {
  save: (summary: string, metadata: SaveInteractionMetadata) => Promise<void>;
  saveDialogueAndSummarize?: (dialogue: string, metadata: SaveInteractionMetadata) => Promise<void>;
  retrieve: (opts: RetrieveMemoriesOpts) => Promise<string[]>;
  deleteBySessionId?: (session_id: string) => Promise<void>;
  saveOriginSetting?: (content: string, meta: { session_id: string }) => Promise<void>;
  literarizeAndSaveRumors?: (reports: string[], meta: SaveInteractionMetadata) => Promise<void>;
}): IVectorMemoryManager {
  return {
    async saveInteraction(summary: string, metadata: SaveInteractionMetadata): Promise<void> {
      if (!isVectorMemoryConfigured()) return;
      await handler.save(summary, metadata);
    },
    async saveDialogueAndSummarize(dialogue: string, metadata: SaveInteractionMetadata): Promise<void> {
      if (!isVectorMemoryConfigured() || !handler.saveDialogueAndSummarize) return;
      await handler.saveDialogueAndSummarize(dialogue, metadata);
    },
    async retrieveRelevantMemories(opts: RetrieveMemoriesOpts): Promise<string[]> {
      if (!isVectorMemoryConfigured()) return [];
      return handler.retrieve(opts);
    },
    async saveOriginSetting(content: string, meta: { session_id: string }): Promise<void> {
      if (!isVectorMemoryConfigured() || !handler.saveOriginSetting) return;
      await handler.saveOriginSetting(content, meta);
    },
    async literarizeAndSaveRumors(reports: string[], meta: SaveInteractionMetadata): Promise<void> {
      if (!isVectorMemoryConfigured() || !handler.literarizeAndSaveRumors) return;
      await handler.literarizeAndSaveRumors(reports, meta);
    },
    async deleteBySessionId(session_id: string): Promise<void> {
      if (!isVectorMemoryConfigured() || !handler.deleteBySessionId) return;
      await handler.deleteBySessionId(session_id);
    }
  };
}

/**
 * 云函数路径专用：不检查本地凭证，始终调用 handler（云函数内根据环境变量决定是否真正读写 Zilliz）。
 * 当 ClientConfig.USE_VECTOR_MEMORY 且 wx.cloud 可用时，用此方法创建 manager。
 */
export function createVectorMemoryManagerFromCloud(handler: {
  save: (summary: string, metadata: SaveInteractionMetadata) => Promise<void>;
  saveDialogueAndSummarize?: (dialogue: string, metadata: SaveInteractionMetadata) => Promise<void>;
  retrieve: (opts: RetrieveMemoriesOpts) => Promise<string[]>;
  deleteBySessionId?: (session_id: string) => Promise<void>;
  saveOriginSetting?: (content: string, meta: { session_id: string }) => Promise<void>;
  literarizeAndSaveRumors?: (reports: string[], meta: SaveInteractionMetadata) => Promise<void>;
}): IVectorMemoryManager {
  return {
    async saveInteraction(summary: string, metadata: SaveInteractionMetadata): Promise<void> {
      await handler.save(summary, metadata);
    },
    async saveDialogueAndSummarize(dialogue: string, metadata: SaveInteractionMetadata): Promise<void> {
      if (handler.saveDialogueAndSummarize) await handler.saveDialogueAndSummarize(dialogue, metadata);
    },
    async retrieveRelevantMemories(opts: RetrieveMemoriesOpts): Promise<string[]> {
      return handler.retrieve(opts);
    },
    async saveOriginSetting(content: string, meta: { session_id: string }): Promise<void> {
      if (handler.saveOriginSetting) await handler.saveOriginSetting(content, meta);
    },
    async literarizeAndSaveRumors(reports: string[], meta: SaveInteractionMetadata): Promise<void> {
      if (handler.literarizeAndSaveRumors) await handler.literarizeAndSaveRumors(reports, meta);
    },
    async deleteBySessionId(session_id: string): Promise<void> {
      if (handler.deleteBySessionId) await handler.deleteBySessionId(session_id);
    }
  };
}

/** 无操作实现：不配置 Zilliz 时使用，避免调用处判空。 */
export const noopVectorMemoryManager: IVectorMemoryManager = {
  async saveInteraction(): Promise<void> {},
  async saveDialogueAndSummarize(): Promise<void> {},
  async retrieveRelevantMemories(): Promise<string[]> {
    return [];
  },
  async saveOriginSetting(): Promise<void> {},
  async literarizeAndSaveRumors(): Promise<void> {},
  async deleteBySessionId(): Promise<void> {}
};

/** 微信环境下通过云函数 vectorMemory 调用的 handler；非微信或云不可用时返回 null */
export function getCloudVectorMemoryHandler(): {
  save: (summary: string, metadata: SaveInteractionMetadata) => Promise<void>;
  saveDialogueAndSummarize: (dialogue: string, metadata: SaveInteractionMetadata) => Promise<void>;
  retrieve: (opts: RetrieveMemoriesOpts) => Promise<string[]>;
  deleteBySessionId: (session_id: string) => Promise<void>;
  saveOriginSetting: (content: string, meta: { session_id: string }) => Promise<void>;
  literarizeAndSaveRumors: (reports: string[], meta: SaveInteractionMetadata) => Promise<void>;
} | null {
  const w =
    typeof wx !== "undefined"
      ? (wx as {
          cloud?: {
            callFunction?: (o: { name: string; data: unknown }) => Promise<{ result?: unknown }>;
          };
        }).cloud
      : undefined;
  if (!w?.callFunction) return null;
  return {
    async save(summary: string, metadata: SaveInteractionMetadata): Promise<void> {
      try {
        await w.callFunction!({
          name: "vectorMemory",
          data: {
            action: "save",
            summary,
            npc_ids: metadata.npc_ids,
            region_id: metadata.region_id,
            year: metadata.year,
            session_id: metadata.session_id,
            memory_type: metadata.memory_type || "default"
          }
        });
      } catch {
        // 静默忽略，不阻塞叙事与存档
      }
    },
    async saveDialogueAndSummarize(dialogue: string, metadata: SaveInteractionMetadata): Promise<void> {
      try {
        await w.callFunction!({
          name: "vectorMemory",
          data: {
            action: "summarizeAndSave",
            dialogue,
            npc_ids: metadata.npc_ids,
            region_id: metadata.region_id,
            year: metadata.year,
            session_id: metadata.session_id
          }
        });
      } catch {
        // 静默忽略
      }
    },
    async retrieve(opts: RetrieveMemoriesOpts): Promise<string[]> {
      try {
        const res = await w.callFunction!({
          name: "vectorMemory",
          data: {
            action: "retrieve",
            npc_id: opts.npc_id,
            region_id: opts.region_id,
            session_id: opts.session_id,
            limit: opts.limit,
            include_origin: opts.include_origin !== false
          }
        });
        const out = (res?.result as { memories?: string[] })?.memories;
        return Array.isArray(out) ? out : [];
      } catch {
        return [];
      }
    },
    async saveOriginSetting(content: string, meta: { session_id: string }): Promise<void> {
      try {
        await w.callFunction!({
          name: "vectorMemory",
          data: { action: "saveOrigin", content: content.slice(0, 500), session_id: meta.session_id }
        });
      } catch {
        // 静默忽略
      }
    },
    async literarizeAndSaveRumors(reports: string[], meta: SaveInteractionMetadata): Promise<void> {
      try {
        await w.callFunction!({
          name: "vectorMemory",
          data: {
            action: "literarizeAndSaveRumors",
            reports,
            session_id: meta.session_id,
            region_id: meta.region_id,
            year: meta.year
          }
        });
      } catch {
        // 静默忽略，不阻塞叙事
      }
    },
    async deleteBySessionId(session_id: string): Promise<void> {
      try {
        await w.callFunction!({
          name: "vectorMemory",
          data: { action: "deleteBySessionId", session_id }
        });
      } catch {
        // 静默忽略，不阻塞新游戏流程
      }
    }
  };
}
