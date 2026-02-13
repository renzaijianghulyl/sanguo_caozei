interface PromptRegistry {
  [key: string]: string;
}

type EntityRegistry = Record<string, Set<string>>;

const prompts: PromptRegistry = {};
const entities: EntityRegistry = {};

export function registerPrompt(key: string, value: string): void {
  prompts[key] = value;
}

export function getPrompt(key: string): string | undefined {
  return prompts[key];
}

export function listPrompts(): string[] {
  return Object.keys(prompts);
}

/** 注册已知实体 ID，用于幻觉防御：仅传递已注册的实体给 LLM */
export function registerEntity(type: string, id: string): void {
  if (!entities[type]) entities[type] = new Set();
  entities[type].add(id);
}

/** 若该类型有注册表，则过滤掉未注册的实体；无注册表时原样返回 */
export function filterEntities<T extends { id?: string }>(type: string, items: T[]): T[] {
  const set = entities[type];
  if (!set || set.size === 0) return items;
  return items.filter((it) => (it.id != null ? set.has(it.id) : false));
}
