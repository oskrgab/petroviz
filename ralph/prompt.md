# ISSUES

Open GitHub issues are provided at the start of context. Parse them to understand what's open.

You will work on issues labelled `ready-for-agent` only (AFK-ready). Skip everything else.

You've also been passed a file containing the last few commits. Review these to understand what work has been done.

If there are no unblocked `ready-for-agent` issues left, output `<promise>NO MORE TASKS</promise>`.

# BRANCH

Work on the branch that is checked out now. Make every change and every commit on
it: do not create, switch to or check out another branch, and do not open a pull
request.

# DEPENDENCIES & BLOCKERS

Dependencies are recorded two ways in this repo. **Check the API first — it is the
authoritative record.** Prose is the fallback for issues that predate it.

## 1. Query the recorded dependencies

`gh api` substitutes `{owner}/{repo}` from the current checkout, so these work as written:

```bash
# What blocks this issue? Empty output (exit 0) means nothing is recorded.
gh api "repos/{owner}/{repo}/issues/<number>/dependencies/blocked_by" \
  -q '.[] | "#\(.number) [\(.state)] [\((.labels//[])|map(.name)|join(","))] \(.title)"'

# What does this issue unblock? Useful for prioritising: an issue that
# unblocks several others is worth more than one that unblocks nothing.
gh api "repos/{owner}/{repo}/issues/<number>/dependencies/blocking" \
  -q '.[] | "#\(.number) [\(.state)] \(.title)"'
```

The response carries `state` and `labels` for every blocker, so one call answers the
whole decision below — no follow-up `gh issue view` needed.

`gh api "repos/{owner}/{repo}/issues/<number>" -q .issue_dependencies_summary` returns
counts (`{"blocked_by":4,"blocking":2,...}`) and is a cheap pre-filter, but confirm with
the `blocked_by` endpoint before acting on it — you need each blocker's state and labels.

## 2. Fall back to the issue body

An empty API result means *nothing is recorded*, *not* that the issue is unblocked.
Read the body and comments (`gh issue view <number> --comments`) and treat these as
blockers regardless of the heading they appear under — the headings are inconsistent
(`## Blocked by`, `## Preconditions`, `## Dependencies`), as are the phrasings
(`Blocked by`, `Depends on`, `Requires`, `must precede`).

Watch for the reverse direction too: an issue may declare `**Blocks #56.**` in its own
body rather than #56 declaring the dependency. That still blocks #56.

Also check whether an epic or plan issue carries a gate table or an order-of-work
diagram for the whole effort — it may be the only place an ordering is written down.

## 3. Decide

1. **Check if blockers are resolved**: An issue is unblocked if every blocker is already
   closed, merged, or present in git history. A `[closed]` blocker is satisfied — ignore it.
2. **If an issue has open blockers**:
   - Check if the blocking issue is itself labelled `ready-for-agent` (AFK-ready) and
     unblocked. If so, prioritize and work on that blocking issue first.
   - If the blocking issue is **NOT** AFK-ready (e.g. waiting on human action, triage, or
     unlabelled), **SKIP this issue immediately** and look for another candidate.
3. **Never work on a blocked issue**: You must only select and work on an issue that is
   100% unblocked and AFK-ready.

## 4. Record what you discover

If you establish a dependency that is only written in prose, record it in the API so the
next iteration does not have to re-derive it (`<blocker-id>` is the blocker's numeric
`id`, not its issue number — and it must be sent as an integer, so use `-F`, not `-f`):

```bash
BLOCKER_ID=$(gh api "repos/{owner}/{repo}/issues/<blocker-number>" -q .id)
gh api --method POST "repos/{owner}/{repo}/issues/<number>/dependencies/blocked_by" \
  -F "issue_id=$BLOCKER_ID"
```

# TASK SELECTION

Pick the next unblocked, `ready-for-agent` issue. Prioritize in this order:

1. Critical bugfixes
2. Development infrastructure

Getting development infrastructure like tests, types, and dev scripts ready is an important precursor to building features.

3. Tracer bullets for new features

Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. This helps in identifying potential issues and ensures that the overall architecture is sound before investing significant time in development.

TL;DR — build a tiny, end-to-end slice of the feature first, then expand it out.

4. Polish and quick wins
5. Refactors

**MANDATORY FIRST OUTPUT:**
Before calling any tools or taking any other action, the very first line of your response MUST state the issue you are working on:
`Working on issue #<number>: <title>`

# EXPLORATION

Explore the repo. If you need the full issue body or comments, run:

```
gh issue view <number> --comments
```

# IMPLEMENTATION

Implement the issue on the current branch. Write tests first where the issue names a
seam to test at, typecheck as you go, and run the full test suite at the end.

# FEEDBACK LOOPS

Before committing, run the feedback loops:

- `pnpm test` to run the tests
- `pnpm check` to typecheck (svelte-check)
- `pnpm build` to confirm the app still builds

Fix any failures before committing.

# COMMIT

Make a git commit on the current branch. The commit message must:

1. Include key decisions made
2. Include files changed
3. Include blockers or notes for next iteration
4. Reference the issue with `Refs #<number>` (or `Closes #<number>` if the issue is fully done)

# THE ISSUE

When the work is done (the feedback loops pass and the commit is made), you must close
the GitHub issue with a summary comment. `Closes #<number>` in a commit does not close
it: GitHub only acts on that once the commit reaches the default branch, and an issue
left open is picked up again by the next iteration.

```
gh issue close <number> --comment "..."
```

If the task is not complete, leave the issue open and add a progress comment describing what was done and what's left:

```
gh issue comment <number> --body "..."
```

# FINAL RULES

ONLY WORK ON A SINGLE ISSUE.

STAY ON THE CURRENT BRANCH.

CLOSE THE ISSUE ONCE ITS WORK IS DONE AND COMMITTED.
