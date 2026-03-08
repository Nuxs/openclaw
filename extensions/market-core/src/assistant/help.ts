// extensions/market-core/src/assistant/help.ts

export function generateHelpMessage(): string {
  return `🤖 我是您的市场管家，可以帮您：

📦 发布服务：
• "帮我把 GPU 卖掉，价格 $10/小时"
• "上架我的存储空间，$5/GB"

💰 调整价格：
• "改成 $15"
• "把 GPU 价格调到 $12"

📊 查询状态：
• "库存还剩多少？"
• "今天赚了多少？"
• "有人买吗？"

⚙️ 自动化：
• "自动接单，但价格不能低于 $8"
• "最多同时 5 个订单"

❌ 取消订单：
• "取消所有订单"

📋 任务市场：
• "发布任务「翻译报告」$50"
• "查看任务"
• "投标 taskId=xxx $30"
• "提交成果 taskId=xxx"
• "验收 resultId=xxx"

🔒 隐私合规：
• "查看授权"
• "回放 consentId=xxx"
• "删除数据 consentId=xxx"

📊 运营状态：
• "运营状态"
• "告警"

提示：可以在指令里附带 actorId，例如：actorId=0x...`;
}
