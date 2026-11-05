import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ssh2 from 'ssh2';
import { FakeShell } from '../src/shell.js';
import { createHoneypot } from '../src/server.js';

test('real SSH shell, logging, password redaction and forwarding rejection', { timeout: 15000 }, async t => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'honeypot-test-'));
  const app = createHoneypot({ dataDir, model: '' });
  const client = new ssh2.Client();
  t.after(() => { client.destroy(); app.close(); });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve, reject) => {
    client.once('ready', resolve).once('error', reject).connect({ host: '127.0.0.1', port: app.server.address().port, username: 'root', password: 'TEST_PASSWORD_NEVER_LOG', readyTimeout: 5000 });
  });
  await new Promise(resolve => client.forwardOut('127.0.0.1', 12345, '127.0.0.1', 80, err => { assert.ok(err); resolve(); }));
  await new Promise(resolve => client.exec('whoami', err => { assert.ok(err); resolve(); }));
  // A rejected exec consumes the one-session allowance; use a fresh connection for the shell.
  client.end();
  const shellClient = new ssh2.Client();
  t.after(() => shellClient.destroy());
  await new Promise((resolve, reject) => shellClient.once('ready', resolve).once('error', reject).connect({ host: '127.0.0.1', port: app.server.address().port, username: 'root', password: 'TEST_PASSWORD_NEVER_LOG' }));
  const transcript = await new Promise((resolve, reject) => shellClient.shell((err, stream) => {
    if (err) return reject(err);
    let text = '', sent = false;
    stream.on('data', data => {
      text += data;
      if (!sent && text.includes('# ')) { sent = true; stream.write('cd /etc\rpwd\rcat hostname\rexit\r'); }
    });
    stream.on('close', () => resolve(text));
    stream.on('error', reject);
  }));
  assert.match(transcript, /web01/);
  const log = readFileSync(path.join(dataDir, 'sessions.jsonl'), 'utf8');
  assert.ok(!log.includes('TEST_PASSWORD_NEVER_LOG'));
  const events = log.trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(e => e.type === 'command').length, 4);
  assert.equal(events.find(e => e.command === 'pwd').output, '/etc');
});
