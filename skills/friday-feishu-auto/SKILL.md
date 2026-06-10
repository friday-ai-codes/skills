---
name: friday-feishu-auto
description: "Use when the user gives a Feishu Project work item (requirement or bug) and wants Friday to run the full loop autonomously: fetch context, generate and write back a technical plan, execute multi-repo coding tasks, write PR/MR results back, and record a LearningCase."
---

# Friday Feishu Auto

End-to-end pipeline from one Feishu work item to written-back PR/MRs plus a LearningCase. Orchestrates `friday-feishu-context` -> `friday-feishu-plan` -> `friday-feishu-execute` -> `friday-learn` under one `run_id`. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first. Feishu Project / Docs credentials and repository Git credentials must be configured in Friday.

## Pipeline

1. `get_feishu_work_item_context` — keep the first `run_id` for every later call.
2. `search_learning_cases` with the work item title/description and hints.
3. Repository routing / GraphRAG evidence (`route_repositories`, `search_rag_chunks`) when repo targets are unclear.
4. `create_feishu_technical_plan` with context, evidence, and similar cases.
5. `create_work_item_repo_tasks`.
6. `execute_work_item_repo_tasks` with MR creation and writeback enabled.
7. Poll executions / retry MR per task as needed.
8. `create_learning_case` with outcome, root cause, solution notes, and verified tests.

## Stop Conditions

Stop and consult the user only when:

- the work item or required docs are unreadable due to missing permissions;
- the technical plan produces no repository task matrix even with explicit `repository_ids`;
- every repo task fails without a retryable recovery state.

Partial failures do not stop the pipeline: single-repo failure must not abort other repos; document writeback failure does not block execution; LearningCase failure does not invalidate results.

## Final Report

Per repo task: branch, commit, push, MR URL or recovery action. Plus: technical plan document URL, Feishu writeback status, `learning_case_id`, `context_id`, `technical_plan_id`, and `run_id`.

## Guardrails

All `friday-feishu-execute` guardrails apply. Never expose the Access Token, Feishu plugin secret, or app secret.
