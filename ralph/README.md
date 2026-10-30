# Ralph: Autonomous Agent Issue Runner

Ralph automates tackling GitHub issues using AI coding agents (**Antigravity / `agy`** or **Claude Code / `claude`**).

It retrieves issues labeled `ready-for-agent` (optionally narrowed by an extra label of your choice), provides context from recent git commits, and executes the selected agent in an automated loop or a single session.

---

## Prerequisites

- [GitHub CLI (`gh`)](https://cli.github.com/) authenticated (`gh auth login`)
- [`jq`](https://jqlang.github.io/jq/) for JSON parsing
- [`git`](https://git-scm.com/)
- Agent CLI:
  - **`agy`** (Antigravity CLI): with `--dangerously-skip-permissions`
  - and/or **`claude`** (Claude Code CLI, v2.1.259 or later for `--permission-prompts`): with `--permission-mode auto`
- `pnpm` and an installed `node_modules`, for the feedback loops in `prompt.md`

---

## Quick Start

### 1. Automated Multi-Issue Loop (`afk.sh`)

Run multiple iterations non-interactively (Away From Keyboard).

```bash
# Run 5 iterations using Antigravity (agy)
./ralph/afk.sh 5 agy

# Run 5 iterations using Claude Code
./ralph/afk.sh 5 claude

# Run with environment variable
AGENT=agy ./ralph/afk.sh 10

# Only work on issues labelled 'ready-for-agent' AND 'bug'
./ralph/afk.sh 5 claude bug
./ralph/afk.sh 5 claude --label bug
```

### 2. Single Session (`once.sh`)

Run a single session on open issues.

```bash
# Interactive session with Antigravity
./ralph/once.sh agy

# Non-interactive print mode with Antigravity
./ralph/once.sh agy -p

# Interactive session with Claude Code
./ralph/once.sh claude

# Non-interactive print mode with Claude Code
./ralph/once.sh claude -p

# Only work on issues labelled 'ready-for-agent' AND 'bug'
./ralph/once.sh claude bug
./ralph/once.sh --label bug -p
```

---

## Filtering Issues by Label

Both scripts always require the base label `ready-for-agent`. You can pass **one extra label** to narrow the set further; `gh` ANDs the labels, so only issues carrying **both** are picked up.

Three equivalent ways to pass it:

```bash
./ralph/afk.sh 5 claude bug          # positional
./ralph/afk.sh 5 claude --label bug  # flag (also -l bug, --label=bug)
ISSUE_LABEL=bug ./ralph/afk.sh 5     # environment variable
```

The label is validated against the repository before any agent runs. Matching is exact first, then case-insensitive (`Bug` resolves to `bug`). If the label does not exist, the script exits with an error listing every available label:

```
$ ./ralph/once.sh claude bugz
Error: label 'bugz' does not exist in this repository.
Available labels:
  - bug
  - documentation
  - enhancement
  ...
```

When a filter is active, the agent prompt gets an extra instruction so it only works on the filtered issues. Omitting the filter keeps the original behaviour: every open `ready-for-agent` issue.

---

## Running in a Worktree (worktrunk)

Ralph runs unattended and commits as it goes, so it is worth isolating in a git
worktree. [worktrunk](https://worktrunk.dev) (`wt`) can create the worktree and
launch the loop inside it in one command — no wrapper script needed, because
`wt switch -x` runs the command with the worktree as its working directory:

```bash
# New branch + worktree, then install dependencies inside it (see Provisioning)
wt switch --create ralph/logs --base @ -y -x pnpm -- install

# Run the loop in the worktree
wt switch ralph/logs -y -x ./ralph/afk.sh -- 5 claude bug

# Single session works the same way
wt switch ralph/logs -y -x ./ralph/once.sh -- claude bug -p
```

Arguments after `--` are passed to the command, so the normal ralph CLI applies.
`--base @` bases the worktree on the current branch instead of the default branch;
drop `--create` to reuse an existing worktree (it errors if the branch exists).
The agent works and commits on the worktree's branch, never another one.

### Provisioning

A fresh worktree contains tracked files only:

- **`ralph/` itself** must be committed, or `./ralph/afk.sh` does not exist there.
- **`node_modules`** is missing, so `pnpm test`, `pnpm check` and `pnpm build` from
  `prompt.md` fail until you run `pnpm install` in the worktree. This repo has no
  `.config/wt.toml` hook to do it for you, which is why the examples above install
  before starting the loop.
- **`.env`** is missing too. The app builds on its defaults without one; copy it in
  if a ticket needs your overrides.

### agy and worktrees

`agy` binds a session to a *project* resolved from a path-keyed registry
(`~/.gemini/config/projects/*.json`). A worktree created under a directory that
is already a registered project root inherits that project, and the agent then
works in the **original repo instead of the worktree** — committing to the wrong
branch without any error. The scripts detect a linked worktree
(`git-dir != git-common-dir`) and pass `--new-project` to `agy`, which pins the
session to the current directory. Override with `RALPH_AGY_NEW_PROJECT=0|1`.

### Merging back

Ralph commits every iteration, so the branch accumulates commits. Review, then:

```bash
wt merge            # squash + rebase + fast-forward target + remove worktree
wt remove --reap    # discard instead; --reap kills processes left in the worktree
```

---

## Agent Flag & Mode Details

| Agent | AFK Mode Command | Interactive Command |
|---|---|---|
| **`agy`** | `agy --dangerously-skip-permissions --print-timeout 30m --output-format stream-json -p "..."` | `agy --dangerously-skip-permissions -i "..."` |
| **`claude`** | `claude --model opus --effort high --permission-mode auto --permission-prompts none --verbose --print --output-format stream-json "/implement ..." < /dev/null` | `claude --model opus --effort high --permission-mode auto "/implement ..."` |

Notes on the `claude` flags:

- **`/implement` leads the prompt.** The skill is user-invoked only
  (`disable-model-invocation: true`), so Claude cannot call it itself, and in print
  mode a `/implement` written later in the text does not expand. At the start of the
  prompt it loads, and everything after it reaches the skill as its arguments.
- **`--model` and `--effort` are pinned.** Without them Claude Code falls back to
  `~/.claude/settings.json`, which `/model` and `/effort` rewrite from any
  interactive session.
- **`--permission-prompts none`** (print mode only): with nobody to answer, anything
  that would prompt is denied and Claude is told not to retry it. Auto mode's
  classifier still reviews every action first.
- **`< /dev/null`** stops Claude Code waiting 3s for stdin when the script is not
  run from a terminal.
- **No `--bare`.** It would skip the repo's skills and `CLAUDE.md` and need an
  `ANTHROPIC_API_KEY` instead of your subscription login. The Claude Code docs say
  `--bare` will become the default for `-p`; revisit these scripts when it does.

---

## Reopening a Run

Print-mode sessions are saved, so you can open one interactively to ask why it did
something or to finish the ticket yourself. `afk.sh` prints each iteration's session
ID when it ends:

```bash
claude -r <session-id>   # a specific iteration, from any directory
claude -c                # the most recent conversation in this directory
```

`claude -c` picks whichever session in the directory ran last, including one you
started yourself after the loop, so prefer `-r` with the printed ID. Do not add `-c`
to the loop itself: every iteration starts with a fresh context on purpose, and its
progress lives in commits and issue comments.

---

## Environment Variables

- `AGENT`: Default agent if not passed as CLI argument (`claude` or `agy`). Default: `claude`.
- `ISSUE_LABEL`: Default extra label filter if not passed as CLI argument. Default: none.
- `RALPH_BASE_LABEL`: Base label required on every issue. Default: `ready-for-agent`.
- `RALPH_MODEL`: Model for `claude` runs (alias or full name). Default: `opus`.
- `RALPH_EFFORT`: Effort for `claude` runs (`low`, `medium`, `high`, `xhigh`, `max`). Default: `high`. `CLAUDE_CODE_EFFORT_LEVEL`, if set in your environment, overrides it.
- `RALPH_MAX_BUDGET_USD`: Spend cap for each `claude` print-mode run (`--max-budget-usd`). Default: none.
- `PRINT_TIMEOUT`: Timeout for `agy` print mode (default: `30m`).
- `RALPH_AGY_NEW_PROJECT`: Force (`1`) or suppress (`0`) the `--new-project` flag passed to `agy`. Default: `auto` (on inside a linked worktree).

---

## How It Works

1. Queries GitHub issues using `gh issue list --state open --label ready-for-agent` (plus `--label <your-label>` when a filter is given).
2. Gathers the last 5 commits via `git log`.
3. Merges the context with the task instructions in [`prompt.md`](./prompt.md), plus a label-filter note when one is active. For `claude`, the prompt starts with `/implement`.
4. Launches the chosen agent (`agy` or `claude`), which works one issue on the current branch, commits, and closes the issue once the work is done.
5. In `afk.sh`, loops until no more tasks remain (`<promise>NO MORE TASKS</promise>`) or maximum iterations are reached.
