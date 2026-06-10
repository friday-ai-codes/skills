# HTTP Fallback — Feishu Work Item Tools

When the `friday` MCP server is unusable, every tool is a plain HTTP endpoint:

```text
POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/
Authorization: Bearer {FRIDAY_ACCESS_TOKEN}
Content-Type: application/json
X-Friday-Run-ID: {run_id from first workflow call, optional on first call}
X-Friday-Skill-Step: {workflow.step, optional}
```

## Tool Contracts

| Tool | Request | Response (key fields) |
| --- | --- | --- |
| `get_feishu_work_item_context` | `project_id`, `project_key`, `work_item_type`, `work_item_id`, `fields`, `include_comments` | `context_id`, `work_item`, `relations`, `documents`, `comments`, `status`, `run_id` |
| `create_feishu_technical_plan` | `context_id`, `repository_ids`, `repo_hints`, `context_chunks`, `similar_cases`, `title`, `folder_token`, `create_document`, `write_comment` | `technical_plan_id`, `plan`, `markdown`, `repository_tasks`, `feishu_document`, `comment`, `status`, `retry_state`, `run_id` |
| `create_work_item_repo_tasks` | `technical_plan_id` | `tasks`, `total`, `run_id` |
| `execute_work_item_repo_tasks` | `technical_plan_id`, `task_ids`, `create_missing`, `dispatch`, `create_merge_requests`, `write_back`, `timeout_seconds`, `reviewer_usernames` | `tasks`, `summary`, `document_update`, `comment`, `status`, `run_id` |

## Multi-Repo Task Rules

- Each repo task carries its own `execution_id`, branch, commit, push, and MR state — never collapse them into one status.
- Dispatch failed: the task is recoverable from `execution_id`, branch, and `recovery_state`; retry that task only.
- MR failed after push: retry MR creation for that task using persisted branch/commit; never redispatch coding for an MR-only failure.

## Errors

Errors use `{ "error_code": "...", "detail": "..." }`. `authentication_failed` means the Access Token must be created or rotated — see `friday-setup`. Feishu credential errors are fixed in Friday settings, not locally.
