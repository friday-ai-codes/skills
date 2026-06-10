---
name: friday-execute
description: "Use when the user wants Friday to execute an approved coding plan, poll a running execution, summarize a pushed branch, or create a merge request from a finished execution. Drives the coding runner and MR creation."
---

# Friday Execute

Run an approved Friday coding plan through the containerized runner, then summarize the branch and create a merge request. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first.

## Prerequisites

An approved `plan_id` (and optionally `version_id`) from `friday-plan`. Repository Git credentials must be configured server-side in Friday.

## Steps

1. `execute_coding_plan` with `plan_id`, optional `version_id`, optional `branch_name` / `target_branch` / `timeout_seconds`. Store `execution_id`.
2. Poll `get_coding_execution` with `execution_id` until status is `completed`, `failed`, or `partial`. Report meaningful progress, not every poll.
3. On `completed` with a pushed branch: `summarize_branch` (`execution_id`) to get the diff summary and MR draft.
4. When the user wants an MR: `create_merge_request` with `execution_id`, title/description from the MR draft, optional `reviewer_usernames`.

## Output

Report: `execution_id`, status, branch -> target branch, `commit_sha`, push result, test results, MR URL or recovery action, and `run_id`.

## Guardrails

- Never create a merge request unless execution produced a pushed branch or the user explicitly supplied a source branch.
- Execution `failed`: report `error`, `runner_logs`, `last_diff`, `recovery_state`. Retry with `retry_of_execution_id` only when recovery is marked retryable.
- Execution `partial` (code pushed, later step failed): do not rerun coding. Retry `summarize_branch` or `create_merge_request` using the persisted branch and commit.
- `create_merge_request` returning `success: false` with `execution_status: partial`: keep branch/commit info; retry MR creation only after the reported platform issue (credentials, permissions, existing MR) is addressed.

See [references/http-fallback.md](references/http-fallback.md) for the raw HTTP contract and MR retry details.
