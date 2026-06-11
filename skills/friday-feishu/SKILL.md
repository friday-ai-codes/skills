---
name: friday-feishu
description: "当用户给出飞书项目（Feishu Project）工作项——需求或缺陷——并希望 Friday 处理时使用：读取工作项上下文与关联文档、生成技术方案并回写飞书、把方案的多仓任务矩阵执行成 PR/MR 并回写结果，或一条龙全自动跑完整个闭环。"
---

# Friday Feishu

从一个飞书工作项到回写完成的 PR/MR 的完整流水线，按阶段分节。用户只要某一个阶段就停在那个阶段；用户要的是闭环结果，就按"一条龙模式"跑完。执行单元是工作项，看板只是入口视图。全程使用 `friday` MCP server 工具。

## 前置门槛

看不到 `friday` MCP 工具，或调用返回 401/403，先走 `friday-setup` 技能。此外：

- 读工作项需要飞书项目插件凭证已在 Friday 服务端配置；
- 创建方案文档需要飞书 Docs 应用凭证和 `feishu_doc_folder_token`；
- 执行需要仓库 Git 凭证。

凭证缺失时给出指向 Friday 设置页的具体清单，不要在本地重试。

## 模式判定

| 用户意图 | 跑到哪 |
| --- | --- |
| "看看这个工作项 / 把需求和关联文档拉出来" | 阶段一 |
| "给这个工作项出技术方案并回写飞书" | 阶段二 |
| "方案已有，把多仓任务跑了、建 MR、回写结果" | 阶段三 |
| 给了工作项，要的是闭环结果 | 一条龙模式 |

第一个成功响应返回的 `run_id` 全程保留；`context_id`、`technical_plan_id` 跨阶段传递。

## 阶段一 — 读工作项上下文

1. 从用户输入解析工作项引用（URL，或 项目 + 类型 + ID）。
2. `get_feishu_work_item_context`，传 `project_id`/`project_key`、`work_item_type`、`work_item_id`，可选 `fields`、`include_comments`。
3. 保存 `run_id`、`context_id`、工作项源 URL、文档读取状态、关联关系摘要。

护栏：

- 文档状态 `partial`：缺失文档不阻塞用户目标时继续；否则报告确切缺失的权限或配置。
- 保留 `context_id`——阶段二要用。

## 阶段二 — 技术方案

前置：阶段一的 `context_id`，复用同一个 `run_id`。

1. 推荐先做：`search_learning_cases`，用工作项标题/描述加仓库/文件提示检索——相似历史案例显著提升方案质量。
2. 可选：仓库目标不明确时，用 `route_repositories` / `search_rag_chunks` 补代码证据（流程同 `friday-code` 阶段一/二）。
3. `create_feishu_technical_plan`，传 `context_id`，加 `repository_ids` 或 `repo_hints`、`context_chunks`、`similar_cases`；用 `create_document` / `write_comment` / `folder_token` 控制回写。
4. 保存 `technical_plan_id`、文档 URL、仓库任务矩阵、`status`、`retry_state`。

护栏：

- 文档创建失败但方案生成成功（`status: partial`）：继续——方案和任务矩阵有效，报告回写重试状态即可。
- 仓库任务矩阵为空会阻塞执行：先带明确的 `repository_ids` 重跑，再交给阶段三。
- 绝不暴露飞书插件 secret 或应用 secret——它们都在 Friday 服务端。

## 阶段三 — 多仓执行与回写

前置：任务矩阵非空的 `technical_plan_id`（来自阶段二），复用同一个 `run_id`。

1. `create_work_item_repo_tasks`，传 `technical_plan_id`——任务已存在时跳过。
2. `execute_work_item_repo_tasks`，传 `technical_plan_id`，可选 `task_ids`、`create_merge_requests`、`write_back`、`reviewer_usernames`、`timeout_seconds`。
3. 长任务用 `get_coding_execution` 轮询对应的 `execution_id`。
4. 每个仓库任务的状态单独跟踪：分支、commit、推送、MR 状态逐仓报告，绝不合并成一个状态。

护栏：

- 没有任务矩阵绝不执行——退回阶段二。
- 单仓失败不得中断其他仓库，保留部分成功。
- 执行完成但 MR 失败：用已持久化的分支/commit 重试 `summarize_branch` / `create_merge_request`，不要重跑编码。
- 回写失败不影响执行结果有效性，报告重试状态即可。

## 一条龙模式

按 阶段一 → `search_learning_cases` → 阶段二 → 阶段三 → `create_learning_case`（记录结果、根因、解法、已验证测试，见 `friday-learn`）顺序跑完，全程共用第一个 `run_id`。

只在以下情况停下来问用户，其余一律继续：

- 工作项或必需文档因权限不可读；
- 带明确 `repository_ids` 仍生成不出任务矩阵；
- 所有仓库任务都失败且没有可重试的恢复状态。

部分失败不停流水线：单仓失败不影响其他仓库；文档回写失败不阻塞执行；LearningCase 失败不影响结果有效性。

最终报告：逐仓任务的分支、commit、推送、MR URL 或恢复动作；外加技术方案文档 URL、飞书回写状态、`learning_case_id`、`context_id`、`technical_plan_id`、`run_id`。

## HTTP 兜底

MCP 不可用时，所有工具都是 `POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/` + Bearer 认证；`run_id` 通过 `X-Friday-Run-ID` 头传递。完整契约与多仓任务规则见 [references/http-fallback.md](references/http-fallback.md)。
