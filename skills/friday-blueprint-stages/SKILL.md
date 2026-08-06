---
name: friday-blueprint-stages
description: "技术方案编排环节的单跑与能力测试：仓库路由、需求规格、仓库调研三个环节都能基于上游产物单独触发（`route_blueprint_repos` / `generate_requirement_spec` / `start_repo_research` + `get_repo_research`），结果永远只是提案；是否把仓库集写回项目关联由用户显式裁决（`apply_repo_association`）。典型触发：「单独跑一次这个需求的仓库路由/调研」「不走完整方案编排，只看路由会给什么候选」「绕过项目绑定看自动路由的真实输出」「把调研结果里的这几个仓关联到项目」「测一下路由/规格/调研环节的能力」。反向边界：要完整技术方案走 friday-solution / friday-feishu；只要粗筛矩阵走 friday-routing（本技能的路由是与正式编排同源的三分量融合版）。"
---

# Friday Blueprint Stages

把 `technical_blueprint` 编排链里的三个环节拆成可独立触发的能力：每个环节吃「上游产物 JSON」、
吐「与正式编排 `stage_state` 契约同形的产物」，可以单测每个环节的能力，也可以把上一环的输出
直接喂给下一环。**所有单跑结果都只是提案** —— 是否替换「项目」或「技术方案」的关联仓库，
永远由用户显式裁决。

## 前置门槛

看不到 `friday` MCP 工具，或调用返回 401/403，引导用户运行 `npx -y @friday-ai-codes/mcp setup`
（见 `friday` 技能「环境未就绪」一节）。

## 三个可单跑的环节

| 环节 | 工具 | 输入（上游产物） | 输出 | 副作用 |
| --- | --- | --- | --- | --- |
| 需求规格 | `generate_requirement_spec` | 需求原文（或直采 `feature_points`） | `requirement_spec`（goal + feature_points + intent）+ `ambiguity` 四维歧义报告与澄清问题 | 无（dry-run） |
| 仓库路由 | `route_blueprint_repos` | `requirement_spec` 或需求原文 | 与 `stage_state["routing"]` 同形的候选摘要（三分量 breakdown + 证据 + citations） | 无（dry-run） |
| 仓库调研 | `start_repo_research` → `get_repo_research` 轮询 | 需求原文/`requirement_spec` + 显式仓库集 | 逐仓 §7 调研结论（`fitness` / `findings` / `proposed_changes`） | 建沙箱会话与调研任务（不触碰正式编排） |

链式用法：`generate_requirement_spec` 的 `requirement_spec` 直接作为后两个工具的入参；
`route_blueprint_repos` 的 `candidates` 里挑仓（带 `role_suggestion`）直接作为
`start_repo_research` 的 `repositories` 入参。

## 与项目关联仓库的关系（关键语义）

- 项目已手动绑定仓库时，`route_blueprint_repos` 默认按绑定**固定路由**
  （`router_version="project_binding"`）——与正式编排行为一致。
- 传 `ignore_pin=true` 可绕过绑定，看自动路由的真实输出。做「人工绑定 vs 自动路由」对比时，
  两种各跑一次并排展示。
- 路由/调研结果**不会自动写回**项目关联或任何技术方案。唯一的写回路径是
  `apply_repo_association`（`ProjectBranch(source=manual)`，绑定后会固定后续技术方案路由）。

## 采纳协议（一条都不能省）

1. 把候选/调研结论完整呈现给用户：仓库、分数 breakdown、`fitness.verdict`、证据。
2. 明确问用户要不要写回、写回哪几个仓、绑哪个分支（缺省仓库默认分支）。
3. 拿到明确答复后才调 `apply_repo_association`（`action=bind|unbind`）；非项目成员会 403，
   如实转告，不要换身份重试。
4. 用户不表态 = 不写回。**绝不替用户拍板。**

## 调研环节注意事项

- `role=direct` 的仓会起隔离容器深调研（数分钟到 30 分钟），`role=indirect` 走服务端轻量合成
  （秒级）；无在线 runner 时深调研自动降级轻量合成（返回 `degraded=true`，如实告知用户）。
- 发起后用 `get_repo_research` 轮询，`all_terminal=true` 即全部出结论；深调研在途时建议
  30–60 秒一轮，不要高频轰炸。
- 单次最多 10 仓；调研会话只有发起者本人可读。

## 护栏

- dry-run 环节零落库；不要用它们承诺任何「已生成方案」——要正式方案走 `friday-solution`。
- 歧义报告里的澄清问题直接呈现给用户，答复拼进 `prior_context` 重跑，不要自答自跑。
- **绝不回显或上报任何凭证 / 密钥 / Access Token / 个人敏感信息。**

## 与其它技能的边界

| 情况 | 去哪 |
| --- | --- |
| 单跑某个环节 / 环节能力测试 / 采纳写回项目关联 | 本技能 |
| 成批功能点只要粗筛落点矩阵（agent 自己编排原子检索） | `friday-routing` |
| 要服务端托管的完整技术方案编排 | `friday-solution` |
| 飞书工作项 → 技术方案 → 多仓 MR | `friday-feishu` |

## HTTP 兜底

MCP 不可用时，所有工具都是 `POST {FRIDAY_BASE_URL}/api/mcp/tools/{tool_name}/` + Bearer 认证。
