# 参与贡献

## 环境

- Node.js 18+（构建单文件 HTML、跑测试）
- 打包 EXE：本机 Electron 运行时
- 打包 APK：Android SDK（build-tools 35 / platform android-35）+ JDK 17+

## 常用命令

```bash
node build.mjs                 # src → dist/麻将赛事管理.html
node test/engine.mjs           # 引擎测试（计分、编排、淘汰赛、积分、CSV）
node test/render.mjs           # 页面渲染测试（假 DOM）
node scripts/serve.mjs dist 8123  # 本地预览
node scripts/build-exe.mjs     # Windows 绿色版（先改脚本里的 Electron 路径）
node scripts/build-apk.mjs     # Android APK（先改脚本里的 SDK / JDK 路径）
```

## 代码约定

- 纯前端、无框架、无构建依赖：所有源码最终打进一个 HTML。
- 原生 ES5 风格函数（浏览器 / WebView 兼容），不使用打包器。
- 只持久化「原始录入值」（顺位、点数、加减分），派生值（积分、名次、晋级）一律实时重算。
- 改规则算法时，必须同时补 `test/engine.mjs` 的断言。
- UI 改动后跑 `test/render.mjs`，确保所有页面能渲染。

## 提交

- 提交信息用中文，一句话说清楚「改了什么」。
- 涉及计分口径的改动，请在提交信息里写明口径变化。
- 不要提交 `dist/exe/`、`build/`、`android/mtt.keystore`。

## 反馈

提 Issue 时请附上：

1. 赛事阶段配置（赛制、桌人数、轮数、局数、计分方式、名次分来源）
2. 期望的算法与实际的差异
3. 截图或导出的小样本 JSON
