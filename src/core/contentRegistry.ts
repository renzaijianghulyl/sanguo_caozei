interface PromptRegistry {
  [key: string]: string;
}

const prompts: PromptRegistry = {};

export function registerPrompt(key: string, value: string): void {
  prompts[key] = value;
}

export function getPrompt(key: string): string | undefined {
  return prompts[key];
}

export function listPrompts(): string[] {
  return Object.keys(prompts);
}
