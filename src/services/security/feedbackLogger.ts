/**
 * 错误日志收集器：玩家点击「反馈」时，生成 AdjudicationRequest 等快照，
 * 便于定位是数据 AI 的 JSON 问题还是 LLM 的 Prompt 权重不足。
 */
import type { AdjudicationRequest } from "@services/network/adjudication";

export interface FeedbackSnapshot {
  timestamp: string;
  type: "adjudication_failure" | "sanitize_failure";
  /** 裁决失败时的请求体 */
  adjudicationRequest?: AdjudicationRequest;
  /** 错误信息 */
  error?: string;
  /** 审核失败时的叙事原文 */
  narrative?: string;
  /** 审核失败原因 */
  reason?: string;
}

const MAX_ENTRIES = 5;
const snapshots: FeedbackSnapshot[] = [];

export function recordAdjudicationFailure(
  request: AdjudicationRequest | undefined,
  error: unknown
): void {
  snapshots.push({
    timestamp: new Date().toISOString(),
    type: "adjudication_failure",
    adjudicationRequest: request,
    error: error instanceof Error ? error.message : String(error)
  });
  if (snapshots.length > MAX_ENTRIES) {
    snapshots.shift();
  }
}

export function recordSanitizeFailure(narrative: string, reason?: string): void {
  snapshots.push({
    timestamp: new Date().toISOString(),
    type: "sanitize_failure",
    narrative: narrative.slice(0, 500),
    reason
  });
  if (snapshots.length > MAX_ENTRIES) {
    snapshots.shift();
  }
}

/** 获取最近一次反馈快照（供上传或展示） */
export function getLatestFeedbackSnapshot(): FeedbackSnapshot | null {
  return snapshots[snapshots.length - 1] ?? null;
}

/** 获取全部快照（供批量上传） */
export function getAllFeedbackSnapshots(): FeedbackSnapshot[] {
  return [...snapshots];
}

/** 清空快照（上传成功后调用） */
export function clearFeedbackSnapshots(): void {
  snapshots.length = 0;
}
