# ReVisit — Issue Register (build backlog)

Every issue from `01-walkthrough.md` in one sortable table. **Sev**: 🔴 high ·
🟠 medium · 🟡 low. **Logic risk**: `CSS` (pure CSS/markup) · `WIRE` (connect an
existing endpoint, no new logic) · `MINOR` (small local logic) · `MED` (a flow) —
**none reshape `rvData`/`rvLocal` or the Supabase sync path.** **Fix ref** points to
the recommendation in `02-recommendations.md`.

## UX issues

| ID | Sev | Issue (where) | Fix | Ref | Logic |
|----|----|---------------|-----|-----|-------|
| U13 | 🔴 | Can't save a bookmark without a Revisit date — empty date makes `toISOString()` throw (`content.js:1120`) | Optional date + quick chips incl. "No reminder"; store `null`→Someday | B5 | MINOR |
| U18 | 🔴 | "ReVisit ↗" only `window.open` — never marks revisited / moves the date (`list-modal.js:319`), while `background.js:1187` already does it correctly | Kebab menu: Revisited/Snooze/Done wired to existing `updateBookmarkStatus` | B3 | WIRE |
| U7 | 🔴 | In‑app "Test Connection" is a mock that always says success (`list-modal.js:196‑211`) | Reuse the real `testGatewayConnection` message onboarding uses | B10 | WIRE |
| U2 | 🔴 | Onboarding step 4 makes users run a `curl` command to mint a key (`onboarding.html:213`) | Move behind "How do I get a key?" link + a Skip button | B9 | MED |
| U19 | 🟠 | "Priority View" = 3 invisible buckets, arbitrary intra‑bucket order (`list-modal.js:1635`) | Always‑on due chips + Overdue/Today/Week/Later/Someday groups | B4 | CSS |
| U20 | 🟠 | No real sort (only Priority⇄Date toggle) | Sort menu: Due/Added/Updated/Title/Category | B7 | CSS |
| U22 | 🟠 | AI summary invisible until you open the editor (`list-modal.js:299`) | 2‑line summary preview on each row | B6 | CSS |
| U8 | 🟠 | Provider+model configured separately ×3, forever (`list-modal.html:205`) | Global default model + optional per‑task overrides | B10 | MINOR |
| U9 | 🟠 | Adding an Ollama Cloud model needs Test→Refresh→re‑pick→Save (`list-modal.js:1053`) | Auto‑surface models after key entry; fold into AI tab | B10 | MINOR |
| U10 | 🟠 | Deleting a Space requires typing "reassign"/"delete" into `window.prompt` (`list-modal.js:1265`) | In‑app dialog with radio choice | B8 | MINOR |
| U11 | 🟠 | Two ways to order categories: drag AND a 1–100 number (`list-modal.js:1357`) | Keep drag; drop the number field (or hide as advanced) | B7 | CSS |
| U3 | 🟠 | Step 5 forces provider+model for 3 "transactions" before first save (`onboarding.html:254`) | One default; advanced disclosure | B9 | MED |
| U4 | 🟠 | Onboarding hard‑blocks on name+key+6 fields (`onboarding.js:320`) | Make name & AI optional; sensible defaults | B9 | MED |
| U1 | 🟠 | Two onboarding front doors (account gate + wizard) collide (`onboarding.html:110`) | One path; ask "have an account?" once | B9 | MED |
| U12 | 🟠 | Spaces setup is heavy: gate + 3‑zone manager (`list-modal.html:308`) | Tabbed settings; explain Space vs Category inline | B9/B10 | CSS |
| U5 | 🟡 | Categories entered as a comma string, generic defaults (`onboarding.html:171`) | Starter‑Space template chips | B9 | MED |
| U6 | 🟡 | "Space" introduced late; step‑2 categories silently become its categories (`onboarding.js:301`) | Show Space→Category relationship up front | B9 | MED |
| U14 | 🟡 | Summary has Zoom; Notes (textarea) doesn't (`content.js:976`) | Give Notes a Zoom too | B (capture) | CSS |
| U15 | 🟡 | Changing Space wipes the typed category (`content.js:1050`) | Keep input; offer "create here" if name absent | — | MINOR |
| U16 | 🟡 | After save, no link to the item / its Space (`content.js:1171`) | Toast with "View in list" action | — | CSS |
| U17 | 🟡 | Long AI call shows only one toast (`content.js:724`) | Skeleton/progress in the card | — | CSS |
| U21 | 🟡 | "ReVisited" status unreachable by any action (`list-modal.html:39`) | Resolved by B3 (the menu sets it) | B3 | WIRE |
| U23 | 🟡 | Row click vs tiny button competes (`list-modal.js:311`) | Title = Open; actions in a clear cluster + kebab | B3 | CSS |
| U24 | 🟡 | Search placeholder "Search categories…" but searches bookmarks (`list-modal.html:31`) | Fix placeholder copy | — | CSS |
| U25 | 🟡 | Tags captured but not filterable (`content.js:1118`) | Tag filter in sidebar | B7 | CSS |
| U26 | 🟡 | Inadequate default Spaces/Categories | Starter templates (Read Later/Watch/Work/Shopping) | B9 | MED |

## UI / visual issues

| ID | Sev | Issue (where) | Fix | Ref | Logic |
|----|----|---------------|-----|-----|-------|
| V5 | 🔴 | Settings modal hardcoded light — white flash in dark mode; `.settings-overlay` duplicated (`styles.css:789`,`325`/`775`) | One token file; settings honors theme | B1 | CSS |
| V6 | 🟠 | Rainbow Bootstrap buttons: green/teal/gray/red (`styles.css:893‑918`) | One accent; semantic colors only for state | B2 | CSS |
| V7 | 🟠 | Emoji as the icon system (`list-modal.html:118‑296`) | One line‑icon set (Lucide/Phosphor/Tabler) | B2 | CSS |
| V1 | 🟠 | Onboarding is a separate design system, different blue, no dark mode (`onboarding.html:7‑104`) | Shared tokens across all surfaces | B1 | CSS |
| V14 | 🟠 | List rows low‑info & flat: title/host/date only (`list-modal.js:299`) | Favicon, category chip, due chip, summary, actions | B4/B6 | CSS |
| V15 | 🟠 | Edit overlay is a tall scroll; no "open page" link (`list-modal.html:62`) | Reorder; add open‑page link; group metadata | B (detail) | CSS |
| V8 | 🟠 | Spaces panel stacks over settings modal (2 scrims, 2 close btns) (`styles.css:1095`) | Spaces as a settings tab | B10 | CSS |
| V17 | 🟠 | Native `confirm`/`prompt` for delete & unsaved (`list-modal.js:331`,`641`,`1265`) | Themed in‑app dialogs | B8 | CSS |
| V2 | 🟡 | Green‑on‑black curl block is the visual centerpiece of step 4 (`onboarding.html:213`) | Hide behind link (see U2) | B9 | CSS |
| V3 | 🟡 | Six unlabeled progress dots (`onboarding.html:150`) | Labeled/short progress | B9 | CSS |
| V4 | 🟡 | Dense unstyled onboarding forms | Grouped, rhythmic forms | B9 | CSS |
| V9 | 🟡 | Capture card is a 4th dialect; follows OS theme while List uses manual toggle (`content.js:9‑80`) | Read saved theme first | B1 | CSS |
| V10 | 🟡 | Summary box locked to 110px → needs Zoom crutch (`content.js:266`) | Natural height + optional Zoom | B (capture) | CSS |
| V11 | 🟡 | Bare date input as the only scheduler (`content.js:982`) | Quick chips (tomorrow/week/month) | B5 | CSS |
| V12 | 🟡 | Row buttons styled inline in JS (`list-modal.js:306`) | Move to CSS classes | B2 | CSS |
| V13 | 🟡 | Search icon historically oversized/misplaced (`styles.css:186`) | Proper inline icon sizing | B2 | CSS |
| V16 | 🟡 | Markdown editor swaps raw/rendered on focus/blur — feels unstable (`list-modal.js:413`) | Calmer edit affordance / live preview | B (detail) | CSS |

## Tally

- **27 UX + 17 UI = 44 issues.** By logic risk: **CSS ~27 · WIRE ~4 · MINOR ~8 ·
  MED ~5.** Roughly **70% are pure presentation**, and the few non‑CSS items are
  "connect an existing endpoint" or small local changes. **Nothing here requires
  touching the cloud‑sync code or the stored data shape** — matching the brief's
  guardrail.
