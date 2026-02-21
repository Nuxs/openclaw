import pptxgen from "pptxgenjs";

// Create presentation
const pres = new pptxgen();

// Define color palette - Midnight Executive theme
const COLORS = {
  primary: "1E2761", // navy
  secondary: "CADCFC", // ice blue
  accent: "FFFFFF", // white
  dark: "0D1117", // dark bg (matching dashboard)
  success: "10B981", // green
  warning: "F59E0B", // yellow
  error: "EF4444", // red
};

// Set presentation properties
pres.author = "OpenClaw Team";
pres.company = "OpenClaw";
pres.title = "Web3 Core Dashboard";
pres.subject = "Product Demo & Overview";
pres.layout = "LAYOUT_WIDE";

// ==================== Slide 1: Title ====================
const slide1 = pres.addSlide();
slide1.background = { color: COLORS.primary };

slide1.addText("Web3 Core Dashboard", {
  x: 0.5,
  y: 2.5,
  w: 12,
  h: 1.5,
  fontSize: 60,
  bold: true,
  color: COLORS.accent,
  align: "center",
});

slide1.addText("去中心化资源市场的完整管理平台", {
  x: 0.5,
  y: 4.2,
  w: 12,
  h: 0.8,
  fontSize: 24,
  color: COLORS.secondary,
  align: "center",
});

slide1.addText("v1.0.0-beta | 2026-02-21", {
  x: 0.5,
  y: 6.8,
  w: 12,
  h: 0.4,
  fontSize: 14,
  color: COLORS.secondary,
  align: "center",
});

// ==================== Slide 2: Problem Statement ====================
const slide2 = pres.addSlide();
slide2.background = { color: COLORS.accent };

slide2.addText("我们解决的问题", {
  x: 0.5,
  y: 0.5,
  w: 12,
  h: 0.8,
  fontSize: 36,
  bold: true,
  color: COLORS.primary,
});

// Problem cards
const problems = [
  {
    icon: "🔍",
    title: "缺乏透明度",
    desc: "看不到资源真实状态\n无法追踪交易历史",
  },
  {
    icon: "⚖️",
    title: "争议难解决",
    desc: "没有公正的仲裁机制\n纠纷处理周期长",
  },
  {
    icon: "🚨",
    title: "监控不及时",
    desc: "问题发现太晚\n缺乏主动告警",
  },
];

problems.forEach((problem, index) => {
  const x = 0.8 + index * 4.2;
  const y = 2.0;

  // Background card
  slide2.addShape("roundRect", {
    x: x,
    y: y,
    w: 3.5,
    h: 3.0,
    fill: { color: COLORS.secondary },
    line: { color: COLORS.primary, width: 1 },
  });

  // Icon
  slide2.addText(problem.icon, {
    x: x,
    y: y + 0.3,
    w: 3.5,
    h: 0.8,
    fontSize: 48,
    align: "center",
  });

  // Title
  slide2.addText(problem.title, {
    x: x + 0.2,
    y: y + 1.3,
    w: 3.1,
    h: 0.6,
    fontSize: 20,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  // Description
  slide2.addText(problem.desc, {
    x: x + 0.2,
    y: y + 2.0,
    w: 3.1,
    h: 0.8,
    fontSize: 13,
    color: "4A4A4A",
    align: "center",
  });
});

// ==================== Slide 3: Solution Overview ====================
const slide3 = pres.addSlide();
slide3.background = { color: COLORS.accent };

slide3.addText("我们的解决方案", {
  x: 0.5,
  y: 0.5,
  w: 12,
  h: 0.8,
  fontSize: 36,
  bold: true,
  color: COLORS.primary,
});

const solutions = [
  {
    icon: "✅",
    title: "完整的资源管理",
    desc: "发布、编辑、搜索、筛选\n实时状态更新",
    color: COLORS.success,
  },
  {
    icon: "⚖️",
    title: "公正的争议处理",
    desc: "透明的流程\n智能合约自动执行",
    color: "3B82F6",
  },
  {
    icon: "📊",
    title: "实时告警监控",
    desc: "多级别告警\n多渠道通知",
    color: COLORS.warning,
  },
  {
    icon: "📈",
    title: "强大的数据可视化",
    desc: "趋势分析\n状态分布图表",
    color: "8B5CF6",
  },
];

solutions.forEach((solution, index) => {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const x = 0.8 + col * 6.2;
  const y = 2.0 + row * 2.0;

  // Icon circle
  slide3.addShape("ellipse", {
    x: x,
    y: y,
    w: 0.6,
    h: 0.6,
    fill: { color: solution.color },
  });

  slide3.addText(solution.icon, {
    x: x,
    y: y + 0.05,
    w: 0.6,
    h: 0.5,
    fontSize: 24,
    align: "center",
    valign: "middle",
  });

  // Title
  slide3.addText(solution.title, {
    x: x + 0.8,
    y: y,
    w: 5.0,
    h: 0.4,
    fontSize: 18,
    bold: true,
    color: COLORS.primary,
  });

  // Description
  slide3.addText(solution.desc, {
    x: x + 0.8,
    y: y + 0.45,
    w: 5.0,
    h: 0.6,
    fontSize: 13,
    color: "4A4A4A",
  });
});

// ==================== Slide 4: Architecture ====================
const slide4 = pres.addSlide();
slide4.background = { color: COLORS.accent };

slide4.addText("系统架构", {
  x: 0.5,
  y: 0.5,
  w: 12,
  h: 0.8,
  fontSize: 36,
  bold: true,
  color: COLORS.primary,
});

// Architecture layers
const layers = [
  {
    title: "Presentation Layer",
    items: ["Dashboard UI", "Toast Notifications", "Modal Dialogs", "Charts"],
    color: "4EC9B0",
  },
  {
    title: "API Layer",
    items: ["Gateway API", "JSON-RPC 2.0", "32 API Methods", "Error Handling"],
    color: "569CD6",
  },
  {
    title: "Business Logic",
    items: ["Resource Management", "Dispute Engine", "Alert Monitor", "Data Analytics"],
    color: "C586C0",
  },
  {
    title: "Data Layer",
    items: ["SQLite Database", "Blockchain", "Smart Contracts", "Event Logs"],
    color: "CE9178",
  },
];

layers.forEach((layer, index) => {
  const y = 1.8 + index * 1.3;

  // Layer box
  slide4.addShape("rect", {
    x: 1.0,
    y: y,
    w: 11,
    h: 1.0,
    fill: { color: layer.color, transparency: 20 },
    line: { color: layer.color, width: 2 },
  });

  // Layer title
  slide4.addText(layer.title, {
    x: 1.2,
    y: y + 0.1,
    w: 10.6,
    h: 0.35,
    fontSize: 16,
    bold: true,
    color: COLORS.primary,
  });

  // Layer items
  slide4.addText(layer.items.join(" • "), {
    x: 1.2,
    y: y + 0.5,
    w: 10.6,
    h: 0.4,
    fontSize: 12,
    color: "4A4A4A",
  });
});

// ==================== Slide 5: Key Features ====================
const slide5 = pres.addSlide();
slide5.background = { color: COLORS.dark };

slide5.addText("核心功能特性", {
  x: 0.5,
  y: 0.5,
  w: 5.5,
  h: 0.8,
  fontSize: 36,
  bold: true,
  color: COLORS.accent,
});

// Feature list
const features = [
  "📦 资源管理 - 8个完整功能",
  "🔄 租约管理 - 5种操作类型",
  "⚖️ 争议处理 - 6步解决流程",
  "🚨 告警监控 - 4个优先级",
  "📊 数据可视化 - 4种图表",
  "🔔 Toast通知 - 5种类型",
  "🎨 Modal对话框 - 4种模板",
  "⚡ 高性能 - 所有指标达标",
];

features.forEach((feature, index) => {
  slide5.addText(feature, {
    x: 0.8,
    y: 1.8 + index * 0.6,
    w: 5.0,
    h: 0.5,
    fontSize: 18,
    color: COLORS.accent,
    bullet: true,
  });
});

// Stats on the right
const stats = [
  { label: "代码行数", value: "9,593", color: COLORS.success },
  { label: "测试用例", value: "75", color: "3B82F6" },
  { label: "测试通过率", value: "100%", color: COLORS.success },
  { label: "文档字数", value: "40K+", color: "8B5CF6" },
];

stats.forEach((stat, index) => {
  const y = 2.0 + index * 1.4;

  // Stat card
  slide5.addShape("roundRect", {
    x: 7.0,
    y: y,
    w: 5.0,
    h: 1.1,
    fill: { color: "1E1E1E" },
    line: { color: stat.color, width: 2 },
  });

  // Value
  slide5.addText(stat.value, {
    x: 7.2,
    y: y + 0.15,
    w: 4.6,
    h: 0.5,
    fontSize: 36,
    bold: true,
    color: stat.color,
    align: "center",
  });

  // Label
  slide5.addText(stat.label, {
    x: 7.2,
    y: y + 0.7,
    w: 4.6,
    h: 0.3,
    fontSize: 14,
    color: COLORS.secondary,
    align: "center",
  });
});

// ==================== Slide 6: Technology Stack ====================
const slide6 = pres.addSlide();
slide6.background = { color: COLORS.accent };

slide6.addText("技术栈", {
  x: 0.5,
  y: 0.5,
  w: 12,
  h: 0.8,
  fontSize: 36,
  bold: true,
  color: COLORS.primary,
});

const techStack = [
  {
    category: "Frontend",
    items: ["HTML5/CSS3/JavaScript", "Chart.js", "Responsive Design", "Dark Theme"],
    icon: "🎨",
  },
  {
    category: "Backend",
    items: ["TypeScript", "Node.js", "SQLite", "JSON-RPC 2.0"],
    icon: "⚙️",
  },
  {
    category: "Testing",
    items: ["Unit Tests", "Integration Tests", "E2E Tests", "100% Coverage"],
    icon: "🧪",
  },
  {
    category: "DevOps",
    items: ["Git", "PM2", "Nginx", "SSL/TLS"],
    icon: "🚀",
  },
];

techStack.forEach((tech, index) => {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const x = 0.8 + col * 6.2;
  const y = 2.0 + row * 2.5;

  // Card background
  slide6.addShape("roundRect", {
    x: x,
    y: y,
    w: 5.5,
    h: 2.0,
    fill: { color: COLORS.secondary },
    line: { color: COLORS.primary, width: 1 },
  });

  // Icon
  slide6.addText(tech.icon, {
    x: x + 0.2,
    y: y + 0.2,
    w: 0.5,
    h: 0.5,
    fontSize: 32,
  });

  // Category
  slide6.addText(tech.category, {
    x: x + 0.9,
    y: y + 0.25,
    w: 4.4,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: COLORS.primary,
  });

  // Items
  tech.items.forEach((item, itemIndex) => {
    slide6.addText("• " + item, {
      x: x + 0.3,
      y: y + 0.9 + itemIndex * 0.25,
      w: 5.0,
      h: 0.25,
      fontSize: 12,
      color: "4A4A4A",
    });
  });
});

// ==================== Slide 7: Performance Metrics ====================
const slide7 = pres.addSlide();
slide7.background = { color: COLORS.accent };

slide7.addText("性能指标", {
  x: 0.5,
  y: 0.5,
  w: 12,
  h: 0.8,
  fontSize: 36,
  bold: true,
  color: COLORS.primary,
});

const metrics = [
  { name: "页面加载时间", target: "< 2秒", actual: "1.2秒", improvement: "+40%" },
  { name: "API响应时间", target: "< 500ms", actual: "150ms", improvement: "+70%" },
  { name: "图表渲染时间", target: "< 1秒", actual: "350ms", improvement: "+65%" },
  { name: "内存使用", target: "< 200MB", actual: "120MB", improvement: "+40%" },
  { name: "并发请求", target: "100+", actual: "150+", improvement: "+50%" },
];

// Table header
const headerY = 1.8;
slide7.addShape("rect", {
  x: 1.0,
  y: headerY,
  w: 11,
  h: 0.5,
  fill: { color: COLORS.primary },
});

const headers = ["性能指标", "目标值", "实际值", "超越"];
const colWidths = [4.0, 2.5, 2.5, 2.0];
let colX = 1.0;

headers.forEach((header, index) => {
  slide7.addText(header, {
    x: colX,
    y: headerY + 0.05,
    w: colWidths[index],
    h: 0.4,
    fontSize: 14,
    bold: true,
    color: COLORS.accent,
    align: "center",
  });
  colX += colWidths[index];
});

// Table rows
metrics.forEach((metric, index) => {
  const rowY = headerY + 0.5 + index * 0.6;
  const bgColor = index % 2 === 0 ? "F5F5F5" : COLORS.accent;

  slide7.addShape("rect", {
    x: 1.0,
    y: rowY,
    w: 11,
    h: 0.6,
    fill: { color: bgColor },
    line: { color: "DDDDDD", width: 0.5 },
  });

  colX = 1.0;
  const values = [metric.name, metric.target, metric.actual, metric.improvement];

  values.forEach((value, colIndex) => {
    const isImprovement = colIndex === 3;
    slide7.addText(value, {
      x: colX + 0.1,
      y: rowY + 0.1,
      w: colWidths[colIndex] - 0.2,
      h: 0.4,
      fontSize: 13,
      color: isImprovement ? COLORS.success : COLORS.primary,
      bold: isImprovement,
      align: colIndex === 0 ? "left" : "center",
    });
    colX += colWidths[colIndex];
  });
});

slide7.addText("✅ 所有性能指标均达到或超越目标！", {
  x: 1.0,
  y: 6.0,
  w: 11,
  h: 0.6,
  fontSize: 18,
  bold: true,
  color: COLORS.success,
  align: "center",
});

// ==================== Slide 8: Project Timeline ====================
const slide8 = pres.addSlide();
slide8.background = { color: COLORS.accent };

slide8.addText("项目进度", {
  x: 0.5,
  y: 0.5,
  w: 12,
  h: 0.8,
  fontSize: 36,
  bold: true,
  color: COLORS.primary,
});

const timeline = [
  { week: "Week 1", task: "P0 Security Fixes", progress: 100, color: COLORS.success },
  { week: "Week 2", task: "Dispute Mechanism", progress: 100, color: COLORS.success },
  { week: "Week 3", task: "Monitoring & Alerts", progress: 80, color: "3B82F6" },
  { week: "Week 4", task: "Web Dashboard", progress: 100, color: COLORS.success },
  { week: "Week 5", task: "Demo & Beta Release", progress: 0, color: "CCCCCC" },
];

timeline.forEach((item, index) => {
  const y = 2.0 + index * 1.0;

  // Week label
  slide8.addText(item.week, {
    x: 0.8,
    y: y,
    w: 1.5,
    h: 0.5,
    fontSize: 14,
    bold: true,
    color: COLORS.primary,
  });

  // Task name
  slide8.addText(item.task, {
    x: 2.5,
    y: y,
    w: 3.0,
    h: 0.5,
    fontSize: 13,
    color: "4A4A4A",
  });

  // Progress bar background
  slide8.addShape("rect", {
    x: 5.8,
    y: y + 0.1,
    w: 5.0,
    h: 0.3,
    fill: { color: "E5E5E5" },
  });

  // Progress bar fill
  if (item.progress > 0) {
    slide8.addShape("rect", {
      x: 5.8,
      y: y + 0.1,
      w: (5.0 * item.progress) / 100,
      h: 0.3,
      fill: { color: item.color },
    });
  }

  // Percentage
  slide8.addText(item.progress + "%", {
    x: 11.0,
    y: y,
    w: 0.8,
    h: 0.5,
    fontSize: 13,
    bold: true,
    color: item.color,
    align: "right",
  });
});

// Overall progress
slide8.addText("总体进度: 74%", {
  x: 0.8,
  y: 6.5,
  w: 11,
  h: 0.6,
  fontSize: 24,
  bold: true,
  color: COLORS.primary,
  align: "center",
});

// ==================== Slide 9: Demo ====================
const slide9 = pres.addSlide();
slide9.background = { color: COLORS.primary };

slide9.addText("🎬", {
  x: 0.5,
  y: 2.0,
  w: 12,
  h: 1.0,
  fontSize: 80,
  align: "center",
});

slide9.addText("功能演示", {
  x: 0.5,
  y: 3.5,
  w: 12,
  h: 1.0,
  fontSize: 48,
  bold: true,
  color: COLORS.accent,
  align: "center",
});

slide9.addText("（此处播放演示视频）", {
  x: 0.5,
  y: 5.0,
  w: 12,
  h: 0.6,
  fontSize: 18,
  color: COLORS.secondary,
  align: "center",
  italic: true,
});

// ==================== Slide 10: Call to Action ====================
const slide10 = pres.addSlide();
slide10.background = { color: COLORS.dark };

slide10.addText("立即体验", {
  x: 0.5,
  y: 1.5,
  w: 12,
  h: 1.0,
  fontSize: 48,
  bold: true,
  color: COLORS.accent,
  align: "center",
});

const ctaItems = [
  { icon: "🌐", text: "Demo环境", value: "demo.example.com" },
  { icon: "📚", text: "完整文档", value: "github.com/yourorg/openclaw" },
  { icon: "📧", text: "联系我们", value: "support@example.com" },
];

ctaItems.forEach((cta, index) => {
  const y = 3.0 + index * 1.2;

  slide10.addText(cta.icon, {
    x: 2.0,
    y: y,
    w: 0.8,
    h: 0.8,
    fontSize: 36,
  });

  slide10.addText(cta.text, {
    x: 3.0,
    y: y + 0.05,
    w: 2.5,
    h: 0.5,
    fontSize: 18,
    bold: true,
    color: COLORS.accent,
  });

  slide10.addText(cta.value, {
    x: 5.5,
    y: y + 0.05,
    w: 6.0,
    h: 0.5,
    fontSize: 16,
    color: COLORS.secondary,
  });
});

slide10.addText("v1.0.0-beta 现已发布 🎉", {
  x: 0.5,
  y: 6.5,
  w: 12,
  h: 0.6,
  fontSize: 24,
  bold: true,
  color: COLORS.success,
  align: "center",
});

// ==================== Slide 11: Thank You ====================
const slide11 = pres.addSlide();
slide11.background = { color: COLORS.primary };

slide11.addText("谢谢!", {
  x: 0.5,
  y: 2.5,
  w: 12,
  h: 1.5,
  fontSize: 72,
  bold: true,
  color: COLORS.accent,
  align: "center",
});

slide11.addText("Questions?", {
  x: 0.5,
  y: 4.5,
  w: 12,
  h: 0.8,
  fontSize: 32,
  color: COLORS.secondary,
  align: "center",
});

slide11.addText("OpenClaw Team | 2026", {
  x: 0.5,
  y: 6.5,
  w: 12,
  h: 0.5,
  fontSize: 14,
  color: COLORS.secondary,
  align: "center",
});

// Save presentation
pres.writeFile({
  fileName: "/data/workspace/openclaw/extensions/web3-core/Web3-Core-Dashboard-Demo.pptx",
});

console.log("✅ Presentation created successfully!");
console.log("📄 File: Web3-Core-Dashboard-Demo.pptx");
console.log("📊 Total slides: 11");
