# HTTP 兜底 — feature list 技术方案工具

`friday` MCP server 不可用时，工具都可通过普通 HTTP 端点调用：

```text
POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/
Authorization: Bearer {FRIDAY_ACCESS_TOKEN}
Content-Type: application/json
X-Friday-Run-ID: {工作流首个调用返回的 run_id，首个调用可省略}
```

## Canonical blueprint 契约

一旦创建响应给出 `blueprint_artifact_id`，必须停止把下面的 legacy 三工具当作完整控制面，
改用 canonical blueprint 端点：

| 工具 | 路径 | 核心请求字段 |
| --- | --- | --- |
| `create_feishu_technical_plan` | `/api/mcp/tools/create_feishu_technical_plan/` | `context_id`, `idempotency_key`, `blueprint_project_id`, `primary_team` |
| `get_technical_blueprint` | `/api/mcp/tools/get_technical_blueprint/` | `artifact_id` |
| `answer_blueprint_clarification` | `/api/mcp/tools/answer_blueprint_clarification/` | `thread_id`, `body`, `artifact_id`（可选校验） |
| `request_technical_blueprint_changes` | `/api/mcp/tools/request_technical_blueprint_changes/` | `artifact_id`, `comment`, `rework_scope` |
| `approve_technical_blueprint` | `/api/mcp/tools/approve_technical_blueprint/` | `artifact_id`, `artifact_version_id`, `content_hash`, `technical_plan_id` |

控制顺序固定为：取件并核验 `project_id` → 真人逐题澄清 → 原样展示 `pending_review`
的 `markdown` → 真人选择退回或批准。批准必须提交刚展示的同一 `artifact_version_id` 和
`content_hash`；收到 `stale` 时重新取件并重新确认。只有
`approve_technical_blueprint` 返回 `confirmed` envelope 后才允许进入 Coding。

canonical 工具返回 404 或运行时根本没有这些工具时，应报告 MCP 版本过旧并停止；禁止
退回 legacy 流程绕过版本 CAS、人审和 Coding 门禁。`get_feishu_work_item_context` 的
legacy `project_id`/`space_id` 是 Space 身份；fresh create 必须用稳定事件键作为
`idempotency_key`。只有响应显式给出可信 `blueprint_project_id` 时才原样传入；
服务端也只允许唯一、严格的 `ProjectWorkItemLink` 自动绑定。缺少可信 Project 时允许
创建 Space-scoped unbound blueprint，禁止拿 Space UUID 代替、猜测同一 Space 的任意
Project，并且不得仅因 Project 缺失而阻断。只有已绑定 Project 时，
`get_technical_blueprint.project_id` 才与该 `blueprint_project_id` 比较。工作项快照有明确且
唯一的 Team 字段时，把人类可读 `label` 原样传入 `primary_team`；缺失或歧义时留空并把服务端
团队澄清题原样交给用户，禁止猜测。宿主 Issue 状态为
`cancelled` 但 artifact 仍为非终态时属于 orphan，只允许对账/停止自动推进，不得代替
人类批准。

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

HTTP 返回的 `repo_confirmation` 只有在候选仓调研成功且证据可读时才能交给人类回答。
若任一 direct 候选的 `task_status` 为 `failed`，或者候选的 `responsibility` 为空、
`fitness.reasons` 为空、`current_state_summary` 为空，必须标记为调研失败并停止：

- 不得发布或展示为可回答的 `repo_confirmation`，不得要求人类在无证据时盲选仓库。
- 不得调用 `answer_blueprint_clarification`，不得用路由分数或 `matched_domains` 冒充
  仓库现状证据。
- 必须列出失败仓库与缺失字段并重跑 repo_research；恢复后重新调用
  `get_technical_blueprint`，确认所有 direct 候选都有职责、适配理由和现状摘要，才可
  展示新的仓库确认题。
- 恢复期间不得批准、生成 confirmed envelope 或派发 Coding。

### Cancelled/orphan 只读不变量

一旦宿主 Issue 为 `cancelled`，Issue 状态与 Friday artifact 均为只读；HTTP fallback
也只能读取两侧状态、报告 orphan 并立即退出：

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

## Legacy feature list 工具契约

以下三个工具只负责 feature list 初始方案链，并共享同一响应形状（见下「响应字段」）。

| 工具 | 路径 | 请求字段 |
| --- | --- | --- |
| `create_feature_tech_plan` | `/api/mcp/tools/create_feature_tech_plan/` | `project_id` / `branch_name` / `feature_list_text`（三选一必填），`repository_id`, `repository_ids` |
| `confirm_feature_tech_plan` | `/api/mcp/tools/confirm_feature_tech_plan/` | `session_id`*, `answers` |
| `get_feature_tech_plan` | `/api/mcp/tools/get_feature_tech_plan/` | `session_id`* |

### 响应字段

| 字段 | 说明 |
| --- | --- |
| `session_id` | 方案会话 ID，贯穿三个工具 |
| `status` | `awaiting_confirmation` / `researching` / `completed` / `failed` |
| `questions` | 待确认题 `[{question_id, question, type, options, recommended}]` |
| `classification` | `{items: [{key, module, name, change_type, confidence, evidence_files, suggested_location, reason}], summary: {new, modify, unclear}}` |
| `routing` | 仓库路由候选 |
| `plan` | 结构化 MergedPlan（`completed` 时才有） |
| `markdown` | 完整技术方案正文（`completed` 时才有） |
| `artifact_version_id` | 沉淀的产物版本 ID |
| `feature_count` / `truncated` | 功能点数量 / 是否被截断 |
| `project_id` / `source` | 定位到的项目 / 取数来源（`project`、`branch`、`text`） |
| `error` | `failed` 时的结构化错误 |
| `run_id` | 贯穿工作流的 trace ID |

## 请求示例

```bash
branch="$(git rev-parse --abbrev-ref HEAD)"

# 1. 发起（只出待确认项，不出方案）
curl -sS -X POST "${FRIDAY_BASE_URL}/api/mcp/tools/create_feature_tech_plan/" \
  -H "Authorization: Bearer ${FRIDAY_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"branch_name\":\"${branch}\"}"

# 2. 确认（把 questions 给用户看过、拿到答复之后）
curl -sS -X POST "${FRIDAY_BASE_URL}/api/mcp/tools/confirm_feature_tech_plan/" \
  -H "Authorization: Bearer ${FRIDAY_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Friday-Run-ID: ${RUN_ID}" \
  -d '{"session_id":"<session_id>","answers":[{"question_id":"<qid>","selected":["backend-repo"]}]}'

# 3. 轮询取方案（status=researching 时反复调，每次都会推进一步编排）
curl -sS -X POST "${FRIDAY_BASE_URL}/api/mcp/tools/get_feature_tech_plan/" \
  -H "Authorization: Bearer ${FRIDAY_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Friday-Run-ID: ${RUN_ID}" \
  -d '{"session_id":"<session_id>"}'
```

## 错误

错误格式为 `{ "error_code": "...", "detail": "..." }`。

| error_code | HTTP | 含义与处理 |
| --- | --- | --- |
| `authentication_failed` | 401 | Access Token 无效，引导运行 `npx -y @friday-ai-codes/mcp setup` |
| `invalid_params` | 400 | 三个取数源一个都没给，或参数格式错 |
| `branch_not_bound` | 400 | 分支未绑定项目，引导用户在项目工作台「关联分支」绑定 |
| `empty_feature_list` | 400 | 未解析出功能点（项目未录 feature list，或文本无可识别结构） |
| `project_not_found` | 404 | 项目不存在 |
| `session_not_found` | 404 | 会话不存在 |
| `not_feature_solution_session` | 400 | 该 session_id 不是 feature list 方案会话 |
| `forbidden` | 403 | 无权访问该项目 / 该会话（非创建者且非项目可读者） |

`status="researching"` **不是错误**——调研容器在跑，继续轮询 `get_feature_tech_plan`。
