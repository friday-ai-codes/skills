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
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { skillsDirFor } from './agents.mjs';

export const BOOTSTRAP_BEGIN = '<!-- friday-ai-skills:begin -->';
export const BOOTSTRAP_END = '<!-- friday-ai-skills:end -->';

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

/** 注入正文：精简引导，指向已安装的 friday 入口技能（不塞全文）。 */
function bootstrapBody(skillsDir) {
  const skillPath = join(skillsDir, 'friday', 'SKILL.md');
  return `${BOOTSTRAP_BEGIN}
## Friday AI Skills

已安装 Friday AI skills（friday / friday-code / friday-feishu / friday-memory，位于 \`${skillsDir}\`）。
只要当前任务有任何可能涉及 Friday AI——远端仓库编码、代码库分析、编码计划、MR/PR 自动化、飞书项目工作项、历史交付检索——先完整阅读入口技能 \`${skillPath}\`，再按其中的技能路由表行动。哪怕只有 1% 的可能用得上，也要先读再动手。
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
