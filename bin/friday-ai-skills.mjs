#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

function usage() {
  console.log(`
Friday AI Skills

Usage:
  npx @friday-ai-codes/skills [install] [options]
  npx @friday-ai-codes/skills list
  npx @friday-ai-codes/skills --version

Run without options in a terminal to get a guided install: pick the scope
(current project or global) and which agents to target. All bundled skills
are always installed together — no per-skill selection.

Pass --agent / --all-agents / --project / --global / -y to skip the wizard
(useful for scripts and CI).

Examples:
  npx @friday-ai-codes/skills                          # interactive wizard
  npx @friday-ai-codes/skills install --agent cursor   # non-interactive, Cursor only
  npx @friday-ai-codes/skills install --project --agent cursor
  npx @friday-ai-codes/skills install --all-agents -g  # everything, everywhere
  npx @friday-ai-codes/skills list

Options:
  --project          Install into the current project instead of the user (global) dir
  --global, -g       Install to the user (global) dir
  --agent <name>     Target a specific agent (e.g. claude-code, codex, cursor); repeatable
  --all-agents       Install to every agent the skills CLI detects
  --skill <name>     Install one skill; repeatable. Default: '*'
  --copy             Copy instead of symlink when the skills CLI supports both
  --yes, -y          Skip the wizard; auto-detect agents and install globally
  --interactive      Do not pass -y; let the skills CLI ask selection questions
  --codex-bootstrap  Append the using-friday bootstrap section to ~/.codex/AGENTS.md (idempotent)
  --help, -h         Show this help
  --version, -v      Show package version

This wrapper delegates to the open 'skills' CLI (https://github.com/vercel-labs/skills),
using this package directory as a local skill catalog. The same skills can also be
installed directly with: npx skills add friday-ai-codes/skills
`);
}

function resolveSkillsCli() {
  try {
    return require.resolve('skills/bin/cli.mjs');
  } catch {
    return null;
  }
}

function hasArg(args, names) {
  return args.some((arg) => names.includes(arg));
}

function hasValuedArg(args, names) {
  return args.some((arg, index) => {
    if (names.includes(arg)) return true;
    return names.some((name) => arg.startsWith(`${name}=`)) || names.includes(args[index - 1]);
  });
}

function normalizeInstallArgs(inputArgs) {
  const args = [];
  let installGlobally = true;
  let interactive = false;
  let allAgents = false;
  let wantsCodexBootstrap = false;

  for (let index = 0; index < inputArgs.length; index += 1) {
    const arg = inputArgs[index];
    if (arg === '--project') {
      installGlobally = false;
      continue;
    }
    if (arg === '--interactive') {
      interactive = true;
      continue;
    }
    if (arg === '--all-agents') {
      allAgents = true;
      continue;
    }
    if (arg === '--codex-bootstrap') {
      wantsCodexBootstrap = true;
      continue;
    }
    args.push(arg);
  }

  if (installGlobally && !hasArg(args, ['--global', '-g'])) {
    args.push('-g');
  }
  // Agent target: do not force one. When the user passes --all-agents, target
  // every agent; otherwise let the skills CLI auto-detect installed agents.
  if (allAgents) {
    args.push('--agent', '*');
  }
  if (!hasValuedArg(args, ['--skill', '-s']) && !hasArg(args, ['--all'])) {
    args.push('--skill', '*');
  }
  if (!interactive && !hasArg(args, ['--yes', '-y'])) {
    args.push('-y');
  }

  return { args, wantsCodexBootstrap };
}

/** Detect locally installed agents we can offer in the wizard. */
function detectLocalAgents() {
  const candidates = [
    { id: 'cursor', label: 'Cursor', dir: join(homedir(), '.cursor') },
    { id: 'claude-code', label: 'Claude Code', dir: join(homedir(), '.claude') },
    { id: 'codex', label: 'Codex', dir: join(homedir(), '.codex') },
    { id: 'gemini-cli', label: 'Gemini CLI', dir: join(homedir(), '.gemini') },
    { id: 'opencode', label: 'OpenCode', dir: join(homedir(), '.opencode') },
  ];
  return candidates.filter((agent) => existsSync(agent.dir));
}

/**
 * Line-queue based prompt. Unlike rl.question, this never loses answers when
 * stdin is a fast pipe (all lines + EOF arrive before the prompts are asked).
 */
function createPrompter(rl) {
  const lines = [];
  const waiters = [];
  let closed = false;

  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length > 0) waiters.shift()(null);
  });

  return async function ask(prompt) {
    process.stdout.write(prompt);
    const line = lines.length > 0
      ? lines.shift()
      : closed
        ? null
        : await new Promise((resolveLine) => waiters.push(resolveLine));
    if (line === null) {
      console.error('\nInput closed before the wizard finished. Aborting — nothing was installed.');
      process.exit(1);
    }
    process.stdout.write('\n');
    return line;
  };
}

/**
 * Interactive install wizard. Skills are always all-in (no per-skill
 * selection); the user picks the scope and the target agents.
 */
async function runWizard() {
  const rl = createInterface({ input: process.stdin });
  const ask = createPrompter(rl);
  try {
    console.log('');
    console.log('Friday AI Skills — guided install (12 skills, always installed together)');
    console.log('');

    console.log('Install scope:');
    console.log('  1) Current project (./)   [default]');
    console.log('  2) Global (~)');
    const scopeAnswer = (await ask('Scope [1]: ')).trim();
    const project = scopeAnswer !== '2';

    const detected = detectLocalAgents();
    console.log('');
    console.log('Target agents (detected on this machine):');
    detected.forEach((agent, index) => {
      console.log(`  ${index + 1}) ${agent.label}`);
    });
    console.log(`  a) All agents the skills CLI can detect (${detected.length ? 'broadest' : 'fallback'} — installs to every supported agent)`);
    const agentAnswer = (await ask('Agents, comma-separated [1]: ')).trim().toLowerCase() || '1';

    let agents = [];
    let allAgents = false;
    if (agentAnswer === 'a' || agentAnswer === 'all') {
      allAgents = true;
    } else {
      const picked = new Set(
        agentAnswer
          .split(',')
          .map((part) => Number.parseInt(part.trim(), 10))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= detected.length),
      );
      agents = [...picked].map((n) => detected[n - 1].id);
      if (agents.length === 0) {
        console.error('No valid agent selected. Aborting — nothing was installed.');
        process.exit(1);
      }
    }

    const scopeLabel = project ? 'current project (./)' : 'global (~)';
    const agentLabel = allAgents
      ? 'all detected agents'
      : agents.map((id) => detected.find((agent) => agent.id === id)?.label ?? id).join(', ');
    console.log('');
    console.log(`Will install 12 skills -> ${agentLabel}, scope: ${scopeLabel}`);
    const confirm = (await ask('Proceed? [Y/n]: ')).trim().toLowerCase();
    if (confirm === 'n' || confirm === 'no') {
      console.log('Aborted — nothing was installed.');
      process.exit(0);
    }

    const args = ['--skill', '*', '-y'];
    if (!project) args.push('-g');
    if (allAgents) {
      args.push('--agent', '*');
    } else {
      for (const id of agents) args.push('--agent', id);
    }
    return args;
  } finally {
    rl.close();
  }
}

const CODEX_BOOTSTRAP_BEGIN = '<!-- friday-ai-skills:begin -->';
const CODEX_BOOTSTRAP_END = '<!-- friday-ai-skills:end -->';

/**
 * Codex has no SessionStart hook mechanism, so persist the using-friday
 * bootstrap into ~/.codex/AGENTS.md instead. Idempotent via marker comments.
 */
function codexBootstrap() {
  const agentsFile = join(homedir(), '.codex', 'AGENTS.md');
  if (existsSync(agentsFile) && readFileSync(agentsFile, 'utf8').includes(CODEX_BOOTSTRAP_BEGIN)) {
    console.log(`codex bootstrap: already present in ${agentsFile}`);
    return;
  }

  const skillPath = join(packageRoot, 'skills', 'using-friday', 'SKILL.md');
  const skillBody = readFileSync(skillPath, 'utf8').replace(/^---[\s\S]*?---\n/, '');
  const section = `\n${CODEX_BOOTSTRAP_BEGIN}\n${skillBody.trim()}\n${CODEX_BOOTSTRAP_END}\n`;

  mkdirSync(dirname(agentsFile), { recursive: true });
  appendFileSync(agentsFile, section);
  console.log(`codex bootstrap: appended using-friday to ${agentsFile}`);
}

function printNextSteps() {
  console.log('');
  console.log('Next steps:');
  console.log('  1. Configure Friday access:   npx -y @friday-ai-codes/mcp init --base-url <url> --token <pat>');
  console.log('  2. Register the MCP server:   npx -y @friday-ai-codes/mcp register');
  console.log('  Or simply ask your agent to "set up Friday" — the friday-setup skill walks through it.');
}

function runSkills(args, { afterInstall = false } = {}) {
  const skillsCli = resolveSkillsCli();
  const command = skillsCli ? process.execPath : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const commandArgs = skillsCli ? [skillsCli, ...args] : ['-y', 'skills@^1.5.10', ...args];

  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (afterInstall && (result.status ?? 0) === 0) {
    printNextSteps();
  }
  process.exit(result.status ?? 0);
}

const [rawCommand, ...rest] = process.argv.slice(2);
const command = rawCommand && !rawCommand.startsWith('-') ? rawCommand : 'install';
const passthrough = command === rawCommand ? rest : process.argv.slice(2);

if (command === 'help' || hasArg(process.argv.slice(2), ['--help', '-h'])) {
  usage();
  process.exit(0);
}

if (command === 'version' || hasArg(process.argv.slice(2), ['--version', '-v'])) {
  console.log(packageJson.version);
  process.exit(0);
}

if (command === 'list' || command === 'ls') {
  runSkills(['add', packageRoot, '--list', ...passthrough]);
}

if (command === 'install' || command === 'add') {
  const decisiveFlags = ['--agent', '--all-agents', '--project', '--global', '-g', '-y', '--yes', '--interactive', '--skill', '-s'];
  const wantsWizard
    = !hasValuedArg(passthrough, decisiveFlags)
      && (process.env.FRIDAY_SKILLS_WIZARD === '1' || (process.stdin.isTTY && process.stdout.isTTY));

  if (wantsWizard) {
    const wizardArgs = await runWizard();
    if (passthrough.includes('--codex-bootstrap')) {
      codexBootstrap();
    }
    runSkills(['add', packageRoot, ...wizardArgs], { afterInstall: true });
  } else {
    const { args, wantsCodexBootstrap } = normalizeInstallArgs(passthrough);
    if (wantsCodexBootstrap) {
      codexBootstrap();
    }
    runSkills(['add', packageRoot, ...args], { afterInstall: true });
  }
}

console.error(`Unknown command: ${command}`);
usage();
process.exit(1);
