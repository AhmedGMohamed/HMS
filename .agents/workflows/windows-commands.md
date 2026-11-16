---
description: How to execute commands reliably on Windows
---
To avoid issues where commands are lost during CMD initialization, follow these steps:

1. Always wrap your command in `cmd /c` (for Command Prompt) or `powershell -Command` (for PowerShell).
2. For multiple commands, use `&` or `&&` inside the quotes, for example: `cmd /c "echo hello && whoami"`.
3. If you need to see the output in the initial snapshot of `run_command`, set `WaitMsBeforeAsync` to at least `1000`.

// turbo-all
4. Run the command as follows:
`cmd /c <your-command>`
