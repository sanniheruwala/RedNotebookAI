# Design: remote git sync for notebooks

**Status:** 🟡 design — accepting implementer
**Tracking issue:** TBD (filed in the GitHub issues tab)
**Estimated effort:** ~1 week for a polished v1

---

## The problem

Today the per-user notebook directory is a local git repo. Autosave lands
a commit on every edit and the History dialog shows that timeline — but
the repo never leaves the user's machine.

Users have asked: *"can I sync this to GitHub so my notebooks are backed
up and visible to teammates?"* That's a real, common request that the
existing local-only feature doesn't cover.

This proposal adds remote git sync: the user configures a remote URL +
credentials, and the local notebook repo pushes to it on demand or
automatically after each autosave.

---

## What we want users to do

1. Settings → Notebooks → **Remote sync** → paste a git URL (e.g.
   `git@github.com:alice/notebooks.git` or `https://github.com/alice/notebooks.git`)
2. Pick auth: SSH key (path to private key) or HTTPS token.
3. Pick a sync mode:
   - **Manual**: only when the user clicks **Sync now** in the History
     dialog header.
   - **After every autosave**: piggybacks on the autosave commit, fires
     a debounced push.
4. Click **Sync now**. The local repo pushes to the remote. Success
   toast shows the SHA + commit count pushed.

That's the entire UX. Pull / merge / conflict resolution is **out of
scope for v1** — this is one-way push (local → remote) only.

---

## Backend shape

### Storage

Per-user remote config lives in the encrypted runtime-config store
(same place admin AI overrides live today), keyed by user id:

```python
class NotebookRemoteConfig(BaseModel):
    enabled: bool = False
    remote_url: str                # git@host:repo.git or https://...
    auth_mode: Literal["ssh-key", "https-token"]
    ssh_key_path: str | None = None        # absolute path on host
    https_token: SecretStr | None = None   # encrypted at rest
    branch: str = "main"
    auto_push: bool = False                # push on every autosave
```

Stored under `<user_id>.notebook_remote` in the runtime config (it's
sensitive — never written to disk plaintext).

### Connector hook

Extend `NotebookGitStore` with:

```python
def push(self, *, remote_url, branch, auth) -> PushResult:
    """git push <remote_url> HEAD:<branch>, returning the new remote sha + count."""

def is_remote_configured(self) -> bool: ...
```

Implementation uses GitPython's `repo.remote("origin").push()`. For
auth, we'd write a tiny shell wrapper that sets `GIT_SSH_COMMAND` (for
SSH key) or uses a credential helper (for HTTPS token). The token never
hits disk — it's piped via env var to the subprocess.

### Auto-push debouncing

When `auto_push=True`, each autosave fires a push **at most once per 30
seconds** (debounced server-side). Avoids hammering the remote when the
user is typing fast. Implementation: an in-memory `dict[user_id,
threading.Timer]` that schedules the actual push after the debounce
window.

### Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/me/notebook-remote` | Current config (token masked) |
| PUT    | `/api/me/notebook-remote` | Update config |
| POST   | `/api/me/notebook-remote/test` | Probe the remote (clone with `--depth 1` to a tmpdir, report ok/fail) |
| POST   | `/api/me/notebook-remote/push` | One-shot push, returns `{commits_pushed, remote_sha, took_ms}` |

### Edge cases

| Case | Strategy |
|------|----------|
| First push to an empty remote | OK — push creates the branch + history. |
| Remote already has commits not in local | **Reject.** v1 is push-only; pulling + merging is Phase 5. Surface a clear error: "Remote has 3 commits not on your machine. Push refused — open in GitHub to reconcile." |
| Force-push | **Never.** No `--force` ever. |
| Network down | Cache the push request; retry on next autosave. Don't block the save itself. |
| Bad credentials | Surface the git error verbatim in the History dialog header — these errors are usually self-explanatory ("Authentication failed", "Permission denied (publickey)"). |
| Repo has no commits yet | Skip — nothing to push. |
| `auto_push` flapping | The 30s debounce + one-in-flight-at-a-time guard makes a chatty editor cheap. Worst case: one push per 30s per user. |

### Security

* `https_token` is encrypted with the existing `secret_key` rotation
  story (same as connection passwords today).
* `ssh_key_path` is **only a path** — we never read or copy the key
  into our storage. The git subprocess reads it via
  `GIT_SSH_COMMAND='ssh -i $path -o StrictHostKeyChecking=accept-new'`.
* The runtime config audit log records every push event (user, remote
  URL, success/failure, commit count). No tokens or keys logged.

---

## Frontend shape

### Settings page

A new **Notebook remote** section in Settings → Notebooks:

```
┌─────────────────────────────────────────────────────────────┐
│ Notebook remote sync                                        │
│                                                             │
│ ☑ Enable remote git sync                                    │
│                                                             │
│   Remote URL  [ git@github.com:alice/notebooks.git ____ ]   │
│   Branch      [ main _________ ]                            │
│                                                             │
│   Auth        ( ) SSH key   (x) HTTPS token                 │
│                                                             │
│     Token     [ ghp_••••••••••••••••• ]   [Clear]           │
│                                                             │
│   ☐ Push after every autosave (debounced 30s)               │
│                                                             │
│   [Test connection]  [Sync now]                             │
│                                                             │
│   Last sync: 3 commits → main · 2026-06-12 14:23 UTC        │
└─────────────────────────────────────────────────────────────┘
```

### History dialog header

Add a small **Sync** button next to the existing version count line:

```
Notebook history     [⟳ Sync now]
12 versions · 4 today
```

Click → fires `POST /api/me/notebook-remote/push`, shows result toast.
If no remote configured, the button opens the settings page directly.

---

## What's out of scope for v1

* **Pull from remote.** No conflict resolution, no merge UI. Users who
  edit on two machines need to push from one before editing on the
  other. Phase 5 territory.
* **Multi-remote.** One remote per user. If you want to mirror to
  GitHub + GitLab, set up a webhook-style remote-of-remotes outside the
  app.
* **Repo per notebook.** v1 syncs the whole user dir as one repo. Phase
  5 could split per notebook for tighter granularity.
* **Branch switching.** Always pushes to the configured `branch`.
  Switching branches is Phase 5.
* **Public profile pages.** The published-HTML feature already covers
  share-a-notebook-publicly. This is about backup + private collab.

---

## Acceptance criteria

* [ ] User can configure SSH + HTTPS-token auth via the Settings UI.
* [ ] `Test connection` correctly distinguishes success / auth-fail /
      missing-repo / network-error.
* [ ] `Sync now` pushes a notebook edit that landed via autosave and
      surfaces the new remote SHA + count in a toast.
* [ ] Auto-push fires no more than once per 30s under typing load.
* [ ] No tokens / keys are written to disk plaintext.
* [ ] Audit log captures every push (user / remote / outcome).
* [ ] Push to a remote with unrelated commits is rejected with a clear
      error, never `--force`.
* [ ] Unit + E2E tests covering the happy path + the four edge cases
      above.

---

## Why ~1 week and not less

The straightforward push case is half a day. The infrastructure under
it — auth UX, debounce, test-connection probe, the four error cases
each surfaced cleanly in the UI, audit logging, plus tests — is the
other 4 days. Plan honestly.
