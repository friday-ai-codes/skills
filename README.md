# Friday AI Skills

Agent-agnostic [Agent Skills](https://github.com/vercel-labs/skills) for driving Friday AI. These skills are not
tied to any single IDE or agent — install them into Claude Code, Codex, Cursor, or any of the 70+ agents the
`skills` ecosystem supports.

Published to npm as [`@friday-ai-codes/skills`](https://www.npmjs.com/package/@friday-ai-codes/skills).

## Bundled Skills

- `friday-ai` — Friday AI setup, connectivity check, and workflow routing. Start here.
- `friday-codebase-agent` — repository coding workflows through Friday MCP tools (discover, analyze, plan, execute, summarize, create MR).
- `friday-feishu-agent` — Feishu Project work item → technical plan → multi-repo execution → PR/MR writeback → searchable LearningCase memory.

## Prerequisites

These skills call a running Friday server over MCP HTTP tools. Installing the skill files alone is not enough.
Each user also needs:

- `FRIDAY_BASE_URL` — Friday server origin, e.g. `https://friday.example.com`.
- `FRIDAY_ACCESS_TOKEN` — an Access Token created on the Friday profile page.
- Repository / Feishu credentials configured server-side (only for execution, MR creation, or Feishu workflows).

Every tool call is `POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/` with `Authorization: Bearer {FRIDAY_ACCESS_TOKEN}`.

## Install — `skills` CLI (any agent)

The open [`skills`](https://github.com/vercel-labs/skills) CLI auto-detects your installed agents and installs to them.

```bash
# Install all Friday skills (auto-detect agents)
npx skills add friday-ai-codes/skills

# List skills without installing
npx skills add friday-ai-codes/skills --list

# Install one skill to a specific agent
npx skills add friday-ai-codes/skills --skill friday-feishu-agent -a claude-code

# Install all skills to multiple agents, globally, non-interactively
npx skills add friday-ai-codes/skills --skill '*' -a claude-code -a codex -a cursor -g -y
```

Agent targets include `claude-code`, `codex`, `cursor`, `opencode`, `windsurf`, and many more —
see the [supported agents list](https://github.com/vercel-labs/skills#supported-agents).

Other source forms also work:

```bash
npx skills add https://github.com/friday-ai-codes/skills   # full URL
npx skills add ./friday-skills                             # local checkout
```

## Install — bundled npm CLI

A thin wrapper around the `skills` CLI, distributed on npm. Same skills, same behavior; auto-detects agents by default.

```bash
# Install all skills to auto-detected agents (global)
npx @friday-ai-codes/skills

# Into the current project instead of global
npx @friday-ai-codes/skills install --project

# Target specific agents
npx @friday-ai-codes/skills install --agent claude-code
npx @friday-ai-codes/skills install --all-agents

# One skill only
npx @friday-ai-codes/skills install --skill friday-feishu-agent

# List bundled skills
npx @friday-ai-codes/skills list
```

While `@friday-ai-codes/skills` is a pre-release, pin the tag:

```bash
npx @friday-ai-codes/skills@alpha
```

## After Install

1. Set `FRIDAY_BASE_URL` and `FRIDAY_ACCESS_TOKEN` in the environment your agent runs in.
2. Ask your agent to use `friday-ai` first; it verifies connectivity and routes to the right workflow skill.
3. Then drive `friday-codebase-agent` (repo coding) or `friday-feishu-agent` (Feishu work items).

## Verify Locally

```bash
npx skills add . --list        # should report exactly 3 skills
npm run pack:dry-run           # inspect the npm tarball contents
```

## Publishing (maintainers)

```bash
npm publish --access public --tag alpha
```

## License

MIT
