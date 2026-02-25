/**
 * 年龄与关系规则：出仕、义结金兰、结婚等门槛
 * - 玩家与武将均需满 15 岁方可义结金兰或结婚
 * - 情感阈值：好感 > AFFINITY_SWORN / AFFINITY_MARRIAGE 且符合史实逻辑方可解锁结拜/婚配叙事权限
 */
import { MIN_AGE_MARRIAGE, MIN_AGE_SERVE, MIN_AGE_SWORN } from "./state";

export { MIN_AGE_SERVE, MIN_AGE_SWORN, MIN_AGE_MARRIAGE };

/** 解锁「义结金兰」叙事权限的最低好感度 */
export const AFFINITY_SWORN_BROTHER = 90;
/** 解锁「婚配」叙事权限的最低好感度 */
export const AFFINITY_MARRIAGE = 90;

/** 根据出生年与当前年计算年龄（虚岁，当前年 - 出生年） */
export function getAge(birthYear: number, currentYear: number): number {
  return Math.max(0, currentYear - birthYear);
}

/** 是否已满出仕年龄：武将满 15 岁方可出仕，否则仅为娃娃 */
export function canServe(age: number): boolean {
  return age >= MIN_AGE_SERVE;
}

/** 是否可义结金兰：双方均须满 15 岁 */
export function canSwornBrother(playerAge: number, npcAge: number): boolean {
  return playerAge >= MIN_AGE_SWORN && npcAge >= MIN_AGE_SWORN;
}

/** 是否可结婚：双方均须满 15 岁 */
export function canMarry(playerAge: number, npcAge: number): boolean {
  return playerAge >= MIN_AGE_MARRIAGE && npcAge >= MIN_AGE_MARRIAGE;
}

/** 是否满足「结拜」叙事权限：年龄通过且好感 ≥ 阈值（史实逻辑由 LLM/云端判定） */
export function canUnlockSwornBrother(playerAge: number, npcAge: number, affinity: number): boolean {
  return canSwornBrother(playerAge, npcAge) && affinity >= AFFINITY_SWORN_BROTHER;
}

/** 是否满足「婚配」叙事权限：年龄通过且好感 ≥ 阈值 */
export function canUnlockMarriage(playerAge: number, npcAge: number, affinity: number): boolean {
  return canMarry(playerAge, npcAge) && affinity >= AFFINITY_MARRIAGE;
}

/** 关系类型中文标签，供叙事与 UI 使用 */
export const RELATION_LABELS: Record<string, string> = {
  acquaintance: "相识",
  sworn_brother: "义结金兰",
  spouse: "结婚",
  lord_vassal: "君臣",
  admiration: "倾慕"
};
