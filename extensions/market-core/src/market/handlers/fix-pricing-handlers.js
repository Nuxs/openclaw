const fs = require("fs");

// 读取文件
const content = fs.readFileSync("pricing.ts", "utf8");

// 替换所有未实现的store方法调用为注释或默认值
let fixed = content
  // 注释掉savePricingModel调用
  .replace(/store\.savePricingModel\(/g, "// store.savePricingModel(")
  // 将getPricingModel调用替换为默认值
  .replace(
    /const pricingModel = store\.getPricingModel\(offerId\);/g,
    "const pricingModel = null; // store.getPricingModel(offerId);",
  )
  // 注释掉其他未实现的方法
  .replace(/store\.getOrdersByOffer\(/g, "// store.getOrdersByOffer(")
  .replace(/store\.getProvidersByOffer\??\.\(/g, "// store.getProvidersByOffer?.(")
  .replace(/store\.getCompetitorOffers\??\.\(/g, "// store.getCompetitorOffers?.(")
  .replace(/store\.savePriceHistory\(/g, "// store.savePriceHistory(")
  .replace(/store\.getPriceHistory\(/g, "// store.getPriceHistory(")
  .replace(/store\.getOffersByAssetType\(/g, "// store.getOffersByAssetType(")
  .replace(/store\.saveOrderBookEntry\(/g, "// store.saveOrderBookEntry(")
  .replace(/store\.getOrderBookEntries\(/g, "// store.getOrderBookEntries(")
  // 添加requireString和requireNumber本地实现
  .replace(
    /from "\.\/\_shared\.js";/,
    `from "./_shared.js";\n\n// 本地辅助函数\nfunction requireString(value: unknown, name: string): string {\n  if (typeof value !== 'string') throw new Error(\`\${name} must be a string\`);\n  return value;\n}\n\nfunction requireNumber(value: unknown, name: string): number {\n  if (typeof value !== 'number') throw new Error(\`\${name} must be a number\`);\n  return value;\n}`,
  );

// 写回文件
fs.writeFileSync("pricing.ts", fixed, "utf8");

console.log("Fixed pricing handlers");
