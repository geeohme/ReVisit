# ReVisit — Backlog

A running list of ideas to develop. Newest/most-wanted near the top of each section.
Move items to **Done** (or just delete) as they ship. Keep entries short — one line of
intent plus any constraints worth not forgetting.

**Format:** `- [ ] Title — one-line description. (notes / why / where)`

---

## Next up

- [ ] **Smart Reorganization** — a feature to clean up the data model: handle orphaned tags
  (tags only disappear today when their last bookmark is deleted), merge/rename tags and
  categories, suggest re-categorization. Tag *deletion* was intentionally deferred to live here.
- [ ] **Per-domain rules** — once a domain is saved, attach a rule: summarize future saves
  with a chosen model, use a custom summarization prompt, and position the capture popup at a
  chosen spot. Needs its own `rvDomainRules` store keyed by hostname; reuses the existing
  9-grid `capturePopupPosition` vocabulary.

## Ideas / someday

- [ ] **Wire up the revisit scheduling engine** — scheduling logic exists in `background.js`
  but appears unwired; verify current state and decide whether to finish it.

## Polish / tech-debt

- [ ] **Summarize-only transcript formatting** — the YouTube summarize-only → "ReVisit this
  page" path computes the Groq-formatted transcript twice (once discarded during summarize,
  once on save). Thread it through instead of recomputing. Low priority.
- [ ] **Per-bookmark / per-category color contrast** — avatars use luminance-based black/white
  text; revisit if any picked colors still read poorly.

## Done

- [x] 2026-06 feature batch — list UX (logo, ReVisited status, tag-click filter, editable zoom,
  space-switch, category-letter avatars + colors, multi-select, bucket nav, sidebar
  Categories/Tags tabs + search), settings reorg, summarize-only + 9-grid popup position.
  (spec: `docs/superpowers/specs/2026-06-08-feature-batch-design.md`)
