# HTTP 兜底 — 飞书工作项工具

`friday` MCP server 不可用时，每个工具都是普通 HTTP 端点：

```text
POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/
Authorization: Bearer {FRIDAY_ACCESS_TOKEN}
Content-Type: application/json
X-Friday-Run-ID: {工作流首个调用返回的 run_id，首个调用可省略}
X-Friday-Skill-Step: {workflow.step，可选}
```

## 工具契约

| 工具 | 请求 | 响应（关键字段） |
| --- | --- | --- |
| `get_feishu_work_item_context` | `project_id`, `project_key`, `work_item_type`, `work_item_id`, `fields`, `include_comments` | `context_id`, `work_item`, `relations`, `documents`, `comments`, `status`, `run_id` |
| `create_feishu_technical_plan` | `context_id`, `repository_ids`, `repo_hints`, `context_chunks`, `similar_cases`, `title`, `folder_token`, `create_document`, `write_comment` | `technical_plan_id`, `plan`, `markdown`, `repository_tasks`, `feishu_document`, `comment`, `status`, `retry_state`, `run_id` |
| `create_work_item_repo_tasks` | `technical_plan_id` | `tasks`, `total`, `run_id` |
| `execute_work_item_repo_tasks` | `technical_plan_id`, `task_ids`, `create_missing`, `dispatch`, `create_merge_requests`, `write_back`, `timeout_seconds`, `reviewer_usernames` | `tasks`, `summary`, `document_update`, `comment`, `status`, `run_id` |

## 多仓任务规则

- 每个仓库任务都有自己的 `execution_id`、分支、commit、推送和 MR 状态——绝不合并成一个状态。
- 派发失败：任务可以通过 `execution_id`、分支和 `recovery_state` 恢复；只重试该任务。
- 推送后 MR 失败：用已持久化的分支/commit 只重试该任务的 MR 创建；绝不为 MR 失败重新派发编码。

## 错误

错误格式为 `{ "error_code": "...", "detail": "..." }`。`authentication_failed` 表示 Access Token 需要创建或轮换——引导用户运行 `npx -y @friday-ai-codes/mcp setup`。飞书凭证错误在 Friday 设置页修复，不在本地。
