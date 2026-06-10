---
name: friday-auto
description: "Use when the user gives a concrete coding requirement and wants Friday to handle it end to end: discover the repository, analyze, plan, execute, and open a merge request without manual stage-by-stage driving. The full_auto pipeline."
---

# Friday Auto

End-to-end pipeline from one requirement to a traced merge request. Orchestrates the same stages as `friday-discover` -> `friday-analyze` -> `friday-plan` -> `friday-execute` under a single `run_id`. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first.

## Pipeline

1. `route_repositories` with the full requirement; keep the first `run_id` for every later call.
2. `get_repository` for the selected repository (index status must be healthy).
3. `search_rag_chunks` for requirement-specific evidence; `find_related_chunks` when evidence names entry points worth tracing.
4. `analyze_repository` with the selected evidence.
5. `create_coding_plan` with requirement + `analysis_id` + context chunks.
6. If the plan has an obvious gap, one `improve_coding_plan` round with precise feedback — at most once; do not loop.
7. `execute_coding_plan`, then poll `get_coding_execution` until terminal status.
8. `summarize_branch` on success.
9. `create_merge_request` from the MR draft.

## Stop Conditions

Stop and consult the user only when:

- repository routing is ambiguous (close scores) and the user did not request autonomous mode;
- the repository is not indexed;
- execution fails without a retryable `recovery_state`;
- MR creation hits a non-retryable platform error.

Otherwise keep going — the point of this skill is no manual steps.

## Final Report

```text
Repository: <name> (<repository_id>)
Trace: <run_id>
Plan: <plan_id> version <version_id>
Execution: <execution_id> status <status>
Branch: <branch_name> -> <target_branch>
Commit: <commit_sha or none>
Push: <pushed/failed/skipped>
MR: <mr_url or recovery action>
Tests: <test summary or runner logs pointer>
```

## Guardrails

All `friday-execute` guardrails apply: no MR without a pushed branch; `partial` means retry summarize/MR, never rerun coding; never echo the Access Token.
