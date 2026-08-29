/**
 * installCursorHooks 安装布局回归（v0.25.0 审计 B-1）：
 * wrapper 解析 `$script_dir/../lib/session_capture.py`，安装器必须把该
 * 运行时依赖一并拷入 `<cursorRoot>/lib/`，否则 npx 安装出的 Cursor 采集
 * 会因 fail-soft 静默空转（exit 0、无 pending Capture）。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const installer = await import('./installer.mjs');
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function withTemporaryCwd(prefix, run) {
  const workDir = mkdtempSync(join(tmpdir(), prefix));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    return run(workDir);
  } finally {
    process.chdir(previousCwd);
  }
}

test('installCursorHooks 安装布局包含 wrapper 依赖的 lib/session_capture.py（B-1）', () => {
  withTemporaryCwd('friday-install-layout-', (workDir) => {
    const result = installer.installCursorHooks(packageRoot, { project: true });
    assert.equal(result.ok, true);

    const hooksDir = join(workDir, '.cursor', 'hooks');
    for (const name of ['friday-before-submit-prompt.sh', 'friday-after-agent-response.sh']) {
      accessSync(join(hooksDir, name), constants.X_OK);
    }
    assert.ok(
      existsSync(join(workDir, '.cursor', 'lib', 'session_capture.py')),
      'wrapper 引用 $script_dir/../lib/session_capture.py，安装布局必须提供该文件',
    );
  });
});

test('安装布局的 before wrapper 端到端产生 pending Capture（B-1 复现反转）', () => {
  const python = spawnSync('python3', ['--version'], { encoding: 'utf8' });
  if (python.error || python.status !== 0) {
    return; // 无 python3 时 wrapper 本身按约定 fail-soft 跳过，此断言无意义
  }

  withTemporaryCwd('friday-install-e2e-', (workDir) => {
    installer.installCursorHooks(packageRoot, { project: true });
    const wrapper = join(workDir, '.cursor', 'hooks', 'friday-before-submit-prompt.sh');
    const cacheHome = join(workDir, 'xdg-cache');
    const event = JSON.stringify({
      conversation_id: 'conv-b1',
      generation_id: 'gen-b1',
      workspace_roots: [workDir],
      prompt: '安装布局采集自检',
    });

    const run = spawnSync('bash', [wrapper], {
      input: event,
      env: { ...process.env, XDG_CACHE_HOME: cacheHome, FRIDAY_HOOKS_DISABLED: '0' },
      encoding: 'utf8',
    });

    assert.equal(run.status, 0);
    assert.match(run.stdout, /"continue"\s*:\s*true/);

    const pairDir = join(cacheHome, 'friday-skills', 'pairs');
    const pendingFiles = existsSync(pairDir)
      ? readdirSync(pairDir).filter((name) => name.startsWith('pending-'))
      : [];
    assert.equal(
      pendingFiles.length,
      1,
      `安装布局应产生 1 个 pending Capture，实际 ${pendingFiles.length}（B-1：漏拷 lib 时 fail-soft 静默空转）`,
    );
  });
});
