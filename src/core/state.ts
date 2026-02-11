export interface PlayerAttributes {
  strength: number;
  intelligence: number;
  charm: number;
  luck: number;
}

export interface PlayerResources {
  gold: number;
  food: number;
  soldiers: number;
}

export interface PlayerLocation {
  region: string;
  scene: string;
}

export interface PlayerState {
  id: string;
  attrs: PlayerAttributes;
  legend: number;
  tags: string[];
  reputation: number;
  resources: PlayerResources;
  location: PlayerLocation;
}

export interface WorldState {
  era: string;
  flags: string[];
  time: {
    year: number;
    month: number;
    day: number;
  };
  regionStatus?: Record<string, string>;
  regions?: Record<
    string,
    {
      stability?: number;
      unrest?: number;
    }
  >;
}

export interface NPCState {
  id: string;
  name?: string;
  stance: string;
  trust: number;
  location?: string;
  relations?: Record<string, number>;
}

export interface EventLogEntry {
  eventId: string;
  playerId: string;
  triggeredAt: string;
  recordedAt: string;
}

export interface GameProgress {
  totalTurns: number;
  lastEventId: string;
  lastEventTime: string;
}

export interface GameSaveMeta {
  version: string;
  createdAt: string;
  lastSaved: string;
  lastAutoSave?: string;
  playerId: string;
  saveName: string;
  saveSlot: number;
}

export interface GameSaveData {
  meta: GameSaveMeta;
  player: PlayerState & { name?: string };
  world: WorldState;
  npcs: NPCState[];
  eventLog: EventLogEntry[];
  dialogueHistory: string[];
  progress: GameProgress;
  tempData?: Record<string, unknown>;
}
