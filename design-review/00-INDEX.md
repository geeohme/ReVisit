# ReVisit — Design Review Package · Start Here

> **UPDATE — Phase 1 (foundation) is built.** Per your direction (all 3 schemes
> selectable, default Paper & Ink; zero-logic-risk scope), the foundation is
> implemented on branch **`ui-foundation-themes`**: a tri-scheme theme system with a
> real **Settings → Appearance** picker (Paper & Ink / Quiet Focus / Confident
> System × light/dark, persisted), the settings panel de-slopped (token-driven,
> emoji→line icons, one accent), onboarding aligned to the brand, and an a11y
> baseline. Verified across all 3 schemes — see `screenshots/foundation/`. The
> next-phase plan is **`04-next-phase-spec.md`** (run it in a new conversation).
> Cloud sync + data shape untouched. Files changed: `styles.css`, `theme.js` (new),
> `manifest.json`, `list-modal.html`, `list-modal.js`, `onboarding.html`.

Below is the original overnight review that led here.

Good morning. While you slept I read the whole codebase, walked the product as a
user, diagnosed the UI/UX, and built three interactive design directions. Nothing
in the production code was changed — everything lives in this `design-review/`
folder.

## The 60‑second summary

The **logic is largely sound** — there's even a complete, correct revisit‑scheduling
engine sitting in `background.js` that the UI never calls. The problem is the
**UI is three eras stacked together** (a flat‑blue "sample" app, a Bootstrap‑colored
settings panel, an inline‑styled onboarding page) and **none of them match the warm,
characterful brand logo**. That mismatch — plus emoji‑as‑icons, three different
blues, and a rainbow of button colors — is what reads as "AI slop."

**The good news for your constraint:** ~70% of the 44 issues I found are *pure
CSS/markup*, and the few that aren't are "wire a button to an endpoint that already
exists." **Nothing requires touching cloud sync or the stored data shape.**

The two genuinely broken interactions both have one‑line‑ish fixes:
- **You can't save a bookmark without a follow‑up date** — the empty date literally
  throws (`content.js:1120`). → make the date optional + quick chips.
- **The "ReVisit" button doesn't revisit** — it just opens the URL, while a working
  `updateBookmarkStatus('ReVisited')` that advances the date sits unused in
  `background.js:1187`. → wire a Revisited/Snooze/Done menu to it.

## What's in the package

| File | What it is |
|---|---|
| **`mockups/index.html`** | **▶ Open this first** — a clickable gallery of all three directions + onboarding, with a 25‑min review guide. |
| `01-walkthrough.md` | First‑person walk through onboarding, settings, capture, and the list — each with an annotated **Mermaid sequence diagram** and severity‑ranked 🟥 UX / 🟦 UI issues. |
| `02-recommendations.md` | Four design lenses → a shared system of fixes (B1–B11) → the **three directions** with full color tokens + type pairings. |
| `03-issues-register.md` | All 44 issues (U1–U26, V1–V17) in one table with fix + logic‑risk — the build backlog. |
| `mockups/direction-a-paper-ink.html` | **★ Recommended.** Warm editorial; reconciles UI with the brand. |
| `mockups/direction-b-quiet-focus.html` | Dark‑first, dense, refined (Linear/Things). |
| `mockups/direction-c-confident-system.html` | Disciplined blue system; smallest leap from today. |
| `mockups/onboarding-a-paper-ink.html` | The simplified 3‑screen onboarding (Direction A). |
| `screenshots/` | PNGs of each mockup (all browser‑verified, light + dark) if you want a glance before opening them live. |

> Every mockup was rendered and clicked through in a real browser — light **and**
> dark, plus the capture/edit/settings overlays — so they work as‑is. The only
> console message is a harmless `favicon.ico` 404.

> The Mermaid diagrams in `01` render automatically on GitHub or in any Markdown
> viewer with Mermaid (VS Code "Markdown Preview Mermaid Support", Obsidian, etc.).

## How to review (~25 min)

1. **Open `mockups/index.html`** in your browser.
2. In each of the three direction mockups: **toggle dark mode** (top‑right) and click
   **"Toggle annotations"** (bottom‑right) — every change is labelled with the issue
   ID it fixes (U13, U18, B3…). Then exercise the interactions:
   - **Click a row** → the redesigned **Edit** overlay (now with an *open‑the‑page*
     link and a Zoom on Notes).
   - **Click the kebab ⋮** on a row → the new **Revisited / Snooze / Done** menu
     (the fix for the dead ReVisit button).
   - **"ReVisit this Page"** → the **capture card** (optional date + quick chips,
     incl. "No reminder").
   - **Gear icon** → **tabbed settings** that finally respect dark mode, with one
     global model default and a *real* Test Connection.
   - **Esc** closes any overlay.
3. Skim `01-walkthrough.md` (the diagnosis) and `02-recommendations.md` Part C
   (the three directions side by side).

## The three directions, in one line each

- **A · Paper & Ink (recommended)** — warm cream paper, ink‑navy, one red‑orange
  accent (from the logo's check), index‑card rows, Fraunces + Newsreader. The only
  option that makes the product *memorable* — and it costs nothing in logic.
- **B · Quiet Focus** — dark‑first, dense, a left "due rail" that turns the list into
  a timeline. Best if the audience is power‑users who live in the list.
- **C · Confident System** — keeps a blue identity (smallest perceptual change from
  today) but disciplined: one blue, warm neutrals, fixed contrast, a characterful
  grotesk. The safe step.

## Decisions I need from you

1. **Which direction** — A, B, C, or a blend (e.g. A's warmth on C's density)?
   *(My recommendation: A for identity; C if you want a smaller first step.)*
2. **Scope of a first pass** — I propose starting with the **zero‑logic‑risk
   foundation** (one token file, kill the hardcoded‑light settings, line icons,
   due chips + summary preview, in‑app dialogs) before the wired actions and the
   onboarding rebuild. The phased sequence is in `02-recommendations.md` Part D.
3. **Any hard constraints** I should respect beyond "don't touch cloud sync"
   (e.g. must keep Inter? must keep the current logo as‑is? minimum Chrome version?).

When you're back, just tell me the direction and I'll turn the recommended foundation
into a real, reviewable branch — proposed first, code second.
