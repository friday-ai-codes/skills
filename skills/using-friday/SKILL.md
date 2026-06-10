---
name: using-friday
description: "Friday AI skills bootstrap. Use when any task could involve Friday AI: remote repository coding, codebase analysis, coding plans, MR/PR automation, or Feishu Project work items. If there is even a 1% chance a friday-* skill applies, read it before acting."
---

# Using Friday

Friday AI turns requirements into traceable merge requests: repository discovery, GraphRAG analysis, coding plans, containerized execution, and PR/MR creation. You drive it through the `friday` MCP server tools (or its skills below).

## The Rule

If there is even a 1% chance a `friday-*` skill applies to the current task, read that skill BEFORE doing anything else. Do not improvise a Friday workflow from memory. Reading a skill costs little; skipping one causes broken traces, orphan branches, and failed MRs.

Rationalizations that mean you should read the skill anyway: "this is a simple request", "I already know what this tool does", "the user is in a hurry", "I'll just call one tool".

## Setup Gate

Before any Friday workflow, the `friday` MCP tools must be available and authenticated:

- `friday` MCP tools not visible, or a call fails with 401/403 or `authentication_failed` → use `friday-setup` first.
- Never echo the Friday Access Token in any output.

## Skill Routing

| Situation | Skill |
| --- | --- |
| Install, configure, connect, or fix Friday access | `friday-setup` |
| Which repository matches this requirement? Index healthy? | `friday-discover` |
| Analyze a repository: architecture, risks, evidence, impact | `friday-analyze` |
| Create or revise a coding plan | `friday-plan` |
| Execute an approved plan, poll, summarize branch, create MR | `friday-execute` |
| Concrete coding requirement, handle end to end to an MR | `friday-auto` |
| Read a Feishu work item and its linked docs | `friday-feishu-context` |
| Generate a technical plan for a work item and write it back | `friday-feishu-plan` |
| Run multi-repo tasks from a work item plan, write results back | `friday-feishu-execute` |
| Feishu work item handled end to end (context to LearningCase) | `friday-feishu-auto` |
| Record or search LearningCase memory | `friday-learn` |

When the user names an end-to-end goal, prefer `friday-auto` (coding requirement) or `friday-feishu-auto` (Feishu work item). Use narrower skills when the user asks for only one stage.

## Trace Discipline (applies to every skill)

- The first successful Friday tool response returns a `run_id`. Keep it for the whole workflow.
- Preserve IDs across steps: `repository_id`, `analysis_id`, `plan_id`, `version_id`, `execution_id`, `context_id`, `technical_plan_id`.
- Final reports include `run_id`, branch, commit, push status, and MR URL or recovery action.
