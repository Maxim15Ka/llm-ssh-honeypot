import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const input = new URL('../data/sessions.jsonl', import.meta.url);
if (!existsSync(input)) { console.error('No logs yet. Start the honeypot and connect first.'); process.exit(1); }
const events = readFileSync(input, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const commands = events.filter(e => e.type === 'command');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const frequencies = new Map();
for (const e of commands) frequencies.set(e.command, (frequencies.get(e.command) || 0) + 1);
const output = new URL('../data/report.html', import.meta.url);
writeFileSync(output, `<!doctype html><html lang="en"><meta charset="utf-8"><title>SSH Honeypot Lab Report</title><meta name="viewport" content="width=device-width"><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;background:#101827;color:#e2e8f0}h1{color:#5eead4}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #334155;overflow-wrap:anywhere}pre{white-space:pre-wrap}small{color:#94a3b8}</style><h1>SSH Honeypot Lab</h1><small>Local lab activity. These records do not establish real-world attacker activity.</small><p>${events.filter(e => e.type === 'connection').length} connections · ${commands.length} commands · ${commands.filter(e => e.source === 'llm').length} LLM responses · ${commands.filter(e => e.source === 'fallback').length} model fallbacks</p><h2>Frequent commands</h2><table><tr><th>Command</th><th>Count</th></tr>${[...frequencies].sort((a,b)=>b[1]-a[1]).map(([c,n])=>`<tr><td>${escape(c)}</td><td>${n}</td></tr>`).join('')}</table><h2>Recent activity</h2><table><tr><th>Time / session</th><th>Command</th><th>Output / source</th></tr>${commands.slice(-100).reverse().map(e=>`<tr><td>${escape(e.timestamp)}<br><small>${escape(e.sessionId)}</small></td><td>${escape(e.command)}</td><td><pre>${escape(e.output)}</pre><small>${escape(e.source)} · ${e.durationMs} ms</small></td></tr>`).join('')}</table></html>`);
console.log('Report saved:', output.pathname);
