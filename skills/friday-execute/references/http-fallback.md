# HTTP Fallback — Execution and MR Tools

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
| `execute_coding_plan` | `plan_id`, `version_id`, `branch_name`, `target_branch`, `retry_of_execution_id`, `timeout_seconds` | `execution_id`, `status`, `branch_name`, `target_branch`, `commit_sha`, `file_changes`, `test_results`, `push_result`, `last_diff`, `runner_logs`, `recovery_state`, `error`, `run_id` |
| `get_coding_execution` | `execution_id` | same fields as `execute_coding_plan` |
| `summarize_branch` | `execution_id`, `repository_id`, `source_branch`, `target_branch`, `max_files` | `summary`, `mr_draft`, `run_id` |
| `create_merge_request` | `execution_id`, `repository_id`, `source_branch`, `target_branch`, `title`, `description`, `reviewer_usernames`, `remove_source_branch` | `mr`, `execution_status`, `run_id` |

## MR Retry Rules

- MR failure after a successful push: preserve `source_branch`, `target_branch`, `commit_sha`, and `mr_error`. Retry only `create_merge_request` after the platform issue is fixed; never rerun `execute_coding_plan` for an MR-only failure.
- `git_platform_error`: check Git credentials in Friday, branch existence, permissions, or an already-open MR for the same branches.

## Errors

Errors use `{ "error_code": "...", "detail": "..." }`. `authentication_failed` / `authentication_required` means the Access Token must be created or rotated — see `friday-setup`.
