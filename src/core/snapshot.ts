import type { GameSaveData, NPCState, PlayerState, WorldState } from "@core/state";
import { filterEntities } from "@core/contentRegistry";
import type { AdjudicationRequest } from "@services/network/adjudication";
import { DEFAULT_NPC_STATE, DEFAULT_PLAYER_STATE, DEFAULT_WORLD_STATE } from "@config/index";

export interface SnapshotInput {
  saveData: GameSaveData | null;
  playerIntent: string;
  recentDialogue?: string[];
}

/**
 * 构建压缩版世界快照，供裁决 API 使用。
 * 纯函数，无副作用；实体经 contentRegistry 校验。
 */
export function buildAdjudicationPayload(input: SnapshotInput): AdjudicationRequest {
  const {
    saveData,
    playerIntent,
    recentDialogue = saveData?.dialogueHistory?.slice(-5) ?? []
  } = input;

  const playerState: PlayerState = saveData?.player ?? DEFAULT_PLAYER_STATE;
  const worldState: WorldState = saveData?.world ?? DEFAULT_WORLD_STATE;
  let npcState: NPCState[] = saveData?.npcs ?? DEFAULT_NPC_STATE;
  npcState = filterEntities<NPCState>("npc", npcState);

  return {
    player_state: playerState,
    world_state: worldState,
    npc_state: npcState,
    event_context: recentDialogue.length > 0 ? { recent_dialogue: recentDialogue } : undefined,
    player_intent: playerIntent
  };
}
