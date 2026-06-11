---
name: friday-setup
description: "当 Friday MCP 工具缺失、friday 工具调用返回 401/403 或 authentication_failed、FRIDAY_BASE_URL / FRIDAY_ACCESS_TOKEN 未配置，或用户要求安装、配置、连接、修复 Friday AI 时使用。安装 @friday-ai-codes/mcp、引导创建 Access Token、把 MCP server 注册进 Cursor / Claude Code / Codex。"
---

# Friday Setup

把一个零配置的 agent 环境带到拥有可用、已认证的 `friday` MCP server。按顺序执行，每一步都幂等、可安全重跑。

## 第一步 — 诊断

```bash
npx -y @friday-ai-codes/mcp doctor
```

- 退出码 0：配置和连通性正常。如果本会话仍看不到 `friday` MCP 工具，跳到第三步（注册），再做第四步。
- 提示"未配置"：进入第二步。
- 已配置但 `/health` 不可达：报告 base URL，让用户检查网络/VPN/端口。不通之前不要继续。

## 第二步 — 配置凭证

需要两个值：

1. `base-url`：Friday 服务地址，如 `https://friday.example.com`。不知道就问用户。
2. `token`：Friday Access Token（PAT）。用户没有时，明确告知操作路径：打开 Friday Web 控制台 →「个人资料 → 访问令牌」→ 创建令牌。明文只展示一次，立即复制。

然后写入配置（存于 `~/.friday/config.json`，权限 0600）：

```bash
npx -y @friday-ai-codes/mcp init --base-url <url> --token <token>
```

绝不在对话、日志或文件里回显 token。用户偏好环境变量时，`FRIDAY_BASE_URL` / `FRIDAY_ACCESS_TOKEN` 会覆盖配置文件。

## 第三步 — 把 MCP server 注册进 agent

```bash
npx -y @friday-ai-codes/mcp register
```

自动探测已安装的 agent（Cursor、Claude Code、Codex）并幂等注册 `friday` MCP server。用 `--agent cursor|claude-code|codex` 指定单个 agent，或用 `--project` 写项目级 Cursor 配置。注册后用户需要重载 agent（新会话/重启）工具才会出现。

`register` 不可用（旧版本包）时手动注册：

- Cursor `~/.cursor/mcp.json`：`{"mcpServers": {"friday": {"command": "npx", "args": ["-y", "@friday-ai-codes/mcp"]}}}`
- Claude Code：`claude mcp add friday -- npx -y @friday-ai-codes/mcp`
- Codex `~/.codex/config.toml`：`[mcp_servers.friday]`，`command = "npx"`，`args = ["-y", "@friday-ai-codes/mcp"]`

## 第四步 — 验证

1. 重跑 `npx -y @friday-ai-codes/mcp doctor`——期望退出码 0。
2. 通过 MCP 调一个低风险只读工具，如 `route_repositories` 带一个短 query。响应里有 `run_id` 即确认端到端认证打通。
3. 返回 `authentication_failed`：token 错误或已吊销——回到第二步让用户创建新 token。

## 安装技能本身

agent 里缺 `friday-*` 技能时，一条命令非交互式装齐：

```bash
npx skills add friday-ai-codes/skills --skill '*' -y
```

或等价地运行 `npx @friday-ai-codes/skills`（交互式向导，可选项目/全局与目标 agent）。项目级安装会写入 `.agents/skills/`，Cursor 会自动发现并在每次会话注入技能描述；Cursor 项目还会写入 `.cursor/rules/using-friday.mdc`（alwaysApply）兜底引导。

## 护栏

- Fail closed：任何一步无法完成时，报告确切缺失项（URL、token、网络、注册），不要在半配置状态下尝试 Friday 工作流。
- 服务端前置条件（仓库 Git 凭证、飞书凭证）在 Friday 自身配置；工作流因此失败时，指引用户去 Friday 设置页，而不是在本地重试。
