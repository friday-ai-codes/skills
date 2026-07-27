---
name: friday-routing
description: "由 feature list / PRD 出「仓库路由与落点判定矩阵」：逐个功能点判定落到哪个仓库（monorepo 下钻到子应用）、仓库里的哪个目录/文件、是新增还是改造、证据是什么、有多确定。典型触发：「这批需求该改哪些仓库」「这份 feature list / PRD 的落点在哪」「哪些是新增哪些是改造」「给我一份路由矩阵」「这些功能点分别落在哪个模块」。核心机制：自己编排 Friday 原子检索工具做系统性调研，过程与证据全透明；无证据一律降级 unclear，判不准的地方一轮批量带选项问用户，绝不替用户拍板。反向边界：要完整技术方案（含分仓方案与伪代码）走 friday-solution；单个需求要编码计划 / 执行 / MR 走 friday-code；飞书工作项走 friday-feishu。"
---

# Friday Routing

输入一份 feature list 或 PRD，输出一份**路由与落点判定矩阵**：每个功能点落到哪个仓库、仓库里的哪个位置、是新增还是改造、依据是什么、有多确定。

这是 `friday-solution` 的**上游**：它出的是给人看的完整技术方案（含伪代码），本技能只出落点判定这一半，但过程与证据对用户全透明——每一行都能追到真实文件路径或检索命中。

## 前置门槛

看不到 `friday` MCP 工具，或调用返回 401/403，引导用户运行 `npx -y @friday-ai-codes/mcp setup`（见 `friday` 技能「环境未就绪」一节）。第一个成功响应返回的 `run_id` 全程保留，最终矩阵里要带上。

## 铁律：纯 agent 驱动

本技能**自己编排原子工具**做系统性调研，不走任何服务端的方案编排黑盒：

- 调研过程、每一步用了什么工具、命中了什么，都对用户可见；
- 澄清由你自己发起、直接问用户，不依赖服务端组装的确认题；
- 判定依据一律是工具真实返回的文件路径与 chunk，不是推理出来的「应该在」。

要服务端托管的完整方案编排（发起 → 确认 → 取回三段式），那是 `friday-solution` 的路径，不在本技能里做。

## 取数源

四选一，拿到功能点清单才能开工：

| 场景 | 怎么取 |
| --- | --- |
| 用户在本地分支上说「这批需求落哪」 | 先 `git rev-parse --abbrev-ref HEAD` 拿分支名，再 `lookup_project_by_branch(branch_name=…)` 反查项目并召回 feature list / 需求 |
| 用户给了 Friday 项目 | 直接用 `project_id`，需要 PRD 正文用 `read_project_doc`，深挖用 `search_project_context` / `grep_project` |
| 用户直接贴了 feature list / PRD 原文 | 就用原文，不必回 Friday 取 |
| 本地有需求文档 | 读文件内容 |

分支未绑定项目（`matched=false` 或 `branch_not_bound`）：提示用户去项目工作台「关联分支」绑定，或改用其它取数源。**不要瞎猜项目**，猜错的上下文比没有上下文更糟。

功能点先拆成一份编号清单并与用户对齐颗粒度——矩阵是一行一个功能点，颗粒度错了后面全白做。

## 阶段一 — 索引健康度与候选仓收敛

**先确认能不能查，再开始查。**

1. `get_repository` 读目标仓库的元数据、默认分支与索引状态。返回 `repository_not_indexed`，或仓库/分支根本没索引 → **停下来告诉用户去 Friday 完成索引**，不要拿空检索继续往下推。空结果不等于「代码不存在」，只等于「查不到」。
2. 逐功能点用 `route_repositories` 做粗筛，`query` 用功能点原文（可选 `top_k`）。读 `ranked_repos` 里的：
   - 分数与 `confidence`：第一名明显领先 → 候选收敛；分数接近或普遍很弱 → 记为待澄清项，留到阶段五批量问。
   - `matched_node_paths`：命中的能力树节点路径，这是后面下钻落点的入口线索。
   - `sub_project`：**monorepo 必须下钻到子应用**，停在仓库级的路由等于没路由。
3. 把「功能点 → 候选仓（含子应用）」列成中间表，再进阶段二。多个功能点命中同一仓库的，合并成一批一起下钻，省往返。

## 阶段二 — 落点下钻

对每个功能点，在候选仓里找到**真实落点**。

1. `search_rag_chunks` 是主力：用功能点描述做 `query`（带 `repository_id`，可选 `branch` / `top_k` / `max_tokens`），混合语义 + 关键词 + 图谱检索，定位相关模块。
2. 需要**穷举**时切 `grep_repository`（语义检索保证不了全量）。推荐两步法：先 `output_mode="files_only"` 看命中分布，再 `output_mode="content"` + `context_lines` 抠关键上下文——能省掉大量精确读文件的往返。支持正则、大小写开关、`paths` / `include_globs` / `exclude_globs` 过滤。
3. `list_repository_files` 浅扫目录结构，确认落点形态（这个仓库是按 feature 分目录还是按层分目录，新代码该放哪）。
4. `get_repository_file` 读精确文件（支持行范围），确认命中的确实是这个功能点该改的地方。
5. `find_related_chunks` 从重要命中往外扩展（`chunk_id` / `file_path` / `symbol_name` 三选一），把一个入口扩成一片影响面。

判定规则：

- 判 `modify`：**必须指到真实既有文件**，路径来自工具返回，不是你补全出来的。指不出文件就不能判 `modify`。
- 判 `new`：给出建议落点目录，并说明依据的是哪种既有同类结构（「参照 `src/features/xxx/` 的组织方式」），依据同样要来自真实目录扫描。
- 两者都拿不到证据：判 `unclear`，进阶段五的澄清清单。

## 阶段三 — 跨仓依赖

接口契约天然有两侧，只判一侧的落点是不完整的。

- 前端调用点 ↔ 后端实现，用 `grep_repository` 精确枚举：传 `repository_ids` 数组或 `all_repositories=true` 跨仓检索，结果按仓库分组。
- 找后端实现：用接口路径匹配路由注册 / 处理函数（`@app.route` / `@RequestMapping` / `router.get` / handler 注册）。
- 找前端调用点：用 URL 常量或请求封装名（`fetch` / `axios` / `request` / 接口常量）枚举全部调用位置。
- 接口路径在前后端命名常有差异（前缀、版本号、path 参数占位）：**命中为空时退一步**，用更短的稳定片段（资源名 / 动词）重试，不要一次空命中就下「没有调用方」的结论。

每个跨仓依赖都要落进矩阵最后一列，写清楚「改 A 仓的 X，B 仓的 Y 必须同步改」。

## 阶段四 — 影响面与历史

1. 判为 `modify` 的落点，用 `reverse_lookup_requirements` 反查它关联的已交付需求（`related_work_items`）与文档（`related_documents`）——改这里会碰到哪些已上线的东西，是回归风险的直接依据。
2. `search_delivery_knowledge` 找相似需求的历史交付（可带 `repository_ids` / `as_of` 收窄），`search_learning_cases` 找同类改动踩过的坑。
3. 有 Friday 项目上下文时，`search_project_context` / `grep_project` / `read_project_doc` 深挖 PRD 与项目记忆，补齐功能点背后的业务约束。

这一阶段的产出不是新的行，而是给已有行补「风险」列。

## 阶段五 — 置信度定级与批量澄清

逐行定级：

| 置信度 | 判据 |
| --- | --- |
| high | 仓库路由分数明显领先，落点有真实文件证据，变更类型无歧义 |
| medium | 仓库明确但落点有多个候选，或落点明确但新增/改造存疑 |
| low | 路由分数接近 / 检索无有效命中 / 只能靠命名推测 |

**只有 low 和关键 medium 才问用户，不为问而问。** 高置信度的行直接进矩阵。

澄清协议（四条，一条都不能省）：

1. **批量问**：一轮把所有待澄清点摆出来，编号列出，不要逐条来回消耗用户。
2. **每题必须给具体选项**：哪个仓库、哪个落点目录、新增还是改造——是具体选择，不是「你觉得这块该怎么办」这种开放式提问。
3. **每题标出推荐项与推荐理由**：说清楚你为什么倾向这一项，证据是什么。
4. **用户答复前不得替用户拍板**：待澄清的行在矩阵里保持 `unclear`，等答复回来再改。

格式示例：

```text
以下 3 个功能点判不准，请逐条选择（括号内为推荐项与理由）：

1. 「掌握度浮层」落在哪个仓库？
   A. web-student（推荐：route_repositories 第一名 0.71，命中 学习页/浮层 节点）
   B. web-teacher（分数 0.58，但没有学生端浮层的同类实现）
   C. 都不是，我来指定
```

## 阶段六 — 输出路由矩阵

**这是本技能唯一的产物。** 七列，一行一个功能点：

| 功能点 | 目标仓库 | 落点（目录/文件） | 变更类型 | 证据 | 置信度 | 风险与跨仓依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1 章切换弹窗 | web-student / apps/h5 | `src/features/topic-map/ChapterSwitch.vue` | modify | `src/features/topic-map/ChapterSwitch.vue:1-88`（既有弹窗组件） | high | 章列表接口复用，无跨仓改动 |
| 4.3 多题合并诊断 | api-exam | `app/services/diagnosis/`（新增 merge 策略） | new | 参照 `app/services/diagnosis/single.py` 的同类结构 | medium | 前端 web-student 需同步解析新返回结构 |
| 9.2 掌握度历史最佳 | unclear | — | unclear | 检索无有效命中 | low | 待澄清 #3，用户未指定仓库 |

矩阵后附：

- `run_id`
- 涉及仓库清单（monorepo 标注子应用）
- 计数：`new` N 个 / `modify` M 个 / `unclear` K 个
- 待澄清项编号清单（若有）

## 阶段七 — 结论沉淀

跑完用 `report_project_knowledge` 把路由结论写回项目记忆，供后续 `friday-solution` / `friday-code` 召回复用：

```text
report_project_knowledge(branch_name=<当前 git 分支>, content=<矩阵摘要 + 关键判定依据>)
```

**按当前分支自动定位项目，不需要 `project_id`**，切分支切项目都通用。沿用既有 fail-soft 语义：非项目成员 / 分支未绑定 / 质量门槛未过时，返回 `accepted=false` 并静默跳过，**绝不阻断**，也不要重试轰炸。

沉淀内容只写路由结论与依据。**绝不上报任何凭证 / 密钥 / Access Token / 个人敏感信息。**

## 护栏

- **无证据一律降级 `unclear`**：拿不到真实文件路径或 chunk 就不下判定。**不猜、不编造文件路径**——编出来的落点比空着危害大得多。
- **未索引就停下告知**：仓库 / 分支没索引时明说，让用户先去 Friday 完成索引，不能拿空检索下结论。
- **只出矩阵**：不出伪代码、不出模块详细设计、不出完整技术方案文档。用户要这些，按下面的边界表分流。
- **不替用户拍板**：待澄清项保持 `unclear`，等用户答复。
- **fail-soft**：Friday 不可用时向用户说明并退回本地处理，不阻断他的工作。
- **绝不回显或上报任何凭证 / 密钥 / Access Token / 个人敏感信息。**

## 与其它技能的边界

| 情况 | 去哪 |
| --- | --- |
| 成批功能点 → 只要仓库路由与落点判定矩阵 | 本技能 |
| 要完整技术方案（分仓方案 + 整体方案 + 伪代码） | `friday-solution`（本技能是它的上游，矩阵可直接作为它确认关联仓库的输入依据） |
| 单个需求 → 编码计划 → 执行 → MR | `friday-code` |
| 飞书工作项 → 技术方案 → 多仓 MR | `friday-feishu` |
| 想知道项目现在做到哪、需求在哪 | `friday-dev` |
| 历史交付检索、相似需求、版本时间线 | `friday-memory` |

## HTTP 兜底

MCP 不可用时，所有工具都是 `POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/` + Bearer 认证；`run_id` 经 `X-Friday-Run-ID` 头传递。完整契约见 [references/http-fallback.md](references/http-fallback.md)。
