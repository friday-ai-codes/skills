# HTTP 兜底 — 本地开发上下文工具

`friday` MCP server 不可用时，每个工具都是普通 HTTP 端点：

```text
POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/
Authorization: Bearer {FRIDAY_ACCESS_TOKEN}
Content-Type: application/json
X-Friday-Run-ID: {工作流首个调用返回的 run_id，首个调用可省略}
```

## 工具契约

### 分支召回

| 工具 | 路径 | 请求字段 | 响应（关键字段） |
| --- | --- | --- | --- |
| `lookup_project_by_branch` | `/api/mcp/tools/lookup_project_by_branch/` | `branch_name`*, `repository_id` | `matched`, `project`, `candidates`, `context`, `included_layers`, `work_item_id`, `run_id` |

### 项目上下文深挖

| 工具 | 路径 | 请求字段 | 响应（关键字段） |
| --- | --- | --- | --- |
| `search_project_context` | `/api/mcp/tools/search_project_context/` | `project_id`*, `query`*, `top_k`, `entity_kinds` | `results`, `total`, `run_id` |
| `grep_project` | `/api/mcp/tools/grep_project/` | `project_id`*, `query`*, `top_k` | `results`, `total`, `run_id` |
| `read_project_doc` | `/api/mcp/tools/read_project_doc/` | `project_id`*, `doc_type`* | `rendered_markdown`, `blocks`, `run_id` |
| `reverse_lookup_requirements` | `/api/mcp/tools/reverse_lookup_requirements/` | `repository_id`*, `file_path`, `line`, `chunk_id`, `branch` | `related_work_items`, `related_documents`, `paths`, `run_id` |

### 收工沉淀

| 工具 | 路径 | 请求字段 | 响应（关键字段） |
| --- | --- | --- | --- |
| `report_session_knowledge` | `/api/mcp/tools/report_session_knowledge/` | `question`*, `answer`*, `repository_id`, `git_url`, `branch_name`, `project_id`, `session_id`, `response_model`, `provider`, `input_tokens`, `output_tokens`, `client` | `accepted`, `capture_id`, `deduplicated`, `link_reason`, `repository_id`, `project_id`, `run_id` |
| `report_project_knowledge` | `/api/mcp/tools/report_project_knowledge/` | `content`*, `branch_name`/`project_id`, `repository_id`, `writeback_mode`, `target`, `distill` | `accepted`, `draft_id`, `reason`, `run_id` |
| `report_project_state` | `/api/mcp/tools/report_project_state/` | `apis`*, `branch_name`/`project_id`, `repository_id` | `applied`, `results`, `total_applied`, `run_id` |

`report_session_knowledge` 的 12 个请求字段中，只有 `question` 与 `answer` 必填；常规客户端可选传 `git_url`、`branch_name`、`session_id`、`response_model`、`provider`、`input_tokens`、`output_tokens`、`client`。`repository_id` 与 `project_id` 是服务端开放的可选挂钩字段，但客户端不得根据默认分支猜测或主动拼装 `project_id`。即使工作区是 **clean tree**（无 git 改动），每轮问答仍应提交；`answer` 只取用户可见的最终答案，禁止上传 transcript、隐藏思维链、凭证 / 密钥 / token 或个人敏感信息。

两条写入路径职责独立：`report_session_knowledge` 记录 SessionCapture 原始问答；`report_project_knowledge` 只在存在 git 交付变更时记录 ProjectMemory 交付总结，并保留 diff 门闩与质量门槛。不得把二者合并为一个笼统的“记忆写回”。

## 请求示例

```bash
branch="$(git rev-parse --abbrev-ref HEAD)"
curl -sS -X POST "${FRIDAY_BASE_URL}/api/mcp/tools/lookup_project_by_branch/" \
  -H "Authorization: Bearer ${FRIDAY_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"branch_name\":\"${branch}\"}"
```

## 错误

错误格式为 `{ "error_code": "...", "detail": "..." }`。`authentication_failed` 表示 Access Token 无效——引导用户运行 `npx -y @friday-ai-codes/mcp setup`。`report_*` 返回 `accepted=false` / `applied=false` 是 fail-soft 预期行为（非成员 / 分支无法唯一定位 / 质量门槛未过），不要重试轰炸。
