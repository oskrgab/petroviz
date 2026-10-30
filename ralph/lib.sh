#!/bin/bash
# Shared helpers for the Ralph scripts (afk.sh, once.sh).

# Label every Ralph run requires. Overridable, but not part of the CLI.
RALPH_BASE_LABEL="${RALPH_BASE_LABEL:-ready-for-agent}"

# Model and effort for claude runs. Pinned here because an interactive /model
# or /effort rewrites ~/.claude/settings.json, which would otherwise silently
# change what Ralph runs with.
RALPH_MODEL="${RALPH_MODEL:-opus}"
RALPH_EFFORT="${RALPH_EFFORT:-high}"

# Flags every claude run gets, interactive or not.
ralph_claude_args() {
  echo "--model $RALPH_MODEL --effort $RALPH_EFFORT --permission-mode auto"
}

# Extra flags for unattended (print-mode) claude runs. With nobody to answer,
# --permission-prompts none denies anything that would prompt and tells Claude
# not to retry it. RALPH_MAX_BUDGET_USD caps the spend of each run.
ralph_claude_print_args() {
  local args="--permission-prompts none"
  [ -n "${RALPH_MAX_BUDGET_USD:-}" ] && args+=" --max-budget-usd $RALPH_MAX_BUDGET_USD"
  echo "$args"
}

# Prefix for the claude prompt. /implement is user-invoked only
# (disable-model-invocation), so it must lead the prompt: a mention later in
# the text is not expanded in print mode, and Claude cannot call it itself.
RALPH_CLAUDE_SKILL="/implement"

# Print every label defined in the current repo, one per line.
ralph_repo_labels() {
  gh label list --limit 200 --json name --jq '.[].name' 2>/dev/null
}

# Validate a user-supplied label against the repo.
# Echoes the canonical label name on success; on failure prints a clear error
# listing the available labels and returns 1.
ralph_resolve_label() {
  local requested="$1"
  local labels match

  labels=$(ralph_repo_labels)
  if [ -z "$labels" ]; then
    echo "Error: could not list labels for this repository." >&2
    echo "Make sure 'gh' is authenticated (gh auth login) and you are inside a GitHub repo." >&2
    return 1
  fi

  # Exact match first, then fall back to a case-insensitive match so that
  # './afk.sh 5 Bug' resolves to the canonical 'bug'.
  match=$(printf '%s\n' "$labels" | grep -Fx -- "$requested" || true)
  if [ -z "$match" ]; then
    match=$(printf '%s\n' "$labels" | grep -Fxi -- "$requested" | head -n 1 || true)
  fi

  if [ -z "$match" ]; then
    echo "Error: label '$requested' does not exist in this repository." >&2
    echo "Available labels:" >&2
    printf '%s\n' "$labels" | sed 's/^/  - /' >&2
    return 1
  fi

  printf '%s\n' "$match"
}

# Human-readable description of the active filter, e.g.
# "'ready-for-agent' + 'bug'".
ralph_filter_description() {
  local extra_label="$1"
  if [ -n "$extra_label" ]; then
    echo "'$RALPH_BASE_LABEL' + '$extra_label'"
  else
    echo "'$RALPH_BASE_LABEL'"
  fi
}

# Fetch open issues as JSON, optionally narrowed by an extra label.
# gh treats repeated --label flags as AND, so issues must carry both labels.
ralph_fetch_issues() {
  local extra_label="$1"
  local args=(--state open --label "$RALPH_BASE_LABEL")
  [ -n "$extra_label" ] && args+=(--label "$extra_label")

  gh issue list "${args[@]}" \
    --json number,title,body,labels,comments \
    --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]' \
    2>/dev/null || echo "[]"
}

# Log what was found to stderr.
ralph_report_issues() {
  local issues="$1" extra_label="$2"
  local count description

  description=$(ralph_filter_description "$extra_label")
  count=$(echo "$issues" | jq 'length' 2>/dev/null || echo "0")

  if [ "$count" -gt 0 ]; then
    echo "Found $count issue(s) labeled $description:" >&2
    echo "$issues" | jq -r '.[] | "  - #\(.number): \(.title)"' >&2
  else
    echo "No issues found labeled $description." >&2
  fi
}

# Extra instruction appended to the prompt when a label filter is active, so
# the agent does not wander off to issues that were filtered out.
ralph_prompt_label_note() {
  local extra_label="$1"
  [ -z "$extra_label" ] && return 0
  echo "Label filter: only issues labelled both '$RALPH_BASE_LABEL' and '$extra_label' are listed above, and they are the only issues you may work on. If none of them are unblocked, output the NO MORE TASKS promise. "
}

# True when the current directory is a linked git worktree (not the main one).
# In a linked worktree --git-dir points at .git/worktrees/<name> while
# --git-common-dir points at the original repo's .git.
ralph_in_linked_worktree() {
  local git_dir common_dir
  git_dir=$(git rev-parse --absolute-git-dir 2>/dev/null) || return 1
  common_dir=$(cd "$(git rev-parse --git-common-dir 2>/dev/null)" && pwd) || return 1
  [ "$git_dir" != "$common_dir" ]
}

# Extra agy flags needed to keep the agent inside the current worktree.
#
# agy binds a session to a "project" resolved from a registry keyed by absolute
# path (~/.gemini/config/projects/*.json). A worktree created under a directory
# that is already a registered project root (e.g. /data/dev/apps) inherits that
# project, and agy then works in the ORIGINAL repo instead of the worktree --
# silently committing to the wrong branch. --new-project pins the session to the
# current directory. Override with RALPH_AGY_NEW_PROJECT=0|1.
ralph_agy_project_args() {
  case "${RALPH_AGY_NEW_PROJECT:-auto}" in
    1) echo "--new-project" ;;
    0) ;;
    *) ralph_in_linked_worktree && echo "--new-project" ;;
  esac
}
