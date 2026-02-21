# 📦 Web3 Core Dashboard 部署指南

**版本**: v1.0.0-beta  
**日期**: 2026-02-21  
**文档类型**: 部署手册

---

## 📋 目录

1. [系统要求](#系统要求)
2. [安装步骤](#安装步骤)
3. [配置说明](#配置说明)
4. [启动服务](#启动服务)
5. [验证部署](#验证部署)
6. [故障排查](#故障排查)
7. [生产优化](#生产优化)

---

## 🖥️ 系统要求

### 最低要求

| 组件         | 要求                                            |
| ------------ | ----------------------------------------------- |
| **操作系统** | Linux (Ubuntu 20.04+) / macOS 11+ / Windows 10+ |
| **Node.js**  | v16.0+                                          |
| **内存**     | 2GB RAM                                         |
| **存储**     | 500MB 可用空间                                  |
| **浏览器**   | Chrome 90+ / Firefox 88+ / Safari 14+           |

### 推荐配置

| 组件         | 推荐             |
| ------------ | ---------------- |
| **操作系统** | Ubuntu 22.04 LTS |
| **Node.js**  | v18.0+           |
| **内存**     | 4GB+ RAM         |
| **存储**     | 2GB+ SSD         |
| **网络**     | 10Mbps+          |

---

## 📥 安装步骤

### 1. 克隆仓库

```bash
# 克隆项目
git clone https://github.com/yourorg/openclaw.git
cd openclaw/extensions/web3-core

# 检查分支
git branch
```

### 2. 安装依赖

```bash
# 安装npm依赖
npm install

# 验证安装
npm list --depth=0
```

### 3. 构建项目

```bash
# 编译TypeScript
npm run build

# 检查构建输出
ls -la dist/
```

---

## ⚙️ 配置说明

### 配置文件位置

```
extensions/web3-core/
├── config.ts          # 主配置文件
├── .env.example       # 环境变量模板
└── .env.local         # 本地环境配置（需创建）
```

### 创建配置文件

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑配置
nano .env.local
```

### 环境变量说明

```bash
# ====================
# 基础配置
# ====================

# 服务端口
PORT=3000

# 环境模式 (development / production)
NODE_ENV=production

# 数据库路径
DB_PATH=./data/web3-core.db

# ====================
# 安全配置
# ====================

# JWT密钥（生产环境必须修改！）
JWT_SECRET=your-super-secret-key-change-this-in-production

# API密钥（用于Gateway认证）
API_KEY=your-api-key-here

# ====================
# 功能开关
# ====================

# 启用告警系统
ENABLE_ALERTS=true

# 启用自动刷新（秒）
AUTO_REFRESH_INTERVAL=30

# 启用调试日志
DEBUG_MODE=false

# ====================
# 外部服务（可选）
# ====================

# 企业微信Webhook（用于告警通知）
WECHAT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY

# 邮件服务器（用于通知）
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=your-password

# ====================
# 性能优化
# ====================

# 最大并发请求数
MAX_CONCURRENT_REQUESTS=100

# API超时（毫秒）
API_TIMEOUT=5000

# 缓存TTL（秒）
CACHE_TTL=60
```

### 配置验证

```bash
# 验证配置文件
npm run config:validate

# 测试数据库连接
npm run db:test

# 检查告警配置
npm run alerts:test
```

---

## 🚀 启动服务

### 开发模式

```bash
# 启动开发服务器（热重载）
npm run dev

# 服务将在 http://localhost:3000 启动
```

### 生产模式

```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm start

# 或使用PM2守护进程
pm2 start npm --name "web3-core" -- start
```

### 使用PM2（推荐生产环境）

```bash
# 安装PM2
npm install -g pm2

# 启动服务
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs web3-core

# 重启服务
pm2 restart web3-core

# 停止服务
pm2 stop web3-core

# 开机自启动
pm2 startup
pm2 save
```

### PM2配置文件 (ecosystem.config.js)

```javascript
module.exports = {
  apps: [
    {
      name: "web3-core",
      script: "./dist/index.js",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      max_memory_restart: "500M",
    },
  ],
};
```

---

## ✅ 验证部署

### 1. 健康检查

```bash
# 检查服务状态
curl http://localhost:3000/health

# 期望输出
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600
}
```

### 2. API测试

```bash
# 测试系统状态API
curl http://localhost:3000/api/status

# 测试资源列表API
curl http://localhost:3000/api/resources

# 期望返回JSON数据
```

### 3. Dashboard访问

```bash
# 打开浏览器访问
http://localhost:3000/extensions/web3-core/dashboard.html
```

### 4. 功能测试清单

- [ ] Dashboard加载正常
- [ ] 资源列表显示
- [ ] Dispute列表显示
- [ ] Alert面板显示
- [ ] Toast通知工作
- [ ] Modal对话框工作
- [ ] 图表渲染正常
- [ ] 搜索/筛选功能
- [ ] 数据刷新功能

### 5. 自动化测试

```bash
# 运行单元测试
npm test

# 运行E2E测试
npm run test:e2e

# 生成测试报告
npm run test:report
```

---

## 🔧 故障排查

### 常见问题

#### 1. 服务无法启动

**症状**: `npm start` 报错

**解决方案**:

```bash
# 检查端口占用
lsof -i :3000
# 如果被占用，kill进程或更换端口

# 检查依赖
npm install

# 清除缓存
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### 2. Dashboard白屏

**症状**: 浏览器打开显示空白页面

**解决方案**:

```bash
# 检查控制台错误（F12）
# 查看Network标签，确认静态文件加载

# 检查文件权限
chmod -R 755 ./extensions/web3-core/

# 验证文件存在
ls -la extensions/web3-core/dashboard.html
```

#### 3. API返回404

**症状**: API调用返回404错误

**解决方案**:

```bash
# 检查路由配置
cat dist/routes.js

# 重启服务
pm2 restart web3-core

# 查看日志
pm2 logs web3-core --lines 100
```

#### 4. 数据库错误

**症状**: `SQLITE_ERROR: no such table`

**解决方案**:

```bash
# 初始化数据库
npm run db:init

# 运行迁移
npm run db:migrate

# 检查数据库文件
sqlite3 data/web3-core.db ".tables"
```

#### 5. 告警不发送

**症状**: P0告警没有收到通知

**解决方案**:

```bash
# 检查Webhook配置
echo $WECHAT_WEBHOOK_URL

# 测试Webhook
curl -X POST $WECHAT_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"msgtype":"text","text":{"content":"Test"}}'

# 查看告警日志
tail -f logs/alerts.log
```

### 日志位置

```
logs/
├── error.log          # 错误日志
├── out.log            # 标准输出
├── alerts.log         # 告警日志
└── access.log         # 访问日志
```

### 调试模式

```bash
# 启用详细日志
DEBUG=* npm start

# 只显示特定模块
DEBUG=web3:* npm start
```

---

## 🔒 生产优化

### 1. 安全加固

```bash
# 修改默认密钥
sed -i 's/your-super-secret-key/RANDOM_STRONG_KEY/' .env.local

# 生成随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 限制文件权限
chmod 600 .env.local
chown www-data:www-data .env.local
```

### 2. Nginx反向代理

```nginx
# /etc/nginx/sites-available/web3-core

server {
    listen 80;
    server_name dashboard.example.com;

    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dashboard.example.com;

    # SSL证书
    ssl_certificate /etc/letsencrypt/live/dashboard.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.example.com/privkey.pem;

    # SSL配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Gzip压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 代理到Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval';" always;
}
```

```bash
# 启用配置
ln -s /etc/nginx/sites-available/web3-core /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 3. SSL证书（Let's Encrypt）

```bash
# 安装Certbot
apt install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d dashboard.example.com

# 自动续期
certbot renew --dry-run
```

### 4. 防火墙配置

```bash
# UFW（Ubuntu）
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw enable

# 只允许内网访问Node.js端口
ufw allow from 127.0.0.1 to any port 3000
```

### 5. 监控配置

```bash
# 安装监控工具
npm install -g pm2
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true

# 启用监控
pm2 monitor
```

### 6. 数据库优化

```bash
# SQLite优化
sqlite3 data/web3-core.db <<EOF
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=MEMORY;
VACUUM;
EOF

# 定期备份
0 2 * * * /usr/bin/sqlite3 /path/to/web3-core.db ".backup '/backup/web3-core-$(date +\%Y\%m\%d).db'"
```

### 7. CDN加速（可选）

```html
<!-- 使用CDN加载Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

<!-- 使用CDN加载其他库 -->
<!-- 在dashboard.html中已配置 -->
```

---

## 📊 性能基准

### 目标指标

| 指标         | 目标值  | 说明             |
| ------------ | ------- | ---------------- |
| **页面加载** | < 2秒   | 首次加载完成时间 |
| **API响应**  | < 500ms | 平均响应时间     |
| **并发请求** | 100+    | 同时处理请求数   |
| **内存使用** | < 200MB | 单实例内存占用   |
| **CPU使用**  | < 50%   | 正常负载CPU      |

### 压测命令

```bash
# 安装Apache Bench
apt install apache2-utils

# API压测
ab -n 1000 -c 10 http://localhost:3000/api/status

# 页面压测
ab -n 500 -c 5 http://localhost:3000/extensions/web3-core/dashboard.html
```

---

## 📚 相关文档

- [用户使用手册](./user-guide.md)
- [API文档](./api-documentation.md)
- [开发指南](./development-guide.md)
- [Week 4总结报告](./reports/week4-complete.md)

---

## 🆘 获取帮助

### 技术支持

- **Issue Tracker**: https://github.com/yourorg/openclaw/issues
- **邮件**: support@example.com
- **企业微信群**: OpenClaw技术支持群

### 常见问题

- FAQ文档: [docs/faq.md](./faq.md)
- Troubleshooting: 见上方"故障排查"章节

---

## 📝 更新日志

### v1.0.0-beta (2026-02-21)

- ✅ 初始Beta版本发布
- ✅ Dashboard完整功能
- ✅ 监控告警系统
- ✅ Dispute机制
- ✅ 完整文档

---

**部署指南版本**: v1.0.0  
**最后更新**: 2026-02-21  
**维护者**: OpenClaw Team
