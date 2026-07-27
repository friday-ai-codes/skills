# HTTP 兜底 — 仓库路由与落点判定工具

`friday` MCP server 不可用时，每个工具都是普通 HTTP 端点：

```text
POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/
Authorization: Bearer {FRIDAY_ACCESS_TOKEN}
Content-Type: application/json
X-Friday-Run-ID: {工作流首个调用返回的 run_id，首个调用可省略}
```

字段带 `*` 为必填。

## 工具契约

### 取数与索引健康度

| 工具 | 路径 | 请求字段 | 响应（关键字段） |
| --- | --- | --- | --- |
| `lookup_project_by_branch` | `/api/mcp/tools/lookup_project_by_branch/` | `branch_name`*, `repository_id` | `matched`, `project`, `candidates`, `context`, `included_layers`, `work_item_id`, `run_id` |
| `get_repository` | `/api/mcp/tools/get_repository/` | `repository_id`* | `repository`, `run_id` |

### 候选仓收敛

| 工具 | 路径 | 请求字段 | 响应（关键字段） |
| --- | --- | --- | --- |
| `route_repositories` | `/api/mcp/tools/route_repositories/` | `query`*, `top_k` | `query`, `ranked_repos`, `total`, `run_id` |

`ranked_repos` 每项含分数、`confidence`、`matched_node_paths`（命中的能力树节点路径）与 `sub_project`（monorepo 子应用）。

### 落点下钻

| 工具 | 路径 | 请求字段 | 响应（关键字段） |
| --- | --- | --- | --- |
| `search_rag_chunks` | `/api/mcp/tools/search_rag_chunks/` | `query`*, `repository_id`, `repository_ids`, `all_repositories`, `max_repos`, `branch`, `top_k`, `max_tokens` | `query`, `repository_id`, `repository_ids`, `branch`, `results`, `related_edges`, `total_tokens`, `run_id` |
| `grep_repository` | `/api/mcp/tools/grep_repository/` | `pattern`*, `repository_id`, `repository_ids`, `all_repositories`, `max_repos`, `branch`, `regex`, `case_sensitive`, `paths`, `include_globs`, `exclude_globs`, `context_lines`, `max_matches`, `output_mode`, `max_tokens` | `pattern`, `output_mode`, `repositories`, `total_matches`, `truncated`, `run_id` |
| `list_repository_files` | `/api/mcp/tools/list_repository_files/` | `repository_id`*, `branch`, `path`, `recursive`, `page`, `page_size` | `repository_id`, `branch`, `path`, `items`, `total`, `page`, `page_size`, `run_id` |
| `get_repository_file` | `/api/mcp/tools/get_repository_file/` | `repository_id`*, `file_path`*, `branch`, `start_line`, `end_line`, `max_lines` | `content`, `truncated`, `total_chunks`, `returned_lines`, `max_lines`, `source`, `commit_sha`, `total_lines`, `run_id` |
| `find_related_chunks` | `/api/mcp/tools/find_related_chunks/` | `repository_id`*, `chunk_id` / `file_path` / `symbol_name`（三选一）, `branch`, `relation_types`, `hops`, `direction`, `limit` | `repository_id`, `branch`, `source`, `related_chunks`, `run_id` |

`output_mode` 取 `files_only`（看命中分布）或 `content`（配合 `context_lines` 抠上下文）。

### 影响面与沉淀

| 工具 | 路径 | 请求字段 | 响应（关键字段） |
| --- | --- | --- | --- |
| `reverse_lookup_requirements` | `/api/mcp/tools/reverse_lookup_requirements/` | `repository_id`*, `file_path`, `line`, `chunk_id`, `branch` | `chunks`, `related_work_items`, `related_documents`, `paths`, `run_id` |
| `report_project_knowledge` | `/api/mcp/tools/report_project_knowledge/` | `content`*, `branch_name` / `project_id`（至少给一个）, `repository_id`, `source_conversation_id` | `accepted`, `draft_id`, `reason`, `run_id` |

## 请求示例

示例里的凭证一律走环境变量，**任何情况下都不要把真实 Access Token 写进命令、日志或输出**。

```bash
branch="$(git rev-parse --abbrev-ref HEAD)"

# 1. 按当前分支反查项目，取 feature list / 需求上下文
curl -sS -X POST "${FRIDAY_BASE_URL}/api/mcp/tools/lookup_project_by_branch/" \
  -H "Authorization: Bearer ${FRIDAY_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"branch_name\":\"${branch}\"}"

# 2. 逐功能点粗筛候选仓（读 ranked_repos 的分数 / confidence / sub_project）
curl -sS -X POST "${FRIDAY_BASE_URL}/api/mcp/tools/route_repositories/" \
  -H "Authorization: Bearer ${FRIDAY_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Friday-Run-ID: ${RUN_ID}" \
  -d '{"query":"章切换弹窗与小节目录","top_k":5}'

# 3. 落点下钻：先看命中分布，再抠上下文
curl -sS -X POST "${FRIDAY_BASE_URL}/api/mcp/tools/grep_repository/" \
  -H "Authorization: Bearer ${FRIDAY_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Friday-Run-ID: ${RUN_ID}" \
  -d '{"repository_id":"<repository_id>","pattern":"ChapterSwitch","output_mode":"files_only"}'

# 4. 结论沉淀（fail-soft，accepted=false 不重试）
curl -sS -X POST "${FRIDAY_BASE_URL}/api/mcp/tools/report_project_knowledge/" \
  -H "Authorization: Bearer ${FRIDAY_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Friday-Run-ID: ${RUN_ID}" \
  -d "{\"branch_name\":\"${branch}\",\"content\":\"<路由矩阵摘要与判定依据>\"}"
```

## 错误

错误格式为 `{ "error_code": "...", "detail": "..." }`。

| error_code | HTTP | 含义与处理 |
| --- | --- | --- |
| `authentication_failed` | 401 | Access Token 无效或过期，引导运行 `npx -y @friday-ai-codes/mcp setup` |
| `invalid_params` | 400 | 必填参数缺失或格式错（如 `find_related_chunks` 三个定位参数一个都没给） |
| `repository_not_indexed` | 400 | 仓库 / 分支尚未建立索引——**停下告知用户**去 Friday 完成索引，不要拿空检索下结论 |
| `repository_not_found` | 404 | 仓库不存在或已删除，让用户在 Friday 控制台核对 |
| `branch_not_bound` | 400 | 分支未绑定项目，引导用户在项目工作台「关联分支」，或改用其它取数源 |
| `forbidden` | 403 | 无权访问该仓库 / 项目 |

`report_project_knowledge` 返回 `accepted=false` 是 fail-soft 预期行为（非项目成员 / 分支无法唯一定位 / 质量门槛未过），不是错误，读 `reason` 说明即可，**不要重试轰炸**。
