import { describe, expect, it } from "vitest";

import { getLocalIntentType } from "../src/app/gameApp";

describe("getLocalIntentType", () => {
  it("returns help for 帮助/help/指令", () => {
    expect(getLocalIntentType("帮助")).toBe("help");
    expect(getLocalIntentType("help")).toBe("help");
    expect(getLocalIntentType("指令")).toBe("help");
    expect(getLocalIntentType("  HELP  ")).toBe("help");
  });

  it("returns save for 存档/保存/save", () => {
    expect(getLocalIntentType("存档")).toBe("save");
    expect(getLocalIntentType("保存")).toBe("save");
    expect(getLocalIntentType("save")).toBe("save");
  });

  it("returns load for 读档/载入/load", () => {
    expect(getLocalIntentType("读档")).toBe("load");
    expect(getLocalIntentType("载入")).toBe("load");
    expect(getLocalIntentType("load")).toBe("load");
  });

  it("returns about for 你是谁/who are you/about", () => {
    expect(getLocalIntentType("你是谁")).toBe("about");
    expect(getLocalIntentType("who are you")).toBe("about");
    expect(getLocalIntentType("about")).toBe("about");
  });

  it("returns ad for 广告/福利/reward", () => {
    expect(getLocalIntentType("广告")).toBe("ad");
    expect(getLocalIntentType("福利")).toBe("ad");
    expect(getLocalIntentType("reward")).toBe("ad");
  });

  it("returns null for non-local intents", () => {
    expect(getLocalIntentType("前往洛阳")).toBe(null);
    expect(getLocalIntentType("寻找盟友")).toBe(null);
    expect(getLocalIntentType("")).toBe(null);
    expect(getLocalIntentType("   ")).toBe(null);
  });
});
