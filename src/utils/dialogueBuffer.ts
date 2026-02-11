export const DEFAULT_HISTORY_LIMIT = 120;

export function appendDialogue(history: string[], lines: string | string[], limit = DEFAULT_HISTORY_LIMIT): string[] {
  if (Array.isArray(lines)) {
    history.push(...lines);
  } else {
    history.push(lines);
  }
  enforceLimit(history, limit);
  return history;
}

export function replaceLast(history: string[], line: string): string[] {
  if (history.length === 0) {
    history.push(line);
    return history;
  }
  history[history.length - 1] = line;
  return history;
}

export function removeLast(history: string[]): string | undefined {
  return history.pop();
}

function enforceLimit(history: string[], limit: number): void {
  if (history.length > limit) {
    history.splice(0, history.length - limit);
  }
}
