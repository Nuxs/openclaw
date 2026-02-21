#!/bin/bash

# 修复monitor handlers的函数签名
cd extensions/web3-core/src/monitor

# 修改返回的handler函数，使其符合 GatewayRequestHandler 类型
# GatewayRequestHandler接收一个opts参数：(opts: GatewayRequestHandlerOptions) => Promise<void> | void

cat > handlers-fix.sed << 'SEDEOF'
# 将原来的 (params, _opts) 改为 (opts)
s/return async (params, _opts)/return async (opts/g
s/return async (_params, _opts)/return async (opts/g

# 更改参数访问方式
s/params\.timeRange/opts.params.timeRange/g
s/params\.metricType/opts.params.metricType/g
s/params\.from/opts.params.from/g
s/params\.to/opts.params.to/g

# 修正respond调用
s/respond(/opts.respond(/g
SEDEOF

sed -i -f handlers-fix.sed handlers.ts

echo "修复monitor handlers完成"
