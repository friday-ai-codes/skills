# Friday AI Skills

Atomic, agent-agnostic [Agent Skills](https://github.com/vercel-labs/skills) for driving [Friday AI](https://github.com/friday-ai-codes/friday-ai): requirement-to-MR automation through the Friday MCP server.

Published to npm as [`@friday-ai-codes/skills`](https://www.npmjs.com/package/@friday-ai-codes/skills). Also a Claude Code plugin (skills + SessionStart hook + bundled MCP server declaration).

## Design

- **Atomic**: one skill per workflow stage, so agents auto-trigger the right one from its `description` — no manual `/slash` invocation needed.
- **MCP-first**: skills drive the [`@friday-ai-codes/mcp`](https://github.com/friday-ai-codes/mcp) stdio server; raw HTTP is documented as fallback only.
- **Self-bootstrapping**: when the MCP server is missing or unauthenticated, the `friday-setup` skill walks the agent through install, Access Token creation, and IDE registration.

## Skills

| Skill | Use it for |
| --- | --- |
| `using-friday` | Meta skill: skill routing table + trace discipline (auto-injected by the plugin hook) |
| `friday-setup` | Install/configure/repair Friday access: `doctor` -> `init` -> `register` -> verify |
| `friday-discover` | Route a requirement to the right indexed repository, check index health |
| `friday-analyze` | GraphRAG evidence, architecture/risk/test analysis, `analysis_id` |
| `friday-plan` | Create or revise a coding plan (`plan_id` / `version_id`) |
| `friday-execute` | Execute a plan, poll, summarize branch, create MR |
| `friday-auto` | Requirement -> MR end to end (full_auto) |
| `friday-feishu-context` | Read a Feishu work item + linked docs (`context_id`) |
| `friday-feishu-plan` | Technical plan + Feishu writeback (`technical_plan_id`, repo task matrix) |
| `friday-feishu-execute` | Multi-repo task execution + PR/MR + result writeback |
| `friday-feishu-auto` | Feishu work item end to end (context -> plan -> execute -> learn) |
| `friday-learn` | Record / search LearningCase memory |

## Install

### Any agent — one shot, no prompts

```bash
npx @friday-ai-codes/skills
```

Installs **all** skills to every detected agent (Claude Code, Codex, Cursor, ...), globally, non-interactively. Equivalent raw form:

```bash
npx skills add friday-ai-codes/skills --skill '*' -g -y
```

Useful variants:

```bash
npx @friday-ai-codes/skills install --project            # current project instead of global
npx @friday-ai-codes/skills install --agent claude-code  # one agent only
npx @friday-ai-codes/skills install --codex-bootstrap    # also append using-friday to ~/.codex/AGENTS.md
npx @friday-ai-codes/skills list                         # list bundled skills
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
npx skills add . --list        # should report exactly 12 skills
npm run pack:dry-run           # inspect the npm tarball contents
bash hooks/session-start | head -1   # valid JSON context injection
```

## Publishing (maintainers)

```bash
npm publish --access public --tag alpha
```

## License

MIT
