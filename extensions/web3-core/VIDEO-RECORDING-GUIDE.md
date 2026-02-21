# 🎥 演示视频录制完整指南

**版本**: v1.0  
**目标**: 录制15分钟高质量Dashboard演示视频  
**日期**: 2026-02-21

---

## 📋 录制前准备清单

### 1. 环境准备 (15分钟)

#### 启动Dashboard服务

```bash
# 1. 进入项目目录
cd /data/workspace/openclaw/extensions/web3-core

# 2. 安装依赖（如果未安装）
npm install

# 3. 启动服务
npm start

# 4. 验证服务
curl http://localhost:3000/dashboard.html
```

#### 准备测试数据

```bash
# 创建测试数据脚本
cat > prepare-demo-data.sh << 'EOF'
#!/bin/bash

echo "🚀 Preparing demo data..."

# 1. 清除旧数据
rm -f demo-data.db

# 2. 初始化数据库
sqlite3 demo-data.db << SQL
-- Resources table
CREATE TABLE resources (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    price INTEGER,
    owner TEXT,
    status TEXT,
    created_at DATETIME
);

-- Leases table
CREATE TABLE leases (
    id TEXT PRIMARY KEY,
    resource_id TEXT,
    tenant TEXT,
    start_time DATETIME,
    end_time DATETIME,
    status TEXT
);

-- Disputes table
CREATE TABLE disputes (
    id TEXT PRIMARY KEY,
    lease_id TEXT,
    reason TEXT,
    description TEXT,
    status TEXT,
    created_at DATETIME
);

-- Alerts table
CREATE TABLE alerts (
    id TEXT PRIMARY KEY,
    priority TEXT,
    category TEXT,
    message TEXT,
    status TEXT,
    created_at DATETIME
);

-- Insert demo resources
INSERT INTO resources VALUES
    ('res-001', 'Professional GPU Instance', 'Compute', 200, 'alice.eth', 'Available', '2026-02-15 10:00:00'),
    ('res-002', 'High-Speed Storage 10TB', 'Storage', 150, 'bob.eth', 'Rented', '2026-02-16 11:30:00'),
    ('res-003', 'CDN Bandwidth Package', 'Network', 100, 'carol.eth', 'Available', '2026-02-17 14:20:00'),
    ('res-004', 'AI Training Cluster', 'Compute', 500, 'dave.eth', 'Maintenance', '2026-02-18 09:15:00'),
    ('res-005', 'Database Hosting', 'Storage', 80, 'eve.eth', 'Available', '2026-02-19 16:45:00');

-- Insert demo leases
INSERT INTO leases VALUES
    ('lease-001', 'res-002', 'frank.eth', '2026-02-20 00:00:00', '2026-03-20 23:59:59', 'Active'),
    ('lease-002', 'res-004', 'grace.eth', '2026-02-18 00:00:00', '2026-02-25 23:59:59', 'Active'),
    ('lease-003', 'res-001', 'henry.eth', '2026-01-15 00:00:00', '2026-02-15 23:59:59', 'Completed');

-- Insert demo disputes
INSERT INTO disputes VALUES
    ('dispute-001', 'lease-001', 'Performance Issues', 'Storage speed is 50% lower than advertised', 'Pending', '2026-02-21 08:30:00'),
    ('dispute-002', 'lease-002', 'Availability', 'Service downtime exceeded SLA', 'In Progress', '2026-02-20 15:00:00'),
    ('dispute-003', 'lease-003', 'Billing Error', 'Overcharged for usage', 'Resolved', '2026-02-16 10:00:00');

-- Insert demo alerts
INSERT INTO alerts VALUES
    ('alert-001', 'P0', 'Security', 'Unauthorized access attempt detected', 'Active', '2026-02-21 08:00:00'),
    ('alert-002', 'P1', 'Performance', 'API response time > 1s', 'Active', '2026-02-21 07:30:00'),
    ('alert-003', 'P2', 'Storage', 'Disk usage at 75%', 'Active', '2026-02-21 06:00:00'),
    ('alert-004', 'Info', 'System', 'Scheduled maintenance in 24h', 'Acknowledged', '2026-02-20 18:00:00');

SQL

echo "✅ Demo data prepared!"
echo "📊 Created:"
echo "   - 5 Resources"
echo "   - 3 Leases"
echo "   - 3 Disputes"
echo "   - 4 Alerts"
EOF

chmod +x prepare-demo-data.sh
./prepare-demo-data.sh
```

#### 浏览器设置

```
推荐浏览器: Chrome / Edge
窗口尺寸: 1920x1080 (全屏)
缩放级别: 100%
扩展程序: 全部禁用（避免干扰）
通知: 关闭所有系统通知
```

#### 录制工具设置

| 项目       | 推荐设置       | 说明                 |
| ---------- | -------------- | -------------------- |
| **分辨率** | 1920x1080      | 标准全高清           |
| **帧率**   | 30 fps         | 流畅度与文件大小平衡 |
| **码率**   | 5-8 Mbps       | 保证画质清晰         |
| **音频**   | 48kHz, 128kbps | 高质量音频           |
| **格式**   | MP4 (H.264)    | 兼容性最好           |
| **麦克风** | 外置麦克风     | 降噪效果好           |

---

## 🎬 录制流程

### 阶段1: Part 1-2 开场和概览 (4分钟)

**录制时间**: 5分钟（含缓冲）

#### Part 1: 开场介绍 (2分钟)

**操作步骤**:

1. 打开空白PPT或准备好的标题页
2. 面向摄像头（如使用画中画）

**旁白脚本**:

```
大家好！今天我要演示的是Web3 Core Dashboard，
这是一个为去中心化资源市场设计的完整管理平台。

在传统的资源交易中，我们面临三大痛点：
第一，缺乏透明度 - 看不到资源真实状态
第二，争议难解决 - 没有公正的仲裁机制
第三，监控不及时 - 问题发现太晚

Web3 Core Dashboard通过区块链技术和智能合约，
为这些问题提供了完整的解决方案。

让我们开始演示！
```

**录制要点**:

- ✅ 语速适中（150-180字/分钟）
- ✅ 充满自信和热情
- ✅ 眼神交流（看摄像头）

#### Part 2: Dashboard概览 (2分钟)

**操作步骤**:

1. 在浏览器中打开 `http://localhost:3000/dashboard.html`
2. 等待页面完全加载（1-2秒）
3. 鼠标移向顶部4个统计卡片

**旁白脚本**:

```
这是Dashboard的概览页面。

（鼠标指向卡片）
顶部的4个卡片显示了系统的关键指标：
- 42个已发布的资源
- 28个活跃租约
- 3个待处理的争议
- 150K tokens的交易总量

（滚动到活动时间轴）
下方的活动时间轴实时显示系统中的最新动态，
包括资源发布、租约创建、争议提交等事件。

这让管理员可以快速掌握系统整体状态。
```

**录制要点**:

- ✅ 鼠标移动要平滑
- ✅ 悬停在关键元素上1-2秒
- ✅ 页面加载时保持沉默，等待完成

---

### 阶段2: Part 3 资源管理演示 (4分钟)

**录制时间**: 5分钟（含缓冲）

#### 3.1 浏览资源列表 (1分钟)

**操作步骤**:

1. 点击 `Resources` 标签
2. 等待列表加载（1秒）
3. 慢慢滚动浏览列表
4. 鼠标悬停在不同状态的资源上

**旁白脚本**:

```
现在我们来看资源管理功能。

（列表加载完成后）
这个列表展示了所有已发布的资源。
每个资源都有清晰的状态标识：

（指向绿色标签）
绿色表示可租用

（指向蓝色标签）
蓝色表示已租出

（指向黄色标签）
黄色表示维护中

我们可以看到资源的详细信息：
类型、价格、所有者、创建时间等。
```

#### 3.2 搜索和筛选 (1分钟)

**操作步骤**:

1. 点击搜索框
2. 输入 "GPU"（逐字输入，不要粘贴）
3. 从类型下拉框选择 "Compute"
4. 从状态下拉框选择 "Available"
5. 点击 "🔍 Search" 按钮
6. 展示筛选结果

**旁白脚本**:

```
强大的搜索和筛选功能让我们可以快速找到需要的资源。

比如，我想找一个可用的GPU资源。

（开始输入）
输入"GPU"，
（选择类型）
选择"Compute"类型，
（选择状态）
选择"Available"状态，
（点击搜索）
点击搜索...

（结果显示）
立即就能看到所有符合条件的资源。

这对于有大量资源的市场来说非常重要。
```

#### 3.3 创建资源 (2分钟)

**操作步骤**:

1. 点击 "➕ Publish Resource" 按钮
2. Modal对话框打开
3. 填写表单：
   - Name: "Professional GPU Instance"（逐字输入）
   - Type: 下拉选择 "Compute"
   - Price: 输入 "200"
   - Description: "High-performance GPU for AI training"
4. 点击 "🚀 Publish Resource" 按钮
5. 等待成功Toast通知出现
6. Modal关闭，列表中出现新资源

**旁白脚本**:

```
发布一个新资源非常简单。

（点击按钮）
点击"Publish Resource"按钮，

（Modal打开）
填写资源的基本信息：

（填写名称）
名称：Professional GPU Instance

（选择类型）
类型：选择Compute

（输入价格）
价格：200 tokens每小时

（输入描述）
描述：高性能GPU，适合AI训练

（点击发布）
点击发布...

（等待通知）
几秒钟内资源就上架了！

（Toast出现）
看，右上角出现了成功通知。

（查看列表）
资源已经添加到列表中，状态是"Available"，
可以立即被其他用户租用。

这个流程完全自动化，无需人工审核。
```

**录制要点**:

- ✅ 输入文字时不要太快
- ✅ 等待Toast动画完成
- ✅ 确保新资源在列表中可见

---

### 阶段3: Part 4 争议处理演示 (3分钟)

**录制时间**: 4分钟（含缓冲）

#### 4.1 查看争议列表 (1分钟)

**操作步骤**:

1. 点击 `Disputes` 标签
2. 等待列表加载
3. 浏览争议列表
4. 鼠标悬停在不同状态的争议上

**旁白脚本**:

```
接下来是争议处理功能，
这是Web3市场中非常重要的一环。

（列表加载）
这里展示了所有的争议案件。

（指向红色）
红色表示待处理，
（指向黄色）
黄色表示处理中，
（指向绿色）
绿色表示已解决。

我们可以看到每个争议的关键信息：
关联的租约、争议原因、提交人和时间。
```

#### 4.2 提交争议 (1分钟)

**操作步骤**:

1. 点击 "⚖️ File Dispute" 按钮
2. Modal打开
3. 填写表单：
   - Lease ID: 输入 "lease-001"
   - Reason: 选择 "Performance Issues"
   - Description: "GPU performance is 50% lower than advertised"
4. 点击 "📤 Submit Dispute"
5. 等待成功通知

**旁白脚本**:

```
如果用户遇到问题，可以轻松提交争议。

（打开Modal）
选择关联的租约ID，

（选择原因）
选择争议原因 - 这里我选择"性能问题"，

（输入描述）
然后详细描述问题：
"GPU性能比广告宣传的低50%"

（提交）
提交后，系统会自动创建案件号，
并通知相关方。

（成功通知）
预计响应时间是24到48小时。
```

#### 4.3 解决争议 (1分钟)

**操作步骤**:

1. 点击第一个待处理争议的 "👁️ Details" 按钮
2. Modal打开显示详情
3. 点击 "✅ Resolve" 按钮
4. 选择解决方式 "Partial Refund (50%)"
5. 输入解决说明（可选）
6. 确认

**旁白脚本**:

```
作为管理员或仲裁者，我可以解决争议。

（点击Details）
点击查看详情，了解案件的完整信息。

（查看信息）
经过调查，我决定给用户部分退款。

（选择解决方式）
选择"Partial Refund 50%"，

（填写说明）
填写解决说明，

（确认）
确认。

（成功通知）
智能合约会自动执行退款，
双方都会收到通知。

整个过程透明、公正、不可篡改。
```

---

### 阶段4: Part 5-6 告警和可视化 (3分钟)

**录制时间**: 4分钟（含缓冲）

#### 5.1 查看告警面板 (1分钟)

**操作步骤**:

1. 点击 `Alerts` 标签
2. 浏览告警列表
3. 指向不同优先级的告警

**旁白脚本**:

```
最后是实时告警监控系统。

（列表加载）
这里展示了所有的系统告警，
按优先级分类：

（指向P0）
P0深红色：紧急告警，需要立即处理

（指向P1）
P1橙色：高优先级，1小时内处理

（指向P2）
P2蓝色：中优先级，24小时内处理

（指向Info）
Info灰色：信息通知

每个告警都有清晰的类别标识：
安全、存储、性能、网络等。
```

#### 5.2 处理告警 (1分钟)

**操作步骤**:

1. 点击一个P1告警的 "👁️ Details"
2. Modal打开
3. 查看详细信息
4. 点击 "✅ Acknowledge"
5. 成功通知

**旁白脚本**:

```
当收到告警时，我可以查看详情。

（打开详情）
这里显示了完整的错误信息、
影响范围和建议的解决方案。

（点击确认）
点击"Acknowledge"确认我已知晓，

（成功）
系统会记录确认时间和处理人。

对于P0级别的告警，
系统还会通过企业微信、邮件等多个渠道通知，
确保不会遗漏关键问题。
```

#### 6. 数据可视化展示 (1分钟)

**操作步骤**:

1. 返回 `Overview` 标签
2. 滚动到图表区域
3. 鼠标悬停在图表上查看数据
4. 点击图例切换显示

**旁白脚本**:

```
Dashboard还提供了丰富的数据可视化功能。

（指向折线图）
这个折线图展示了资源和租约的增长趋势，
我们可以看到市场正在快速发展。

（指向柱状图）
这个柱状图显示了争议的解决情况，
绿色是已解决的，黄色是新开的案件。

（指向圆环图）
这个圆环图展示了资源状态分布，
45%的资源可用，35%已租出。

（悬停操作）
悬停在图表上可以看到精确的数值，

（点击图例）
点击图例可以切换显示特定的数据集。

这些图表每30秒自动刷新，
始终展示最新的数据。
```

---

### 阶段5: Part 7-8 高级功能和总结 (2分钟)

**录制时间**: 3分钟（含缓冲）

#### 7. 高级功能快速展示 (1分钟)

**操作步骤**:

1. 触发几个Toast通知（通过操作）
2. 打开一个Modal
3. 按ESC关闭
4. 调整浏览器窗口大小展示响应式

**旁白脚本**:

```
Dashboard还有很多精心设计的细节。

（触发通知）
比如这个Toast通知系统，
不同类型的通知有不同的颜色和图标，
P0告警还会有声音提示。

（打开Modal）
Modal对话框支持键盘快捷键，

（按ESC）
按Escape键就能关闭。

整个界面采用响应式设计，
在手机、平板上都能完美展示。

（调整窗口）
看，布局会自动调整以适应屏幕尺寸。
```

#### 8. 总结和Q&A (1分钟)

**操作步骤**:

1. 回到Overview标签
2. 或切换到总结PPT页面

**旁白脚本**:

```
总结一下，Web3 Core Dashboard提供了：

✅ 完整的资源管理 - 发布、编辑、搜索、筛选
✅ 公正的争议处理 - 提交、审理、自动执行
✅ 实时的告警监控 - 多级别、多渠道、及时响应
✅ 强大的数据可视化 - 趋势分析、状态分布
✅ 优秀的用户体验 - 响应式、暗色主题、平滑动画

技术亮点：
- 模块化架构，易于扩展
- 100%测试覆盖，质量保证
- 完善的文档，快速上手
- 性能优异，所有指标超越目标

当前状态：
- v1.0.0-beta 已发布
- 欢迎试用和反馈
- GitHub: github.com/yourorg/openclaw

现在开放提问时间！
有任何问题都可以问我。

谢谢大家！
```

---

## ✂️ 后期处理指南

### 剪辑流程

#### 1. 导入素材

```
推荐工具:
- 免费: DaVinci Resolve
- 付费: Adobe Premiere Pro, Final Cut Pro
```

**操作步骤**:

1. 创建新项目（1920x1080, 30fps）
2. 导入录制的原始视频
3. 创建时间轴

#### 2. 粗剪

**移除内容**:

- ❌ 加载等待时间（超过2秒的）
- ❌ 失误操作
- ❌ 过长的停顿
- ❌ 口误和重复

**保留内容**:

- ✅ 关键操作的完整过程
- ✅ 自然的停顿（1-2秒）
- ✅ 页面加载动画

#### 3. 添加字幕

**字幕规范**:

```
字体: 思源黑体 / Source Han Sans
大小: 36-42pt
颜色: 白色
描边: 黑色 2px
位置: 底部居中
动画: 无（直接显示）
```

**字幕内容**:

- ✅ 所有旁白对话
- ✅ 重要的屏幕文字
- ✅ 关键操作说明

**字幕工具**:

- 自动生成: 剪映、Subtitle Edit
- 手动调整: 时间轴同步

#### 4. 添加标注

**标注类型**:

1. **圆圈标注**
   - 用途: 突出关键UI元素
   - 颜色: 黄色 / 红色
   - 粗细: 3-5px
   - 动画: 淡入淡出

2. **箭头指示**
   - 用途: 引导视线
   - 颜色: 红色
   - 动画: 箭头移动

3. **文字说明**
   - 用途: 补充信息
   - 字体: 同字幕
   - 大小: 28-32pt
   - 位置: 空白区域

**标注时机**:

```
✅ 首次出现的重要功能
✅ 复杂的操作步骤
✅ 需要强调的结果
❌ 不要过度标注（保持简洁）
```

#### 5. 片头片尾

**片头** (5秒):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         Web3 Core Dashboard
      去中心化资源市场的完整管理平台
             v1.0.0-beta
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**片尾** (5秒):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           谢谢观看！

    🌐 Demo: demo.example.com
    📚 Docs: github.com/yourorg/openclaw
    📧 Email: support@example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 6. 背景音乐（可选）

**音乐选择**:

- 类型: 轻音乐 / 科技感电子音乐
- 音量: -20dB ~ -25dB（不要盖过旁白）
- 来源: YouTube Audio Library, Epidemic Sound

**注意事项**:

- ⚠️ 必须使用无版权音乐
- ⚠️ 音量要低于旁白
- ⚠️ 在重要讲解时可暂停音乐

#### 7. 音频处理

**降噪**:

```
工具: Audacity (免费)
操作:
1. 选择静音片段
2. Effects → Noise Reduction → Get Noise Profile
3. 选择全部音频
4. Effects → Noise Reduction → Apply
```

**音量标准化**:

```
目标: -3dB 峰值
工具: Audacity Normalize 效果
```

**EQ调整**:

```
低频: 80Hz 以下 -3dB（去除噪音）
中频: 1-4kHz +2dB（增强人声清晰度）
高频: 8kHz 以上 +1dB（增加明亮感）
```

---

## 📤 导出设置

### 最终视频导出

**格式**: MP4 (H.264)

**参数**:

```
分辨率: 1920x1080
帧率: 30fps
码率: 8 Mbps (CBR)
音频: AAC, 192kbps, 48kHz
```

**DaVinci Resolve 导出设置**:

```
Format: MP4
Codec: H.264
Quality: Restrict to 8000 Kb/s
Audio Codec: AAC
Audio Bitrate: 192
```

**Adobe Premiere 导出设置**:

```
Format: H.264
Preset: YouTube 1080p Full HD
Bitrate Encoding: CBR
Target Bitrate: 8 Mbps
Audio Format: AAC
Audio Bitrate: 192 kbps
```

---

## 📊 质量检查清单

### 录制质量

- [ ] 视频清晰无模糊
- [ ] 音频清晰无杂音
- [ ] 无明显失误操作
- [ ] 所有功能演示完整
- [ ] 时长控制在15分钟内

### 剪辑质量

- [ ] 移除了所有冗余内容
- [ ] 过渡自然流畅
- [ ] 字幕与音频同步
- [ ] 字幕无错别字
- [ ] 标注清晰易懂

### 音频质量

- [ ] 音量适中一致
- [ ] 降噪处理完成
- [ ] 无爆音和失真
- [ ] 背景音乐音量合适
- [ ] 所有对话清晰可听

### 视觉质量

- [ ] 片头片尾专业
- [ ] 标注使用得当
- [ ] 颜色准确
- [ ] 无闪烁和抖动
- [ ] Logo和品牌元素正确

### 内容质量

- [ ] 涵盖所有核心功能
- [ ] 演示逻辑清晰
- [ ] 亮点突出
- [ ] 技术细节准确
- [ ] CTA明确

---

## 🚀 发布准备

### 文件命名

```
Web3-Core-Dashboard-Demo-v1.0.0-beta.mp4
```

### 发布渠道

1. **GitHub Repository**
   - 位置: README.md 顶部
   - 使用: 嵌入式播放器或链接

2. **视频平台**
   - YouTube: 公开或不公开
   - Bilibili: 如果目标观众在中国
   - 公司内部视频系统

3. **项目网站**
   - 首页 Hero 区域
   - 文档页面

### 视频描述模板

```markdown
# Web3 Core Dashboard - 产品演示

## 简介

Web3 Core Dashboard 是一个为去中心化资源市场设计的完整管理平台，提供资源管理、争议处理、实时监控和数据可视化功能。

## 功能亮点

✅ 完整的资源管理 - 发布、编辑、搜索、筛选
✅ 公正的争议处理 - 透明流程、智能合约自动执行
✅ 实时告警监控 - 多级别、多渠道通知
✅ 强大的数据可视化 - 趋势分析、状态分布

## 技术栈

- Frontend: HTML5/CSS3/JavaScript + Chart.js
- Backend: TypeScript + Node.js + SQLite
- Testing: 100% Coverage
- DevOps: PM2 + Nginx

## 链接

🌐 Demo: demo.example.com
📚 文档: github.com/yourorg/openclaw
📧 联系: support@example.com

## 时间轴

0:00 开场介绍
0:30 Dashboard概览
2:30 资源管理演示
6:30 争议处理演示
9:30 告警监控演示
11:30 数据可视化
12:30 高级功能
13:30 总结

## 版本

v1.0.0-beta | 2026-02-21

## 许可

MIT License
```

---

## 🎯 成功标准

### 技术指标

- ✅ 视频时长: 14-16分钟
- ✅ 分辨率: 1920x1080
- ✅ 帧率: 30fps
- ✅ 码率: 5-8 Mbps
- ✅ 文件大小: 150-250MB

### 内容指标

- ✅ 涵盖所有核心功能
- ✅ 每个功能演示完整
- ✅ 逻辑流畅易懂
- ✅ 亮点突出
- ✅ CTA明确

### 质量指标

- ✅ 视频清晰
- ✅ 音频清晰
- ✅ 字幕准确
- ✅ 标注恰当
- ✅ 无明显瑕疵

---

## 💡 录制技巧

### 旁白技巧

1. **语速控制**
   - 正常: 150-180字/分钟
   - 重要内容: 慢至120字/分钟
   - 过渡: 可快至200字/分钟

2. **语气**
   - 自信但不傲慢
   - 热情但不过度
   - 专业但不生硬

3. **停顿**
   - 每句话之间: 0.5-1秒
   - 功能切换: 1-2秒
   - 加载等待: 静音

### 鼠标操作技巧

1. **移动速度**
   - 慢速: 重要操作
   - 中速: 一般操作
   - 快速: 仅用于切换

2. **悬停时间**
   - 按钮: 1秒
   - 重要元素: 2秒
   - 不重要: 0.5秒

3. **点击**
   - 明确的点击动作
   - 点击后停顿1秒
   - 等待反馈出现

### 页面操作技巧

1. **滚动**
   - 平滑滚动（不要快速拖动）
   - 目标位置停顿2秒
   - 展示完整内容

2. **输入**
   - 正常打字速度
   - 不要复制粘贴
   - 输入完停顿1秒

3. **切换**
   - Tab切换要清晰
   - 切换后等待加载
   - 确保内容完整显示

---

## ⚠️ 常见问题

### Q1: 录制时页面加载太慢怎么办？

**A**:

- 后期剪辑时加速或剪掉
- 或在旁白中说明"正在加载..."
- 考虑使用更快的测试环境

### Q2: 录制时出现失误怎么办？

**A**:

- 不要立即停止，继续完成该段
- 重新录制该段落
- 后期剪辑时替换

### Q3: 背景噪音太大怎么办？

**A**:

- 选择安静的录制环境
- 使用降噪麦克风
- 后期使用Audacity降噪

### Q4: Toast通知消失太快怎么办？

**A**:

- 后期添加标注
- 或暂停视频放大显示
- 或在旁白中复述内容

### Q5: 演示数据不够真实怎么办？

**A**:

- 使用prepare-demo-data.sh脚本
- 手动添加更多真实数据
- 使用faker生成随机但真实的数据

---

## 📞 支持

如有任何问题，请联系:

- 📧 Email: team@example.com
- 💬 Slack: #web3-dashboard

---

**祝录制顺利！🎬✨**

---

**版本**: v1.0  
**最后更新**: 2026-02-21  
**维护者**: OpenClaw Team
