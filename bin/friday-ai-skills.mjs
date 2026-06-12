#!/usr/bin/env node

/**
 * Friday Skills 安装器 —— 自带安装能力，不依赖第三方 skills CLI。
 *
 * - 交互模式（TTY 默认）：中文向导，嗅探本机 agent，选 scope 选目标，
 *   装完接力 Friday MCP 配置（spawn `npx -y @friday-ai-codes/mcp setup`）。
 * - 非交互模式（带定向参数 / 非 TTY / CI）：--agent / --all-agents /
 *   --project / -g / -y，安装后打印下一步命令。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as p from '@clack/prompts';

import { AGENTS, agentById, detectAgents } from '../lib/agents.mjs';
import {
  bundledSkills,
  injectContextBootstrap,
  installSkillsForAgent,
  mcpConfigured,
} from '../lib/installer.mjs';
import { banner, pc } from '../lib/ui.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

// ---------------------------------------------------------------------------
// 帮助 / 版本
// ---------------------------------------------------------------------------

function usage() {
  console.log(banner(packageJson.version));
  console.log(`${pc.bold('用法')}
  npx @friday-ai-codes/skills              ${pc.dim('# 交互式中文向导（推荐）')}
  npx @friday-ai-codes/skills install [选项]
  npx @friday-ai-codes/skills list         ${pc.dim('# 列出打包的技能')}

${pc.bold('选项（非交互安装）')}
  --agent <name>     目标 agent（${AGENTS.map((agent) => agent.id).join(' / ')}），可重复
  --all-agents       安装到本机嗅探到的全部 agent
  --project          装进当前项目（./.cursor/skills 等）
  --global, -g       装进用户全局目录（~/.cursor/skills 等，默认）
  --yes, -y          跳过向导：自动嗅探 agent，全局安装
  --no-bootstrap     不向各 agent 指令文件（CLAUDE.md / AGENTS.md / GEMINI.md / Cursor rule）注入 friday 引导
  --help, -h         显示本帮助
  --version, -v      显示版本

${pc.dim('默认会把 friday 入口引导注入各 agent 的指令文件（marker 幂等，可重复运行）：')}
${pc.dim('Cursor → .cursor/rules/friday.mdc · Claude Code → CLAUDE.md · Codex / OpenCode → AGENTS.md · Gemini CLI → GEMINI.md')}

${pc.bold('示例')}
  npx @friday-ai-codes/skills install --agent cursor --project
  npx @friday-ai-codes/skills install --all-agents -g
  npx @friday-ai-codes/skills install -y

${pc.dim('技能安装完成后，用一条命令完成 Friday 连接配置（交互式中文向导）：')}
  ${pc.cyan('npx -y @friday-ai-codes/mcp setup')}
`);
}

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    command: 'install',
    agents: [],
    allAgents: false,
    project: false,
    global: false,
    yes: false,
    bootstrap: true,
    help: false,
    version: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--agent' && argv[i + 1]) out.agents.push(argv[++i]);
    else if (arg.startsWith('--agent=')) out.agents.push(arg.slice('--agent='.length));
    else if (arg === '--all-agents') out.allAgents = true;
    else if (arg === '--project') out.project = true;
    else if (arg === '--global' || arg === '-g') out.global = true;
    else if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--no-bootstrap') out.bootstrap = false;
    else if (arg === '--codex-bootstrap') out.bootstrap = true; // 兼容旧参数（现已默认开启）
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--version' || arg === '-v') out.version = true;
    else if (!arg.startsWith('-')) positional.push(arg);
  }
  if (positional.length > 0) out.command = positional[0];
  return out;
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

function runList() {
  console.log(banner(packageJson.version));
  const skills = bundledSkills(packageRoot);
  console.log(`${pc.bold(`打包技能（${skills.length} 个）`)}\n`);
  for (const skill of skills) {
    console.log(`  ${pc.cyan(pc.bold(`/${skill.name}`))}`);
    console.log(`    ${pc.dim(skill.description)}\n`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 安装执行（交互 / 非交互共用）
// ---------------------------------------------------------------------------

function performInstall({ agents, project, bootstrap }) {
  const results = [];
  for (const agent of agents) {
    results.push(installSkillsForAgent(packageRoot, agent, { project }));
  }
  const extras = [];
  if (bootstrap) {
    for (const agent of agents) {
      const boot = injectContextBootstrap(agent, { project });
      if (boot.status === 'written') {
        extras.push(`${agent.label} 引导：已注入 ${boot.path}`);
      } else if (boot.status === 'already') {
        extras.push(`${agent.label} 引导：已存在（${boot.path}）`);
      }
    }
    // Cursor 全局文件规则支持不稳定，提示用户官方推荐路径
    if (!project && agents.some((agent) => agent.id === 'cursor')) {
      extras.push(
        'Cursor 全局规则提示：~/.cursor/rules 偶有不生效（已知问题），更稳的是 Cursor Settings → Rules 手动加一条同样内容。',
      );
    }
  }
  return { results, extras };
}

// ---------------------------------------------------------------------------
// 交互式向导
// ---------------------------------------------------------------------------

async function runWizard() {
  console.log(banner(packageJson.version));
  p.intro(pc.bgMagenta(pc.black(' Friday Skills 安装向导 ')));

  const skills = bundledSkills(packageRoot);
  p.note(
    skills.map((skill) => `${pc.cyan(`/${skill.name}`)}`).join('\n'),
    `将安装 ${skills.length} 个技能（始终整组安装）`,
  );

  // 1) 安装范围
  const scope = await p.select({
    message: '装到哪里？',
    options: [
      { value: 'project', label: '当前项目（./）', hint: '随仓库提交，团队共享' },
      { value: 'global', label: '用户全局（~）', hint: '本机所有项目可用' },
    ],
  });
  if (p.isCancel(scope)) return cancel();
  const project = scope === 'project';

  // 2) 目标 agent（嗅探到的默认勾选）
  const detected = detectAgents();
  const detectedIds = new Set(detected.map((agent) => agent.id));
  if (detected.length > 0) {
    p.log.info(`本机嗅探到：${detected.map((agent) => pc.green(agent.label)).join('、')}`);
  } else {
    p.log.warn('本机未嗅探到任何已知 agent 目录，请手动选择目标。');
  }
  const agentIds = await p.multiselect({
    message: '装给哪些 agent？（空格选择，回车确认）',
    options: AGENTS.map((agent) => ({
      value: agent.id,
      label: agent.label,
      hint: detectedIds.has(agent.id) ? '已检测到' : undefined,
    })),
    initialValues: detected.map((agent) => agent.id),
    required: true,
  });
  if (p.isCancel(agentIds)) return cancel();
  const agents = agentIds.map((id) => agentById(id)).filter(Boolean);

  // 3) 指令文件引导注入（CLAUDE.md / AGENTS.md / GEMINI.md / Cursor rule，默认开启）
  const bootstrapAnswer = await p.confirm({
    message: `把 friday 入口引导写进各 agent 的指令文件？（${
      project
        ? 'CLAUDE.md / AGENTS.md / GEMINI.md / .cursor/rules'
        : '~/.claude/CLAUDE.md / ~/.codex/AGENTS.md / ~/.gemini/GEMINI.md 等'
    }，幂等，推荐）`,
    initialValue: true,
  });
  if (p.isCancel(bootstrapAnswer)) return cancel();

  // 4) 执行安装
  const spinner = p.spinner();
  spinner.start('正在安装技能…');
  const { results, extras } = performInstall({ agents, project, bootstrap: bootstrapAnswer });
  spinner.stop('技能安装完成');

  for (const result of results) {
    p.log.success(
      `${pc.bold(result.agent.label)} → ${pc.dim(result.targetDir)}\n  ${result.installed
        .map((name) => pc.cyan(`/${name}`))
        .join('  ')}`,
    );
  }
  for (const extra of extras) p.log.info(extra);

  // 5) 接力 Friday MCP 配置
  if (mcpConfigured()) {
    p.log.success('Friday 连接已配置（~/.friday/config.json）。');
    p.outro('全部就绪。重启 agent 会话后即可使用 /friday 。');
    return 0;
  }

  const setupNow = await p.confirm({
    message: '还差最后一步：配置 Friday 连接（服务地址 + 访问令牌）。现在就配？',
  });
  if (p.isCancel(setupNow) || !setupNow) {
    p.outro(`随时可以补配：${pc.cyan('npx -y @friday-ai-codes/mcp setup')}`);
    return 0;
  }

  p.log.step('交给 Friday MCP 配置向导…');
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['-y', '@friday-ai-codes/mcp', 'setup'],
    { stdio: 'inherit', cwd: process.cwd(), env: process.env },
  );
  if ((result.status ?? 1) === 0) {
    p.outro('全部就绪。重启 agent 会话后即可使用 /friday 。');
    return 0;
  }
  p.outro(`MCP 配置未完成，可稍后重试：${pc.cyan('npx -y @friday-ai-codes/mcp setup')}`);
  return result.status ?? 1;
}

function cancel() {
  p.cancel('已取消，未做任何更改。');
  return 1;
}

// ---------------------------------------------------------------------------
// 非交互安装
// ---------------------------------------------------------------------------

function runNonInteractive(options) {
  console.log(banner(packageJson.version));
  const project = options.project && !options.global;

  let agents;
  if (options.agents.length > 0) {
    agents = [];
    for (const id of options.agents) {
      const agent = agentById(id);
      if (!agent) {
        console.error(
          `${pc.red('✗')} 未知 agent: ${id}（可用: ${AGENTS.map((entry) => entry.id).join(' / ')}）`,
        );
        return 1;
      }
      agents.push(agent);
    }
  } else {
    agents = detectAgents();
    if (agents.length === 0) {
      console.error(`${pc.red('✗')} 未嗅探到任何 agent，请用 --agent 指定目标。`);
      return 1;
    }
  }

  const { results, extras } = performInstall({
    agents,
    project,
    bootstrap: options.bootstrap,
  });
  for (const result of results) {
    console.log(`${pc.green('✓')} ${pc.bold(result.agent.label)} → ${pc.dim(result.targetDir)}`);
    console.log(`    ${result.installed.map((name) => pc.cyan(`/${name}`)).join('  ')}`);
  }
  for (const extra of extras) console.log(`${pc.blue('ℹ')} ${extra}`);

  console.log('');
  if (mcpConfigured()) {
    console.log(`${pc.green('✓')} Friday 连接已配置。重启 agent 会话后即可使用 /friday 。`);
  } else {
    console.log(`${pc.bold('下一步')}：配置 Friday 连接（交互式中文向导）`);
    console.log(`  ${pc.cyan('npx -y @friday-ai-codes/mcp setup')}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || options.command === 'help') {
    usage();
    return 0;
  }
  if (options.version || options.command === 'version') {
    console.log(packageJson.version);
    return 0;
  }
  if (options.command === 'list' || options.command === 'ls') {
    return runList();
  }
  if (options.command !== 'install' && options.command !== 'add') {
    console.error(`未知命令: ${options.command}`);
    usage();
    return 1;
  }

  const hasTargeting =
    options.agents.length > 0 ||
    options.allAgents ||
    options.project ||
    options.global ||
    options.yes;
  const interactive =
    !hasTargeting &&
    (process.env.FRIDAY_SKILLS_WIZARD === '1' || (process.stdin.isTTY && process.stdout.isTTY));

  if (interactive) {
    return runWizard();
  }
  // --all-agents 等价于「不指定 agent，全部嗅探安装」
  if (options.allAgents) options.agents = [];
  return runNonInteractive(options);
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
