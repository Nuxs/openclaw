#!/usr/bin/env bash
# ============================================================================
# verify-sync-architecture.sh — 校验私有 fork 合流架构是否健康
# ============================================================================
# 用法:
#   bash private/scripts/verify-sync-architecture.sh \
#     --conflicts-json /tmp/predict.json
#
#   bash private/scripts/verify-sync-architecture.sh \
#     --pin-json private/upstream-pin.json --strict --phase ci
#
# 说明:
# - 支持两种输入来源：predict-conflicts --json 或 upstream-pin.json。
# - 输出：人可读文本 + 可选 JSON 文件；--json-only 仅输出 JSON。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

BASELINE_PATH="private/sync-guardrails/baseline.json"
CONFLICTS_JSON_PATH=""
PIN_JSON_PATH=""
REPORT_JSON_PATH=""
PHASE="local"
STRICT=false
JSON_ONLY=false

usage() {
  cat <<'EOF'
用法: verify-sync-architecture.sh [options]

必选其一:
  --conflicts-json <path>   predict-conflicts.sh --json 的输出文件
  --pin-json <path>         private/upstream-pin.json（读取其中 conflicts.predicted）

可选:
  --baseline <path>         基线文件（默认 private/sync-guardrails/baseline.json）
  --report-json <path>      将结构化报告写入文件
  --phase <name>            阶段标识（preflight/postsync/ci/local）
  --strict                  失败时返回非零退出码
  --json-only               仅输出 JSON（不打印文本摘要）
  -h, --help                显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --baseline)
      BASELINE_PATH="$2"
      shift 2
      ;;
    --conflicts-json)
      CONFLICTS_JSON_PATH="$2"
      shift 2
      ;;
    --pin-json)
      PIN_JSON_PATH="$2"
      shift 2
      ;;
    --report-json)
      REPORT_JSON_PATH="$2"
      shift 2
      ;;
    --phase)
      PHASE="$2"
      shift 2
      ;;
    --strict)
      STRICT=true
      shift
      ;;
    --json-only)
      JSON_ONLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$CONFLICTS_JSON_PATH" && -z "$PIN_JSON_PATH" ]]; then
  echo "❌ 请提供 --conflicts-json 或 --pin-json"
  exit 1
fi

if [[ -n "$CONFLICTS_JSON_PATH" && -n "$PIN_JSON_PATH" ]]; then
  echo "❌ --conflicts-json 与 --pin-json 只能二选一"
  exit 1
fi

if [[ ! -f "$BASELINE_PATH" ]]; then
  echo "❌ 基线文件不存在: $BASELINE_PATH"
  exit 1
fi

SOURCE_PATH="$CONFLICTS_JSON_PATH"
SOURCE_TYPE="predict"
if [[ -n "$PIN_JSON_PATH" ]]; then
  SOURCE_PATH="$PIN_JSON_PATH"
  SOURCE_TYPE="pin"
fi

if [[ ! -f "$SOURCE_PATH" ]]; then
  echo "❌ 输入文件不存在: $SOURCE_PATH"
  exit 1
fi

report_json="$(BASELINE_PATH="$BASELINE_PATH" SOURCE_PATH="$SOURCE_PATH" SOURCE_TYPE="$SOURCE_TYPE" PHASE="$PHASE" node - <<'NODE'
const fs = require("node:fs");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toArray(value) {
  return Array.isArray(value) ? value.filter((x) => typeof x === "string") : [];
}

function normalizePath(value) {
  return value.replaceAll("\\\\", "/");
}

function uniq(values) {
  return [...new Set(values)];
}

function startsWithAny(target, prefixes) {
  return prefixes.some((prefix) => target.startsWith(prefix));
}

function includesAny(target, exacts) {
  return exacts.includes(target);
}

function resolvePredicted(sourceType, sourceJson) {
  if (sourceType === "pin") {
    return sourceJson?.conflicts?.predicted ?? null;
  }
  return sourceJson?.predicted ?? null;
}

const baselinePath = process.env.BASELINE_PATH;
const sourcePath = process.env.SOURCE_PATH;
const sourceType = process.env.SOURCE_TYPE;
const phase = process.env.PHASE;

const baseline = readJson(baselinePath);
const source = readJson(sourcePath);
const predicted = resolvePredicted(sourceType, source);

if (!predicted) {
  const payload = {
    status: "fail",
    meta: {
      phase,
      sourceType,
      sourcePath,
      baselinePath,
      generatedAt: new Date().toISOString(),
    },
    summary: {
      total: 0,
      brand: 0,
      otherRaw: 0,
      otherEffective: 0,
      hotspotsTotal: 0,
      hotspotsOtherEffective: 0,
    },
    violations: [
      {
        code: "MISSING_PREDICTED_DATA",
        message: "输入缺少 conflicts.predicted / predicted 字段，无法执行合流架构验证。",
      },
    ],
    recommendations: [
      "先运行 predict-conflicts.sh --json，或确保 upstream-pin.json 包含 conflicts.predicted。",
    ],
    files: {
      all: [],
      brand: [],
      otherRaw: [],
      otherEffective: [],
      hotspots: [],
      hotspotOtherEffective: [],
    },
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(0);
}

const files = uniq(toArray(predicted.files).map(normalizePath));
const brandFiles = uniq(toArray(predicted.brandFiles).map(normalizePath));
const otherFilesRawInput = toArray(predicted.otherFiles).map(normalizePath);
const otherFilesRaw = uniq(otherFilesRawInput.length > 0 ? otherFilesRawInput : files.filter((f) => !brandFiles.includes(f)));

const thresholds = baseline.thresholds ?? {};
const allowlist = baseline.allowlist ?? {};
const hotspots = baseline.hotspots ?? {};

const allowExact = toArray(allowlist.otherConflictExact).map(normalizePath);
const allowPrefixes = toArray(allowlist.otherConflictPrefixes).map(normalizePath);
const hotspotExact = toArray(hotspots.exact).map(normalizePath);
const hotspotPrefixes = toArray(hotspots.prefixes).map(normalizePath);

const otherEffective = otherFilesRaw.filter((f) => {
  if (includesAny(f, allowExact)) return false;
  if (startsWithAny(f, allowPrefixes)) return false;
  return true;
});

const hotspotFiles = files.filter((f) => includesAny(f, hotspotExact) || startsWithAny(f, hotspotPrefixes));
const hotspotOtherEffective = otherEffective.filter((f) => includesAny(f, hotspotExact) || startsWithAny(f, hotspotPrefixes));

const summary = {
  total: files.length,
  brand: brandFiles.length,
  otherRaw: otherFilesRaw.length,
  otherEffective: otherEffective.length,
  hotspotsTotal: hotspotFiles.length,
  hotspotsOtherEffective: hotspotOtherEffective.length,
};

const violations = [];

function checkLimit(code, actual, limit, message, samples) {
  if (typeof limit !== "number") return;
  if (actual <= limit) return;
  violations.push({ code, message, actual, limit, samples: samples.slice(0, 10) });
}

checkLimit(
  "TOTAL_CONFLICTS_EXCEEDED",
  summary.total,
  thresholds.maxTotalPredictedConflicts,
  "预测冲突总量超过阈值，说明合流成本上升。",
  files,
);

checkLimit(
  "OTHER_CONFLICTS_EXCEEDED",
  summary.otherEffective,
  thresholds.maxOtherPredictedConflicts,
  "非品牌有效冲突超过阈值，提示差异可能从 overlay 扩散到核心实现。",
  otherEffective,
);

checkLimit(
  "HOTSPOT_CONFLICTS_EXCEEDED",
  summary.hotspotsTotal,
  thresholds.maxHotspotConflicts,
  "热点文件冲突超阈值，需检查是否破坏薄入口策略。",
  hotspotFiles,
);

checkLimit(
  "HOTSPOT_OTHER_CONFLICTS_EXCEEDED",
  summary.hotspotsOtherEffective,
  thresholds.maxHotspotOtherConflicts,
  "热点文件出现非品牌有效冲突，通常表示 overlay-first 退化。",
  hotspotOtherEffective,
);

const recommendations = [];
if (violations.length === 0) {
  recommendations.push("合流架构健康：冲突面保持在可控范围，可继续按既定节奏同步。");
} else {
  recommendations.push("优先将热点文件私有逻辑下沉到叶子模块，入口只保留 import + hook/spread。",
    "将品牌差异继续迁移到运行时注入（private/brand.json + src/infra/brand.ts），避免改写核心源码。",
    "把可通用能力抽象为扩展点并回馈 upstream，逐步减薄 fork 补丁栈。",
  );
}

const payload = {
  status: violations.length === 0 ? "pass" : "fail",
  meta: {
    phase,
    sourceType,
    sourcePath,
    baselinePath,
    generatedAt: new Date().toISOString(),
    industryMappings: baseline.industryMappings ?? [],
  },
  summary,
  violations,
  recommendations,
  files: {
    all: files,
    brand: brandFiles,
    otherRaw: otherFilesRaw,
    otherEffective,
    hotspots: hotspotFiles,
    hotspotOtherEffective,
  },
};

process.stdout.write(`${JSON.stringify(payload)}\n`);
NODE
)"

if [[ -n "$REPORT_JSON_PATH" ]]; then
  mkdir -p "$(dirname "$REPORT_JSON_PATH")"
  printf '%s\n' "$report_json" >"$REPORT_JSON_PATH"
fi

if ! $JSON_ONLY; then
  REPORT_JSON="$report_json" node - <<'NODE'
const report = JSON.parse(process.env.REPORT_JSON || "{}");
const s = report.summary || {};
const v = Array.isArray(report.violations) ? report.violations : [];

console.log("");
console.log(`🔎 合流架构验证 [${report?.meta?.phase ?? "local"}]`);
console.log(`   来源: ${report?.meta?.sourceType ?? "unknown"} (${report?.meta?.sourcePath ?? "-"})`);
console.log(`   基线: ${report?.meta?.baselinePath ?? "-"}`);
console.log(`   预测冲突: total=${s.total ?? 0}, brand=${s.brand ?? 0}, other(raw)=${s.otherRaw ?? 0}, other(effective)=${s.otherEffective ?? 0}`);
console.log(`   热点触达: total=${s.hotspotsTotal ?? 0}, hotspot-other(effective)=${s.hotspotsOtherEffective ?? 0}`);

if ((v.length || 0) === 0) {
  console.log("✅ 结果: PASS（合流架构健康）");
} else {
  console.log("❌ 结果: FAIL（检测到架构退化风险）");
  for (const item of v) {
    console.log(`   - [${item.code}] ${item.message} (actual=${item.actual}, limit=${item.limit})`);
    if (Array.isArray(item.samples) && item.samples.length > 0) {
      for (const file of item.samples.slice(0, 5)) {
        console.log(`       · ${file}`);
      }
    }
  }
}

const recs = Array.isArray(report.recommendations) ? report.recommendations : [];
if (recs.length > 0) {
  console.log("");
  console.log("📌 建议:");
  for (const rec of recs) {
    console.log(`   - ${rec}`);
  }
}
NODE
fi

if $JSON_ONLY; then
  printf '%s\n' "$report_json"
fi

if $STRICT; then
  status="$(REPORT_JSON="$report_json" node - <<'NODE'
const report = JSON.parse(process.env.REPORT_JSON || "{}");
process.stdout.write(report.status === "pass" ? "pass" : "fail");
NODE
)"
  if [[ "$status" != "pass" ]]; then
    exit 2
  fi
fi
