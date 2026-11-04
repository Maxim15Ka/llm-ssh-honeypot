# LLM-Powered SSH Honeypot — Local Lab

A portfolio project that exposes a simulated Linux shell over real SSH, records session activity, and uses a local LM Studio model for commands outside the built-in simulation.

## Start here (Windows PowerShell)

Requires Node.js 22+ and LM Studio or Bionic with a local chat model. The default model identifier is `qwen2.5-7b-instruct`.

Download or clone this repository, open PowerShell in its folder, then run:

```powershell
npm.cmd ci --omit=optional
npm.cmd start
```
In a second PowerShell window:

```powershell
ssh -p 2222 root@127.0.0.1
```

Accept the local host-key prompt on your first connection. Enter any made-up password (typing will not display). Password authentication is intentionally permissive. Do not use a real password.

Try these commands individually:

```text
whoami
pwd
ls
cat notes.txt
cd /etc
cat os-release
ps aux
uptime
exit
```

The server now defaults to `qwen2.5-7b-instruct`, including when started with `npm.cmd start`. Keep Bionic's local API server running. If model access fails, commands outside the built-in simulator return `command not found` and the log records the model error as a fallback.

## Connect LM Studio

1. Open LM Studio, load a chat/instruct model you already have, and start its local API server on port 1234. Keep local-network serving disabled for this lab.
2. List the available model identifiers in PowerShell:

```powershell
(Invoke-RestMethod http://127.0.0.1:1234/v1/models).data.id
```

3. Stop the honeypot with Ctrl+C. Replace the placeholder below with your model's exact identifier, then restart:

```powershell
$env:LM_STUDIO_MODEL = "YOUR-MODEL-ID"
npm.cmd start
```

4. Reconnect over SSH and try `uptime`. Generate a report and confirm that the response source is `llm`. If the model is unavailable, the log records `fallback` with an error. Model requests time out after 30 seconds. This version assumes LM Studio API authentication is disabled on the loopback-only server.

Built-in commands remain deterministic; only other commands go to the LLM. `df -h`, `free -m`, `ps aux`, and `/proc/meminfo` now use a fixed synthetic machine profile; see LAB-NOTES.md for the experiment and findings. This is a hybrid simulator. It does not claim that every response comes from a model.

## View evidence

After a session, run in another terminal from the project folder:

```powershell
npm.cmd report
Start-Process .\data\report.html
npm.cmd test
```

`data/sessions.jsonl` stores timestamps, session identifiers, connection addresses, authentication method and username, command text, response source, response text and latency. Passwords are never recorded. Commands can still contain sensitive text; use synthetic lab inputs and inspect logs before sharing. `data/` is excluded from Git, including the private host key.

## Architecture

```text
SSH client -> 127.0.0.1:2222 (ssh2)
                |
                +-> per-session fake filesystem / built-in commands
                +-> other commands -> LM Studio 127.0.0.1:1234
                |
                +-> JSONL events -> static HTML report
```

Client commands and model output never enter a real OS shell. No command execution, real filesystem browsing, downloads, model tools, SFTP, or port forwarding are provided. Only the application's own logs and host key are written to disk. The production entry point binds exclusively to loopback.

## Limits and design decisions

- This is a local learning prototype, not an internet deployment. It has not undergone security hardening or load testing. Keep it local until a separate isolated deployment has been designed.
- The virtual filesystem is small and read-only. Shell pipes, redirects, quoting, command chaining, full terminal editing, and real programs are not implemented. Model text can be inconsistent or disclose the simulation; prompt instructions are not a security boundary.
- Input is limited to 2,048 characters, model output to 8,192 characters, history to six exchanges, sessions to five minutes and 100 submitted lines, and simultaneous clients to eight. Input arriving while a response is being produced is ignored; wait for the next prompt.
- Logs append without rotation; monitor disk use for longer experiments. The HTML report reads the complete log and shows the latest 100 commands.
- The LLM has no tools and receives only synthetic context and command history. This structural separation, rather than the prompt, prevents actual host command execution.
- Automated tests use a mocked model service. Live model behavior requires the LM Studio demo above.

## Validation and findings

Five automated tests cover SSH sessions, forwarding rejection, password omission from logs, fake filesystem behavior, consistent system facts, bounded model history, and model failure fallback. Run `npm.cmd test`; these tests do not require a model server.

With the local model server running, use `node src/demo.js` for a controlled end-to-end demonstration and `npm.cmd report` to generate the activity report. Generated logs and reports are not included in this repository.

See [LAB-NOTES.md](LAB-NOTES.md) for observed model inconsistencies and the resulting design changes. This project was developed with AI coding assistance and evaluated through controlled local sessions. No real-world attacker activity or detection performance is claimed.

## Next improvements

- Evaluate response consistency and latency against a fixed command set.
- Add log rotation and better terminal input handling.
- Expand the virtual filesystem and supported command arguments.
## References

- SSH server API: https://github.com/mscdex/ssh2
- LM Studio API: https://lmstudio.ai/docs/developer/openai-compat
