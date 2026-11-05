import ssh2 from 'ssh2';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FakeShell, clean } from './shell.js';

export function createHoneypot({ dataDir = fileURLToPath(new URL('../data/', import.meta.url)), model = process.env.LM_STUDIO_MODEL ?? 'qwen2.5-7b-instruct' } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const keyPath = `${dataDir}/host-key.pem`;
  if (!existsSync(keyPath)) writeFileSync(keyPath, generateKeyPairSync('rsa', { modulusLength: 3072, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } }).privateKey, { mode: 0o600 });
  const clients = new Set();
  const log = event => appendFileSync(`${dataDir}/sessions.jsonl`, JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n');
  const server = new ssh2.Server({ hostKeys: [readFileSync(keyPath)], ident: 'OpenSSH_8.9p1', readyTimeout: 15000 }, (client, info) => {
    if (clients.size >= 8) { client.end(); return; }
    clients.add(client);
    const sessionId = randomUUID();
    const emit = event => log({ sessionId, ...event });
    emit({ type: 'connection', address: info.ip });
    const lifetime = setTimeout(() => client.end(), 300000);
    client.on('error', err => emit({ type: 'connection_error', message: clean(err.message) }));
    client.on('close', () => { clearTimeout(lifetime); clients.delete(client); emit({ type: 'disconnect' }); });
    client.on('authentication', ctx => {
      emit({ type: 'authentication', username: clean(ctx.username).slice(0, 128), method: ctx.method, accepted: ctx.method === 'password' });
      // Deliberately accepts any password; passwords are never persisted.
      if (ctx.method === 'password') ctx.accept(); else ctx.reject(['password']);
    });
    client.on('ready', () => {
      let opened = false;
      client.on('session', (accept, reject) => {
        if (opened) return reject();
        opened = true;
        const session = accept();
        session.on('pty', acceptPty => acceptPty());
        session.on('shell', acceptShell => {
          const channel = acceptShell();
          const shell = new FakeShell({ model });
          let line = '', count = 0, busy = false, lastCR = false;
          const prompt = () => channel.write(`root@web01:${shell.cwd === '/root' ? '~' : shell.cwd}# `);
          channel.on('error', () => {});
          channel.write('Welcome to Ubuntu 22.04.5 LTS\r\n'); prompt();
          channel.on('data', async data => {
            if (busy) return;
            busy = true;
            try {
              for (const char of data.toString('utf8')) {
                if (channel.destroyed) break;
                if (char === '\n' && lastCR) { lastCR = false; continue; }
                lastCR = char === '\r';
                if (char === '\r' || char === '\n') {
                  channel.write('\r\n');
                  const command = line; line = '';
                  if (++count > 100) { channel.end('Session limit reached.\r\n'); break; }
                  const started = Date.now();
                  const result = await shell.run(command);
                  emit({ type: 'command', command, ...result, durationMs: Date.now() - started });
                  if (channel.destroyed) break;
                  if (result.output) channel.write(result.output.replace(/\n/g, '\r\n') + '\r\n');
                  if (result.exit) { channel.exit(0); channel.end(); break; }
                  prompt();
                } else if (char === '\x03') { line = ''; channel.write('^C\r\n'); prompt(); }
                else if (char === '\x04') { channel.end(); break; }
                else if (char === '\x7f' || char === '\b') { if (line.length) { line = line.slice(0, -1); channel.write('\b \b'); } }
                else if (char >= ' ' && char <= '~' && line.length < 2048) { line += char; channel.write(char); }
              }
            } finally { busy = false; }
          });
        });
        // exec, SFTP and forwarding are unsupported and rejected by ssh2.
      });
    });
  });
  return { server, close: () => { for (const client of clients) client.end(); server.close(); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const model = process.env.LM_STUDIO_MODEL ?? 'qwen2.5-7b-instruct';
  const app = createHoneypot({ model });
  app.server.on('error', err => { console.error(err.message); process.exitCode = 1; });
  app.server.listen(2222, '127.0.0.1', () => console.log(`Honeypot: 127.0.0.1:2222 | ${model ? 'LM Studio: ' + model : 'simulation mode (no LLM configured)'} | Ctrl+C to stop`));
  process.on('SIGINT', () => app.close());
  process.on('SIGTERM', () => app.close());
}
