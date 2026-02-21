#!/usr/bin/env node
/**
 * OpenClaw Market Dashboard Prototype - PowerPoint Generator
 *
 * Generates a visual prototype of the free market dashboard UI
 */

import pptxgen from "pptxgenjs";

// Color Palette - Teal Trust (自由市场主题)
const COLORS = {
  primary: "028090", // 主色调: 深青色
  secondary: "00A896", // 次要色: 海绿色
  accent: "02C39A", // 强调色: 薄荷绿
  dark: "1E293B", // 深色文字
  muted: "64748B", // 灰色文字
  light: "F8FAFC", // 浅色背景
  white: "FFFFFF",
  success: "10B981",
  warning: "F59E0B",
  danger: "EF4444",
};

// Helper function to create shadows
const makeShadow = () => ({
  type: "outer",
  blur: 6,
  offset: 2,
  angle: 135,
  color: "000000",
  opacity: 0.1,
});

async function createPresentation() {
  let pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "OpenClaw Team";
  pres.title = "OpenClaw Market Dashboard Prototype";

  // ============================================
  // Slide 1: Title Slide
  // ============================================
  let slide1 = pres.addSlide();
  slide1.background = { color: COLORS.primary };

  slide1.addText("OpenClaw 自由市场", {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 1,
    fontSize: 48,
    bold: true,
    color: COLORS.white,
    align: "center",
  });

  slide1.addText("市场仪表盘原型设计", {
    x: 0.5,
    y: 2.8,
    w: 9,
    h: 0.6,
    fontSize: 28,
    color: COLORS.white,
    align: "center",
    transparency: 20,
  });

  slide1.addText(
    [
      { text: "去中心化 AI 算力交易平台", options: { breakLine: true } },
      { text: "Market Dashboard UI/UX Prototype" },
    ],
    {
      x: 0.5,
      y: 4.2,
      w: 9,
      h: 0.8,
      fontSize: 16,
      color: COLORS.white,
      align: "center",
      transparency: 30,
    },
  );

  // ============================================
  // Slide 2: Provider 市场搜索页
  // ============================================
  let slide2 = pres.addSlide();
  slide2.background = { color: COLORS.light };

  // Title
  slide2.addText("Provider 市场搜索页", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 32,
    bold: true,
    color: COLORS.dark,
    margin: 0,
  });

  slide2.addText("Consumer 视角 - 查找和比较服务提供商", {
    x: 0.5,
    y: 0.9,
    w: 9,
    h: 0.3,
    fontSize: 14,
    color: COLORS.muted,
  });

  // Search Bar
  slide2.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 0.6,
    fill: { color: COLORS.white },
    line: { color: COLORS.secondary, width: 2 },
    shadow: makeShadow(),
  });

  slide2.addText("🔍 搜索模型: llama-3-70b    |    最高价格: $0.01    |    最低评分: 80", {
    x: 0.7,
    y: 1.65,
    w: 8.6,
    h: 0.3,
    fontSize: 14,
    color: COLORS.dark,
  });

  // Results Header
  slide2.addText("找到 23 个 Provider", {
    x: 0.5,
    y: 2.3,
    w: 4,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  slide2.addText("排序: 综合推荐 ▼", {
    x: 6.5,
    y: 2.3,
    w: 3,
    h: 0.3,
    fontSize: 14,
    color: COLORS.secondary,
    align: "right",
  });

  // Provider Cards (3 examples)
  const providers = [
    {
      rank: "🥇",
      name: "prov_fast",
      price: "$0.009",
      latency: "0.8s",
      success: "99.5%",
      score: 95,
      tier: "💎 卓越",
    },
    {
      rank: "🥈",
      name: "prov_cheap",
      price: "$0.006",
      latency: "2.1s",
      success: "97.2%",
      score: 88,
      tier: "⭐ 良好",
    },
    {
      rank: "🥉",
      name: "prov_stable",
      price: "$0.010",
      latency: "1.2s",
      success: "98.9%",
      score: 92,
      tier: "💎 卓越",
    },
  ];

  providers.forEach((provider, index) => {
    const yPos = 2.8 + index * 0.8;

    // Card background
    slide2.addShape(pres.shapes.RECTANGLE, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.7,
      fill: { color: COLORS.white },
      line: { color: "E2E8F0", width: 1 },
      shadow: makeShadow(),
    });

    // Rank
    slide2.addText(provider.rank, {
      x: 0.7,
      y: yPos + 0.2,
      w: 0.4,
      h: 0.3,
      fontSize: 18,
      align: "center",
    });

    // Name
    slide2.addText(provider.name, {
      x: 1.3,
      y: yPos + 0.1,
      w: 1.5,
      h: 0.3,
      fontSize: 14,
      bold: true,
      color: COLORS.dark,
    });

    slide2.addText(provider.tier, {
      x: 1.3,
      y: yPos + 0.4,
      w: 1.5,
      h: 0.2,
      fontSize: 10,
      color: COLORS.muted,
    });

    // Metrics
    slide2.addText(
      [
        { text: "价格: ", options: { color: COLORS.muted } },
        { text: provider.price, options: { bold: true, color: COLORS.success } },
      ],
      {
        x: 3.2,
        y: yPos + 0.25,
        w: 1.2,
        h: 0.2,
        fontSize: 12,
      },
    );

    slide2.addText(
      [
        { text: "延迟: ", options: { color: COLORS.muted } },
        { text: provider.latency, options: { bold: true, color: COLORS.dark } },
      ],
      {
        x: 4.6,
        y: yPos + 0.25,
        w: 1.2,
        h: 0.2,
        fontSize: 12,
      },
    );

    slide2.addText(
      [
        { text: "成功率: ", options: { color: COLORS.muted } },
        { text: provider.success, options: { bold: true, color: COLORS.dark } },
      ],
      {
        x: 6.0,
        y: yPos + 0.25,
        w: 1.3,
        h: 0.2,
        fontSize: 12,
      },
    );

    slide2.addText(
      [
        { text: "评分: ", options: { color: COLORS.muted } },
        { text: String(provider.score), options: { bold: true, color: COLORS.primary } },
      ],
      {
        x: 7.5,
        y: yPos + 0.25,
        w: 1,
        h: 0.2,
        fontSize: 12,
      },
    );

    // CTA Button
    slide2.addShape(pres.shapes.RECTANGLE, {
      x: 8.7,
      y: yPos + 0.15,
      w: 0.7,
      h: 0.4,
      fill: { color: COLORS.secondary },
      line: { type: "none" },
    });

    slide2.addText("选择", {
      x: 8.7,
      y: yPos + 0.15,
      w: 0.7,
      h: 0.4,
      fontSize: 11,
      bold: true,
      color: COLORS.white,
      align: "center",
      valign: "middle",
    });
  });

  // ============================================
  // Slide 3: Provider 详情页
  // ============================================
  let slide3 = pres.addSlide();
  slide3.background = { color: COLORS.light };

  // Header
  slide3.addText("Provider 详情页", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 32,
    bold: true,
    color: COLORS.dark,
  });

  // Provider Info Card
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 1.1,
    w: 4.2,
    h: 1.8,
    fill: { color: COLORS.white },
    shadow: makeShadow(),
  });

  // Accent bar
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 1.1,
    w: 0.08,
    h: 1.8,
    fill: { color: COLORS.primary },
  });

  slide3.addText("prov_fast", {
    x: 0.8,
    y: 1.3,
    w: 3.5,
    h: 0.3,
    fontSize: 20,
    bold: true,
    color: COLORS.dark,
  });

  slide3.addText("💎 卓越 Provider (评分: 95)", {
    x: 0.8,
    y: 1.65,
    w: 3.5,
    h: 0.25,
    fontSize: 13,
    color: COLORS.muted,
  });

  slide3.addText(
    [
      { text: "📍 地区: 美国西部", options: { breakLine: true } },
      { text: "🔒 质押: 10 ETH", options: { breakLine: true } },
      { text: "📅 运营: 6 个月 (200+ 任务)" },
    ],
    {
      x: 0.8,
      y: 2.0,
      w: 3.5,
      h: 0.6,
      fontSize: 11,
      color: COLORS.dark,
      lineSpacing: 16,
    },
  );

  // Performance Metrics
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: 5.0,
    y: 1.1,
    w: 4.5,
    h: 1.8,
    fill: { color: COLORS.white },
    shadow: makeShadow(),
  });

  slide3.addText("性能指标", {
    x: 5.2,
    y: 1.3,
    w: 4.1,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  const metrics = [
    { label: "响应时间", value: "0.8s", trend: "↓ 15%" },
    { label: "成功率", value: "99.5%", trend: "↑ 2%" },
    { label: "在线率", value: "99.8%", trend: "→ 稳定" },
  ];

  metrics.forEach((metric, index) => {
    const yPos = 1.75 + index * 0.35;

    slide3.addText(metric.label, {
      x: 5.2,
      y: yPos,
      w: 1.5,
      h: 0.25,
      fontSize: 11,
      color: COLORS.muted,
    });

    slide3.addText(metric.value, {
      x: 6.8,
      y: yPos,
      w: 1,
      h: 0.25,
      fontSize: 12,
      bold: true,
      color: COLORS.dark,
      align: "right",
    });

    slide3.addText(metric.trend, {
      x: 7.9,
      y: yPos,
      w: 1.2,
      h: 0.25,
      fontSize: 10,
      color: COLORS.success,
      align: "right",
    });
  });

  // Pricing Card
  slide3.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 3.1,
    w: 9,
    h: 1.3,
    fill: { color: COLORS.primary },
    shadow: makeShadow(),
  });

  slide3.addText("当前定价", {
    x: 0.8,
    y: 3.3,
    w: 2,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.white,
  });

  slide3.addText(
    [
      { text: "基础价格: ", options: { color: COLORS.white, transparency: 30 } },
      { text: "$0.008 / 1K tokens", options: { bold: true, color: COLORS.white } },
    ],
    {
      x: 0.8,
      y: 3.7,
      w: 4,
      h: 0.25,
      fontSize: 13,
    },
  );

  slide3.addText(
    [
      { text: "高峰加价: ", options: { color: COLORS.white, transparency: 30 } },
      { text: "+50%", options: { bold: true, color: COLORS.warning } },
      { text: "  |  ", options: { color: COLORS.white, transparency: 30 } },
      { text: "闲时折扣: ", options: { color: COLORS.white, transparency: 30 } },
      { text: "-20%", options: { bold: true, color: COLORS.success } },
    ],
    {
      x: 5.0,
      y: 3.7,
      w: 4.3,
      h: 0.25,
      fontSize: 12,
    },
  );

  // User Reviews
  slide3.addText("用户评价 (48 条)", {
    x: 0.5,
    y: 4.6,
    w: 4.5,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  slide3.addText("⭐⭐⭐⭐⭐ 4.8 / 5.0", {
    x: 5.2,
    y: 4.6,
    w: 4.3,
    h: 0.3,
    fontSize: 14,
    color: COLORS.warning,
    align: "right",
  });

  // ============================================
  // Slide 4: 市场行情仪表盘
  // ============================================
  let slide4 = pres.addSlide();
  slide4.background = { color: COLORS.light };

  slide4.addText("市场行情仪表盘", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 32,
    bold: true,
    color: COLORS.dark,
  });

  slide4.addText("Llama-3-70B 实时市场数据", {
    x: 0.5,
    y: 0.9,
    w: 9,
    h: 0.3,
    fontSize: 14,
    color: COLORS.muted,
  });

  // Price Stats
  const stats = [
    { label: "当前平均价格", value: "$0.0089", change: "↑ 12%", changeColor: COLORS.success },
    { label: "价格范围", value: "$0.005 - $0.015", change: "24h", changeColor: COLORS.muted },
    { label: "可用 Provider", value: "47 个", change: "+3 今日", changeColor: COLORS.success },
    { label: "平均响应时间", value: "1.2s", change: "↓ 0.2s", changeColor: COLORS.success },
  ];

  stats.forEach((stat, index) => {
    const xPos = 0.5 + (index % 2) * 4.7;
    const yPos = 1.5 + Math.floor(index / 2) * 0.9;

    slide4.addShape(pres.shapes.RECTANGLE, {
      x: xPos,
      y: yPos,
      w: 4.3,
      h: 0.7,
      fill: { color: COLORS.white },
      shadow: makeShadow(),
    });

    slide4.addText(stat.label, {
      x: xPos + 0.2,
      y: yPos + 0.1,
      w: 3.9,
      h: 0.2,
      fontSize: 11,
      color: COLORS.muted,
    });

    slide4.addText(stat.value, {
      x: xPos + 0.2,
      y: yPos + 0.35,
      w: 2.5,
      h: 0.3,
      fontSize: 18,
      bold: true,
      color: COLORS.dark,
    });

    slide4.addText(stat.change, {
      x: xPos + 2.9,
      y: yPos + 0.4,
      w: 1.2,
      h: 0.2,
      fontSize: 11,
      color: stat.changeColor,
      align: "right",
    });
  });

  // Price Distribution Chart
  slide4.addText("价格分布", {
    x: 0.5,
    y: 3.5,
    w: 4.3,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  slide4.addChart(
    pres.charts.BAR,
    [
      {
        name: "Provider 数量",
        labels: ["$0.005-0.007", "$0.007-0.010", "$0.010-0.015"],
        values: [15, 23, 9],
      },
    ],
    {
      x: 0.5,
      y: 3.9,
      w: 4.3,
      h: 1.5,
      barDir: "col",
      chartColors: [COLORS.primary],
      showLegend: false,
      showValue: true,
      valAxisMaxVal: 30,
      chartArea: { fill: { color: COLORS.white } },
      catAxisLabelColor: COLORS.muted,
      valAxisLabelColor: COLORS.muted,
      valGridLine: { color: "E2E8F0", size: 0.5 },
      catGridLine: { style: "none" },
    },
  );

  // Market Trend Chart
  slide4.addText("24h 价格趋势", {
    x: 5.2,
    y: 3.5,
    w: 4.3,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  slide4.addChart(
    pres.charts.LINE,
    [
      {
        name: "平均价格",
        labels: ["00:00", "06:00", "12:00", "18:00", "24:00"],
        values: [0.0079, 0.0082, 0.0089, 0.0091, 0.0089],
      },
    ],
    {
      x: 5.2,
      y: 3.9,
      w: 4.3,
      h: 1.5,
      lineSize: 3,
      lineSmooth: true,
      chartColors: [COLORS.secondary],
      showLegend: false,
      chartArea: { fill: { color: COLORS.white } },
      catAxisLabelColor: COLORS.muted,
      valAxisLabelColor: COLORS.muted,
      valGridLine: { color: "E2E8F0", size: 0.5 },
      catGridLine: { style: "none" },
    },
  );

  // ============================================
  // Slide 5: Provider 管理后台
  // ============================================
  let slide5 = pres.addSlide();
  slide5.background = { color: COLORS.light };

  slide5.addText("Provider 管理后台", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 32,
    bold: true,
    color: COLORS.dark,
  });

  slide5.addText("Provider 视角 - 收入和性能监控", {
    x: 0.5,
    y: 0.9,
    w: 9,
    h: 0.3,
    fontSize: 14,
    color: COLORS.muted,
  });

  // Revenue Stats
  const revenueStats = [
    { label: "今日收入", value: "$234.50", icon: "💰" },
    { label: "本月收入", value: "$6,890", icon: "📈" },
    { label: "总收入", value: "$48,320", icon: "🏆" },
    { label: "信誉评分", value: "95", icon: "💎" },
  ];

  revenueStats.forEach((stat, index) => {
    const xPos = 0.5 + (index % 4) * 2.375;
    const yPos = 1.5;

    slide5.addShape(pres.shapes.RECTANGLE, {
      x: xPos,
      y: yPos,
      w: 2.2,
      h: 1.0,
      fill: { color: COLORS.white },
      shadow: makeShadow(),
    });

    slide5.addText(stat.icon, {
      x: xPos + 0.2,
      y: yPos + 0.2,
      w: 0.4,
      h: 0.4,
      fontSize: 24,
    });

    slide5.addText(stat.label, {
      x: xPos + 0.7,
      y: yPos + 0.15,
      w: 1.3,
      h: 0.2,
      fontSize: 10,
      color: COLORS.muted,
    });

    slide5.addText(stat.value, {
      x: xPos + 0.7,
      y: yPos + 0.45,
      w: 1.3,
      h: 0.3,
      fontSize: 18,
      bold: true,
      color: COLORS.dark,
    });
  });

  // Recent Orders
  slide5.addText("最近订单", {
    x: 0.5,
    y: 2.7,
    w: 4.3,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  slide5.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 3.1,
    w: 4.3,
    h: 2.2,
    fill: { color: COLORS.white },
    shadow: makeShadow(),
  });

  const orders = [
    { id: "order_abc123", consumer: "0xABC...789", amount: "$12.50", status: "✅ 完成" },
    { id: "order_def456", consumer: "0xDEF...012", amount: "$8.20", status: "⏳ 进行中" },
    { id: "order_ghi789", consumer: "0xGHI...345", amount: "$15.80", status: "✅ 完成" },
  ];

  orders.forEach((order, index) => {
    const yPos = 3.3 + index * 0.55;

    slide5.addText(
      [
        { text: order.id, options: { bold: true, color: COLORS.dark, breakLine: true } },
        { text: `Consumer: ${order.consumer}`, options: { color: COLORS.muted, fontSize: 9 } },
      ],
      {
        x: 0.7,
        y: yPos,
        w: 2,
        h: 0.4,
        fontSize: 11,
      },
    );

    slide5.addText(order.amount, {
      x: 2.8,
      y: yPos + 0.1,
      w: 0.8,
      h: 0.2,
      fontSize: 12,
      bold: true,
      color: COLORS.success,
    });

    slide5.addText(order.status, {
      x: 3.7,
      y: yPos + 0.1,
      w: 0.9,
      h: 0.2,
      fontSize: 10,
      color: COLORS.dark,
    });
  });

  // Performance Chart
  slide5.addText("性能趋势 (7天)", {
    x: 5.2,
    y: 2.7,
    w: 4.3,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  slide5.addChart(
    pres.charts.LINE,
    [
      {
        name: "成功率",
        labels: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
        values: [98.2, 98.5, 99.1, 99.5, 99.3, 99.6, 99.5],
      },
    ],
    {
      x: 5.2,
      y: 3.1,
      w: 4.3,
      h: 2.2,
      lineSize: 3,
      lineSmooth: true,
      chartColors: [COLORS.primary],
      showLegend: false,
      valAxisMaxVal: 100,
      valAxisMinVal: 95,
      chartArea: { fill: { color: COLORS.white } },
      catAxisLabelColor: COLORS.muted,
      valAxisLabelColor: COLORS.muted,
      valGridLine: { color: "E2E8F0", size: 0.5 },
      catGridLine: { style: "none" },
    },
  );

  // ============================================
  // Slide 6: 定价策略配置页
  // ============================================
  let slide6 = pres.addSlide();
  slide6.background = { color: COLORS.light };

  slide6.addText("定价策略配置页", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 32,
    bold: true,
    color: COLORS.dark,
  });

  slide6.addText("Provider 可自主设定动态定价规则", {
    x: 0.5,
    y: 0.9,
    w: 9,
    h: 0.3,
    fontSize: 14,
    color: COLORS.muted,
  });

  // Base Price Setting
  slide6.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 0.9,
    fill: { color: COLORS.white },
    shadow: makeShadow(),
  });

  slide6.addText("基础价格", {
    x: 0.7,
    y: 1.65,
    w: 2,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  slide6.addShape(pres.shapes.RECTANGLE, {
    x: 3.0,
    y: 1.75,
    w: 1.5,
    h: 0.4,
    fill: { color: COLORS.light },
    line: { color: COLORS.secondary, width: 1 },
  });

  slide6.addText("$0.008", {
    x: 3.0,
    y: 1.75,
    w: 1.5,
    h: 0.4,
    fontSize: 14,
    bold: true,
    color: COLORS.dark,
    align: "center",
    valign: "middle",
  });

  slide6.addText("/ 1K tokens", {
    x: 4.6,
    y: 1.85,
    w: 1,
    h: 0.2,
    fontSize: 12,
    color: COLORS.muted,
  });

  // Dynamic Pricing Rules
  slide6.addText("动态调整规则", {
    x: 0.5,
    y: 2.6,
    w: 9,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  const pricingRules = [
    { condition: "高峰时段 (负载 > 80%)", adjustment: "+50%", color: COLORS.warning },
    { condition: "闲时 (负载 < 30%)", adjustment: "-20%", color: COLORS.success },
    { condition: "VIP 客户", adjustment: "-10%", color: COLORS.primary },
    { condition: "大额订单 (> $100)", adjustment: "-15%", color: COLORS.primary },
  ];

  pricingRules.forEach((rule, index) => {
    const yPos = 3.0 + index * 0.5;

    slide6.addShape(pres.shapes.RECTANGLE, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.4,
      fill: { color: COLORS.white },
      line: { color: "E2E8F0", width: 1 },
    });

    slide6.addText(rule.condition, {
      x: 0.7,
      y: yPos + 0.1,
      w: 5,
      h: 0.2,
      fontSize: 12,
      color: COLORS.dark,
    });

    slide6.addText(rule.adjustment, {
      x: 8.2,
      y: yPos + 0.05,
      w: 1,
      h: 0.3,
      fontSize: 14,
      bold: true,
      color: rule.color,
      align: "center",
    });
  });

  // Save Button
  slide6.addShape(pres.shapes.RECTANGLE, {
    x: 7.8,
    y: 5.1,
    w: 1.7,
    h: 0.5,
    fill: { color: COLORS.secondary },
    shadow: makeShadow(),
  });

  slide6.addText("💾 保存配置", {
    x: 7.8,
    y: 5.1,
    w: 1.7,
    h: 0.5,
    fontSize: 14,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });

  // ============================================
  // Slide 7: 信誉评分详情页
  // ============================================
  let slide7 = pres.addSlide();
  slide7.background = { color: COLORS.light };

  slide7.addText("信誉评分详情页", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 32,
    bold: true,
    color: COLORS.dark,
  });

  slide7.addText("多维度信誉评分系统", {
    x: 0.5,
    y: 0.9,
    w: 9,
    h: 0.3,
    fontSize: 14,
    color: COLORS.muted,
  });

  // Overall Score
  slide7.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 1.5,
    w: 3,
    h: 1.8,
    fill: { color: COLORS.primary },
    shadow: makeShadow(),
  });

  slide7.addText("综合评分", {
    x: 0.7,
    y: 1.7,
    w: 2.6,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.white,
  });

  slide7.addText("95", {
    x: 0.7,
    y: 2.1,
    w: 2.6,
    h: 0.8,
    fontSize: 60,
    bold: true,
    color: COLORS.white,
    align: "center",
  });

  slide7.addText("💎 卓越 Provider", {
    x: 0.7,
    y: 2.95,
    w: 2.6,
    h: 0.25,
    fontSize: 14,
    color: COLORS.white,
    align: "center",
    transparency: 20,
  });

  // Score Breakdown
  slide7.addText("评分细分", {
    x: 3.8,
    y: 1.5,
    w: 5.7,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  const scoreBreakdown = [
    { label: "可靠性", score: 98, weight: "35%", color: COLORS.success },
    { label: "质量", score: 92, weight: "30%", color: COLORS.primary },
    { label: "性能", score: 96, weight: "20%", color: COLORS.secondary },
    { label: "信任度", score: 94, weight: "15%", color: COLORS.accent },
  ];

  scoreBreakdown.forEach((item, index) => {
    const yPos = 1.95 + index * 0.35;

    slide7.addText(item.label, {
      x: 3.8,
      y: yPos,
      w: 1.2,
      h: 0.25,
      fontSize: 12,
      color: COLORS.dark,
    });

    slide7.addText(item.weight, {
      x: 5.1,
      y: yPos,
      w: 0.6,
      h: 0.25,
      fontSize: 10,
      color: COLORS.muted,
      align: "right",
    });

    // Progress bar background
    slide7.addShape(pres.shapes.RECTANGLE, {
      x: 5.9,
      y: yPos + 0.05,
      w: 2.5,
      h: 0.15,
      fill: { color: "E2E8F0" },
    });

    // Progress bar fill
    slide7.addShape(pres.shapes.RECTANGLE, {
      x: 5.9,
      y: yPos + 0.05,
      w: 2.5 * (item.score / 100),
      h: 0.15,
      fill: { color: item.color },
    });

    slide7.addText(String(item.score), {
      x: 8.6,
      y: yPos,
      w: 0.5,
      h: 0.25,
      fontSize: 12,
      bold: true,
      color: item.color,
      align: "right",
    });
  });

  // Performance Metrics
  slide7.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 3.5,
    w: 9,
    h: 1.8,
    fill: { color: COLORS.white },
    shadow: makeShadow(),
  });

  slide7.addText("关键指标", {
    x: 0.7,
    y: 3.7,
    w: 8.6,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  const keyMetrics = [
    { label: "总任务数", value: "200", trend: "+12 本周" },
    { label: "成功率", value: "99.5%", trend: "↑ 2% 本月" },
    { label: "平均响应时间", value: "0.8s", trend: "↓ 0.2s 本月" },
    { label: "争议败诉", value: "0", trend: "0 争议" },
    { label: "用户评分", value: "4.8/5.0", trend: "48 条评价" },
    { label: "账户年龄", value: "6 个月", trend: "活跃" },
  ];

  keyMetrics.forEach((metric, index) => {
    const xPos = 0.7 + (index % 3) * 3.0;
    const yPos = 4.1 + Math.floor(index / 3) * 0.5;

    slide7.addText(
      [
        { text: metric.label, options: { color: COLORS.muted, fontSize: 10, breakLine: true } },
        {
          text: metric.value,
          options: { bold: true, color: COLORS.dark, fontSize: 13, breakLine: true },
        },
        { text: metric.trend, options: { color: COLORS.success, fontSize: 9 } },
      ],
      {
        x: xPos,
        y: yPos,
        w: 2.7,
        h: 0.4,
        fontSize: 11,
      },
    );
  });

  // ============================================
  // Slide 8: 订单簿 (Order Book) 界面
  // ============================================
  let slide8 = pres.addSlide();
  slide8.background = { color: COLORS.light };

  slide8.addText("订单簿 (Order Book)", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 32,
    bold: true,
    color: COLORS.dark,
  });

  slide8.addText("实时供需撮合 - 市场价格发现机制", {
    x: 0.5,
    y: 0.9,
    w: 9,
    h: 0.3,
    fontSize: 14,
    color: COLORS.muted,
  });

  // Asks (卖单 - Provider 报价)
  slide8.addText("🟢 Asks (Provider 报价)", {
    x: 0.5,
    y: 1.5,
    w: 4.3,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.success,
  });

  slide8.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 1.9,
    w: 4.3,
    h: 0.3,
    fill: { color: COLORS.dark },
  });

  slide8.addText(
    [
      { text: "Provider", options: { color: COLORS.white, breakLine: false } },
      { text: "     价格", options: { color: COLORS.white, breakLine: false } },
      { text: "        容量", options: { color: COLORS.white } },
    ],
    {
      x: 0.7,
      y: 1.95,
      w: 3.9,
      h: 0.2,
      fontSize: 11,
      bold: true,
    },
  );

  const asks = [
    { provider: "prov_fast", price: "$0.009", capacity: "100h" },
    { provider: "prov_stable", price: "$0.010", capacity: "50h" },
    { provider: "prov_premium", price: "$0.012", capacity: "200h" },
  ];

  asks.forEach((ask, index) => {
    const yPos = 2.3 + index * 0.35;

    slide8.addShape(pres.shapes.RECTANGLE, {
      x: 0.5,
      y: yPos,
      w: 4.3,
      h: 0.3,
      fill: { color: COLORS.white },
      line: { color: "E2E8F0", width: 1 },
    });

    slide8.addText(ask.provider, {
      x: 0.7,
      y: yPos + 0.05,
      w: 1.5,
      h: 0.2,
      fontSize: 11,
      color: COLORS.dark,
    });

    slide8.addText(ask.price, {
      x: 2.3,
      y: yPos + 0.05,
      w: 1,
      h: 0.2,
      fontSize: 11,
      bold: true,
      color: COLORS.success,
    });

    slide8.addText(ask.capacity, {
      x: 3.5,
      y: yPos + 0.05,
      w: 1.1,
      h: 0.2,
      fontSize: 11,
      color: COLORS.muted,
      align: "right",
    });
  });

  // Bids (买单 - Consumer 需求)
  slide8.addText("🔴 Bids (Consumer 需求)", {
    x: 5.2,
    y: 1.5,
    w: 4.3,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.danger,
  });

  slide8.addShape(pres.shapes.RECTANGLE, {
    x: 5.2,
    y: 1.9,
    w: 4.3,
    h: 0.3,
    fill: { color: COLORS.dark },
  });

  slide8.addText(
    [
      { text: "Consumer", options: { color: COLORS.white, breakLine: false } },
      { text: "     最高价", options: { color: COLORS.white, breakLine: false } },
      { text: "        需求", options: { color: COLORS.white } },
    ],
    {
      x: 5.4,
      y: 1.95,
      w: 3.9,
      h: 0.2,
      fontSize: 11,
      bold: true,
    },
  );

  const bids = [
    { consumer: "0xABC...789", maxPrice: "$0.011", demand: "20h" },
    { consumer: "0xDEF...012", maxPrice: "$0.009", demand: "50h" },
    { consumer: "0xGHI...345", maxPrice: "$0.008", demand: "10h" },
  ];

  bids.forEach((bid, index) => {
    const yPos = 2.3 + index * 0.35;

    slide8.addShape(pres.shapes.RECTANGLE, {
      x: 5.2,
      y: yPos,
      w: 4.3,
      h: 0.3,
      fill: { color: COLORS.white },
      line: { color: "E2E8F0", width: 1 },
    });

    slide8.addText(bid.consumer, {
      x: 5.4,
      y: yPos + 0.05,
      w: 1.5,
      h: 0.2,
      fontSize: 11,
      color: COLORS.dark,
    });

    slide8.addText(bid.maxPrice, {
      x: 7.0,
      y: yPos + 0.05,
      w: 1,
      h: 0.2,
      fontSize: 11,
      bold: true,
      color: COLORS.danger,
    });

    slide8.addText(bid.demand, {
      x: 8.2,
      y: yPos + 0.05,
      w: 1.1,
      h: 0.2,
      fontSize: 11,
      color: COLORS.muted,
      align: "right",
    });
  });

  // Market Depth Visualization
  slide8.addText("市场深度", {
    x: 0.5,
    y: 3.6,
    w: 9,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: COLORS.dark,
  });

  slide8.addChart(
    pres.charts.BAR,
    [
      {
        name: "Asks",
        labels: ["$0.009", "$0.010", "$0.011", "$0.012", "$0.013"],
        values: [100, 150, 200, 80, 50],
      },
      {
        name: "Bids",
        labels: ["$0.009", "$0.010", "$0.011", "$0.012", "$0.013"],
        values: [-50, -80, -20, -10, 0],
      },
    ],
    {
      x: 0.5,
      y: 4.0,
      w: 9,
      h: 1.5,
      barDir: "col",
      chartColors: [COLORS.success, COLORS.danger],
      showLegend: true,
      legendPos: "t",
      chartArea: { fill: { color: COLORS.white } },
      catAxisLabelColor: COLORS.muted,
      valAxisLabelColor: COLORS.muted,
      valGridLine: { color: "E2E8F0", size: 0.5 },
    },
  );

  // ============================================
  // Slide 9: 总结与核心特点
  // ============================================
  let slide9 = pres.addSlide();
  slide9.background = { color: COLORS.primary };

  slide9.addText("OpenClaw 自由市场", {
    x: 0.5,
    y: 0.8,
    w: 9,
    h: 0.6,
    fontSize: 40,
    bold: true,
    color: COLORS.white,
    align: "center",
  });

  slide9.addText("核心特点", {
    x: 0.5,
    y: 1.6,
    w: 9,
    h: 0.4,
    fontSize: 24,
    color: COLORS.white,
    align: "center",
    transparency: 20,
  });

  const features = [
    { icon: "💰", title: "动态定价", desc: "Provider 自主定价,市场自动调节" },
    { icon: "📊", title: "信息透明", desc: "实时行情、历史数据、用户评价" },
    { icon: "⚡", title: "自由竞争", desc: "多维度评分、公平排序机制" },
    { icon: "🚪", title: "低门槛", desc: "3 分钟上架, 1 分钟使用" },
    { icon: "🔒", title: "去中心化", desc: "链上身份、不可篡改、无中介" },
    { icon: "🎯", title: "激励相容", desc: "诚实获利、作弊成本高" },
  ];

  features.forEach((feature, index) => {
    const xPos = 0.8 + (index % 3) * 3.0;
    const yPos = 2.4 + Math.floor(index / 3) * 1.3;

    slide9.addText(feature.icon, {
      x: xPos,
      y: yPos,
      w: 0.5,
      h: 0.5,
      fontSize: 36,
      align: "center",
    });

    slide9.addText(feature.title, {
      x: xPos + 0.6,
      y: yPos + 0.05,
      w: 2.1,
      h: 0.3,
      fontSize: 16,
      bold: true,
      color: COLORS.white,
    });

    slide9.addText(feature.desc, {
      x: xPos + 0.6,
      y: yPos + 0.35,
      w: 2.1,
      h: 0.3,
      fontSize: 12,
      color: COLORS.white,
      transparency: 30,
    });
  });

  // CTA
  slide9.addText("开始使用 OpenClaw →", {
    x: 0.5,
    y: 5.0,
    w: 9,
    h: 0.4,
    fontSize: 18,
    bold: true,
    color: COLORS.accent,
    align: "center",
  });

  // ============================================
  // Generate Presentation
  // ============================================
  const outputPath =
    "/data/workspace/openclaw/docs/reference/OpenClaw_Market_Dashboard_Prototype.pptx";
  await pres.writeFile({ fileName: outputPath });
  console.log(`✅ Presentation created: ${outputPath}`);
}

// Run
createPresentation().catch(console.error);
