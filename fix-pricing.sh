#!/bin/bash

# 修复 pricing.ts 导入问题 - 移除不需要的导入
cd extensions/market-core/src/market/handlers

# 备份文件
cp pricing.ts pricing.ts.bak

# 移除requireString和requireNumber的导入（这些函数不存在）
sed -i '/requireString,/d' pricing.ts
sed -i '/requireNumber,/d' pricing.ts

# 移除pricing store相关的调用（功能未实现）
# 将这些调用注释掉或使用备用方案

echo "修复pricing.ts导入问题"
