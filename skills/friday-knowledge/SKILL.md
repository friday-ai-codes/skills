---
name: friday-knowledge
description: "当用户要查 Friday 历史交付知识时使用：相似需求检索、实体版本时间线、关联实体扩散、历史时点 as_of 查询。覆盖「以前做过类似需求吗」「这段代码为什么这么改」等交付链路问题。"
---

# Friday Knowledge

交付知识检索 skill：从 Friday 已摄取的全链路交付实体（需求 / 技术方案 / 代码变更）中检索与追溯，**不是**代码仓库 RAG（用 `friday-code`）也**不是**任务 LearningCase 记忆（用 `friday-learn`）。

## 前置

- 已完成 `friday-setup`（PAT + MCP 或 HTTP 兜底）
- 保留工作流首个响应的 `run_id`

## 模式判定

| 用户意图 | 工具顺序 |
| --- | --- |
| 「以前做过类似 X 吗」 | `search_delivery_knowledge` |
| 「这个需求后来怎么迭代的」 | `get_entity_timeline` |
| 「从需求追到方案和 MR」 | `search` → `get_related_entities` |
| 「2026-05 时方案是什么」 | 任意工具 + `as_of` ISO8601 |

## 推荐步骤

1. **`search_delivery_knowledge`** — `query`（必填），可选 `project_ids` / `top_k` / `as_of` / `include_superseded`。保留 `run_id` 与命中 `entity_id`。
2. 对高相关命中：**`get_entity_timeline`** — `entity_id`，看版本迭代与挂接的 code_change。
3. 需要扩散关联链：**`get_related_entities`** — `entity_id`, `direction`（both/out/in）, `max_hops`（1–3）, 可选 `as_of`。

## 与相邻 skill 边界

| Skill | 数据域 |
| --- | --- |
| `friday-code` | 远端仓库代码索引（`search_rag_chunks` 等） |
| `friday-learn` | 任务级 LearningCase 经验 |
| **friday-knowledge** | 摄取后的交付实体图谱（飞书需求→方案→MR） |

## 护栏

- 引用结果中的 **provenance**（`feishu_url` / `mr_url` / `session_link`），无链接则说明「无出处」。
- 检索为空时**不要编造**历史需求或 MR。
- PAT 权限 fail-closed：无项目权限时返回空 `results`，不是 403 泄露。

## as_of 示例

用户问：「2026-05 时这个需求的方案是什么？」

```json
{
  "query": "用户登录优化",
  "project_ids": ["<project-uuid>"],
  "as_of": "2026-05-31T23:59:59+08:00"
}
```

## HTTP 兜底

MCP 不可用时见 [references/http-fallback.md](references/http-fallback.md)。
