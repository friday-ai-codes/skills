---
name: friday-feishu-context
description: "Use when the user gives a Feishu Project work item URL/ID and wants its context: requirement details, relations, comments, or linked Feishu Docs fetched through Friday. First step of any Feishu work item flow."
---

# Friday Feishu Context

Read one Feishu Project work item plus its linked documents through Friday. The execution unit is a work item; boards are only entry views. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first. Feishu Project credentials must also be configured server-side in Friday.

## Steps

1. Parse the work item reference from the user (URL or project + type + ID).
2. `get_feishu_work_item_context` with `project_id`/`project_key`, `work_item_type`, `work_item_id`, optional `fields` and `include_comments`.
3. Store `run_id`, `context_id`, the work item source URL, document statuses, and a relation summary.

## Output

Report: work item title/type/status, requirement summary, linked documents and their read status, relations, `context_id`, and `run_id`.

## Guardrails

- Document status `partial`: continue only when missing docs are non-blocking for the user's goal; otherwise report the exact missing permission or configuration.
- Missing Feishu credentials server-side: stop with a concrete checklist (Feishu Project plugin credentials in Friday settings) instead of retrying.
- Preserve `context_id` — `friday-feishu-plan` consumes it.

## HTTP Fallback

`POST {FRIDAY_BASE_URL}/api/mcp/tools/get_feishu_work_item_context/` with Bearer auth; propagate `run_id` via `X-Friday-Run-ID`.
