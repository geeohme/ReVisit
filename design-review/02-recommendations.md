# ReVisit — Overhaul Recommendations & Design Options

> Companion to `01-walkthrough.md`. This document synthesizes four design lenses
> (Visual/Brand, Interaction/UX, Product/IA, Accessibility) into **three cohesive
> design directions** plus a **shared system of fixes** that applies under any
> direction. Mockups for each direction live in `/mockups`.
>
> **Guardrail honored throughout:** avoid logic changes, *especially around cloud
> sync*. Each recommendation is tagged **[CSS/markup]**, **[wire existing logic]**,
> **[minor logic]**, or **[larger]**. Anything touching `rvData`/`rvLocal` shape or
> the Supabase path is flagged explicitly and kept out of the recommended core.

---

## Part A — Four lenses, one diagnosis

### Lens 1 · Visual / Brand
The product looks generic because it has **no single visual source of truth** and
**no brand point of view**. Four token sets (§5.1 of the walkthrough), three blues,
a Bootstrap button rainbow, emoji icons, and Inter everywhere. Meanwhile the
**logo is warm, tactile, and characterful** and is the only thing with a POV — and
the UI ignores it. **The brand wants to be "a note you'll come back to."** That is a
gift: lean into paper, ink, warmth, and a real type pairing, and the "AI slop"
quality evaporates without any logic change.

### Lens 2 · Interaction / UX
Two interactions are actively broken (can't‑save‑without‑date U13; ReVisit‑doesn't‑
revisit U18) and two are hollow (priority U19, sort U20). The fix is a coherent
**"capture → remind → decide" loop**: every item has a clear due state, the primary
action *actually* reschedules using the engine that already exists, and triage gets
real sort/filter. Most of this is wiring, not new logic.

### Lens 3 · Product / IA
Four organizing axes compete — **Space › Category › Status › Tags** plus a date.
They don't need to be cut, they need a **hierarchy of attention**: Space = the
"binder" (rare switch), Category = the shelf (primary filter), **due date = the
spine of the list** (this is a *revisit* tool, so time is the main axis, not an
afterthought sort), Status = a small lifecycle (To revisit → Revisited → Done),
Tags = optional cross‑cut, surfaced as a filter. Reinterpreting existing fields,
not reshaping data.

### Lens 4 · Accessibility / Polish
Highest‑leverage, lowest‑risk wins: kill the hardcoded‑light settings modal so dark
mode is whole; add real `:focus-visible` rings; give icon‑buttons labels; replace
`window.confirm`/`window.prompt` with in‑app dialogs; add `aria-live` to toasts;
honor `prefers-reduced-motion`. Almost all **[CSS/markup]**.

---

## Part B — The shared system (applies under every direction)

These are direction‑agnostic. Adopt them regardless of which look you pick.

### B1. One token file, one theme switch — **[CSS/markup]**
Collapse the four token sets into a single `tokens.css` consumed by *all* surfaces
(onboarding, list, settings, capture card). Drive light/dark from one
`[data-theme]` attribute and **delete the hardcoded‑light settings CSS**
(`styles.css:789‑870`) and the duplicate `.settings-overlay` block. Capture card
can still *default* to `prefers-color-scheme` but should read the saved theme first.

### B2. Replace emoji headers with one line‑icon set — **[CSS/markup]**
Adopt a single open‑source line set (Lucide / Phosphor / Tabler). Consistent stroke
weight, currentColor‑driven so they theme for free. Reserve color for state, not
for every section header.

### B3. Fix the ReVisit action model — **[wire existing logic]**
Define four verbs and map them to fields the backend already maintains:

| Verb | What it means | Effect (existing field) | Existing endpoint |
|---|---|---|---|
| **Open** | read it now | `window.open(url)` | n/a |
| **Revisited** | I looked, remind me again | `revisitBy += defaultInterval`, `status='Active'`, history++ | `updateBookmarkStatus('ReVisited')` `background.js:1187` |
| **Snooze ▾** | not now, later | set `revisitBy` to +1d/+1w/+1mo | same handler, pass a date *(minor)* |
| **Done** | finished with it | `status='Complete'`, history++ | `updateBookmarkStatus('Complete')` `background.js:1178` |

Row layout: **Open** is the title click; a kebab/▾ exposes Revisited / Snooze / Done.
This makes the named feature work and lights up the empty "ReVisited"/"Complete"
states — **no sync code touched**, just connect buttons to handlers.

### B4. Make time the spine of the list — **[CSS/markup]** (+ optional [minor])
Every row shows a **relative due chip**: `Overdue 3d` (danger) · `Due today` ·
`Due in 5d` · `Someday`. Group the list into **Overdue / Today / This week / Later /
Someday** buckets derived from `revisitBy`. This replaces the invisible 3‑bucket
"Priority View" with a visible, always‑on triage — computed from existing data.

### B5. Allow "no date / Someday" — **[minor logic]**
Make the capture date optional. Guard the throw: if the date field is empty, store
`revisitBy=null` (or a far‑future sentinel) and show the item under **Someday**.
Add quick chips: **Tomorrow · This week · Next month · Pick a date · No date**.
Tiny change at `content.js:1120` and the list's date parsing; **no sync change**.

### B6. Summary preview in the list — **[CSS/markup]**
Render a 2‑line clamp of the existing `summary` under each row title, with a
"⌄ expand" affordance. The field already exists; this is presentation only.

### B7. Real sort + filter bar — **[CSS/markup]** (sorts existing arrays)
A compact control row above the list: **Sort** (Due date ▾ default, Date added,
Recently updated, Title, Category) and **Filters** (Status pills, a Tag dropdown,
Category already in the sidebar). Tag filter finally uses the tags we capture (U25).

### B8. In‑app dialogs replace native confirm/prompt — **[CSS/markup]**
A themed `<dialog>`/overlay for unsaved‑changes, delete, and the Space‑delete
"reassign vs delete" choice (radio buttons, not typing a word). Accessible, on‑brand.

### B9. Onboarding on rails — **[medium]** (no sync change)
- One path. Ask "have an account?" once; both answers land in the same 3‑screen flow.
- **Screen 1 — Welcome + name** (optional).
- **Screen 2 — Make it yours:** pick from **starter Space templates** (Read Later,
  Watch, Reference, Shopping…) as chips instead of a comma string; one is the default.
- **Screen 3 — AI (optional, collapsible "Advanced"):** *one* provider+model default
  for everything, with a "different model per task" disclosure for power users. The
  curl instructions move behind a "How do I get a key?" link and a **"Skip — set up
  AI later"** button so onboarding can complete without it.
- Keep the returning‑user sign‑in + Spaces gate, restyled.

### B10. Settings as tabs, global model default — **[CSS/markup]** + **[minor]**
Tabbed settings (Account · AI · Spaces · Data) instead of one long scroll. AI tab:
a **global default model** with optional per‑task overrides (collapsed). Make the
in‑app **Test Connection real** by reusing the working `testGatewayConnection`
message the onboarding already calls (`onboarding.js:69‑88`) — replace the mock at
`list-modal.js:196‑211`. **[wire existing logic]**

### B11. Accessibility baseline — **[CSS/markup]**
`:focus-visible` rings on all interactives; ≥24px hit targets; `aria-label` on the
theme toggle + icon buttons; `aria-live="polite"` on the toast; visible (not
hover‑only) edit affordances; `@media (prefers-reduced-motion: reduce)` to disable
transforms/transitions.

---

## Part C — Three design directions

All three implement Part B. They differ in **aesthetic POV**, not features. Each has
a full token set so a mockup can be built verbatim. Pick one, or mix (e.g.
Direction A's warmth with B's density).

---

### Direction A — **"Paper & Ink"** (recommended) 🟫
*Warm editorial. Reconciles the product with its own logo.* Cream paper grounds,
ink‑navy text, a single saturated accent (the logo's red‑orange check) used **only**
for the due/primary action, and a tactile "index‑card" row. Feels like a Field
Notes notebook, not a SaaS dashboard. This is the most differentiated and the most
"unforgettable."

- **Type:** Display **Fraunces** (soft serif, optical sizing — carries the
  warmth/character) · Body **Newsreader** or **Söhne**/`system-ui` for UI chrome.
  *(Not Inter/Roboto/Arial.)*
- **Signature detail:** rows look like **index cards** with a subtle top edge and a
  hand‑drawn check accent; the active category gets a "highlighter" swipe instead of
  a flat fill.
- **Iconography:** Phosphor (regular weight), ink‑navy.

```css
:root[data-theme="light"] {
  --bg:        #FBF7EF;  /* warm paper */
  --surface:   #FFFDF8;  /* card */
  --surface-2: #F3ECDD;  /* inset / hover */
  --border:    #E4D8C2;
  --ink:       #2A2622;  /* near-black warm */
  --ink-soft:  #6F6657;
  --ink-faint: #A89B85;
  --accent:    #D6492B;  /* logo red-orange — primary action / due */
  --accent-ink:#FFFFFF;
  --accent-soft:#F6E0D8;
  --ok:        #3E7C5A;  /* done */
  --warn:      #C8801E;  /* due soon */
  --danger:    #B23B2E;  /* overdue/destructive */
  --highlight: #FCE9A8;  /* category "swipe" */
}
:root[data-theme="dark"] {
  --bg:        #1C1814;
  --surface:   #262019;
  --surface-2: #2F2820;
  --border:    #3D3225;
  --ink:       #EDE4D3;
  --ink-soft:  #B6A88E;
  --ink-faint: #7C6F58;
  --accent:    #E8633F;
  --accent-ink:#1C1814;
  --accent-soft:#3A241B;
  --ok:        #7FB894;
  --warn:      #E0A645;
  --danger:    #E2705F;
  --highlight: #4A3F1E;
}
```

---

### Direction B — **"Quiet Focus"** (refined dark‑first) 🌑
*Calm, dense, professional — Linear/Things energy.* Near‑monochrome slate with a
single cool accent, tight spacing, subtle elevation. The opposite bet from A: not
warm, but so **disciplined** it can't read as generic. Best if the audience skews
power‑user.

- **Type:** Display/UI **Söhne** or **Geist** · numerics tabular. *(Not Inter.)*
  Free fallback pairing: **Schibsted Grotesk** + `ui-monospace` for dates/counts.
- **Signature detail:** a persistent **left "due rail"** — a 3px colored spine on
  each row encoding due state (overdue→amber→calm), so the whole list reads as a
  timeline at a glance. Hairline separators, no card chrome.
- **Iconography:** Lucide, 1.5px stroke.

```css
:root[data-theme="dark"] {           /* dark is primary here */
  --bg:        #0E1116;
  --surface:   #151A21;
  --surface-2: #1B212A;
  --border:    #232B36;
  --ink:       #E6EAF0;
  --ink-soft:  #9AA6B2;
  --ink-faint: #5C6773;
  --accent:    #5B8DEF;  /* one cool accent */
  --accent-ink:#0E1116;
  --accent-soft:#172132;
  --ok:        #4CB782;
  --warn:      #E0A23C;
  --danger:    #E5604D;
}
:root[data-theme="light"] {
  --bg:        #F6F7F9;
  --surface:   #FFFFFF;
  --surface-2: #F0F2F5;
  --border:    #E2E6EB;
  --ink:       #1A1F26;
  --ink-soft:  #5A6470;
  --ink-faint: #98A2AE;
  --accent:    #2F6FE4;
  --accent-ink:#FFFFFF;
  --accent-soft:#E5EEFD;
  --ok:        #1E9E63;
  --warn:      #B9791A;
  --danger:    #CE4434;
}
```

---

### Direction C — **"Confident System"** (modern, accessible, brandable) 🟦
*A real design system, done right — the current app's intent, executed with
discipline.* Keeps a blue identity (so it's the smallest perceptual leap from
today) but fixes contrast, picks **one** blue, adds a warm neutral so it isn't cold,
uses a characterful grotesk, and applies the Part‑B system. Lowest‑risk path to
"looks intentional" if the team isn't ready for the editorial swing of A.

- **Type:** Display **Bricolage Grotesque** (distinctive, free) · Body **Public
  Sans** or `system-ui`. *(Deliberately not Inter/Roboto.)*
- **Signature detail:** **status as a calm pill system** with a single accent and
  warm‑gray neutrals; a soft "spotlight" gradient header instead of flat fill.
- **Iconography:** Tabler, 2px stroke.

```css
:root[data-theme="light"] {
  --bg:        #F7F6F3;   /* warm gray, not #F9FAFB */
  --surface:   #FFFFFF;
  --surface-2: #EFEDE8;
  --border:    #E3E0D9;
  --ink:       #1B1D22;
  --ink-soft:  #585C66;   /* AA on surface, fixes #6B7280 */
  --ink-faint: #8A8E98;
  --accent:    #2E5BD8;   /* the one blue */
  --accent-ink:#FFFFFF;
  --accent-soft:#E6ECFB;
  --ok:        #1F9D57;
  --warn:      #C07C12;
  --danger:    #D03A2C;
}
:root[data-theme="dark"] {
  --bg:        #16171A;
  --surface:   #1E2024;
  --surface-2: #25282D;
  --border:    #32363D;
  --ink:       #ECEDEF;
  --ink-soft:  #A4A8B0;
  --ink-faint: #6E727A;
  --accent:    #6E97FF;
  --accent-ink:#16171A;
  --accent-soft:#1C2740;
  --ok:        #43BE7C;
  --warn:      #DDA53F;
  --danger:    #E76558;
}
```

---

## Part D — Recommendation & rollout

**Recommended:** **Direction A (Paper & Ink)** for identity — it's the only option
that makes the product *memorable* and it costs nothing in logic. If the team wants
a safer perceptual step, ship **Direction C** first (same system, blue identity) and
treat A as a theme to graduate into. **Direction B** is the right call only if the
real audience is power‑users who live in the list all day.

**Suggested sequencing (all low‑logic‑risk first):**
1. **Foundation [CSS/markup]:** one token file + theme unification (B1), kill
   hardcoded settings light (V5), line icons (B2), focus/aria baseline (B11),
   in‑app dialogs (B8). *Instantly removes the "slop" read.*
2. **Make the name true [wire existing logic]:** ReVisit action model (B3), due
   chips + buckets (B4), real Test Connection (B10). *Plugs in the dormant engine.*
3. **Triage [CSS/markup]:** sort/filter bar + tag filter (B7), summary preview (B6).
4. **Capture polish [minor logic]:** optional date + quick chips (B5), Notes zoom.
5. **Onboarding + settings [medium]:** rails flow (B9), tabbed settings + global
   model default (B10). *Largest effort; do last, behind the new look.*

Nothing in steps 1–4 reshapes `rvData`/`rvLocal` or touches the Supabase sync path.
Step 5's onboarding changes write the **same** storage keys in the **same** shape.
