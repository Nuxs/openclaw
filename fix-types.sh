#!/bin/bash

# 修复 facade.ts 的类型问题
sed -i 's/params,$/params: params as Record<string, unknown>,/g' extensions/market-core/src/facade.ts
sed -i 's/{ success, \.\.\.data }/{ success, ...(data || {}) }/g' extensions/market-core/src/facade.ts

# 修复 market-assistant.ts 的类型问题
sed -i 's/import { OpenClawRuntime } from "@openclaw\/core";/\/\/ import { OpenClawRuntime } from "@openclaw\/core";/g' extensions/market-core/src/market-assistant.ts
sed -i 's/\.map((r, i)/\.map((r: any, i: number)/g' extensions/market-core/src/market-assistant.ts
sed -i 's/\.map((resource)/\.map((resource: any)/g' extensions/market-core/src/market-assistant.ts
sed -i 's/\.filter((o)/\.filter((o: any)/g' extensions/market-core/src/market-assistant.ts
sed -i 's/\.reduce((sum, o)/\.reduce((sum: number, o: any)/g' extensions/market-core/src/market-assistant.ts
sed -i 's/(item) =>/(item: any) =>/g' extensions/market-core/src/market-assistant.ts
sed -i 's/(o, i) =>/(o: any, i: number) =>/g' extensions/market-core/src/market-assistant.ts

echo "修复完成"
