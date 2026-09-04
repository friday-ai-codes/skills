import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProjectScope } from './installer.mjs';

test('非交互安装默认限制在当前项目', () => {
  assert.equal(resolveProjectScope(), true);
  assert.equal(resolveProjectScope({ project: true }), true);
});

test('只有显式 --global 才使用用户级目录', () => {
  assert.equal(resolveProjectScope({ global: true }), false);
});

test('拒绝同时指定 project 与 global', () => {
  assert.throws(
    () => resolveProjectScope({ project: true, global: true }),
    /不能同时使用/,
  );
});
