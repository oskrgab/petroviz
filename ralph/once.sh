#!/bin/bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

agent="${AGENT:-claude}"
mode="interactive"
label_filter="${ISSUE_LABEL:-}"

show_help() {
  cat <<EOF
Usage: $0 [agent] [label] [options]

Run Ralph for a single task session on GitHub issues.

Arguments:
  [agent]            Agent command to run: 'claude' (default) or 'agy'
  [label]            Extra label to filter issues by, in addition to
                     '$RALPH_BASE_LABEL' (optional)

Options:
  -l, --label LABEL  Extra label to filter issues by (same as the positional
                     form). The label must exist in the repository.
  -p, --print        Run non-interactively in print mode
  -i, --interactive  Run interactively (default)
  -h, --help         Show this help message

Environment Variables:
  AGENT              Default agent if not specified ('claude' or 'agy')
  ISSUE_LABEL        Default extra label filter if not specified
  RALPH_BASE_LABEL   Base label required on every issue (default: ready-for-agent)
  RALPH_MODEL        claude model (default: opus)
  RALPH_EFFORT       claude effort: low, medium, high, xhigh, max (default: high)
  RALPH_MAX_BUDGET_USD  Spend cap for a claude print-mode run (default: none)
  PRINT_TIMEOUT      Timeout for agy print mode (default: 30m)

Examples:
  $0                    # Interactive session with claude, all '$RALPH_BASE_LABEL' issues
  $0 agy                # Interactive session with agy (--dangerously-skip-permissions)
  $0 agy -p             # Single print-mode turn with agy
  $0 claude bug         # Only issues labelled '$RALPH_BASE_LABEL' AND 'bug'
  $0 --label bug -p     # Same filter, print mode, default agent
  AGENT=agy $0          # Run with agy via env var
  ISSUE_LABEL=bug $0    # Label filter via env var
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    agy|claude)
      agent="$1"
      shift
      ;;
    --agent|-a)
      agent="$2"
      shift 2
      ;;
    --agent=*)
      agent="${1#*=}"
      shift
      ;;
    --label|-l)
      label_filter="$2"
      shift 2
      ;;
    --label=*)
      label_filter="${1#*=}"
      shift
      ;;
    -p|--print)
      mode="print"
      shift
      ;;
    -i|--interactive)
      mode="interactive"
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      if [[ "$1" != -* ]] && [ -z "$label_filter" ]; then
        # Treat a bare argument as the label filter; it is validated against
        # the repo's labels below.
        label_filter="$1"
      else
        echo "Error: Unknown argument '$1'" >&2
        show_help >&2
        exit 1
      fi
      shift
      ;;
  esac
done

case "$agent" in
  agy|claude) ;;
  *)
    echo "Error: Unsupported agent '$agent'. Must be 'claude' or 'agy'." >&2
    exit 1
    ;;
esac

if [ -n "$label_filter" ]; then
  label_filter=$(ralph_resolve_label "$label_filter") || exit 1
  echo "Filtering issues by label: $(ralph_filter_description "$label_filter")" >&2
fi

issues=$(ralph_fetch_issues "$label_filter")
ralph_report_issues "$issues" "$label_filter"

commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
prompt=$(cat "$SCRIPT_DIR/prompt.md")
label_note=$(ralph_prompt_label_note "$label_filter")

# Keeps agy inside this worktree instead of the repo it was created from.
agy_project_args=()
if [ "$agent" = "agy" ]; then
  read -r -a agy_project_args <<< "$(ralph_agy_project_args)" || true
fi
full_prompt="Previous commits: $commits Issues: $issues $label_note$prompt"

case "$agent" in
  agy)
    if [ "$mode" = "print" ]; then
      agy --dangerously-skip-permissions \
        "${agy_project_args[@]}" \
        --print-timeout "${PRINT_TIMEOUT:-30m}" \
        -p "$full_prompt"
    else
      agy --dangerously-skip-permissions \
        "${agy_project_args[@]}" \
        -i "$full_prompt"
    fi
    ;;
  claude)
    read -r -a claude_args <<< "$(ralph_claude_args)"
    if [ "$mode" = "print" ]; then
      read -r -a claude_print_args <<< "$(ralph_claude_print_args)"
      claude "${claude_args[@]}" \
        "${claude_print_args[@]}" \
        --print \
        "$RALPH_CLAUDE_SKILL $full_prompt" < /dev/null
    else
      claude "${claude_args[@]}" \
        "$RALPH_CLAUDE_SKILL $full_prompt"
    fi
    ;;
esac
