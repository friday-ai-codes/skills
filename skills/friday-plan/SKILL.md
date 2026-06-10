---
name: friday-plan
description: "Use when the user wants Friday to create a coding plan from a requirement, revise an existing plan with feedback or review concerns, or compare plan versions before execution. Produces plan_id / version_id consumed by friday-execute."
---

# Friday Plan

Create or iterate a structured coding plan in Friday. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first.

## Prerequisites

- `repository_id` — run `friday-discover` if missing.
- For non-trivial changes, an `analysis_id` from `friday-analyze` materially improves plan quality; run it first.

## Steps

### Create

1. `create_coding_plan` with `repository_id`, `requirement`, and (when available) `analysis_id` and `context_chunks`.
2. Store `plan_id` and `version_id`. Present implementation steps, affected files, tests, and risks to the user.

### Improve (existing plan + feedback)

1. `improve_coding_plan` with `plan_id`, the user's `feedback`, and any new `context_chunks`.
2. Compare the returned `change_summary` and `risk_delta` against the previous version.
3. The newest `version_id` becomes the execution default unless the user picks an older version.

## Output

Report: plan steps summary, affected files, test plan, risks, `plan_id`, `version_id` (and `change_summary` / `risk_delta` for revisions), and `run_id`.

## Guardrails

- A plan is a proposal: do not trigger execution from this skill. Hand `plan_id` / `version_id` to `friday-execute` only when the user approves.
- If the plan exposes an obvious gap (missing migration, no rollback, untested path), surface it and offer one `improve_coding_plan` round with precise feedback.

## HTTP Fallback

Same tools as `POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/` with Bearer auth; propagate `run_id` via `X-Friday-Run-ID`.
