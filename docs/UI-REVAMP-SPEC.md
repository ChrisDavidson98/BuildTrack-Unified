# BuildTrack Unified — UI Revamp Spec ("Control Room")

**Date:** 2026-09-28
**Repo:** `chrisdavidson98/BuildTrack-Unified` (single `index.html` + `Code.gs` + `Code-BuildTrack.gs`)
**Goal:** Give BuildTrack one consistent look so Scope Deviation stops feeling like a separate app, and make the app open fast. This is a restyle and restructure of the frontend. **No new analytics or features** beyond what is listed here.
**Visual reference:** Design canvas "BuildTrack UI Directions", direction **B · Control Room** (artboards `B-Home` and `B-House`). Chris approved B as drawn: dark theme, tabs at the bottom. The tokens below are the source of truth, because Claude Code can't open the canvas.

Read `CLAUDE.md` in the repo first. Its architecture, security and working-style rules all still apply. In particular, **ask, don't guess**. The open questions at the end are there to be asked.

---

## 1. Decisions already locked (don't reopen)

| Decision | Choice |
|---|---|
| Look | Direction B "Control Room": dark, thin-bordered cards, one amber accent for "needs attention" |
| Theme | Dark only for now; no light mode in this pass |
| Navigation | Bottom tab bar, 5 tabs: **Today · Houses · Scope · Punch · Bonuses** |
| Closing / Archive screens | Removed as separate screens. They become **filter chips on the Houses tab**: `Active · Closing · Archived` |
| Scope placement | Scope is a **tab on each house page** (Milestones · Scope · Punch), in the same visual language. The Scope bottom tab is the cross-house list of scope jobs |
| PunchTrack | **Not merged in this pass.** It gets the same design tokens later as a standalone app, and is merged in a later pass. See §6 for what the Punch tab does now |
| Backends | Unchanged in shape. Still two separate Apps Script backends, linked only by address. One small **additive** endpoint is allowed (§5.3) |
| Output of this session | Chris hands this spec to Claude Code, which builds it on a branch for his review |

---

## 2. Why this revamp (diagnosis from the current code)

1. **Three unrelated style systems in one file.**
   - Milestones/Home: dark, DM Mono + Barlow Condensed, slate `#5c7a99` accent (object `S`, ~line 599).
   - Scope Deviation: its own `styles` object (~line 1635), system sans-serif, orange `#B85C1F` eyebrows, different spacing and radii.
   - Print output: a third, light style.
   - Every color and font is typed inline per component, so nothing keeps them in sync.
2. **Slow first paint.**
   - `@babel/standalone` (~3 MB) is downloaded from unpkg and compiles ~93 KB of JSX in the phone's browser on every load.
   - `Shell` then waits on the BuildTrack Apps Script fetch (often 1–3 s cold) before rendering anything. The `localStorage` copy is used only when that fetch fails.

---

## 3. Design tokens (the single source of truth)

Define these once as CSS custom properties on `:root` in a `<style>` block (or a `styles.css`). Every component uses them. **No hex values inline in components.**

```css
:root {
  /* surfaces */
  --bg:            #0b0c0e;   /* page */
  --surface:       #121419;   /* card rows */
  --border:        #1f2329;   /* all hairlines and card borders */
  --border-strong: #2a2f37;   /* secondary buttons, inputs */

  /* text */
  --text:   #eceef1;
  --text-2: #b3bac5;          /* section labels, logo */
  --text-3: #8b93a1;          /* secondary lines, inactive tabs */
  --text-4: #6b7382;          /* meta, captions, done items */
  --text-5: #3a404a;          /* em-dash placeholders */

  /* meaning (use sparingly) */
  --attn:        #f5b544;     /* needs attention: unsent, past due, closing soon, no clean */
  --attn-wash:   rgba(245,181,68,0.12);
  --attn-border: rgba(245,181,68,0.35);
  --done:        #5fbf8a;     /* completed checkbox fill only */
  --danger:      #f87171;     /* destructive buttons only */

  /* primary button */
  --primary-bg: #eceef1;
  --primary-fg: #0b0c0e;

  /* type */
  --font-display: "Barlow Condensed", sans-serif;  /* 700: page titles, addresses in headers */
  --font-body:    "Geist", -apple-system, sans-serif; /* 400/500/600: body, row titles, buttons */
  --font-mono:    "DM Mono", ui-monospace, monospace;  /* all numbers, dates, meta lines, tab labels */

  /* shape */
  --radius-card: 12px;
  --radius-tile: 10px;
  --radius-btn:  10px;
  --radius-chk:  6px;
  --tap: 44px;         /* minimum tap target */
  --tap-primary: 52px; /* bottom action buttons */
  --gutter: 16px;
}
```

Google Fonts link: `Barlow+Condensed:wght@600;700`, `DM+Mono:wght@400;500`, `Geist:wght@400;500;600`, all with `display=swap`.

### Type scale
| Use | Font | Size | Weight | Color |
|---|---|---|---|---|
| Page title ("7 active homes") | display | 34 | 700 | text |
| House address (house header) | display | 32 | 700 | text |
| Big countdown ("3d") | mono | 26 | 400 | attn when ≤7d, else text |
| Row title (address / item) | body | 14–15 | 500 | text |
| Row meta line | mono | 11 | 400 | text-3, or attn when flagged |
| Section label ("Electrical", "Houses") | body | 12–13 | 500 | text-2 / text-4 |
| Column hint ("MLS · SCOPE · PUNCH") | mono | 10 | 400, 0.08em tracking | text-4 |
| Tab bar label | mono | 10 | 400, 0.06em tracking, UPPERCASE | text active / text-4 inactive |
| Logo "BUILDTRACK" | mono | 13 | 400, 0.1em tracking | text-2 |

### Components (as drawn in B)
- **Header (all screens):** 52px tall, 1px `--border` bottom.
  - Home: a logo mark (18px rounded square in `--text` with an 8px `--bg` square inside) plus "BUILDTRACK", and a search icon button (44×44) on the right.
  - House page: "‹ Today" back link on the left (or "‹ Houses", matching where the user came from), subdivision name in mono 11 `--text-4` on the right.
- **Bottom tab bar:** 64px, 1px top border, 5 equal columns. Each column is an 18px stroke icon above an UPPERCASE mono label. Active tab = `--text`; inactive = `--text-4`. Pad for the iOS home indicator (`env(safe-area-inset-bottom)`). **Hidden** on house detail, add/edit modals, and anywhere with a bottom action bar.
- **KPI tiles:** a 3-column grid with an 8px gap. Each tile has a 1px border, radius 10, padding 12, and three lines: label (body 12, `--text-3`), value (mono 24), sub-line (mono 11, `--attn` when it signals a problem, else `--text-3`).
- **Grouped list card:** a 1px border, radius 12, `overflow:hidden`. Rows have a `--surface` background, 12/14 padding, min-height 60–64, and a 1px `--border` between rows. No shadows anywhere.
- **Progress ring:** a 26×26 SVG with r=10 and stroke 3. The track is `--border`; the arc is `--text`, or `--attn` if that tool has something needing attention. Round linecap, starting at 12 o'clock. **If the house has no job in that tool, render an em-dash in `--text-5` instead of a ring** (this rule is from CLAUDE.md).
- **Underline tabs (house page):** Milestones / Scope / Punch. Body 14. The active tab has a 2px `--text` underline and weight 500; inactive tabs are `--text-3`. Each label is followed by a mono 11 count: `7/9` for milestones, open count for scope and punch. The count is `--attn` if anything in that tab needs attention.
- **Status chips (summary row):** pill-shaped (radius 999), mono 11, padding 6/10.
  - Attention chip: `--attn-wash` fill, `--attn-border` border, `--attn` text.
  - Neutral chips: 1px `--border`, `--text-3` text.
- **Scope item checkbox (20×20, radius 6):**
  - *Not sent*: 1.5px **dashed** `--attn` border, and the card around that category gets `--attn-border`.
  - *Sent*: 1.5px solid `--text-3` border with an 8px `--text-3` square inside.
  - *Done*: solid `--done` fill with a `--bg` check. The title is struck through in `--text-4`.
  - This maps to the existing `itemStatus()` logic (`not sent` / `sent` / `done`). **Do not change the status logic**, only how it looks.
- **Buttons:**
  - Primary: `--primary-bg`/`--primary-fg`, radius 10, body 14 weight 600, min-height 52.
  - Secondary: transparent with a 1px `--border-strong` border.
  - Destructive: transparent with a `--danger` border and text.
  - Replace the current purple archive button style (`#7c3aed` / `#a78bfa`) with Secondary; the archive confirm uses Destructive.
- **Inputs:** `--bg` fill, 1px `--border-strong`, radius 8, body 14, min-height 44, `color-scheme: dark`.
- **Icons:** inline stroke SVGs (stroke-width 2, `currentColor`). **No emoji in the UI.** The current `📅 iPhone Cal` button becomes a calendar stroke icon plus "Add to calendar".

---

## 4. Screens

### 4.1 Today (default tab)
Top to bottom:
1. **Date** (mono 11, `--text-3`, e.g. "Mon, Sep 28"), then the **title** "N active homes".
2. **KPI tiles** (3):
   - **Scope open**: total open scope items across all houses (not sent + sent), with sub-line "N unsent" in attn if >0.
   - **Punch open**: see §6 (for now: "—" plus sub-line "Open PunchTrack").
   - **Closing ≤14d**: count of active houses with a closing date within 14 days. Sub-line is the weekday of the soonest one ("next Thu").
3. **Houses card:** the column hint "MLS · SCOPE · PUNCH" on the right. One row per active house:
   - Address (body 15/500).
   - Meta line (mono 11), which is the **single most urgent fact** for that house, chosen by the priority order in Q3. It is attn-colored when it is a problem, and falls back to "Closes in Nd · on track".
   - Three rings: milestones % (done/9), scope % (done ÷ total items), punch (em-dash for now).
   - Tapping a row opens the house page.
4. Sort: houses needing attention first, then by closing date ascending, with no-closing-date last. (Confirm in Q2.)

### 4.2 Houses tab
- Filter chips at the top: **Active** (default) · **Closing** · **Archived**.
  - *Active* = the current Milestones dashboard list, restyled as grouped-list rows with rings.
  - *Closing* = today's `Closing` screen content (houses sorted by closing date, with countdown).
  - *Archived* = today's `Archive` screen, with restore/delete actions styled per §3.
- Keep the existing sort select (`closing`, `address`, …), restyled as a small secondary control.
- "+ Add house" is a secondary button in the header area. It opens the existing `AddModal`, restyled.

### 4.3 House page (from Today or Houses)
- The header back link returns to the tab the user came from.
- Title block: the address in display 32 on the left; the closing countdown on the right (mono 26, attn if ≤7d) with "to close" under it.
- Underline tabs: **Milestones · Scope · Punch**.
  - **Milestones tab:** today's `Detail` content (all 9 milestones, date inputs, walkthrough time plus calendar button, notes, bonuses, archive/delete), restyled into grouped-list rows. Keep every existing field and behavior.
  - **Scope tab:** the matching scope job for this address. It shows:
    - the status chip row (N not sent · N sent · N done);
    - items grouped by category, each category in its own grouped-list card;
    - item title and "comm method · date" meta line;
    - the checkbox states from §3;
    - a bottom action bar with **Add item** (secondary) and **Email trades** (primary).

    All existing Scope actions (mark communicated per method, mark out, edit, delete, manual add, print/export, email) must still be reachable. Edit/delete move to a row tap that opens an item sheet (see Q5).
    If there is **no scope job** for this address, show an empty state with a "Start scope log" button that calls the existing `createJob`.
  - **Punch tab:** see §6.
- The bottom tab bar is hidden on this screen. The bottom action bar replaces it on the Scope tab.

### 4.4 Scope tab (bottom bar)
- The cross-house list of scope jobs: today's `JobListScreen`, restyled.
- Each row shows the address, a meta line ("N not sent · N sent" or "All done"), and the scope ring.
- Tapping a row opens **the house page on its Scope tab** if a BuildTrack house matches the address. Otherwise it opens a standalone scope view with the same layout minus the Milestones tab.
- "New job address" input plus the create button, restyled.

### 4.5 Bonuses tab
- Today's `Bonuses` screen restyled: grouped list, one row per house, four bonus toggles (R/I, CO, CLOSE, BSMT).
- Toggles use the tokens: on = `--text` fill with `--bg` text; off = 1px `--border-strong`; not eligible = `--text-5` and disabled.

### 4.6 Print / export
- Printed and exported Scope reports keep a **light, print-friendly** style. That's correct for paper and for CoConstruct uploads.
- Tidy it to use the same font family (Geist and DM Mono) so it reads as the same product.
- **Do not change the report content or the `.md` / text export format.**

---

## 5. Performance and data loading

### 5.1 Remove in-browser Babel
- Stop loading `@babel/standalone` and stop using `<script type="text/babel">`. Pick one approach and **ask Chris before choosing** (Q1):
  - **(a) Precompiled build:** a tiny build step (e.g. `esbuild`) turns the JSX into one plain `.js` file committed to the repo. React stays. GitHub Pages serves the compiled file.
  - **(b) No build step:** rewrite to `React.createElement` via `htm` (tagged templates, ~1 KB, no compile). Same React, no tooling.
- Also move React/ReactDOM from unpkg to **cdn.jsdelivr.net** (pinned 18.3.1), or vendor them into the repo.

### 5.2 Show saved data instantly (stale-while-revalidate)
- On load, render immediately from the `localStorage` copy: houses in `bt`, plus a new cached scope-summary key.
- Then fetch from both backends **in parallel** (`Promise.all`, never one after the other) and update the screen when they return.
- Show a small, unobtrusive sync indicator in the header: a dot or "Updated 10:02". **Remove the full-screen "LOADING…" state** except on the very first run, when there is no cache.
- **Keep the 2026-08-18 fix:** a response with `error` must throw and must **never** overwrite the local cache or the sheet. Stale-while-revalidate must not bring back the "silently empty" bug described in CLAUDE.md.

### 5.3 One additive Scope endpoint
- Today's rings and counts need per-job item status. `listJobs` currently returns only `slug`, `address`, `createdAt`, and calling `getJob` once per house would be slow.
- Add a read action `listJobSummaries` to `Code.gs`. It returns `[{slug, address, notSent, sent, done, total, oldestUnsentDate, oldestSentNoReplyDate}]` and is computed server-side in a single read of the Items sheet.
  - Same `checkToken()` guard and read rate-limit bucket as `listJobs`. No AI calls.
  - Additive only. **Don't change `listJobs` or any existing action.**
  - Chris must redeploy the Scope Apps Script after this. Say so clearly in the PR and at the end of the session.

### 5.4 Address matching between tools
- A house and a scope job match when `slugify(house.address) === job.slug`, using the existing `slugify()`.
- If a house has no match, its scope ring shows an em-dash.
- Don't auto-create scope jobs; that rule is from CLAUDE.md.

---

## 6. Punch tab (this pass)
- PunchTrack is not merged yet. The house page's **Punch** tab and the bottom **Punch** tab show a simple panel with an "Open in PunchTrack ↗" button that links to the PunchTrack GitHub Pages URL.
- Pass a house deep link only if PunchTrack already supports one; check its repo, don't add one here.
- Punch rings and counts render as em-dashes until the merge pass.
- **Don't call the PunchTrack backend from BuildTrack in this pass.**

---

## 7. Code structure rules
- One token block (§3). Replace the style objects `S`, `styles`, and `SHELL` with shared component-level classes or one shared style object that reads the CSS variables.
- Build the shared primitives once and use them on every screen: `Header`, `TabBar`, `KpiTile`, `ListCard` / `ListRow`, `Ring`, `UnderlineTabs`, `Chip`, `Checkbox`, `Button`, `Input`, `Sheet`.
- Keep the two backends' URLs and tokens separate, exactly as now. **Don't reuse the Scope token for BuildTrack or the other way round.**
- Keep `escapeHtml()` on rendered user text in the Scope half.
- Keep the deep-link params `?house=` and `?scope=`, now routed to the new house page and its tabs.
- Mobile first at a 390px width, no horizontal scroll. Every tap target is at least 44px.

---

## 8. Acceptance checklist
- [ ] Moving between Today → house → Scope tab → Bonuses shows no change in fonts, colors, radii or spacing.
- [ ] No hex colors inside components. All colors come from the §3 variables.
- [ ] Babel standalone is gone. Cold load on a phone with cached data shows content in under 1 s, with the sync dot updating afterwards.
- [ ] A bad token or backend error never wipes the cache or the sheet. Test this by temporarily breaking the token locally.
- [ ] Every existing action still works. Milestones: set/clear dates, walkthrough time, calendar file, notes, bonuses, archive, restore, delete, add house. Scope: create job, add item (manual), edit, delete, communicated per method, mark out, email trades, print/export.
- [ ] Closing and Archive are reachable only through the Houses filter chips, with the same data as before.
- [ ] No emoji left in the UI.
- [ ] `listJobSummaries` is deployed and checks the token and rate limit. The PR notes that the Scope Apps Script must be redeployed.
- [ ] Update CLAUDE.md with a short "Design system" section that points to the token block.

---

## 9. Open questions — Claude Code must ask Chris these before building (don't guess)

1. **Build approach (§5.1):** (a) an esbuild precompile step committed to the repo, or (b) no build step using `htm`? Explain the trade-off in plain terms before he picks.
2. **Today sort order:** attention-first then closing date (as proposed), or strictly by closing date?
3. **"Most urgent fact" priority for the Today meta line:** proposed order is
   1. closing ≤7d with no final clean
   2. scope item not sent
   3. scope item sent with no mark-out for more than N days (**what is N?**)
   4. walkthrough not set within 14d of closing
   5. "on track"

   Confirm the order and the thresholds.
4. **Attention threshold for the countdown:** amber at ≤7 days, as proposed? Anything else that should turn a house amber?
5. **Scope item editing:** a row tap opens a bottom sheet with communicated-by (email / text / CoConstruct plus date), mark out, edit text, delete. Is that right, or does he want swipe actions or the current inline buttons?
6. **"Email trades" button:** keep the current behavior exactly (confirm what that is from the code and describe it to him), or change it?
7. **Houses with no closing date:** where do they sort, and what does the countdown area show? Proposed: "—".
8. **Ranch Villas buildings:** the mockup showed "Ranch Villas · Bldg 4". How are those houses entered today (address, lot number, or subdivision field), and how should the row title read?
9. **Search icon on Today:** search by address only, or also by scope item text?

---

## 10. Answers from Chris (2026-09-28) — these override anything above

| # | Decision |
|---|---|
| Q1 | **htm, no build step.** |
| Q2 | Today sorts **strictly by closing date**; no-closing-date houses last. |
| Q3 | Meta-line priority: **1)** closing ≤**14**d and no Final Clean date entered → **2)** walkthrough not set within 14d of closing → **3)** a scope item not sent → **4)** a scope item sent but not marked out after **7 days** → **5)** "on track". |
| Q4 | Closing countdown is amber **only when one of the Q3 rules (1–4) is flagged** — not by days alone. |
| Q5 | Row tap opens a **bottom sheet** (communicated-by toggles, mark out, edit, delete). **Add "Call" as a fourth comm method** (explicit exception to "no new features"; needs Code.gs + Items sheet columns + AI prompt update, and a redeploy). |
| Q6 | "Email trades" **does not exist** in the current code (only Export, Copy Summary, and AI dictation). Primary bottom button = **Dictate** (existing intake/follow-up); Export and Copy Summary move to a "…" menu. A real trade-email drafter is deferred to a later pass. |
| Q7 | No closing date → countdown shows "—". |
| Q8 | Ranch Villas units: **address as the title, as-is**. No building field. |
| Q9 | Search: **address only**. |
| Extra A | Marked out but never communicated **stays "sent"**. `itemStatus()` unchanged. |
| Extra B | **Keep 5 bottom tabs** (Punch = link-out panel for now). |
| Plan | Build in **three reviewable steps**: (1) speed — Babel out, instant load; (2) design tokens + restyle + bottom tabs; (3) Today screen, rings, `listJobSummaries`, house Scope tab, Call. |

### Corrections to the spec found while reading the code
- **§5.4 matching:** job slugs are `slugify(address) + "-" + 4 random chars`, so `slugify(house.address) === job.slug` never matches. Match on `slugify(house.address) === slugify(job.address)` instead.
- **§7 deep links:** there are no `?house=` / `?scope=` params in the current code, so there's nothing to preserve. Not added in this pass.
- **§3 status names:** `itemStatus()` returns `pending` / `sent` / `done` (the spec's "not sent" = `pending`).
- **Q3 "final clean":** `finalClean` is a scheduled date, not a completed flag — rule 1 means "no clean date entered".
