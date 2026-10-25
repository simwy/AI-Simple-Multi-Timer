# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

微信小程序（WeChat Mini Program），基于官方 `miniprogram-ts-sass-quickstart` 模板。AppID 为 `wxb9b5e92d50d80b7f`。技术栈：TypeScript + Sass，渲染器为 Skyline，组件框架为 `glass-easel`，自定义导航栏（WeUI 风格）。

## 开发方式（无 CLI 构建/测试/校验）

本项目没有 npm scripts、没有 lint、没有测试框架。`package.json` 仅依赖 `miniprogram-api-typings`（类型定义）。

- 用 **微信开发者工具（WeChat DevTools）** 打开项目根目录即可开发与调试。`project.config.json` 中 `miniprogramRoot` 指向 `miniprogram/`，小程序源码都在这下面。
- TypeScript 与 Sass 的编译由 DevTools 的 compiler 插件完成（`project.config.json` → `setting.useCompilerPlugins: ["typescript", "sass"]`），**没有本地命令行构建步骤**，修改后由 DevTools 热编译。
- 修改页面/组件文件后无法通过 `npm run` 验证，需在 DevTools 中查看编译与运行结果。

## 架构要点

- **入口与全局**：`miniprogram/app.ts`（`App()` 实例）、`miniprogram/app.json`（全局配置、页面路由注册）、`miniprogram/app.scss`（全局样式）。
- **页面用 `Component()` 而非 `Page()`**：`pages/index/index.ts` 和 `pages/logs/logs.ts` 都通过 `Component()` 定义，使用 `methods` / `lifetimes`，这是配合 `glass-easel` 的写法。新增页面需在 `app.json` 的 `pages` 数组中注册路由。
- **自定义导航栏组件**：`miniprogram/components/navigation-bar/` 是 WeUI 风格的自定义导航栏，`navigationStyle: "custom"` 使页面使用它替代系统导航。它开启 `multipleSlots`、`styleIsolation: "apply-shared"`，通过 `properties`（`title`/`back`/`color`/`background`/`delta` 等）配置。页面在 `.json` 的 `usingComponents` 中引用。
- **类型定义**：`typings/` 目录存放微信 API 类型声明（`miniprogram-api-typings`）。`typings/index.d.ts` 定义全局 `IAppOption` 接口（`globalData.userInfo` 等），供 `getApp<IAppOption>()` 使用。`tsconfig.json` 的 `typeRoots` 指向 `./typings`。
- **工具函数**：`miniprogram/utils/util.ts` 导出 `formatTime`（日期格式化），供页面 import 使用。

## TypeScript 配置注意

`tsconfig.json` 开启 `strict`、`noImplicitAny`、`noUnusedLocals`、`noUnusedParameters` 等严格选项。由于没有 CLI 构建，类型错误只在 DevTools 编译时暴露。
