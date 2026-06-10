---
name: friday-learn
description: "Use when the user wants to record a completed Friday task as a reusable LearningCase, or search past LearningCases for similar requirements or bug fixes before starting new work. Friday's cross-task memory."
---

# Friday Learn

Create and search LearningCase memory so future similar requirements reuse past evidence. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first.

## Steps

### Record (after execution completes or partially completes)

1. `create_learning_case` with `technical_plan_id`, `outcome`, `root_cause`, `solution_notes`, and verified `tests`.
2. Store `learning_case_id` and include it in the final report.

### Search (before planning new work)

1. `search_learning_cases` with a `query` built from the requirement title/description; narrow with `work_item_type`, `repo_hints`, `file_hints`, `symbol_hints`, `limit`.
2. Feed relevant results into `friday-plan` or `friday-feishu-plan` as `similar_cases`.

## Output

Record: `learning_case_id` and a one-line case summary. Search: ranked similar cases with their outcomes and solution notes, plus `run_id`.

## Guardrails

- Record honestly: `outcome` reflects what actually happened (success / partial / failed), not the intended result.
- LearningCase creation failure does not invalidate execution output — retry after fixing the reported issue.
- Search before plan is cheap and often decisive; prefer running it for any non-trivial requirement.

## HTTP Fallback

`POST {FRIDAY_BASE_URL}/api/mcp/tools/create_learning_case/` and `.../search_learning_cases/` with Bearer auth; propagate `run_id` via `X-Friday-Run-ID`.
