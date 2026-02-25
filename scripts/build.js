const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const tempDir = path.join(projectRoot, "temp", "dist");
const distDir = path.join(projectRoot, "dist");
const watchMode = process.argv.includes("--watch");

const entryPoints = {
  game: path.join("src", "game.ts"),
  main: path.join("src", "app.ts"),
  config: path.join("src", "config", "index.ts"),
  save: path.join("src", "services", "storage", "saveManager.ts")
};

const outputNames = {
  game: "game.min.js",
  main: "main.min.js",
  config: "config.min.js",
  save: "save.min.js"
};

const supportFiles = ["game.json", "project.config.json", "project.private.config.json"];
const entryStubs = [
  {
    file: "game.js",
    content: 'require("./game.min.js");\n'
  }
];

const define = {
  "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || (watchMode ? "development" : "production")),
  "process.env.CLOUD_ENV": JSON.stringify(process.env.CLOUD_ENV || "cloud1-3gfb9ep2701c4857"),
  "process.env.ADJUDICATION_API": JSON.stringify(
    process.env.ADJUDICATION_API || "http://localhost:3000/intent/resolve"
  ),
  "process.env.DEBUG_TOUCH": JSON.stringify(
    process.env.DEBUG_TOUCH === "1" || process.env.DEBUG_TOUCH === "true" ? "true" : "false"
  ),
  "process.env.AD_UNIT_ID": JSON.stringify(process.env.AD_UNIT_ID || "adunit-1234567890abcdef")
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFileSafe(source, target) {
  if (!fs.existsSync(source)) {
    console.warn(`[build] 文件缺失，跳过复制: ${source}`);
    return;
  }
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function copyArtifacts() {
  ensureDir(distDir);
  Object.entries(outputNames).forEach(([key, fileName]) => {
    const compiledPath = path.join(tempDir, fileName);
    const rootTarget = path.join(projectRoot, fileName);
    copyFileSafe(compiledPath, rootTarget);
    copyFileSafe(compiledPath, path.join(distDir, fileName));
  });

  supportFiles.forEach((fileName) => {
    const source = path.join(projectRoot, fileName);
    if (fs.existsSync(source)) {
      copyFileSafe(source, path.join(distDir, fileName));
    }
  });

  entryStubs.forEach(({ file, content }) => {
    const rootTarget = path.join(projectRoot, file);
    const distTarget = path.join(distDir, file);
    fs.writeFileSync(rootTarget, content, "utf-8");
    copyFileSafe(rootTarget, distTarget);
  });
}

async function buildOnce() {
  ensureDir(tempDir);
  await esbuild.build({
    entryPoints,
    outdir: tempDir,
    bundle: true,
    alias: {
      "@data/sanguoDb": path.join(projectRoot, "src", "data", "sanguoDb", "index.ts"),
      "@data/sanguoDb/timeline": path.join(projectRoot, "src", "data", "sanguoDb", "timeline.ts"),
      "@data/bond": path.join(projectRoot, "src", "data", "bond", "index.ts"),
      "@data/bond/types": path.join(projectRoot, "src", "data", "bond", "types.ts")
    },
    format: "cjs",
    platform: "neutral",
    target: ["es2017"],
    minify: !watchMode,
    sourcemap: watchMode,
    logLevel: "info",
    entryNames: "[name].min",
    define
  });
  copyArtifacts();
}

async function run() {
  if (watchMode) {
    const ctx = await esbuild.context({
      entryPoints,
      outdir: tempDir,
      bundle: true,
      alias: {
        "@data/sanguoDb": path.join(projectRoot, "src", "data", "sanguoDb", "index.ts"),
        "@data/sanguoDb/timeline": path.join(projectRoot, "src", "data", "sanguoDb", "timeline.ts")
      },
      format: "cjs",
      platform: "neutral",
      target: ["es2017"],
      minify: false,
      sourcemap: true,
      logLevel: "info",
      entryNames: "[name].min",
      define
    });

    await ctx.watch({
      onRebuild(error) {
        if (error) {
          console.error("[build] 重建失败:", error);
        } else {
          copyArtifacts();
          console.log("[build] 重建完成，产物已同步。");
        }
      }
    });

    await ctx.rebuild();
    copyArtifacts();
    console.log("[build] 监听模式已启动，Ctrl+C 退出。");
  } else {
    await buildOnce();
    console.log("[build] 构建完成。");
  }
}

run().catch((err) => {
  console.error("[build] 构建失败:", err);
  process.exitCode = 1;
});
