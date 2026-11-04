import ssh2 from 'ssh2';
import { createHoneypot } from './server.js';

// A controlled local demonstration, not captured attacker activity.
const app = createHoneypot({ model: process.env.LM_STUDIO_MODEL || 'qwen2.5-7b-instruct' });
const client = new ssh2.Client();
const timer = setTimeout(() => { console.error('Demo timed out'); client.destroy(); app.close(); process.exitCode = 1; }, 90000);
try {
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => {
    client.once('ready', resolve).once('error', reject);
    client.connect({ host: '127.0.0.1', port: app.server.address().port, username: 'root', password: 'synthetic-demo-password' });
  });
  await new Promise((resolve, reject) => client.shell((err, stream) => {
    if (err) return reject(err);
    const commands = ['whoami', 'cd /etc', 'cat os-release', 'ps aux', 'df -h', 'free -m', 'uptime', 'exit'];
    let pending = '';
    stream.on('data', data => {
      const text = data.toString(); process.stdout.write(text); pending += text;
      if (/root@web01:[^\r\n]*# $/.test(pending)) {
        pending = '';
        const command = commands.shift();
        if (command) stream.write(command + '\r');
      }
    });
    stream.on('error', reject);
    stream.on('close', resolve);
  }));
} finally {
  clearTimeout(timer); client.end(); app.close();
}
