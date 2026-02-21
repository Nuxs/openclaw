# 📖 Web3 Core Dashboard 用户使用手册

**版本**: v1.0.0-beta  
**日期**: 2026-02-21  
**受众**: 终端用户、运维人员

---

## 📋 目录

1. [快速开始](#快速开始)
2. [Dashboard概览](#dashboard概览)
3. [资源管理](#资源管理)
4. [租约管理](#租约管理)
5. [争议处理](#争议处理)
6. [告警监控](#告警监控)
7. [数据可视化](#数据可视化)
8. [常见问题](#常见问题)

---

## 🚀 快速开始

### 首次访问

1. **打开Dashboard**

   ```
   http://your-server:3000/extensions/web3-core/dashboard.html
   ```

2. **登录认证**（如果启用了认证）
   - 输入用户名和密码
   - 或使用API密钥

3. **查看欢迎通知**
   - 右上角会显示成功加载的通知
   - 绿色✅图标表示一切正常

### 界面布局

```
┌─────────────────────────────────────────────────────┐
│  🎯 Web3 Core Dashboard     [Overview][Resources]   │ ← 顶部导航
│                              [Disputes][Alerts]       │
├─────────────────────────────────────────────────────┤
│  📊 统计卡片                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │ 42   │ │ 28   │ │  3   │ │ 150  │              │ ← 关键指标
│  └──────┘ └──────┘ └──────┘ └──────┘              │
├─────────────────────────────────────────────────────┤
│  📋 主要内容区域                                     │
│  （表格、图表、详情等）                              │
│                                                      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 Dashboard概览

### Overview标签页

**功能**: 系统整体状态一览

#### 统计卡片

| 卡片                   | 说明           | 数值含义           |
| ---------------------- | -------------- | ------------------ |
| 📦 **Total Resources** | 已发布资源总数 | 包含所有状态的资源 |
| 🔄 **Active Leases**   | 活跃租约数量   | 正在进行中的租约   |
| ⚖️ **Open Disputes**   | 未解决争议     | 需要处理的争议案件 |
| 📊 **Total Volume**    | 交易总量       | 累计交易代币数     |

#### 活动时间轴

显示最近的系统活动，包括：

- ✅ 资源发布
- 🔄 租约创建
- ⚖️ 争议提交
- ✅ 争议解决
- 🚨 告警触发

**示例**:

```
⏰ 2026-02-21 14:30  ✅ Resource "GPU Instance" created by alice.eth
⏰ 2026-02-21 14:25  🔄 Lease #1234 started
⏰ 2026-02-21 14:20  🚨 P1 Alert: High resource usage
```

---

## 📦 资源管理

### 查看资源列表

**导航**: 点击顶部 `Resources` 标签

#### 表格列说明

| 列名        | 说明                | 示例                             |
| ----------- | ------------------- | -------------------------------- |
| **ID**      | 资源唯一标识        | `res-7f8a9b`                     |
| **Name**    | 资源名称            | `High-Performance GPU`           |
| **Owner**   | 资源所有者          | `alice.eth`                      |
| **Type**    | 资源类型            | Compute / Storage / Network      |
| **Price**   | 价格（tokens/小时） | `150`                            |
| **Status**  | 当前状态            | Available / Leased / Maintenance |
| **Created** | 创建时间            | `2026-02-15 10:30`               |
| **Actions** | 操作按钮            | View / Edit / Delete             |

#### 状态说明

- 🟢 **Available**: 可租用
- 🔵 **Leased**: 已租出
- 🟡 **Maintenance**: 维护中
- ⚫ **Offline**: 离线

### 搜索和筛选

#### 搜索框

```
🔍 Search resources...
```

支持搜索：

- 资源名称
- 资源ID
- 所有者地址

**示例**: 输入 `GPU` 查找所有包含"GPU"的资源

#### 筛选器

| 筛选项     | 选项                                     |
| ---------- | ---------------------------------------- |
| **Status** | All / Available / Leased / Maintenance   |
| **Type**   | All / Compute / Storage / Network / Data |
| **Owner**  | All / Me / Others                        |

### 创建资源

1. **点击 "➕ Publish Resource" 按钮**

2. **填写表单**:

   | 字段            | 必填 | 说明                | 示例                             |
   | --------------- | ---- | ------------------- | -------------------------------- |
   | **Name**        | ✅   | 资源名称            | `GPU Compute Instance`           |
   | **Type**        | ✅   | 资源类型            | 选择 `Compute`                   |
   | **Price**       | ✅   | 价格（tokens/小时） | `150`                            |
   | **Description** | ⬜   | 详细描述            | `Professional-grade GPU...`      |
   | **Tags**        | ⬜   | 标签（逗号分隔）    | `gpu, compute, high-performance` |

3. **点击 "🚀 Publish Resource"**

4. **确认通知**:
   ```
   ✅ Resource "GPU Compute Instance" published successfully!
   ```

### 编辑资源

1. **点击资源行的 "✏️ Edit" 按钮**

2. **修改信息**:
   - 价格
   - 描述
   - 状态

3. **点击 "💾 Save Changes"**

4. **确认通知**:
   ```
   ✅ Resource updated successfully!
   ```

### 查看资源详情

1. **点击资源行的 "🔍 View" 按钮**

2. **详情窗口显示**:
   - 基本信息
   - 规格参数
   - 租约历史
   - 评分统计

3. **可执行操作**:
   - 🚀 **Lease Now**: 立即租用
   - ✏️ **Edit**: 编辑（仅所有者）
   - 🗑️ **Delete**: 删除（仅所有者）

### 删除资源

⚠️ **警告**: 删除操作不可恢复！

1. **点击 "🗑️ Delete" 按钮**

2. **确认对话框**:

   ```
   ⚠️ Are you sure you want to delete this resource?
   This action cannot be undone.

   [Cancel]  [Delete]
   ```

3. **确认删除后**:
   ```
   ✅ Resource deleted successfully!
   ```

---

## 🔄 租约管理

### 查看租约列表

**导航**: 在Resources标签下切换到 `Leases` 视图

#### 表格列说明

| 列名           | 说明                                 |
| -------------- | ------------------------------------ |
| **Lease ID**   | 租约唯一标识                         |
| **Resource**   | 关联的资源                           |
| **Tenant**     | 租户地址                             |
| **Start Time** | 开始时间                             |
| **Duration**   | 租约时长                             |
| **Price**      | 总价格                               |
| **Status**     | 状态（Active / Expired / Cancelled） |

### 创建租约

1. **从资源列表点击 "🚀 Lease"**

2. **配置租约参数**:
   - 租约时长（小时）
   - 预计费用
   - 支付方式

3. **确认并支付**

4. **租约生效通知**:
   ```
   ✅ Lease #1234 created successfully!
   Start time: 2026-02-21 15:00
   ```

### 续约

1. **点击租约的 "🔄 Renew" 按钮**

2. **选择延长时长**

3. **支付续约费用**

### 取消租约

1. **点击 "❌ Cancel" 按钮**

2. **说明取消原因**（可选）

3. **确认取消**:
   - 根据策略可能产生取消费用
   - 未使用时间可能退款

---

## ⚖️ 争议处理

### 查看争议列表

**导航**: 点击顶部 `Disputes` 标签

#### 表格列说明

| 列名         | 说明                                 |
| ------------ | ------------------------------------ |
| **Case ID**  | 争议案件号                           |
| **Lease**    | 关联租约                             |
| **Reason**   | 争议原因                             |
| **Filed By** | 提交人                               |
| **Filed At** | 提交时间                             |
| **Status**   | 状态（Open / InProgress / Resolved） |
| **Actions**  | 操作（View / Resolve）               |

#### 状态说明

- 🔴 **Open**: 待处理
- 🟡 **InProgress**: 处理中
- 🟢 **Resolved**: 已解决

### 提交争议

1. **点击 "⚖️ File Dispute" 按钮**

2. **填写争议表单**:

   | 字段            | 必填 | 说明                 |
   | --------------- | ---- | -------------------- |
   | **Lease ID**    | ✅   | 关联的租约ID         |
   | **Reason**      | ✅   | 争议原因（下拉选择） |
   | **Description** | ✅   | 详细描述问题         |
   | **Evidence**    | ⬜   | 证据（URL或哈希）    |

3. **争议原因选项**:
   - 🐢 **Performance Issues**: 性能问题
   - ⚠️ **Availability Problems**: 可用性问题
   - 💰 **Billing Dispute**: 计费争议
   - 📋 **Terms Violation**: 条款违反
   - 🔧 **Other**: 其他

4. **提交后收到通知**:
   ```
   ⚠️ Dispute submitted. Case ID: #DSP-7482
   Expected response time: 24-48 hours
   ```

### 查看争议详情

1. **点击争议行的 "🔍 View" 按钮**

2. **详情包含**:
   - 争议基本信息
   - 时间线记录
   - 相关证据
   - 处理进度
   - 沟通记录

### 解决争议（管理员）

1. **点击 "✅ Resolve" 按钮**

2. **选择解决方案**:
   - 💰 **Refund**: 全额退款
   - 💵 **Partial Refund**: 部分退款
   - ❌ **Reject**: 拒绝争议
   - 🤝 **Mediation**: 需要调解

3. **填写解决说明**

4. **确认解决**:
   ```
   ✅ Dispute #DSP-7482 resolved
   Resolution: Partial refund (50%)
   ```

---

## 🚨 告警监控

### 查看告警面板

**导航**: 点击顶部 `Alerts` 标签

#### 告警级别

| 级别     | 图标 | 颜色   | 说明     | 响应时间     |
| -------- | ---- | ------ | -------- | ------------ |
| **P0**   | 🚨   | 深红色 | 紧急告警 | 立即处理     |
| **P1**   | ⚠️   | 橙色   | 高优先级 | 1小时内      |
| **P2**   | ℹ️   | 蓝色   | 中优先级 | 24小时内     |
| **Info** | 📋   | 灰色   | 信息通知 | 无需立即处理 |

#### 告警类别

- 🔒 **SECURITY**: 安全相关
- 💾 **STORAGE**: 存储相关
- ⚡ **PERFORMANCE**: 性能相关
- 🌐 **NETWORK**: 网络相关
- 🐛 **ERROR**: 错误相关
- ⚖️ **DISPUTE**: 争议相关
- 💰 **BILLING**: 计费相关

### 告警卡片内容

```
┌────────────────────────────────────────┐
│ 🚨 P0 - SECURITY                       │ ← 级别和类别
│                                        │
│ Critical: Database connection lost    │ ← 告警消息
│                                        │
│ ⏰ 2026-02-21 15:30:00                │ ← 触发时间
│                                        │
│ [👁️ Details]  [✅ Acknowledge]        │ ← 操作按钮
└────────────────────────────────────────┘
```

### 处理告警

#### 1. 查看详情

点击 "👁️ Details" 查看：

- 详细错误信息
- 影响范围
- 建议解决方案
- 相关日志

#### 2. 确认告警

点击 "✅ Acknowledge":

- 标记已知晓
- 防止重复通知
- 记录确认人和时间

```
✅ Alert acknowledged by admin@example.com
Time: 2026-02-21 15:35:00
```

#### 3. 解决告警

处理完问题后，系统会自动：

- 更新告警状态为 "Resolved"
- 记录解决时间
- 计算处理时长

### 告警通知

#### 接收渠道

- 📧 **邮件**: 发送到注册邮箱
- 📱 **企业微信**: 通过Webhook推送
- 🌐 **Dashboard**: 页面内Toast通知
- 🔔 **浏览器**: 浏览器通知（需授权）

#### 通知示例

**企业微信**:

```
🚨 P0告警
类别: SECURITY
消息: Database connection lost

时间: 2026-02-21 15:30
操作: 请立即登录Dashboard查看详情
```

**邮件**:

```
主题: [P0] SECURITY Alert - Database connection lost

您好，

系统触发了一个P0级别的安全告警：

告警详情：
- 级别: P0 (紧急)
- 类别: SECURITY
- 消息: Database connection lost
- 时间: 2026-02-21 15:30:00

请立即访问Dashboard查看详情并处理：
http://dashboard.example.com/extensions/web3-core/dashboard.html

---
Web3 Core Dashboard 自动通知
```

---

## 📊 数据可视化

### 图表类型

#### 1. 资源使用趋势图（折线图）

**位置**: Overview标签

**展示内容**:

- 📈 Published Resources（已发布资源）
- 📊 Active Leases（活跃租约）

**时间范围**: 最近6个月

**用途**: 分析资源市场增长趋势

---

#### 2. Dispute解决率（柱状图）

**位置**: Disputes标签

**展示内容**:

- 🟡 Opened（新开案件）
- 🟢 Resolved（已解决）

**时间范围**: 最近4周

**用途**: 评估争议处理效率

---

#### 3. Alert频率分布（柱状图）

**位置**: Alerts标签

**展示内容**:

- 各级别告警数量（P0/P1/P2/Info）

**时间范围**: 最近24小时

**用途**: 快速识别系统健康状况

---

#### 4. 资源状态分布（圆环图）

**位置**: Overview标签

**展示内容**:

- 🟢 Available: 45%
- 🔵 Leased: 35%
- 🟡 Maintenance: 12%
- ⚫ Offline: 8%

**用途**: 了解资源总体状态

---

### 图表交互

#### 悬停查看详情

将鼠标悬停在图表上：

```
📊 Published Resources
Date: Feb 2026
Value: 32 resources
```

#### 点击图例筛选

点击图例可以：

- 显示/隐藏特定数据集
- 专注查看某一项数据

#### 刷新图表

点击 "🔄 Refresh Charts" 按钮重新加载最新数据

---

## ❓ 常见问题

### Q1: Dashboard加载很慢怎么办？

**A**:

1. 检查网络连接
2. 清除浏览器缓存（Ctrl+Shift+Del）
3. 关闭不必要的浏览器标签页
4. 联系管理员检查服务器状态

---

### Q2: 如何导出数据？

**A**:

1. 点击表格右上角的 "📥 Export" 按钮
2. 选择格式：CSV / Excel / JSON
3. 下载文件到本地

---

### Q3: 忘记密码怎么办？

**A**:

1. 点击登录页面的 "Forgot Password?"
2. 输入注册邮箱
3. 查收重置密码邮件
4. 按照邮件指引重置密码

---

### Q4: 可以在手机上使用吗？

**A**:
可以！Dashboard支持响应式设计：

- 📱 手机浏览器可以访问
- 📊 部分图表在小屏幕上自适应
- 🎯 核心功能完全可用

---

### Q5: 如何获取API访问权限？

**A**:

1. 联系管理员申请API密钥
2. 在Dashboard设置中配置密钥
3. 使用API进行自动化操作

---

### Q6: 争议处理通常需要多久？

**A**:

- 🚀 **提交后**: 立即收到确认
- ⏰ **初步审核**: 24小时内
- ✅ **最终解决**: 2-5个工作日

---

### Q7: 如何联系技术支持？

**A**:

- 📧 **邮件**: support@example.com
- 💬 **企业微信**: OpenClaw技术支持群
- 🐛 **Bug报告**: GitHub Issues

---

### Q8: Dashboard支持哪些浏览器？

**A**:
✅ **完全支持**:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

⚠️ **部分支持**:

- IE 11（基本功能可用，无图表）

---

## 📚 相关资源

- 📖 [部署指南](./DEPLOYMENT.md)
- 🔧 [API文档](./api-documentation.md)
- 📊 [Week 4完成报告](./reports/week4-complete.md)

---

## 💡 使用技巧

### 快捷键

| 快捷键     | 功能               |
| ---------- | ------------------ |
| **Esc**    | 关闭当前Modal      |
| **Ctrl+F** | 搜索（浏览器原生） |
| **F5**     | 刷新页面           |

### 最佳实践

1. **定期检查告警面板**
   - 建议每天至少查看一次
   - P0告警立即处理

2. **及时处理争议**
   - 在24小时内回应
   - 提供充分证据

3. **合理定价资源**
   - 参考市场平均价格
   - 考虑资源性能

4. **保持资源在线**
   - 定期维护
   - 及时更新状态

---

**用户手册版本**: v1.0.0  
**最后更新**: 2026-02-21  
**维护者**: OpenClaw Team

📞 **需要帮助？** 联系 support@example.com
