import { registerPrompt } from "@core/contentRegistry";

export const PROMPT_KEYS = {
  SYSTEM: "system",
  SAFETY: "safety",
  NEW_PLAYER: "new_player"
} as const;

export function bootstrapDefaultPrompts(): void {
  registerPrompt(
    PROMPT_KEYS.SYSTEM,
    "占位 System Prompt：请保持古风旁白，后续由内容团队提供正式文案。"
  );
}
