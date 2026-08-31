---
trigger: always_on
---

# Agent Rules for this Workspace

## Command Execution on Windows
- **Issue**: Commands may fail if sent to an interactive `cmd.exe` before it finishes initialization.
- **Rule**: ALWAYS use `cmd /c` (for Command Prompt) or `powershell -Command` (for PowerShell) when executing commands via `run_command` or similar tools on Windows.
- **Example**: Use `cmd /c npm install` instead of `npm install`.
- **Reasoning**: `cmd /c` passes the command as a startup argument, which is more reliable than piping input to a new shell session.
- **Capture**: Ensure `WaitMsBeforeAsync` is at least 1000ms if you need to capture the initial output of a command.