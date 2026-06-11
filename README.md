# Friday AI Skills

Atomic, agent-agnostic [Agent Skills](https://github.com/vercel-labs/skills) for driving [Friday AI](https://github.com/friday-ai-codes/friday-ai): requirement-to-MR automation through the Friday MCP server.

Published to npm as [`@friday-ai-codes/skills`](https://www.npmjs.com/package/@friday-ai-codes/skills). Also a Claude Code plugin (skills + SessionStart hook + bundled MCP server declaration).

## Design

- **Intent-shaped**: one skill per user intent (code a repo / handle a Feishu work item), with pipeline stages as sections inside the skill — agents auto-trigger the right one from its `description`, no manual `/slash` invocation needed.
- **Chinese-first**: skill bodies and descriptions are written in zh-CN, matching Friday's primary audience; skill names stay English slugs.
- **MCP-first**: skills drive the [`@friday-ai-codes/mcp`](https://github.com/friday-ai-codes/mcp) stdio server; raw HTTP is documented as fallback only.
- **Self-bootstrapping**: when the MCP server is missing or unauthenticated, the `friday-setup` skill walks the agent through install, Access Token creation, and IDE registration.

## Skills

| Skill | Use it for |
| --- | --- |
| `using-friday` | Meta skill: skill routing table + trace discipline (auto-injected by the plugin hook / Cursor rule) |
| `friday-setup` | Install/configure/repair Friday access: `doctor` -> `init` -> `register` -> verify |
| `friday-code` | Everything on a remote indexed repository: discover -> analyze -> plan -> execute/MR, staged or end to end |
| `friday-feishu` | Feishu work item loop: context -> technical plan -> multi-repo execution -> writeback, staged or end to end |
| `friday-learn` | Record / search LearningCase memory |

## Install

### Guided (default in a terminal)

```bash
npx @friday-ai-codes/skills
```

Launches a short wizard: pick the **scope** (current project or global) and the **target agents** (detected on your machine — nothing is pre-selected for you). All 5 skills are always installed together; there is no per-skill selection to click through.

When Cursor is targeted with **project** scope, the installer also writes `.cursor/rules/using-friday.mdc` (`alwaysApply: true`) so every Cursor session is steered to the `using-friday` meta skill — Cursor's counterpart to the Claude Code SessionStart hook.

### Non-interactive (scripts / CI / you know what you want)

Pass any targeting flag to skip the wizard:

```bash
npx @friday-ai-codes/skills install --project --agent cursor   # this project, Cursor only
npx @friday-ai-codes/skills install --agent claude-code -g     # global, Claude Code only
npx @friday-ai-codes/skills install --all-agents -g            # everything, everywhere
npx @friday-ai-codes/skills install -y                         # old behavior: auto-detect all agents, global
npx @friday-ai-codes/skills install --codex-bootstrap --agent codex  # plus ~/.codex/AGENTS.md bootstrap
npx @friday-ai-codes/skills list                               # list bundled skills
```

Equivalent raw skills CLI form (always non-interactive):

```bash
npx skills add friday-ai-codes/skills --skill '*' -g -y
```

### Claude Code — as a plugin (recommended)

The plugin form adds two things skills alone cannot: a SessionStart hook that injects the `using-friday` meta skill into every session (superpowers-style auto-triggering), and a bundled MCP server declaration so the `friday` MCP server is registered on plugin install.

```bash
claude plugin add friday-ai-codes/skills
```

### Codex

Codex has no hook mechanism; install skills plus the AGENTS.md bootstrap:

```bash
npx @friday-ai-codes/skills install --agent codex --codex-bootstrap
```

## First use

Nothing else to configure manually — ask your agent to **"set up Friday"** (or just give it a Friday task). The `friday-setup` skill will:

1. run `npx -y @friday-ai-codes/mcp doctor` to diagnose;
2. guide you to create an Access Token in Friday Web console ("个人资料 → 访问令牌") and run `init`;
3. run `npx -y @friday-ai-codes/mcp register` to register the MCP server into Cursor / Claude Code / Codex;
4. verify with a low-risk read tool call.

Manual equivalent:

```bash
npx -y @friday-ai-codes/mcp init --base-url https://friday.example.com --token <pat>
npx -y @friday-ai-codes/mcp register
```

## Verify locally

```bash
npx skills add . --list        # should report exactly 5 skills
npm run pack:dry-run           # inspect the npm tarball contents
bash hooks/session-start | head -1   # valid JSON context injection
```

## Publishing (maintainers)

```bash
npm publish --access public --tag alpha
```

## License

MIT
