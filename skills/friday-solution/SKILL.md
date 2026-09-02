---
name: friday-solution
description: "由 feature list 生成技术方案：先判定每个功能点是新增功能还是改造已有功能，结合仓库调研给出关联仓库，让用户确认后输出「分仓方案 + 整体方案」（含落点文件与伪代码）。典型触发：「根据这份 feature list 出技术方案」「这些需求要改哪些仓库」「帮我看看这批功能哪些是新增哪些是改造」「基于当前分支的需求清单做技术方案」，以及用户明确说要「创建/生成技术方案」。核心机制：三段式工具链（发起→确认→取回），关联仓库与新增/改造判定必须经用户确认，绝不替用户拍板。反向边界：单个零散需求、没有 feature list 形态的需求走 friday-code；飞书工作项走 friday-feishu。"
---

# Friday Solution

把一份 feature list 变成可执行的技术方案。与 `friday-code`（单需求 → 编码计划 → MR）不同，本技能处理的是**成批功能点**，产物是给人看的技术方案文档：每个功能点是新增还是改造、落在哪些仓库、改哪些文件、关键逻辑长什么样。

## 前置门槛

看不到 `friday` MCP 工具，或调用返回 401/403，引导用户运行 `npx -y @friday-ai-codes/mcp setup`（见 `friday` 技能「环境未就绪」一节）。保留首个响应的 `run_id`。

## Canonical blueprint 优先级

本技能的三段式链路只负责 feature list 的初始分类、路由与方案生成。只要响应或上游任务
给出 `blueprint_artifact_id`，后续状态、正文和审批都以 Friday canonical blueprint 为
唯一事实源，禁止继续把 legacy `session_id` 或宿主 Issue metadata 当作权威状态：

1. `get_feishu_work_item_context` 返回的 legacy `project_id`/`space_id` 是 Space 身份；
   fresh create 必须把稳定事件键传入 `idempotency_key`。只有响应显式给出可信的
   `blueprint_project_id` 时才原样传入同名参数；服务端也只允许唯一、严格的
   `ProjectWorkItemLink` 自动绑定。缺少可信 Project 时允许创建 Space-scoped unbound
   blueprint，禁止猜测同一 Space 的任意 Project，也不得仅因 Project 缺失而阻断。若工作项
   快照存在明确且唯一的 Team 字段，把其人类可读 `label` 原样传入 `primary_team`；缺失或
   歧义时不得猜测，留空并把服务端返回的团队澄清题原样交给用户。
2. 调 `get_technical_blueprint(artifact_id=...)`；仅当创建时绑定了
   `blueprint_project_id`，才核验返回的 `project_id` 与它一致。重试复用同一键，禁止
   新建重复 artifact。
3. `pending_clarifications` 非空时，把题目和选项原样交给用户；拿到真人答复后逐条调
   `answer_blueprint_clarification`，再重新取件。
4. `pending_review` 时必须原样展示 `markdown`，并保存刚读取的 `artifact_version_id` 与
   `content_hash`。用户要求修改时调 `request_technical_blueprint_changes`，不得由 Agent
   私改正文。
5. 只有用户明确批准后，才能把同一版本/hash 传给 `approve_technical_blueprint`。
   `stale` 表示版本已变，必须重新取件、重新展示、重新确认。
6. 只有服务端返回 `confirmed` envelope 后才允许进入 Coding；Issue 状态为 `cancelled`
   但 artifact 仍为非终态时按 orphan 处理并停止自动推进，不能伪造完成或批准。

### Project、Space、Team 与仓库职责边界

- Project 是可选业务身份，只能来自显式可信 UUID 或唯一严格工作项关联；Space 只定义当前
  调用者可访问的仓库宇宙，绝不能把 Space 首个 Project 当身份，也不能把 Space 全仓当 Team。
- Team 只能来自可信 work-item/team 字段、Repository facets 或已确认的项目仓库关联。Team
  缺失或存在歧义时，必须在仓库路由前向人类澄清，禁止依赖 Space、项目相似度或历史名称猜测。
- 路由上下文必须包含 PRD、feature list、测试 case、飞书字段、技术文档与显式仓库名，并保留
  来源和置信度。显式仓、可信 Team 核心仓、项目确认仓与可信历史可突破 Top-N 候选预算；
  Project/知识相似度只作软证据，不能形成 hard scope。
- route 阶段只产 candidate，不得按路由置信度或 charter 命中预判 `direct`。最终
  `direct`/`indirect`/`irrelevant` 必须由逐仓 research 决定；`direct` 必须给出唯一职责和
  具体 file/API/model 拟修改位置。`unsuitable` 必须归为 `irrelevant` 并在人工确认前排除，
  `partial` 必须明确按 `indirect` 或待裁决处理。

### 仓库确认的调研证据门禁

`repo_confirmation` 只有在候选仓调研成功且证据可读时才是可以交给人类回答的确认题。若任一
direct 候选的 `task_status` 为 `failed`，或者候选的 `responsibility` 为空、
`fitness.reasons` 为空、`current_state_summary` 为空，必须标记为调研失败并停止在研究
恢复门禁：

- 不得发布或展示为可回答的 `repo_confirmation`，不得要求人类在无证据时盲选仓库。
- 不得调用 `answer_blueprint_clarification`，也不得把路由分数或 `matched_domains`
  冒充仓库现状证据。
- 必须明确列出失败仓库与缺失字段，并重跑 repo_research；恢复成功后重新读取 artifact，
  只有所有 direct 候选具备职责、适配理由和现状摘要，才可展示新的仓库确认题。
- 研究恢复期间可以把活跃 Issue 标为 `blocked`，但不得批准、生成 Coding envelope 或派发
  Coding。

### Cancelled/orphan 只读不变量

一旦宿主 Issue 为 `cancelled`，无论 Friday artifact 处于什么状态，Issue 状态与 Friday
artifact 均为只读。只读取两侧状态、报告 orphan 并立即退出：

- 禁止把 `cancelled` 改为 `blocked`、`in_progress` 或 `done`，也禁止任何等价的 Issue
  状态迁移或复活操作。
- 禁止调用 `create_feishu_technical_plan`。
- 禁止调用 `answer_blueprint_clarification`。
- 禁止调用 `approve_technical_blueprint`。
- 禁止调用 `request_technical_blueprint_changes`。
- 禁止调用 `start_repo_research`。
- 禁止派发 Coding，也禁止创建或唤醒任何后续任务。

只有宿主策略明确允许时，才能追加不改变状态的 reconciliation `metadata` 或评论；否则
只在当前执行结果中报告 orphan 后退出。即使通用 Agent 规则要求把阻塞任务设为
`blocked`，本只读不变量仍优先，必须保持 `cancelled`。

这个优先级同样适用于 HTTP fallback。canonical 工具缺失时应报告运行时版本过旧并停止，
不能退回三段式链路绕过人审或 Coding 门禁。

#### 写时取消 preflight / CAS

不得依赖 run 启动时或上一步缓存的 Issue 状态。每一次写操作都必须独立执行以下门禁：

1. 紧邻写入前重新读取宿主 Issue 的 `status` 与 `revision`，把该 revision 作为
   `expected_revision`；读取与写入之间不得执行其他操作。
2. 下列动作全部算写操作：Issue 状态写入、Issue metadata 写入、Issue 评论写入，
   以及 `create_feishu_technical_plan`、`answer_blueprint_clarification`、
   `approve_technical_blueprint`、`request_technical_blueprint_changes`、
   `start_repo_research`、legacy `create_feature_tech_plan` /
   `confirm_feature_tech_plan` 和 Coding 派发。
3. 若最新 `status=cancelled`，必须 fail-closed，立即按只读不变量退出；若 revision 已变化，
   必须立即重新预检，禁止沿用旧快照。
4. 宿主写接口支持 `expected_revision` 时必须使用 CAS；CAS 冲突后重新读取并重新判定，
   绝不能把冲突当作成功或退回无条件写入。宿主仅提供非 CAS CLI 时，也必须执行紧邻写入的
   重检，并且不得在重检与写入之间插入轮询、模型调用或其他副作用。

这里的 Issue 评论写入指 Agent 主动调用评论接口；宿主自动投递 run 最终结果不属于 Agent
可控制的 mutation，但最终结果在 cancelled 场景只能报告 orphan，不能宣称或触发状态推进。

## 铁律：三段式不可跳过

这条链路是**三个工具、三次调用**，没有一步到位的捷径：

```
create_feature_tech_plan  → 出「待确认项」，不出方案
        ↓  必须把问题给用户，拿到真实答复
confirm_feature_tech_plan → 提交确认，编排继续
        ↓  调研是异步的
get_feature_tech_plan     → 轮询直到 completed，拿完整方案
```

**绝对禁止**的三件事：

1. 跳过 `confirm` 直接想拿方案——`create` 的返回里 `plan` 恒为空，等不出方案的。
2. 不向用户展示 `questions` 就自己编答案调 `confirm`。关联哪些仓库是用户的决策，不是你的。哪怕系统给的推荐看起来完全正确，也要让用户过目。
3. 看到 `status="researching"` 就当失败或就地放弃。那是正常的中间态，去轮询。

设计上就是这样：即便仓库路由是高置信度，系统也一定会问一次。这不是缺陷，是产品约束。

## Subagent 委托（Cursor / Claude Code 优先走这条）

宿主里存在 `friday-plan` subagent 时，把发起与轮询整段委托给它，主对话只保留与用户的确认环节：

1. **派发起单**：把 feature list 原文 / project_id / 分支名交给 `friday-plan`（阶段=发起）。它会调 `create_feature_tech_plan` 并把 `questions` + `session_id` 原样带回——它被禁止代答。
2. **主对话做确认**：按下文「第二步」的方式把问题呈现给用户，拿到真实答复。
3. **派续跑单**：`session_id` + 用户答复原文再交给 `friday-plan`（阶段=续跑）。它会提交确认并轮询到终态，带回完整方案 markdown 与全部 ID。

没有 subagent 机制的宿主按下文三步直接驱动工具，流程与护栏完全一致。

## 第一步：发起

三种取数源，选一个（优先级 `feature_list_text` > `project_id` > `branch_name`）：

| 场景 | 参数 |
| --- | --- |
| 用户在本地分支上说「基于这个需求出方案」 | `branch_name=<当前分支>`（先 `git rev-parse --abbrev-ref HEAD`） |
| 用户给了 Friday 项目 | `project_id` |
| 用户直接贴了 feature list 原文 / 本地有需求文档 | `feature_list_text`（读文件内容传进去） |

```
create_feature_tech_plan(branch_name="feat/xxx")
```

可选 `repository_ids` 收窄候选仓范围——但它只是收窄，最终选仓仍由用户确认。

返回里要关注的：

- `status="awaiting_confirmation"`：正常，进第二步。
- `questions[]`：**原样呈现给用户**。每题含 `question` / `options` / `recommended` / `question_id`。
- `classification`：功能点分类结果。`summary` 是 `{new, modify, unclear}` 计数；`items[]` 每项含 `change_type`（`new` 新增 / `modify` 改造 / `unclear` 判不出）、`evidence_files`（判 modify 的证据文件）、`suggested_location`（判 new 的建议落点）。
- `feature_count` / `truncated`：功能点数量；`truncated=true` 说明 feature list 过大被截断，要告知用户。

**分支未绑定项目**（`error_code="branch_not_bound"`）：提示用户去项目工作台「关联分支」绑定，或改用 `project_id` / `feature_list_text`。不要自己瞎猜项目。

**项目没录 feature list**（`error_code="empty_feature_list"`）：如实告诉用户，别拿空清单硬跑。

## 第二步：确认

把 `questions` 用清楚的方式展示给用户——尤其要讲明白每题在问什么：

- **仓库确认题**：本次需求实际涉及哪些仓库。系统推荐项已勾选，用户可增删。
- **改造复核题**：系统判为「改造已有功能」的功能点，请用户确认判定是否正确。取消勾选的会按新增处理。
- **待定指认题**：系统判不出的功能点，请用户指认哪些属于改造。

顺带把 `classification.items` 里的证据展示出来（判 modify 的功能点对应哪些已有文件），用户才好判断。

拿到答复后：

```
confirm_feature_tech_plan(session_id=..., answers=[{question_id, selected, freeform_text}])
```

`selected` 单选传字符串、多选传数组。用户明确说「就按推荐来」时可以传 `answers=[]`，服务端会按推荐兜底——但这必须是用户说的，不能是你替他决定的。

## 第三步：取回方案

`confirm` 返回 `status="completed"` 就已经有方案了，直接读 `markdown`。

返回 `status="researching"` 说明调研容器在跑，需要轮询：

```
get_feature_tech_plan(session_id=...)
```

每次间隔十几秒到几十秒，直到 `status` 变成 `completed` 或 `failed`。这个工具每次调用都会推进一步编排，不调它方案就不会往前走——所以别只调一次就放弃。

- `completed`：`markdown` 是完整技术方案（整体方案 + 分仓方案 + 落点文件 + 伪代码 + 功能点分类表），`plan` 是结构化数据，`artifact_version_id` 是沉淀下来的产物版本。
- `failed`：读 `error` 告诉用户原因。
- 轮询很多次仍 `researching`：告诉用户调研还在进行，给出 `session_id` 让他稍后用 `get_feature_tech_plan` 查，不要无限等下去。

## 交付给用户

把 `markdown` 完整给出来，别只给摘要——用户要的就是这份方案。然后补充：

- `session_id`（后续追查 / 继续用）
- `run_id`
- 分类统计：新增 N 个、改造 M 个、待定 K 个
- 涉及仓库清单
- `truncated=true` 时说明有功能点未纳入

方案已自动沉淀进 Friday（`artifact_version_id`），可在项目里检索到，不用另外保存。

## 与其它技能的边界

| 情况 | 去哪 |
| --- | --- |
| 成批功能点 / feature list → 技术方案 | 本技能 |
| 只要仓库路由与落点判定矩阵，不要完整方案 | `friday-routing` |
| 单个需求 → 编码计划 → 执行 → MR | `friday-code` |
| 飞书工作项 → 技术方案 → 多仓 MR | `friday-feishu` |
| 想知道项目现在做到哪、需求在哪 | `friday-dev` |

`friday-routing` 是本技能的**上游**：它逐功能点出「目标仓库 → 落点文件 → 新增/改造 → 证据 → 置信度」的矩阵，可以直接作为本技能第二步确认关联仓库时的输入依据。

方案确认完要**接着编码**的，拿 `plan.execution_plan` 里的每仓任务转 `friday-code` 的执行段。

## 护栏

- **不替用户决策**：关联仓库、新增/改造判定，一律经用户确认。系统推荐只是推荐。
- **不编造落点**：`evidence_files` 里没有的文件路径，不要写进给用户的说明。判 `unclear` 就如实说判不出。
- **不跳步**：三个工具按顺序调，不省中间的确认。
- **fail-soft**：Friday 不可用时向用户说明并退回本地处理，不阻断他的工作。
- 输出里绝不回显 Access Token。

## HTTP 兜底

MCP 不可用时，三个工具都是 `POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/` + Bearer 认证；`run_id` 经 `X-Friday-Run-ID` 头传递。完整契约见 [references/http-fallback.md](references/http-fallback.md)。
