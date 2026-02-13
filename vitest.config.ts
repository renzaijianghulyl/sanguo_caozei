import path from "node:path";

import { defineConfig } from "vitest/config";

const resolvePath = (segment: string) => path.resolve(__dirname, "src", segment);

export default defineConfig({
  test: {
    environment: "node",
    alias: {
      "@app": resolvePath("app"),
      "@core": resolvePath("core"),
      "@services": resolvePath("services"),
      "@ui": resolvePath("ui"),
      "@utils": resolvePath("utils"),
      "@config": resolvePath("config"),
      "@agents": resolvePath("agents"),
      "@data": path.resolve(__dirname, "data")
    }
  }
});
