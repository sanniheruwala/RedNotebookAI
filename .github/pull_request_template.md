<!--
Thanks for contributing to RedNotebook AI!

Before you submit, please confirm:
  * There is an open issue describing what this PR fixes / adds. Reference it
    in the "Linked issue" field below. Drive-by PRs with no linked issue may
    be closed without review — see docs/contributing.md.
  * Your branch is up to date with `main`.
  * `pytest`, `ruff check .`, and the frontend lint / typecheck / build all
    pass locally.

`main` is a protected branch. Merging requires:
  * Green CI (backend + frontend).
  * Approval from a maintainer listed in .github/CODEOWNERS.
  * No unresolved review comments.

Direct pushes to `main` are blocked, even for admins.
-->

## Summary

<!-- One or two sentences: what does this PR do and why? -->

## Linked issue

<!-- Required for any non-trivial change. Use one of:
       Closes #123
       Refs #123
     Drive-by PRs without a linked issue may be closed without review. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] CI / tooling
- [ ] Breaking change

## How I tested this

<!--
List the commands you ran:
- `pytest`
- `ruff check .`
- `npm run typecheck && npm run lint && npm run build`
- Manual checks (which endpoints / UI flows)
-->

## Screenshots / API examples

<!-- Drop UI screenshots, curl examples, or before/after diffs here. -->

## Checklist

- [ ] An issue exists for this change and is linked above.
- [ ] Tests added or updated where it makes sense.
- [ ] `pytest` and `ruff check .` pass locally.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run build` pass locally (if frontend changed).
- [ ] Docs / README updated if user-facing behavior changed.
- [ ] No secrets / credentials in code or commits.
- [ ] PR title follows Conventional Commits (`feat:` / `fix:` / `docs:` / `refactor:` / `chore:` / `ci:` / `perf:`).

## Maintainer approval

By opening this PR you agree that merge requires written approval from a
[CODEOWNER](../.github/CODEOWNERS). Self-merge is not permitted; please
wait for a maintainer to review and approve.
