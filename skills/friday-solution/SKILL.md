---
name: friday-solution
description: "由 feature list 生成技术方案：先判定每个功能点是新增功能还是改造已有功能，结合仓库调研给出关联仓库，让用户确认后输出「分仓方案 + 整体方案」（含落点文件与伪代码）。典型触发：「根据这份 feature list 出技术方案」「这些需求要改哪些仓库」「帮我看看这批功能哪些是新增哪些是改造」「基于当前分支的需求清单做技术方案」，以及用户明确说要「创建/生成技术方案」。核心机制：三段式工具链（发起→确认→取回），关联仓库与新增/改造判定必须经用户确认，绝不替用户拍板。反向边界：单个零散需求、没有 feature list 形态的需求走 friday-code；飞书工作项走 friday-feishu。"
---

# Friday Solution

把一份 feature list 变成可执行的技术方案。与 `friday-code`（单需求 → 编码计划 → MR）不同，本技能处理的是**成批功能点**，产物是给人看的技术方案文档：每个功能点是新增还是改造、落在哪些仓库、改哪些文件、关键逻辑长什么样。

## 前置门槛

看不到 `friday` MCP 工具，或调用返回 401/403，引导用户运行 `npx -y @friday-ai-codes/mcp setup`（见 `friday` 技能「环境未就绪」一节）。保留首个响应的 `run_id`。

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
