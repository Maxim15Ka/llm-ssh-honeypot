import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FakeShell } from '../src/shell.js';

test('machine facts agree across commands and never depend on model availability', async () => {
  const shell = new FakeShell({ model: 'offline', fetcher: async () => { throw new Error('must not call model'); } });
  const disk = await shell.run('df -h');
  assert.equal(disk.source, 'simulation');
  assert.match(disk.output, /40G 10G 30G 25%/);
  const memory = await shell.run('free -m');
  assert.match(memory.output, /4096 1024 2048 64 1024 2816/);
  const proc = await shell.run('cat /proc/meminfo');
  assert.match(proc.output, /MemTotal: 4194304 kB/);
  assert.match(proc.output, /MemFree: 2097152 kB/);
  assert.equal((await shell.run('LS')).output, 'bash: LS: command not found');
  const processes = await shell.run('ps aux');
  assert.equal(processes.source, 'simulation');
  assert.match(processes.output, /nginx: worker process/);
  await shell.run('cd /etc');
  assert.deepEqual(await shell.run('df -h'), disk);
  assert.deepEqual(await new FakeShell().run('free -m'), memory);
});


test('fake filesystem persists navigation and never reads host files', async () => {
  const shell = new FakeShell();
  await shell.run('cd /etc');
  assert.equal((await shell.run('pwd')).output, '/etc');
  assert.equal((await shell.run('cat hostname')).output, 'web01\n');
  assert.match((await shell.run('cat C:/Windows/win.ini')).output, /No such file/);
  assert.match((await shell.run('ls /missing')).output, /No such file/);
  assert.match((await shell.run('touch /tmp/should-not-exist')).output, /command not found/);
  assert.equal((await shell.run('ls /tmp')).output, '');
});

test('LM Studio integration sends bounded history and treats output as text', async () => {
  let calls = 0;
  const shell = new FakeShell({ model: 'test-model', fetcher: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:1234/v1/chat/completions');
    const request = JSON.parse(options.body);
    assert.equal(request.model, 'test-model');
    assert.ok(request.messages.length <= 14);
    assert.equal(request.tools, undefined);
    calls++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'simulated output\u0007' } }] }) };
  } });
  for (let i = 0; i < 10; i++) assert.equal((await shell.run('uptime')).output, 'simulated output');
  assert.equal(calls, 10);
  assert.equal((await shell.run('uptime')).source, 'llm');
});

test('unavailable model produces observable fallback', async () => {
  const shell = new FakeShell({ model: 'test', fetcher: async () => { throw new Error('offline'); } });
  const result = await shell.run('uptime');
  assert.equal(result.source, 'fallback');
  assert.equal(result.error, 'offline');
});

