# Cloud ⇄ PC coordination

- The cloud session sends numbered task packets to the PC session (Claude Code on Max's Windows PC).
- After each task, the PC session commits and pushes `ops/status/<TASK-ID>.json`:

```json
{
  "task": "T1",
  "state": "done | failed | blocked",
  "finished_at": "ISO-8601",
  "outputs": [{ "path": "raw-assets/...", "sha256": "...", "bytes": 0 }],
  "notes": "free text",
  "errors": []
}
```

- The PC session only touches `raw-assets/**` and `ops/**`, runs `git pull --rebase` before each push, and never pushes `main`.
- Branch: `claude/funny-gates-g6ew58`.
