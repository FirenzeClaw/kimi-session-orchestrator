#!/usr/bin/env bash
# Loop Engineering 完整性验证脚本
# 检查 components.json 中列出的每个 loop 组件对应的源文件是否存在

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

PASS=0
FAIL=0

check_file() {
  local label="$1"
  local path="$2"
  if [ -f "$path" ]; then
    echo "  [PASS] $label"
    ((PASS++)) || true
  else
    echo "  [FAIL] $label — 文件不存在: $path"
    ((FAIL++)) || true
  fi
}

check_grep() {
  local label="$1"
  local path="$2"
  local pattern="$3"
  if [ -f "$path" ]; then
    if grep -q "$pattern" "$path"; then
      echo "  [PASS] $label"
      ((PASS++)) || true
    else
      echo "  [FAIL] $label — 在 $path 中未找到匹配: $pattern"
      ((FAIL++)) || true
    fi
  else
    echo "  [FAIL] $label — 文件不存在: $path"
    ((FAIL++)) || true
  fi
}

echo "===== Loop Engineering 完整性验证 ====="
echo ""

echo "1. grade_step 工具（LLM 自动评分）"
check_file "grade_step 工具" "src/tools/grade-step.ts"
echo ""

echo "2. loop 指纹检测（workflow-engine.ts）"
check_grep "loop 指纹检测" "src/workflow-engine.ts" "fingerprint"
echo ""

echo "3. 堵塞检测系统（BLOCKAGE_PATTERNS）"
check_grep "堵塞检测系统" "src/workflow-engine.ts" "BLOCKAGE_PATTERNS"
echo ""

echo "4. guide 分层文件（7 个 guide-loop-*.md）"
GUIDE_FILES=(
  "docs/guide-loop-overview.md"
  "docs/guide-loop-grade.md"
  "docs/guide-loop-detection.md"
  "docs/guide-loop-blockage.md"
  "docs/guide-loop-recovery.md"
  "docs/guide-loop-patterns.md"
  "docs/guide-loop-metrics.md"
)
for gf in "${GUIDE_FILES[@]}"; do
  check_file "  guide 文件: $gf" "$gf"
done
echo ""

echo "5. continue_workflow 决策工具"
check_file "continue_workflow" "src/tools/continue-workflow.ts"
echo ""

echo "===== 结果汇总 ====="
echo "通过: $PASS"
echo "失败: $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "全部验证通过！"
  exit 0
else
  echo "存在 $FAIL 项验证失败，请检查上述 FAIL 项。"
  exit 1
fi
