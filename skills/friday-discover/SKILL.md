---
name: friday-discover
description: "Use when the user wants to find which Friday-indexed repository matches a requirement, check repository index health, or asks 'which repo handles X' / 'can Friday work on this repo'. First step before any Friday analysis, planning, or execution."
---

# Friday Discover

Route a requirement to the right Friday-indexed repository and confirm it is ready for GraphRAG work. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first.

## Steps

1. `route_repositories` with the user's requirement text (`query`, optional `top_k`). Keep the returned `run_id` for the rest of the workflow.
2. Pick the top repository when its score is clearly ahead. If scores are close or weak, ask the user one concise question to confirm — unless the user requested autonomous mode, in which case choose the best-ranked repository and note the decision.
3. `get_repository` with the chosen `repository_id` to read metadata, default branch, and index status.
4. Optional: `list_repository_files` for a shallow file-tree scan when the user wants to sanity-check repository contents.

## Output

Report: repository name + `repository_id`, default branch, index status, route reason/score, and `run_id`.

## Guardrails

- `repository_not_indexed`: stop and tell the user the repo/branch must be indexed in Friday before analysis or planning.
- `repository_not_found`: re-run routing with different phrasing or ask the user to verify repository access in Friday.
- Pass `repository_id` and `run_id` forward to `friday-analyze` / `friday-plan` instead of re-routing.

## HTTP Fallback

If MCP is unusable, the same tool is `POST {FRIDAY_BASE_URL}/api/mcp/tools/route_repositories/` with `Authorization: Bearer {FRIDAY_ACCESS_TOKEN}`; reuse `run_id` via the `X-Friday-Run-ID` header on later calls.
