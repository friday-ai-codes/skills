/**
 * 技能安装核心：把包内 skills/<name>/ 整目录拷贝到各 agent 的技能目录，
 * 并把 friday 入口引导默认注入各 agent 的指令文件（marker 幂等）：
 *
 * | Agent       | 项目级                      | 全局                              |
 * | ----------- | --------------------------- | --------------------------------- |
 * | Cursor      | .cursor/rules/friday.mdc    | ~/.cursor/rules/friday.mdc（尽力而为，官方推荐 Settings → Rules） |
 * | Claude Code | CLAUDE.md                   | ~/.claude/CLAUDE.md               |
 * | Codex       | AGENTS.md                   | ~/.codex/AGENTS.md                |
 * | Gemini CLI  | GEMINI.md                   | ~/.gemini/GEMINI.md               |
 * | OpenCode    | AGENTS.md                   | ~/.config/opencode/AGENTS.md      |
 *
 * 注入内容是一段精简引导（指向已安装的 friday/SKILL.md），不是技能全文，
 * 避免撑爆用户的常驻上下文。Codex 与 OpenCode 项目级共用 AGENTS.md，
 * marker 保证第二次注入自动跳过。
 */

import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { skillsDirFor, subagentsDirFor, supportsSubagents } from './agents.mjs';

export const BOOTSTRAP_BEGIN = '<!-- friday-ai-skills:begin -->';
export const BOOTSTRAP_END = '<!-- friday-ai-skills:end -->';

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 合并 Cursor hooks v1：保留用户配置，只按 Friday command basename 替换/去重。
 */
export function mergeCursorHooksConfig(existing, fridayEntries) {
  const source = objectOrEmpty(existing);
  const hooks = { ...objectOrEmpty(source.hooks) };

  for (const [eventName, configured] of Object.entries(objectOrEmpty(fridayEntries))) {
    const replacements = Array.isArray(configured) ? configured : [configured];
    const byBasename = new Map(
      replacements
        .filter((entry) => entry && typeof entry.command === 'string')
        .map((entry) => [basename(entry.command), { ...entry }]),
    );
    const emitted = new Set();
    const current = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
    const merged = [];

    for (const entry of current) {
      const commandBasename =
        entry && typeof entry.command === 'string' ? basename(entry.command) : '';
      if (!byBasename.has(commandBasename)) {
        merged.push(entry);
      } else if (!emitted.has(commandBasename)) {
        merged.push(byBasename.get(commandBasename));
        emitted.add(commandBasename);
      }
    }
    for (const [commandBasename, entry] of byBasename) {
      if (!emitted.has(commandBasename)) merged.push(entry);
    }
    hooks[eventName] = merged;
  }

  return { ...source, version: 1, hooks };
}

/**
 * 原子写入合并后的 Cursor hooks.json；非法 JSON 必须保留原文件。
 */
export function writeMergedCursorHooksFile(targetPath, fridayEntries) {
  let existing = {};
  if (existsSync(targetPath)) {
    const original = readFileSync(targetPath, 'utf8');
    try {
      existing = JSON.parse(original);
    } catch {
      return {
        ok: false,
        warning: `${targetPath} 不是合法 JSON，文件未修改；请手工修复 hooks.json 后重新安装。`,
      };
    }
  }

  const merged = mergeCursorHooksConfig(existing, fridayEntries);
  mkdirSync(dirname(targetPath), { recursive: true });
  const temporary = join(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporary, targetPath);
    return { ok: true, value: merged };
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/** 列出包内打包的技能（名字 + frontmatter description）。 */
export function bundledSkills(packageRoot) {
  const skillsRoot = join(packageRoot, 'skills');
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillFile = join(skillsRoot, entry.name, 'SKILL.md');
      let description = '';
      if (existsSync(skillFile)) {
        const match = readFileSync(skillFile, 'utf8').match(/^description:\s*"?(.*?)"?\s*$/m);
        description = match ? match[1] : '';
      }
      return { name: entry.name, dir: join(skillsRoot, entry.name), description };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 把全部技能装进一个 agent 的技能目录。
 * 返回 { agent, targetDir, installed: string[] }。
 */
export function installSkillsForAgent(packageRoot, agent, { project }) {
  const targetDir = skillsDirFor(agent, { project });
  mkdirSync(targetDir, { recursive: true });
  const installed = [];
  for (const skill of bundledSkills(packageRoot)) {
    cpSync(skill.dir, join(targetDir, skill.name), { recursive: true, force: true });
    installed.push(skill.name);
  }
  return { agent, targetDir, installed };
}

/**
 * 安装 Cursor 问答采集 wrappers，并非破坏性合并 hooks.json。
 */
export function installCursorHooks(packageRoot, { project }) {
  const cursorRoot = project ? join(process.cwd(), '.cursor') : join(homedir(), '.cursor');
  const targetDir = join(cursorRoot, 'hooks');
  const sourceDir = join(packageRoot, 'hooks', 'cursor');
  const commands = project
    ? {
        before: '.cursor/hooks/friday-before-submit-prompt.sh',
        after: '.cursor/hooks/friday-after-agent-response.sh',
      }
    : {
        before: './hooks/friday-before-submit-prompt.sh',
        after: './hooks/friday-after-agent-response.sh',
      };
  const files = [
    ['before-submit-prompt', 'friday-before-submit-prompt.sh'],
    ['after-agent-response', 'friday-after-agent-response.sh'],
  ];

  mkdirSync(targetDir, { recursive: true });
  for (const [sourceName, targetName] of files) {
    const target = join(targetDir, targetName);
    cpSync(join(sourceDir, sourceName), target, { force: true });
    chmodSync(target, 0o755);
  }

  const configPath = join(cursorRoot, 'hooks.json');
  const merge = writeMergedCursorHooksFile(configPath, {
    beforeSubmitPrompt: [{ command: commands.before, timeout: 15 }],
    afterAgentResponse: [{ command: commands.after, timeout: 15 }],
  });
  return {
    targetDir,
    configPath,
    installed: files.map(([, targetName]) => targetName),
    ...merge,
  };
}

// ---------------------------------------------------------------------------
// Subagent 定义分发（agents/*.md → 各 agent 原生 subagent 目录）
// ---------------------------------------------------------------------------

/** 列出包内打包的 subagent 定义（名字 + frontmatter description）。 */
export function bundledSubagents(packageRoot) {
  const agentsRoot = join(packageRoot, 'agents');
  if (!existsSync(agentsRoot)) return [];
  return readdirSync(agentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const file = join(agentsRoot, entry.name);
      const content = readFileSync(file, 'utf8');
      const nameMatch = content.match(/^name:\s*"?(.*?)"?\s*$/m);
      const descMatch = content.match(/^description:\s*"?(.*?)"?\s*$/m);
      return {
        name: nameMatch ? nameMatch[1] : entry.name.replace(/\.md$/, ''),
        file,
        fileName: entry.name,
        description: descMatch ? descMatch[1] : '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 按目标 agent 口味转换 subagent 定义。
 *
 * canonical 是 Claude Code 格式；Cursor 的 subagent frontmatter 不认
 * Claude 专属键（tools 白名单 / color / effort / model），保留会导致解析
 * 告警或被静默忽略，安装时剥离——工具约束仍由正文协议兜底。
 */
export function transformSubagent(content, flavor) {
  if (flavor !== 'cursor') return content;
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return content;
  const kept = match[1]
    .split('\n')
    .filter((line) => !/^(tools|color|effort|model):/.test(line))
    .join('\n');
  return `---\n${kept}\n---\n${content.slice(match[0].length)}`;
}

/**
 * 把全部 subagent 定义装进一个 agent 的原生 subagent 目录。
 * 不支持 subagent 的 agent（Codex / Gemini CLI / OpenCode 等）返回 skipped。
 * 返回 { agent, targetDir, installed: string[], skipped: boolean }。
 */
export function installSubagentsForAgent(packageRoot, agent, { project }) {
  if (!supportsSubagents(agent)) {
    return { agent, targetDir: null, installed: [], skipped: true };
  }
  const targetDir = subagentsDirFor(agent, { project });
  const subagents = bundledSubagents(packageRoot);
  if (subagents.length === 0) {
    return { agent, targetDir, installed: [], skipped: false };
  }
  mkdirSync(targetDir, { recursive: true });
  const installed = [];
  for (const subagent of subagents) {
    const content = transformSubagent(readFileSync(subagent.file, 'utf8'), agent.subagentFlavor);
    writeFileSync(join(targetDir, subagent.fileName), content);
    installed.push(subagent.name);
  }
  return { agent, targetDir, installed, skipped: false };
}

/** 注入正文：精简引导，指向已安装的 friday 入口技能（不塞全文）。 */
function bootstrapBody(skillsDir) {
  const skillPath = join(skillsDir, 'friday', 'SKILL.md');
  return `${BOOTSTRAP_BEGIN}
## Friday AI Skills

已安装 Friday AI skills（friday / friday-dev / friday-routing / friday-solution / friday-code / friday-feishu / friday-memory，位于 \`${skillsDir}\`）。

动手前先过决策门，任一命中就先完整阅读入口技能 \`${skillPath}\` 再按其路由表行动：
1. **本地分支项目上下文**：用户问「开发到哪一步了 / 继续开发 / 现在有什么问题 / PRD·feature list·技术方案」，或任何仓库编码任务开工——主动走 \`friday-dev\`（按当前分支召回项目上下文），不要等用户点名。
2. 目标代码不在当前本地工作区（远端 / 其他仓库 / 未 checkout）。
3. **跨仓库追接口**：前端拿到接口要看后端实现、后端接口要看前端哪里调用、或检索命中接口调用 / 路由定义 / 请求 URL 且指向另一侧仓库——这时主动用 Friday，不要等用户点名。
4. 终点是编码计划 / MR / PR / 飞书方案回写。
5. **由 feature list / PRD 出落点矩阵**：用户只想知道这批功能点该落到哪些仓库、仓库里的哪个位置、是新增还是改造——走 \`friday-routing\`（逐功能点出「目标仓库 → 落点文件 → 新增/改造 → 证据 → 置信度」矩阵）。要矩阵走 routing，要完整方案走下一条。
6. **由 feature list 出技术方案**：用户给了一批功能点、或明确说要「创建 / 生成技术方案」——走 \`friday-solution\`（判定新增/改造 → 确认关联仓库 → 出分仓+整体方案）。
7. 需要跨多仓检索或历史交付（哪些仓库用了 X、相似需求、版本时间线、需求→方案→MR 链）。

反向边界：纯粹读懂【当前本地工作区已 checkout】、不涉及项目进度/需求/历史、也不涉及另一侧仓库的代码时，用本地 Grep/Read 即可，不必走 Friday。

**分支上下文环路（仓库编码任务强制，按当前分支自动定位、不写死项目）**：开工先用当前 git 分支名调 \`lookup_project_by_branch\` 拉项目需求/工件/记忆上下文再写码；收工用 \`report_project_knowledge(branch_name=…)\` 沉淀经验、\`report_project_state(branch_name=…)\` 回写 API 清单。逐步编排见 \`friday-dev\` 技能。切分支/切项目都通用，无需为每个项目单独配置；非成员/无法唯一定位时工具自动跳过、不阻断。
看不到 \`friday\` MCP 工具或调用返回 401/403 时，引导用户运行 \`npx -y @friday-ai-codes/mcp setup\`。
${BOOTSTRAP_END}`;
}

/** 把引导段追加进指令文件（marker 幂等：已有 marker 即跳过）。 */
function appendBootstrap(file, skillsDir) {
  if (existsSync(file) && readFileSync(file, 'utf8').includes(BOOTSTRAP_BEGIN)) {
    return { status: 'already', path: file };
  }
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `\n${bootstrapBody(skillsDir)}\n`);
  return { status: 'written', path: file };
}

/**
 * Cursor 规则文件：.cursor/rules/friday.mdc（alwaysApply）。
 * 项目级写 ./.cursor/rules/，全局写 ~/.cursor/rules/（注：全局文件规则
 * Cursor 支持得不稳定，官方推荐 Settings → Rules，这里尽力而为）。
 * 文件已存在则不动（幂等）。
 */
function cursorRuleBootstrap(skillsDir, { project }) {
  const ruleFile = project
    ? join(process.cwd(), '.cursor', 'rules', 'friday.mdc')
    : join(homedir(), '.cursor', 'rules', 'friday.mdc');
  if (existsSync(ruleFile)) {
    return { status: 'already', path: ruleFile };
  }
  const content = `---
description: Friday AI skills 引导（安装器自动生成）
alwaysApply: true
---

${bootstrapBody(skillsDir)}
`;
  mkdirSync(dirname(ruleFile), { recursive: true });
  writeFileSync(ruleFile, content);
  return { status: 'written', path: ruleFile };
}

/** 各 agent 的指令文件路径（项目级 / 全局）。 */
function contextFileFor(agentId, { project }) {
  const cwd = process.cwd();
  switch (agentId) {
    case 'claude-code':
      return project ? join(cwd, 'CLAUDE.md') : join(homedir(), '.claude', 'CLAUDE.md');
    case 'codex':
      return project ? join(cwd, 'AGENTS.md') : join(homedir(), '.codex', 'AGENTS.md');
    case 'gemini-cli':
      return project ? join(cwd, 'GEMINI.md') : join(homedir(), '.gemini', 'GEMINI.md');
    case 'opencode':
      return project
        ? join(cwd, 'AGENTS.md')
        : join(homedir(), '.config', 'opencode', 'AGENTS.md');
    case 'agents-dir':
      return project ? join(cwd, 'AGENTS.md') : join(homedir(), '.agents', 'AGENTS.md');
    default:
      return null;
  }
}

/**
 * 把 friday 入口引导注入一个 agent 的原生指令文件。
 * 返回 { agent, status: 'written' | 'already' | 'unsupported', path }。
 *
 * 项目级注入用相对路径（指令文件会进 git，绝对路径在队友机器上失效）；
 * 全局注入用绝对路径。
 */
export function injectContextBootstrap(agent, { project }) {
  // 项目级用 agent 的项目相对目录（如 .claude/skills），全局用绝对路径
  const skillsDir = project ? agent.projectSkillsDir : skillsDirFor(agent, { project });
  if (agent.id === 'cursor') {
    const result = cursorRuleBootstrap(skillsDir, { project });
    return { agent, ...result };
  }
  const file = contextFileFor(agent.id, { project });
  if (!file) {
    return { agent, status: 'unsupported', path: null };
  }
  const result = appendBootstrap(file, skillsDir);
  return { agent, ...result };
}

/** Friday MCP 是否已有用户级配置（~/.friday/config.json）。 */
export function mcpConfigured() {
  if (process.env.FRIDAY_BASE_URL && process.env.FRIDAY_ACCESS_TOKEN) return true;
  return existsSync(join(homedir(), '.friday', 'config.json'));
}
