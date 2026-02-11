
=== 构建报告 ===
构建时间: 2026-02-11T06:40:43.000Z
输出目录: ./dist

文件压缩详情（TypeScript 重构后）:
1. 游戏入口: src/game.ts → game.min.js
   - 压缩后: 23,883 bytes

2. 客户端主逻辑: src/app.ts → main.min.js
   - 压缩后: 23,457 bytes

3. 存档服务: src/services/storage/saveManager.ts → save.min.js
   - 压缩后: 10,178 bytes

4. 配置模块: src/config/index.ts → config.min.js
   - 压缩后: 1,274 bytes

汇总统计:
- 压缩总大小: 58,792 bytes (57.43 KB)
- 微信小游戏首包限制: 4 MB (4,194,304 bytes)
- 剩余空间: 4,135,512 bytes (约 3.95 MB)

备注:
- 构建脚本：`npm run build`（esbuild + tsconfig paths）
- 产物同步：`dist/` 内含 `game.json`、`project*.config.json` 以及所有压缩脚本，可直接导入微信开发者工具

构建完成!
