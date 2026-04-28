# YouTube Transcript Scraping

How ReVisit pulls the transcript out of a YouTube watch page, and where to look when YouTube changes its DOM (which it does — repeatedly).

## Where it runs

- **File:** `content.js`
- **Entry point:** `getTranscriptFromDOM()` (called from `handleScrapeAndShowOverlay` when the URL is a YouTube watch page).
- **Output:** `{ transcript: "..." }` on success, `{ error: "..." }` otherwise. The caller logs the error and proceeds without a transcript (the video still gets summarized from title + description).

## Flow

1. **Locate the transcript panel container** by trying a list of selectors in priority order (`TRANSCRIPT_CONTAINER_SELECTORS`).
2. **If the panel isn't open**, click `#expand.ytd-text-inline-expander` (the description "...more" button) to reveal the description, then click `button[aria-label="Show transcript"]`. The button is searched for both directly in the document and inside the legacy `ytd-video-description-transcript-section-renderer`.
3. **Wait for segments to render.** The container can appear before its rows do, so we poll up to 8 s (150 ms ticks) for transcript segment elements.
4. **Extract text** by iterating over each segment and reading the inner text element. Both new and legacy element/text selectors are tried; first match wins.
5. **Return** the joined string (or an error describing which step failed).

## Selectors (current)

These are listed top-to-bottom in priority order. The first that matches is used; the rest are fallbacks for older layouts or future changes.

### Container selectors

```
yt-section-list-renderer[data-target-id="PAmodern_transcript_view"]
div.ytSectionListRendererContents
yt-section-list-renderer.ytSectionListRendererHost.style-scope.ytd-engagement-panel-section-list-renderer
ytd-transcript-segment-list-renderer    ← legacy
```

The `data-target-id="PAmodern_transcript_view"` attribute is the most stable anchor we've found — it's tied to the panel's purpose, not its CSS classes.

### Segment + text selectors

| Era | Segment element | Text element |
| --- | --- | --- |
| 2026 (current) | `transcript-segment-view-model` | `[role="text"]` (a `<span class="ytAttributedStringHost ...">`) |
| Legacy | `ytd-transcript-segment-renderer` | `.segment-text` |

Both pairs are tried, and segments are searched **inside the container first, then document-wide** as a safety net in case the container selector turns out to be too narrow.

## Why polling, not a fixed sleep

The transcript panel renders in two stages:

1. The panel container (`yt-section-list-renderer`) appears almost immediately after clicking "Show transcript".
2. The individual `transcript-segment-view-model` rows are streamed in afterwards.

Earlier versions used a 500 ms `setTimeout` between step 1 and reading segments, and that race caused intermittent "No text segments found" errors. The current code polls every 150 ms for up to 8 s and bails with a specific error if nothing ever appears.

## When YouTube breaks this again

Symptoms in the console (run on a watch page, with the extension active):

- `DEBUG: Initial container match: NONE` and no "Show transcript" button found → the panel-discovery path has changed. Inspect the engagement panel and update `TRANSCRIPT_CONTAINER_SELECTORS` and/or the show-transcript button lookup.
- Container matched, but `Segment poll waited 8000ms, match: NONE` → segment element name has changed. Open one transcript row in DevTools, find the new custom element name and the inner text element, and add a new entry at the top of `SEGMENT_SELECTORS` inside `getTranscriptFromDOM`.
- Segments matched but transcript is empty → text selector inside the segment has changed. Update the `text` field for the relevant entry in `SEGMENT_SELECTORS`.

The general rule: **add new selectors to the top of the list, keep old ones below as fallbacks**. We've never benefited from removing a working fallback, and YouTube ships A/B variants — a user on an older client may still hit the legacy DOM.

## Known limitations

- **No transcript = no problem.** If scraping fails, processing falls back to summarizing the title + visible description only. The user still gets a bookmark.
- **Chapter headers**: a chaptered video has `timeline-chapter-view-model` rows alongside transcript segments. Our segment selector only matches `transcript-segment-view-model`, so chapter titles are naturally skipped. If that ever changes, expect "Chapter 1: Intro" to leak into transcripts.
- **Auto-translated transcripts**: YouTube serves these through the same DOM, so they scrape the same way. Language detection / translation happens later, in the LLM summarization step.
