/**
 * Agent 目录约定与本机嗅探。
 *
 * 安装目标是各 agent 的「原生技能目录」（一技能一目录，内含 SKILL.md），
 * 不再经由第三方 skills CLI 的 .agents/skills + symlink 方案——但保留
 * `agents-dir` 这个跨 agent 开放标准目录作为可选目标。
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();

export const AGENTS = [
  {
    id: 'cursor',
    label: 'Cursor',
    detectDirs: [join(HOME, '.cursor')],
    globalSkillsDir: join(HOME, '.cursor', 'skills'),
    projectSkillsDir: join('.cursor', 'skills'),
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    detectDirs: [join(HOME, '.claude')],
    globalSkillsDir: join(HOME, '.claude', 'skills'),
    projectSkillsDir: join('.claude', 'skills'),
  },
  {
    id: 'codex',
    label: 'Codex',
    detectDirs: [join(HOME, '.codex')],
    globalSkillsDir: join(HOME, '.codex', 'skills'),
    projectSkillsDir: join('.codex', 'skills'),
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    detectDirs: [join(HOME, '.gemini')],
    globalSkillsDir: join(HOME, '.gemini', 'skills'),
    projectSkillsDir: join('.gemini', 'skills'),
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    detectDirs: [join(HOME, '.opencode'), join(HOME, '.config', 'opencode')],
    globalSkillsDir: join(HOME, '.config', 'opencode', 'skills'),
    projectSkillsDir: join('.opencode', 'skills'),
  },
  {
    id: 'agents-dir',
    label: '通用 .agents 目录（Agent Skills 开放标准）',
    detectDirs: [join(HOME, '.agents')],
    globalSkillsDir: join(HOME, '.agents', 'skills'),
    projectSkillsDir: join('.agents', 'skills'),
  },
];

export function agentById(id) {
  return AGENTS.find((agent) => agent.id === id) ?? null;
}

/** 嗅探本机已安装的 agent（按目录存在性判定）。 */
export function detectAgents() {
  return AGENTS.filter(
    (agent) => agent.id !== 'agents-dir' && agent.detectDirs.some((dir) => existsSync(dir)),
  );
}

/** 计算某 agent 在某 scope 下的技能目录绝对路径。 */
export function skillsDirFor(agent, { project }) {
  return project ? join(process.cwd(), agent.projectSkillsDir) : agent.globalSkillsDir;
}
