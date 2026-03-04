#!/usr/bin/env bash
set -euo pipefail

# Local smoke checks for upstream sync hardening.
# Not part of CI; run manually when changing:
# - private/scripts/sync-upstream.sh
# - private/scripts/predict-conflicts.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

pass() {
  echo "✅ $1"
}

fail() {
  echo "❌ $1"
  exit 1
}

test_labeler_union_stage_merge() {
  local tmp_repo
  tmp_repo="$(mktemp -d)"

  (
    cd "$tmp_repo"
    git init -q
    git config user.email "smoke@example.com"
    git config user.name "smoke"

    mkdir -p .github
    cat > .github/labeler.yml <<'EOF'
"extensions: base":
  - changed-files:
      - any-glob-to-any-file:
          - "extensions/base/**"
EOF

    git add .github/labeler.yml
    git commit -q -m "base"

    git checkout -q -b ours
    cat > .github/labeler.yml <<'EOF'
"extensions: base":
  - changed-files:
      - any-glob-to-any-file:
          - "extensions/base/**"
"extensions: web3-core":
  - changed-files:
      - any-glob-to-any-file:
          - "extensions/web3-core/**"
EOF
    git commit -q -am "ours add web3-core"

    git checkout -q -b theirs HEAD~1
    cat > .github/labeler.yml <<'EOF'
"extensions: base":
  - changed-files:
      - any-glob-to-any-file:
          - "extensions/base/**"
"extensions: acpx":
  - changed-files:
      - any-glob-to-any-file:
          - "extensions/acpx/**"
EOF
    git commit -q -am "theirs add acpx"

    git checkout -q ours
    if git merge theirs --no-edit >/dev/null 2>&1; then
      fail "预期产生 labeler merge 冲突，但未发生"
    fi

    local base_stage ours_stage theirs_stage merged_stage
    base_stage="$(mktemp)"
    ours_stage="$(mktemp)"
    theirs_stage="$(mktemp)"
    merged_stage="$(mktemp)"

    git show ":1:.github/labeler.yml" >"$base_stage"
    git show ":2:.github/labeler.yml" >"$ours_stage"
    git show ":3:.github/labeler.yml" >"$theirs_stage"

    cp "$ours_stage" "$merged_stage"
    git merge-file --union "$merged_stage" "$base_stage" "$theirs_stage" >/dev/null 2>&1

    if grep -qE '^(<<<<<<<|=======|>>>>>>>)' "$merged_stage"; then
      fail "labeler union 后仍残留冲突标记"
    fi

    if ! grep -q '"extensions: web3-core":' "$merged_stage"; then
      fail "labeler union 结果缺少 ours key"
    fi

    if ! grep -q '"extensions: acpx":' "$merged_stage"; then
      fail "labeler union 结果缺少 theirs key"
    fi

    rm -f "$base_stage" "$ours_stage" "$theirs_stage" "$merged_stage"
  )

  rm -rf "$tmp_repo"
  pass "labeler stage-based union merge"
}

test_legacy_predict_fallback() {
  local tmp_repo
  tmp_repo="$(mktemp -d)"

  (
    cd "$tmp_repo"
    git init -q
    git config user.email "smoke@example.com"
    git config user.name "smoke"

    echo "base" > shared.txt
    echo "base" > ours_only.txt
    echo "base" > theirs_only.txt

    git add .
    git commit -q -m "base"

    git checkout -q -b ours
    echo "ours" > shared.txt
    echo "ours" > ours_only.txt
    git commit -q -am "ours changes"

    git checkout -q -b theirs HEAD~1
    echo "theirs" > shared.txt
    echo "theirs" > theirs_only.txt
    git commit -q -am "theirs changes"

    local base ours_changed theirs_changed intersection
    base="$(git merge-base ours theirs)"
    ours_changed="$(mktemp)"
    theirs_changed="$(mktemp)"
    intersection="$(mktemp)"

    git diff --name-only "$base" ours | sort -u >"$ours_changed"
    git diff --name-only "$base" theirs | sort -u >"$theirs_changed"
    comm -12 "$ours_changed" "$theirs_changed" >"$intersection"

    if [[ "$(cat "$intersection")" != "shared.txt" ]]; then
      echo "--- intersection content ---"
      cat "$intersection"
      fail "旧版 fallback 交集预测异常（期望仅 shared.txt）"
    fi

    rm -f "$ours_changed" "$theirs_changed" "$intersection"
  )

  rm -rf "$tmp_repo"
  pass "legacy predict fallback (diff intersection)"
}

test_verify_sync_architecture() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  local baseline pass_json fail_json report_json
  baseline="$tmp_dir/baseline.json"
  pass_json="$tmp_dir/pass.json"
  fail_json="$tmp_dir/fail.json"
  report_json="$tmp_dir/report.json"

  cat > "$baseline" <<'EOF'
{
  "thresholds": {
    "maxTotalPredictedConflicts": 3,
    "maxOtherPredictedConflicts": 1,
    "maxHotspotConflicts": 1,
    "maxHotspotOtherConflicts": 0
  },
  "hotspots": {
    "exact": ["ui/src/ui/tab-registry.ts"],
    "prefixes": []
  },
  "allowlist": {
    "otherConflictExact": [".github/labeler.yml"],
    "otherConflictPrefixes": []
  }
}
EOF

  cat > "$pass_json" <<'EOF'
{
  "predicted": {
    "total": 2,
    "brand": 1,
    "other": 1,
    "files": ["apps/macos/Info.plist", ".github/labeler.yml"],
    "brandFiles": ["apps/macos/Info.plist"],
    "otherFiles": [".github/labeler.yml"]
  }
}
EOF

  if ! bash "$ROOT_DIR/private/scripts/verify-sync-architecture.sh" \
    --baseline "$baseline" \
    --conflicts-json "$pass_json" \
    --json-only \
    --report-json "$report_json" | grep -q '"status":"pass"'; then
    fail "verify-sync-architecture 通过场景失败"
  fi

  cat > "$fail_json" <<'EOF'
{
  "predicted": {
    "total": 2,
    "brand": 0,
    "other": 2,
    "files": ["ui/src/ui/tab-registry.ts", "src/commands/status.command.ts"],
    "brandFiles": [],
    "otherFiles": ["ui/src/ui/tab-registry.ts", "src/commands/status.command.ts"]
  }
}
EOF

  if bash "$ROOT_DIR/private/scripts/verify-sync-architecture.sh" \
    --baseline "$baseline" \
    --conflicts-json "$fail_json" \
    --strict \
    --json-only >/dev/null 2>&1; then
    fail "verify-sync-architecture 严格失败场景未返回非零"
  fi

  rm -rf "$tmp_dir"
  pass "verify sync architecture (pass/fail)"
}

main() {
  echo "Running sync/predict smoke checks..."
  test_labeler_union_stage_merge
  test_legacy_predict_fallback
  test_verify_sync_architecture
  pass "all smoke checks passed"
}

main
