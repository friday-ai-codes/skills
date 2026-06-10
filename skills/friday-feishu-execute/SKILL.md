---
name: friday-feishu-execute
description: "Use when a Feishu work item already has a technical plan with a repository task matrix and the user wants Friday to run the multi-repo coding tasks, create PR/MRs, and write execution results back to Feishu."
---

# Friday Feishu Execute

Fan out a technical plan's repository task matrix into coding executions, create PR/MRs, and write results back to the Feishu work item. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first. Repository Git credentials must be configured in Friday before execution.

## Prerequisites

A `technical_plan_id` whose plan contains a non-empty repository task matrix (from `friday-feishu-plan`). Reuse the same `run_id`.

## Steps

1. `create_work_item_repo_tasks` with `technical_plan_id` — skip if tasks already exist.
2. `execute_work_item_repo_tasks` with `technical_plan_id`, optional `task_ids`, `create_merge_requests`, `write_back`, `reviewer_usernames`, `timeout_seconds`.
3. For long-running tasks, poll the related `execution_id` with `get_coding_execution`.
4. Track every repo task status separately; report per-repo branch, commit, push, and MR state.

## Output

Report per repo task: status, branch -> target, commit, MR URL or recovery action; plus the Feishu writeback (document update / comment) status, `technical_plan_id`, and `run_id`.

## Guardrails

- Never execute without a repository task matrix — send the user back to `friday-feishu-plan` instead.
- One repo task failing must not abort the others; preserve partial success.
- Execution completed but MR failed: retry `summarize_branch` / `create_merge_request` with the persisted branch and commit — do not rerun coding.
- Writeback failure does not invalidate execution results; report the retry state.

See [references/http-fallback.md](references/http-fallback.md) for the raw HTTP contract and multi-repo task details.
