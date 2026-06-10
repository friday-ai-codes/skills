---
name: friday-analyze
description: "Use when the user wants Friday to analyze a repository: architecture overview, risk assessment, test strategy, GraphRAG code evidence, 'how does X work in repo Y', or impact analysis before coding. Produces an analysis_id consumed by coding plans."
---

# Friday Analyze

Collect GraphRAG evidence from a Friday-indexed repository and produce structured architecture/risk/test context. Uses the `friday` MCP server tools.

## Setup Gate

If `friday` MCP tools are not visible or a call returns 401/403, run the `friday-setup` skill first.

## Prerequisites

A `repository_id` is required. If unknown, run `friday-discover` first and reuse its `run_id`.

## Steps

1. `search_rag_chunks` with the requirement or analysis focus (`repository_id`, `query`, optional `branch` / `top_k` / `max_tokens`). This is the main evidence tool — hybrid semantic + keyword + graph retrieval.
2. `find_related_chunks` to expand from important hits: pass exactly one of `chunk_id`, `file_path`, or `symbol_name`. Use when initial evidence names entry points worth tracing.
3. `get_repository_file` to read exact file content (with line ranges) when a chunk needs full context.
4. `analyze_repository` with the selected evidence as `context_chunks` and the user's `focus`. Returns `analysis_id` plus architecture summary, key modules, entry points, risks, test strategy, and reading order.

## Output

Report: architecture summary, key modules and risks, test strategy, evidence chunk IDs, `analysis_id`, and `run_id`.

## Guardrails

- Keep evidence honest: cite chunk IDs / file paths returned by tools; never invent code structure not present in evidence.
- Empty search results: broaden the query or verify branch and index status via `get_repository` before concluding the code does not exist.
- Preserve `analysis_id` — `friday-plan` consumes it.

## HTTP Fallback

Same tools as `POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/` with Bearer auth; propagate `run_id` via `X-Friday-Run-ID`.
