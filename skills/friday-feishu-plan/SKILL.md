---
name: friday-feishu-plan
description: "Use when the user wants Friday to generate a technical plan for a Feishu work item and write it back as a Feishu document and comment. Produces technical_plan_id and the repository task matrix consumed by friday-feishu-execute."
---

# Friday Feishu Plan

Turn a fetched work item context into a technical plan document with a repository task matrix, written back to Feishu. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first. Feishu Docs app credentials and `feishu_doc_folder_token` must be configured in Friday for document creation.

## Prerequisites

A `context_id` from `friday-feishu-context`. Reuse the same `run_id`.

## Steps

1. Optional but recommended: `search_learning_cases` with the work item title/description and repo/file hints — similar past cases improve the plan.
2. Optional: codebase evidence via `route_repositories` / `search_rag_chunks` when repository targets are unclear (see `friday-discover` / `friday-analyze`).
3. `create_feishu_technical_plan` with `context_id`, plus `repository_ids` or `repo_hints`, `context_chunks`, and `similar_cases`. Control writeback with `create_document` / `write_comment` / `folder_token`.
4. Store `technical_plan_id`, the document URL, the repository task matrix, `status`, and `retry_state`.

## Output

Report: plan summary, repository task matrix (repo -> task), Feishu document URL, comment status, `technical_plan_id`, and `run_id`.

## Guardrails

- Document creation failed but plan generation succeeded (`status: partial`): keep going — the plan and matrix are valid; report the writeback retry state.
- An empty or missing repository task matrix blocks execution: re-run with explicit `repository_ids` before handing off to `friday-feishu-execute`.
- Never expose Feishu plugin secrets or app secrets; they live server-side in Friday.

## HTTP Fallback

`POST {FRIDAY_BASE_URL}/api/mcp/tools/create_feishu_technical_plan/` with Bearer auth; propagate `run_id` via `X-Friday-Run-ID`.
