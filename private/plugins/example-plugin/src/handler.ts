/**
 * 私有插件示例 — handler.ts
 *
 * 这是插件的入口文件，OpenClaw 运行时会加载此 handler。
 * 复制整个 example-plugin 目录并重命名即可开始开发新插件。
 *
 * 插件开发文档: https://docs.openclaw.ai/plugins
 */

import type { PluginContext, PluginHandler } from "openclaw/plugin-sdk";

/**
 * 插件 handler — OpenClaw 会调用 default export
 */
const handler: PluginHandler = {
  /**
   * 插件元信息
   */
  meta: {
    name: "example-plugin",
    description: "私有插件开发示例",
    version: "0.0.1",
  },

  /**
   * 插件初始化 — 在 gateway 启动时调用
   */
  async init(ctx: PluginContext) {
    ctx.log.info("Example plugin initialized");
  },

  /**
   * 定义工具（可选）— AI 可调用的工具
   */
  tools: [
    {
      name: "example_tool",
      description: "一个示例工具 — 返回当前时间",
      parameters: {
        type: "object" as const,
        properties: {
          timezone: {
            type: "string" as const,
            description: "时区，例如 Asia/Shanghai",
          },
        },
      },
      async execute(_params: { timezone?: string }) {
        const tz = _params.timezone || "UTC";
        const now = new Date().toLocaleString("zh-CN", { timeZone: tz });
        return { result: `当前时间 (${tz}): ${now}` };
      },
    },
  ],
};

export default handler;
