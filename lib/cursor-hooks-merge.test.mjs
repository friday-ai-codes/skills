import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const installer = await import('./installer.mjs');

const projectEntries = {
  beforeSubmitPrompt: [{ command: '.cursor/hooks/friday-before-submit-prompt.sh' }],
  afterAgentResponse: [{ command: '.cursor/hooks/friday-after-agent-response.sh' }],
};

const globalEntries = {
  beforeSubmitPrompt: [{ command: './hooks/friday-before-submit-prompt.sh' }],
  afterAgentResponse: [{ command: './hooks/friday-after-agent-response.sh' }],
};

function merge(existing, entries = projectEntries) {
  assert.equal(
    typeof installer.mergeCursorHooksConfig,
    'function',
    'installer.mjs 必须导出 mergeCursorHooksConfig',
  );
  return installer.mergeCursorHooksConfig(existing, entries);
}

test('空配置生成 Cursor hooks v1 且不启用 failClosed（D-04 / T-145-05）', () => {
  for (const existing of [null, {}]) {
    const result = merge(existing);
    assert.equal(result.version, 1);
    assert.deepEqual(result.hooks.beforeSubmitPrompt, projectEntries.beforeSubmitPrompt);
    assert.deepEqual(result.hooks.afterAgentResponse, projectEntries.afterAgentResponse);
    assert.notEqual(result.failClosed, true);
  }
});

test('保留用户配置并仅按 Friday command basename 去重升级（145-01-01）', () => {
  const existing = {
    version: 1,
    customTopLevel: { retained: true },
    hooks: {
      beforeSubmitPrompt: [
        { command: './user-before.sh' },
        { command: '/old/location/friday-before-submit-prompt.sh', timeout: 1 },
      ],
      stop: [{ command: './user-stop.sh' }],
      customEvent: [{ command: './custom.sh' }],
    },
  };

  const result = merge(existing);
  assert.deepEqual(result.customTopLevel, existing.customTopLevel);
  assert.deepEqual(result.hooks.stop, existing.hooks.stop);
  assert.deepEqual(result.hooks.customEvent, existing.hooks.customEvent);
  assert.deepEqual(result.hooks.beforeSubmitPrompt, [
    { command: './user-before.sh' },
    projectEntries.beforeSubmitPrompt[0],
  ]);
  assert.deepEqual(result.hooks.afterAgentResponse, projectEntries.afterAgentResponse);
});

test('重复 merge 幂等且 project/global command 各自正确（145-01-02）', () => {
  for (const entries of [projectEntries, globalEntries]) {
    const once = merge(null, entries);
    const twice = merge(once, entries);
    assert.deepEqual(twice, once);
  }
});

test('非法 JSON 保留原 bytes 并返回可操作 warning（D-04 / T-145-10）', async () => {
  assert.equal(
    typeof installer.writeMergedCursorHooksFile,
    'function',
    'installer.mjs 必须导出 writeMergedCursorHooksFile',
  );
  const directory = await mkdtemp(join(tmpdir(), 'friday-cursor-hooks-'));
  const target = join(directory, 'hooks.json');
  const invalidBytes = Buffer.from('{\n  "version": 1,\n  broken\n}\n');
  await writeFile(target, invalidBytes);

  const result = await installer.writeMergedCursorHooksFile(target, projectEntries);

  assert.deepEqual(await readFile(target), invalidBytes);
  assert.match(String(result?.warning ?? ''), /JSON|解析|修复|hooks\.json/i);
  assert.notEqual(result?.warning, '');
});
