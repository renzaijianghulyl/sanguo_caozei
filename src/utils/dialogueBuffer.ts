export const DEFAULT_HISTORY_LIMIT = 120;

export function appendDialogue(history: string[], lines: string | string[], limit = DEFAULT_HISTORY_LIMIT): string[] {
  const toStr = (x: unknown): string => {
    if (x == null) return "";
    if (typeof x === "string") return x;
    if (typeof x === "number" || typeof x === "boolean") return String(x);
    return ""; // 对象/数组不拼成 [object Object]，丢弃
  };
  if (Array.isArray(lines)) {
    lines.forEach((line) => {
      const s = toStr(line);
      if (s) history.push(s);
    });
  } else {
    const s = toStr(lines);
    if (s) history.push(s);
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
