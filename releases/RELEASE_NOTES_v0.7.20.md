# v0.7.20

UX bug-fix patch — three issues reported against the History dialog.

## Fixes

### 🐛 Every custom dialog had two close (✕) buttons

shadcn's `DialogContent` already renders a top-right `DialogPrimitive.Close`
button. I'd also added an explicit close `Button` in every custom dialog
I built (History, Publish, Knowledge Studio, Infographic) — so every one
of them showed two ✕ in the top-right corner.

Fix: dropped the redundant button + lucide `X` import from all four
dialogs. The single top-right ✕ from the base `DialogContent` stays.

### 🐛 Notebook History dialog body collapsed to 0 height

`DialogContent` is a CSS grid container with `gap-4` and auto rows.
The History dialog used `h-[78vh]` on the outer + `h-full` on the inner
body, but with the auto-row sizing the body row sized to its natural
content — so the commit list aside / preview panel rendered in a 0-height
region. The header was visible, the body was effectively gone, and the
empty-state message ("No saved versions yet…") was rendered but
invisible.

Fix: added `grid-rows-[auto_1fr]` to the `DialogContent` so the second
row fills, plus `min-h-0 flex-col` on the inner aside / section so they
actually stretch. The commit list now scrolls properly inside the dialog.

### 🐛 History empty state was hard to find

When a notebook has zero commits (e.g. never autosaved), the dialog now
shows a clear empty state — a primary-tinted commit icon, headline
"No saved versions yet", and a one-liner explaining that editing a cell
or hitting ⌘S fires autosave + lands the first commit.

The commit-row visuals also got a polish: slightly larger message
text, selected-row primary tint with a ring, better contrast on the
sha/author/time meta line.

## Upgrade notes

Pure frontend bug-fix patch. No new dependencies, no backend changes,
no migrations.
