# HTTP 兜底 — feature list 技术方案工具

`friday` MCP server 不可用时，三个工具都是普通 HTTP 端点：

```text
POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/
Authorization: Bearer {FRIDAY_ACCESS_TOKEN}
Content-Type: application/json
X-Friday-Run-ID: {工作流首个调用返回的 run_id，首个调用可省略}
```

## 工具契约

三个工具**共享同一响应形状**（见下「响应字段」），差别只在请求与产出阶段。

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
