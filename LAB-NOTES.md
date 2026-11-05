# Lab notes — November 4, 2026

## Observed problem

During controlled local SSH sessions, Qwen generated inconsistent machine details: `df -h` reported questionable disk totals, `free -m` reported an unexpected root permission error, and uppercase `LS` received an inaccurate error. These were model-generated responses, not observations of the Windows host.

## Implemented improvement

The simulator now owns a fixed machine profile: 40 GiB disk with 10 GiB used and 30 GiB available; 4,096 MiB memory; and a small process list containing init, SSH and nginx. `df -h`, `free -m`, `ps aux`, and `/proc/meminfo` use this profile without calling the model. Uppercase `LS` returns a deterministic command-not-found error. Other commands still use Qwen and receive the same profile as context.

This is a hybrid design: deterministic state for common system queries and an LLM for additional command responses. Prompted model responses can still be inconsistent. The profile is a static snapshot, not a complete operating-system emulator.

## Evidence and boundaries

The session log preserves earlier outputs for comparison. The report labels each response as simulation, LLM or fallback. All activity so far is controlled local testing, not captured attacker traffic. Regression tests check memory consistency, disk totals, repeatability across sessions, and behavior when the model is unavailable.

