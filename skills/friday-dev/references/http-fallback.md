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
| `report_project_knowledge` | `/api/mcp/tools/report_project_knowledge/` | `content`*, `branch_name`/`project_id`, `repository_id`, `writeback_mode`, `target`, `distill` | `accepted`, `draft_id`, `reason`, `run_id` |
| `report_project_state` | `/api/mcp/tools/report_project_state/` | `apis`*, `branch_name`/`project_id`, `repository_id` | `applied`, `results`, `total_applied`, `run_id` |

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
