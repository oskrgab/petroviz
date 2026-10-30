#!/bin/bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

iterations=""
agent="${AGENT:-claude}"
label_filter="${ISSUE_LABEL:-}"

show_help() {
  cat <<EOF
Usage: $0 <iterations> [agent] [label]
       $0 <iterations> [agent] [--label <label>]

Run Ralph in a loop to tackle GitHub issues.

Arguments:
  <iterations>       Number of iterations to run (required)
  [agent]            Agent command to run: 'claude' (default) or 'agy'
  [label]            Extra label to filter issues by, in addition to
                     '$RALPH_BASE_LABEL' (optional)

Options:
  -l, --label LABEL  Extra label to filter issues by (same as the positional
                     form). The label must exist in the repository.
  -h, --help         Show this help message

Environment Variables:
  AGENT              Default agent if not specified ('claude' or 'agy')
  ISSUE_LABEL        Default extra label filter if not specified
  RALPH_BASE_LABEL   Base label required on every issue (default: ready-for-agent)
  RALPH_MODEL        claude model (default: opus)
  RALPH_EFFORT       claude effort: low, medium, high, xhigh, max (default: high)
  RALPH_MAX_BUDGET_USD  Spend cap for each claude iteration (default: none)
  PRINT_TIMEOUT      Timeout for agy print mode (default: 30m)

Examples:
  $0 5                    # 5 iterations, default agent, all '$RALPH_BASE_LABEL' issues
  $0 5 agy                # 5 iterations with agy (--dangerously-skip-permissions)
  $0 5 claude bug         # Only issues labelled '$RALPH_BASE_LABEL' AND 'bug'
  $0 5 --label bug        # Same, using the flag form
  AGENT=agy $0 5          # Run 5 iterations with agy via env var
  ISSUE_LABEL=bug $0 5    # Label filter via env var
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
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        iterations="$1"
      elif [ -z "$label_filter" ]; then
        # Treat a bare non-numeric argument as the label filter; it is
        # validated against the repo's labels below.
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

if [ -z "$iterations" ]; then
  echo "Error: <iterations> is required." >&2
  show_help >&2
  exit 1
fi

case "$agent" in
  agy)
    stream_text='if .event == "step_update" then (if .step_update.step_type == "tool" and .step_update.state == "ACTIVE" then "\n> [\(.step_update.tool_name)] " + (.step_update.tool_info.parameters.CommandLine // .step_update.tool_info.parameters.TargetFile // .step_update.tool_info.parameters.AbsolutePath // "") + "\n" elif .step_update.text_delta != null then .step_update.text_delta else empty end) else empty end'
    final_result='select(.event == "result").result.response // empty'
    ;;
  claude)
    stream_text='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'
    final_result='select(.type == "result").result // empty'
    ;;
  *)
    echo "Error: Unsupported agent '$agent'. Must be 'claude' or 'agy'." >&2
    exit 1
    ;;
esac

if [ -n "$label_filter" ]; then
  label_filter=$(ralph_resolve_label "$label_filter") || exit 1
  echo "Filtering issues by label: $(ralph_filter_description "$label_filter")" >&2
fi

label_note=$(ralph_prompt_label_note "$label_filter")

# Keeps agy inside this worktree instead of the repo it was created from.
agy_project_args=()
if [ "$agent" = "agy" ]; then
  read -r -a agy_project_args <<< "$(ralph_agy_project_args)" || true
else
  read -r -a claude_args <<< "$(ralph_claude_args) $(ralph_claude_print_args)"
fi

for ((i = 1; i <= iterations; i++)); do
  tmpfile=$(mktemp)
  trap 'rm -f "$tmpfile"' EXIT INT TERM

  echo "===== Ralph iteration $i / $iterations (agent: $agent) =====" >&2

  commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
  issues=$(ralph_fetch_issues "$label_filter")
  ralph_report_issues "$issues" "$label_filter"

  prompt=$(cat "$SCRIPT_DIR/prompt.md")
  full_prompt="Previous commits: $commits Issues: $issues $label_note$prompt"

  echo "Calling $agent (this can take a while before first output)..." >&2

  if [ "$agent" = "agy" ]; then
    agy --dangerously-skip-permissions \
      "${agy_project_args[@]}" \
      --print-timeout "${PRINT_TIMEOUT:-30m}" \
      --output-format stream-json \
      -p "$full_prompt" |
      grep --line-buffered '^{' |
      tee "$tmpfile" |
      jq --unbuffered -rj "$stream_text"
  else
    claude "${claude_args[@]}" \
      --verbose \
      --print \
      --output-format stream-json \
      "$RALPH_CLAUDE_SKILL $full_prompt" < /dev/null |
      grep --line-buffered '^{' |
      tee "$tmpfile" |
      jq --unbuffered -rj "$stream_text"

    # Print-mode sessions are saved, so the iteration can be reopened later.
    session_id=$(jq -r 'select(.type == "result").session_id // empty' "$tmpfile" 2>/dev/null || true)
    [ -n "$session_id" ] && echo "Iteration $i session: $session_id (reopen with: claude -r $session_id)" >&2
  fi

  result=$(jq -r "$final_result" "$tmpfile" 2>/dev/null || true)
  rm -f "$tmpfile"

  if [[ "$result" == *"<promise>NO MORE TASKS</promise>"* ]]; then
    echo "Ralph complete after $i iterations."
    exit 0
  fi
done
