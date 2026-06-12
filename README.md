# Friday Skills

为 [Friday AI](https://github.com/friday-ai-codes/friday-ai) 提供的 Agent Skills：把「需求 → 可追溯 MR」的自动化能力带进 Cursor / Claude Code / Codex / Gemini CLI / OpenCode 等本地 AI 助手。

npm 包：[`@friday-ai-codes/skills`](https://www.npmjs.com/package/@friday-ai-codes/skills)。自带中文安装向导（不依赖第三方 skills CLI），也是一个 Claude Code 插件（skills + SessionStart hook + 捆绑 MCP server 声明）。

## 设计

- **好记**：4 个 skill，全部 `friday` 开头、一个词收尾，按用户意图划分职责。
- **中文优先**：skill 正文与描述全部 zh-CN，名字保留英文 slug。
- **MCP 优先**：细粒度能力（22 个工具）全部由 [`@friday-ai-codes/mcp`](https://github.com/friday-ai-codes/mcp) stdio server 提供；skill 负责编排、护栏与轨迹纪律，HTTP 直调仅作兜底。
- **配置下沉 CLI**：安装、配置、连接、修复全部由 CLI 完成（`mcp setup` 交互式向导），不再需要 setup 技能。

## Skills（4 个）

| Skill | 用途 |
| --- | --- |
| `friday` | 总入口：技能路由表 + 轨迹纪律 + 环境未就绪指引；也可直接把任意需求交给它一条龙跑完（hook / Cursor rule 自动注入） |
| `friday-code` | 远端已索引仓库：找仓库 → 分析 → 计划 → 执行/MR，可分阶段也可一条龙 |
| `friday-feishu` | 飞书工作项闭环：读上下文 → 技术方案 → 多仓执行 → 结果回写，可分阶段也可一条龙 |
| `friday-memory` | Friday 的记忆层：LearningCase 经验记录/检索 + 交付知识检索（相似需求、版本时间线、关联链、as_of） |

## 安装

**推荐顺序：先配 MCP 连接，再装 Skills。**

### 第一步 — 配置 Friday 连接

```bash
npx -y @friday-ai-codes/mcp setup
```

交互式中文向导：凭证问答 → 注册进本机 agent → 连通性测速（ms 高亮）→ 能力演示。访问令牌在 Friday Web 控制台「个人资料 → 访问令牌」创建（明文只显示一次）。

### 第二步 — 安装 Skills（交互式向导）

```bash
npx @friday-ai-codes/skills
```

向导会：展示渐变 banner → 选择安装范围（当前项目 / 全局）→ 自动嗅探本机 agent（Cursor / Claude Code / Codex / Gemini CLI / OpenCode）并默认勾选 → 把 4 个技能拷进各 agent 原生技能目录 → 检测 MCP 配置，未配置时直接接力拉起 `mcp setup`。

### 非交互（脚本 / CI）

```bash
npx @friday-ai-codes/skills install -y                          # 嗅探到的全部 agent，全局
npx @friday-ai-codes/skills install --project --agent cursor    # 当前项目，仅 Cursor
npx @friday-ai-codes/skills install --agent claude-code -g      # 全局，仅 Claude Code
npx @friday-ai-codes/skills install -y --no-bootstrap           # 只装技能，不注入指令文件
npx @friday-ai-codes/skills list                                # 列出打包技能
```

### Claude Code — 插件形式

插件形式额外提供两样：SessionStart hook（每个会话自动注入 `friday` 入口技能）与捆绑 MCP server 声明（装插件即注册 `friday` MCP server）。

```bash
claude plugin add friday-ai-codes/skills
```

### 兼容社区 skills CLI

```bash
npx skills add friday-ai-codes/skills --skill '*' -g -y
```

注意：此路径不会引导后续配置——请务必先完成第一步（`mcp setup`）。

## 自动注入

安装器默认把一段精简的 friday 入口引导注入各 agent 的原生指令文件（marker 幂等，可用 `--no-bootstrap` 关闭）：

| Agent | 项目级 | 全局 |
| --- | --- | --- |
| Cursor | `.cursor/rules/friday.mdc`（`alwaysApply`） | `~/.cursor/rules/friday.mdc`（注：文件方式偶有不生效，官方推荐 Settings → Rules） |
| Claude Code | `CLAUDE.md` | `~/.claude/CLAUDE.md` |
| Codex | `AGENTS.md` | `~/.codex/AGENTS.md` |
| Gemini CLI | `GEMINI.md` | `~/.gemini/GEMINI.md` |
| OpenCode | `AGENTS.md`（与 Codex 共用，自动去重） | `~/.config/opencode/AGENTS.md` |

项目级注入使用相对路径（文件会进 git，队友机器同样生效）。另外 Claude Code 插件形式自带 SessionStart hook，把 `friday` 入口技能全文注入每个会话。

## 本地验证

```bash
node bin/friday-ai-skills.mjs list        # 应列出 4 个技能
npm run pack:dry-run                       # 检查 npm tarball 内容
bash hooks/session-start | head -1         # 合法 JSON 上下文注入
```

## 发布（维护者）

```bash
npm publish --access public
```

## License

MIT
