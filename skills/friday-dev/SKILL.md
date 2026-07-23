---
name: friday-dev
description: "本地开发上下文面：在本地仓库的分支上工作、需要项目级上下文时使用。典型触发：「我们项目开发到哪一步了」「继续开发 / 接着上次做」「现在有什么问题 / 卡在哪」「这个需求的 PRD / feature list / 技术方案在哪」「这段代码是为哪个需求改的」，以及任何仓库编码任务开工前想先拉项目上下文。核心机制：用当前 git 分支名经 lookup_project_by_branch 反查 Friday 项目并召回需求/工件/记忆，回答有出处、续做有依据、收工有沉淀。反向边界：问题与项目进度/需求/历史无关、纯代码阅读时不必走本技能。"
---

# Friday Dev

在本地分支上把 Friday 的项目上下文召回到当前会话：**开工先召回 → 带着上下文回答或续做 → 收工沉淀回写**。全程使用 `friday` MCP server 工具，按当前 git 分支自动定位项目，**不写死项目**，切分支 / 切仓库都通用。

## 前置门槛

看不到 `friday` MCP 工具，或调用返回 401/403，引导用户运行 `npx -y @friday-ai-codes/mcp setup`（见 `friday` 技能「环境未就绪」一节）。保留首个响应的 `run_id`。

## 第一步（所有模式共用）— 按分支召回

1. 取当前分支名：`git rev-parse --abbrev-ref HEAD`。
2. `lookup_project_by_branch(branch_name=<当前分支>)`；同名分支跨仓时带 `repository_id` 收窄。
3. 结果分三种：
   - **`matched=true`**：`context` 就是项目的打包上下文（overview / 记忆 / 需求 / feature list 进度 / 工件 / 知识分层，见 `included_layers`）。先完整读它，记下 `project.id`。
   - **`matched=false` 且有 `candidates`**：列出候选项目问用户确认一次；确认后用该 `project_id` 走下面的深挖工具。建议提示用户在 Friday 控制台把该分支显式绑定到项目，下次直接命中。
   - **`matched=false` 且 `candidates` 为空**：分支未关联任何 Friday 项目。明确告知用户（分支命名 `feat/xxxx-m{工作项id}-slug` 可自动命中，或在控制台绑定分支/仓库），然后退回本地工具处理，不臆造项目信息。

## 模式判定（召回后按用户问题走）

| 用户意图 | 动作 |
| --- | --- |
| 「开发到哪一步了 / 项目进度」 | 读 `context` 的 feature list 进度与里程碑层；不够时 `read_project_doc(doc_type="state")` + `read_project_doc(doc_type="milestones")`，按功能点逐条报进度（名称 + 四态进度灯 + 验收项） |
| 「继续开发 / 接着上次做」 | 从 `context` 与 STATE 找未完成功能点与最近记忆决策，结合本地 `git log`/工作区状态定位续做点；开工前把相关约束（记忆里的方案决策、教训）列为本次编码依据 |
| 「现在有什么问题 / 卡在哪 / 有什么坑」 | 读 `context` 记忆层 + `search_project_context(query=<问题域>)`；历史教训用 `search_learning_cases`（见 `friday-memory`） |
| 「PRD / 需求 / 技术方案在哪 / 是什么」 | `context` 需求层 + `grep_project` / `search_project_context` 定位具体工件与文档；有 `feishu_url` / 文档链接必须原样给出 |
| 「这段代码是为哪个需求改的 / 改这里影响哪些需求」 | `reverse_lookup_requirements(repository_id, file_path, line)` 反查关联工作项 / 文档 / 追溯路径 |
| 仓库编码任务开工（任何写码前） | 按 `friday` 技能「分支上下文环路」：召回 → 编码 → 沉淀 |

## 深挖工具（按需，全部要 `project_id`）

- `read_project_doc(project_id, doc_type)` — 单文档直读：`memory`（记忆）/ `state`（状态与 API 清单）/ `milestones`（里程碑）/ `research`（调研）/ `preflight`（预检）。
- `search_project_context(project_id, query, top_k)` — 项目交付上下文语义召回（需求 / 工件 / 记忆实体）。
- `grep_project(project_id, query)` — 关键词精确匹配（与语义召回互补，找确定名词用这个）。

## 收工沉淀（有实际改动 / 有价值结论时）

- 方案决策 / 经验教训：`report_project_knowledge(branch_name=<当前分支>, content=<提炼后的沉淀>)`。
- 新增 / 改动 API：`report_project_state(branch_name=<当前分支>, apis=[{method, path, params?, status?}...])`。
- 两者按分支自动定位项目；非成员 / 无法唯一定位时服务端 fail-soft 跳过，不阻断。**绝不上报任何凭证 / 密钥 / token / 个人敏感信息。**

## 护栏

- **绝不擅自改变工作区状态**：不要主动 `git switch` / `checkout` / `stash`。发现目标代码不在当前分支（如需求分支未合入当前分支）时，报告代码所在分支并**请用户确认**后再切，未提交改动可能被带走或阻塞切换。
- **回答必须带出处**：引用 `included_layers` 层名、`doc_type`、工件 / 需求标题或链接；召回为空就说「Friday 里没有相关记录」，不编造进度或需求。
- **不与记忆矛盾**：`context` 记忆层里已记录的方案决策与约束优先于临场判断；要推翻须显式说明并在收工时沉淀新决策。
- **fail-soft**：Friday 不可用 / 未命中 / 无权限时退回本地工具并向用户说明，绝不阻断当前开发。
- 非成员零召回是预期行为（权限 fail-closed），不要当故障重试。

## HTTP 兜底

MCP 不可用时，所有工具都是 `POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/` + Bearer 认证；`run_id` 经 `X-Friday-Run-ID` 头传递。完整契约见 [references/http-fallback.md](references/http-fallback.md)。
