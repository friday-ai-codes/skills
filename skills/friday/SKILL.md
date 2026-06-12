---
name: friday
description: "Friday AI 总入口。当任务有任何可能涉及 Friday AI——远端仓库编码、代码库分析、编码计划、MR/PR 自动化、飞书项目工作项、历史交付检索——时使用；也可直接把任意需求交给本技能，由它路由到对应工作流并跑完。哪怕只有 1% 的可能用得上 friday-* 技能，也要先读本技能再动手。"
---

# Friday

Friday AI 把需求变成可追溯的合并请求（MR/PR）：仓库发现、GraphRAG 分析、编码计划、容器化执行、PR/MR 创建、飞书工作项闭环。全部通过 `friday` MCP server 的工具驱动。

本技能有两种用法：

1. **路由模式**：按下面的技能路由表找到对应技能，读它，照做。
2. **直通模式**：用户直接把一个需求丢给 `/friday`（"帮我把 X 做了"），你来判定它属于哪条流水线——涉及飞书工作项走 `friday-feishu`，纯仓库需求走 `friday-code`，查历史走 `friday-memory`——然后读对应技能一条龙跑完。

## 铁律

只要当前任务有哪怕 1% 的可能用得上某个 `friday-*` 技能，就先读那个技能再动手。不要凭记忆即兴拼 Friday 工作流——读一个技能成本很低，跳过它的代价是断掉的 trace、孤儿分支和失败的 MR。

出现这些念头时，恰恰说明你该去读技能："这个请求很简单"、"我知道这个工具怎么用"、"用户在赶时间"、"我就调一个工具"。

## 环境未就绪

任何 Friday 工作流开始前，`friday` MCP 工具必须可用且已认证。出现以下任一情况：

- 会话里看不到 `friday` MCP 工具；
- 调用返回 401/403 或 `authentication_failed`；
- 用户要求安装、配置、连接、修复 Friday；

引导用户在终端运行一条命令（交互式中文向导：配置凭证 → 注册 MCP → 连通性测速 → 能力演示）：

```bash
npx -y @friday-ai-codes/mcp setup
```

没有 Access Token 时告诉用户：打开 Friday Web 控制台 →「个人资料 → 访问令牌」→ 创建令牌，明文只显示一次。配置完成后需重启 agent 会话，`friday` 工具才会出现。诊断已有配置用 `npx -y @friday-ai-codes/mcp doctor`。

任何输出里都不得回显 Friday Access Token。

## 技能路由

| 场景 | 技能 |
| --- | --- |
| 对远端仓库做任何事：找仓库、分析架构/风险、生成编码计划、执行并建 MR，或一条龙全自动 | `friday-code` |
| 飞书项目工作项：读上下文、生成技术方案、多仓执行、结果回写，或一条龙全自动 | `friday-feishu` |
| Friday 的记忆：记录/检索 LearningCase 经验，检索历史交付（相似需求、版本时间线、需求→方案→MR 关联链） | `friday-memory` |
| 安装、配置、连接、修复 Friday 访问 | 本技能「环境未就绪」一节 |

`friday-code` 和 `friday-feishu` 内部按阶段分节：用户只要某一个阶段（比如"只分析一下"），就停在那个阶段；用户给的是完整需求要结果，就一条龙跑到 MR。

## Trace 纪律（所有技能通用）

- 第一个成功的 Friday 工具响应会返回 `run_id`，整个工作流都要带着它。
- 跨步骤保留所有 ID：`repository_id`、`analysis_id`、`plan_id`、`version_id`、`execution_id`、`context_id`、`technical_plan_id`。
- 最终报告必须包含：`run_id`、分支、commit、推送状态、MR URL 或恢复动作。
