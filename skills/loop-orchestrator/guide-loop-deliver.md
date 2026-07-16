# 交付与归档

> 加载触发：阶段 5 交付时 Read。
> ⚠️ memory_archive 调用失败时先执行 guide-loop-core.md §9 断连恢复流程。

---

## §1 交付条件

全部验收标准 grade_step PASS。若仍有 FAIL → 回到阶段 2 继续修复。

## §2 归档

```
memory_archive(session_id)
  → session/<sid>/findings → project/learnings
```

## §3 最终报告

```
模块汇总:
  ✅ user-service.ts: 5/5 PASS
  ✅ calculator.ts: 5/5 PASS (含 1 修复)

修复历史:
  getAdultUsers: 未过滤 inactive → 已修复
  deleteUser: 缺参数校验 → 已修复
  updateUser: 缺 email 唯一性 + age 校验 → 已修复

记忆沉淀: 3 条 findings → project/learnings
```
