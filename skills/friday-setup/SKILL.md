---
name: friday-setup
description: "Use when Friday MCP tools are missing, a friday tool call returns 401/403 or authentication_failed, FRIDAY_BASE_URL or FRIDAY_ACCESS_TOKEN is unset, or the user asks to install, configure, connect, or fix Friday AI. Installs @friday-ai-codes/mcp, guides Access Token creation, and registers the MCP server into Cursor / Claude Code / Codex."
---

# Friday Setup

Bring an agent environment from zero to a working, authenticated `friday` MCP server. Run the steps in order; each step is idempotent and safe to re-run.

## Step 1 — Diagnose

```bash
npx -y @friday-ai-codes/mcp doctor
```

- Exit 0: configuration and connectivity are fine. If the `friday` MCP tools are still not visible in this session, go to Step 3 (registration), then Step 4.
- "未配置" / not configured: go to Step 2.
- Configured but `/health` unreachable: report the base URL and ask the user to check network/VPN/port. Do not continue until reachable.

## Step 2 — Configure credentials

Two values are needed:

1. `base-url`: the Friday server origin, e.g. `https://friday.example.com`. Ask the user if unknown.
2. `token`: a Friday Access Token (PAT). If the user does not have one, tell them exactly: open Friday Web console, go to "个人资料 → 访问令牌", create a token. The plaintext is shown only once — copy it immediately.

Then write the config (stored in `~/.friday/config.json`, mode 0600):

```bash
npx -y @friday-ai-codes/mcp init --base-url <url> --token <token>
```

Never echo the token back in conversation, logs, or files. Environment variables `FRIDAY_BASE_URL` / `FRIDAY_ACCESS_TOKEN` override the config file if the user prefers env-based setup.

## Step 3 — Register the MCP server in the agent

```bash
npx -y @friday-ai-codes/mcp register
```

Auto-detects installed agents (Cursor, Claude Code, Codex) and idempotently registers the `friday` MCP server in each. Target one agent with `--agent cursor|claude-code|codex`, or use `--project` for a project-level Cursor config. After registering, the user must reload the agent (new session / restart) for tools to appear.

If `register` is unavailable (old package version), fall back to manual registration:

- Cursor `~/.cursor/mcp.json`: `{"mcpServers": {"friday": {"command": "npx", "args": ["-y", "@friday-ai-codes/mcp"]}}}`
- Claude Code: `claude mcp add friday -- npx -y @friday-ai-codes/mcp`
- Codex `~/.codex/config.toml`: `[mcp_servers.friday]` with `command = "npx"`, `args = ["-y", "@friday-ai-codes/mcp"]`

## Step 4 — Verify

1. Re-run `npx -y @friday-ai-codes/mcp doctor` — expect exit 0.
2. Call one low-risk read tool through MCP, e.g. `route_repositories` with a short query. A response containing `run_id` confirms end-to-end auth.
3. On `authentication_failed`: the token is wrong or revoked — return to Step 2 and have the user create a fresh token.

## Installing the skills themselves

If `friday-*` skills are missing from the agent, install all of them in one non-interactive shot:

```bash
npx skills add friday-ai-codes/skills --skill '*' -g -y
```

or equivalently `npx @friday-ai-codes/skills` (defaults to all skills, all detected agents, no prompts).

## Guardrails

- Fail closed: if any step cannot complete, report the exact missing piece (URL, token, network, registration) instead of attempting Friday workflows half-configured.
- Server-side prerequisites (repository Git credentials, Feishu credentials) live in Friday itself; when a workflow fails for those, point the user to Friday settings rather than retrying locally.
