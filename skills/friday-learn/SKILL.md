---
name: friday-learn
description: "当用户要把完成的 Friday 任务记录为可复用的 LearningCase，或在开始新工作前检索历史 LearningCase 找相似需求/缺陷修复经验时使用。Friday 的跨任务记忆。"
---

# Friday Learn

创建与检索 LearningCase 记忆，让未来的相似需求复用历史证据。使用 `friday` MCP server 工具。

## 前置门槛

看不到 `friday` MCP 工具，或调用返回 401/403，先走 `friday-setup` 技能。

## 步骤

### 记录（执行完成或部分完成后）

1. `create_learning_case`，传 `technical_plan_id`、`outcome`、`root_cause`、`solution_notes` 和已验证的 `tests`。
2. 保存 `learning_case_id` 并写进最终报告。

### 检索（规划新工作前）

1. `search_learning_cases`，用需求标题/描述构造 `query`；用 `work_item_type`、`repo_hints`、`file_hints`、`symbol_hints`、`limit` 收窄范围。
2. 把相关结果作为 `similar_cases` 喂给 `friday-code` 阶段三或 `friday-feishu` 阶段二。

## 输出

记录：`learning_case_id` 和一行案例摘要。检索：按相关度排序的相似案例及其结果和解法笔记，外加 `run_id`。

## 护栏

- 诚实记录：`outcome` 反映实际发生的结果（success / partial / failed），不是预期结果。
- LearningCase 创建失败不影响执行产出的有效性——修复报告的问题后重试即可。
- "先检索再规划"成本极低、常常决定方向；任何非平凡需求都建议先跑一次检索。

## HTTP 兜底

`POST {FRIDAY_BASE_URL}/api/mcp/tools/create_learning_case/` 与 `.../search_learning_cases/` + Bearer 认证；`run_id` 通过 `X-Friday-Run-ID` 头传递。
