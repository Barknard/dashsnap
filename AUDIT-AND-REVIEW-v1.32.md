# DashSnap v1.32 — Audit, Bug Report & Radical UX Review

**Date**: 2026-03-11
**Scope**: SlideLayoutPreview feature audit + full-app radical UX review
**Status**: Test version (v1.31.0 = last stable)

---

## Part 1: SlideLayoutPreview Audit Results

### Critical Bugs Fixed

| Bug | File | Fix Applied |
|-----|------|-------------|
| `onChange` identity changed on every render, causing listener teardown/reattach on every mousemove during drag | SlideLayoutPreview.tsx | Used `useRef` for onChange to decouple effect lifecycle from prop identity |
| `expandedSnapId` not cleared when step deleted — stale state leak | StepList.tsx:600 | Clear `expandedSnapId` in delete handler |
| `collapsedGroups.delete()` directly mutated React state | StepList.tsx:635 | Use `setCollapsedGroups(prev => ...)` pattern |
| Post-snap rounding could produce widths/heights below 0.5" minimum | SlideLayoutPreview.tsx:107 | Added `Math.max(MIN_SIZE, ...)` after snap() |
| Presets retained crop values from previous custom layout | StepList.tsx:488 | Reset crop to 0 and don't spread `...sl` on preset apply |
| Exact float equality for preset matching failed after snap rounding | SlideLayoutPreview.tsx:138 | Replaced with tolerance-based `near()` function |
| Dead `scale` variable + `getScale` returning hardcoded 24 on unmount | SlideLayoutPreview.tsx:74 | Removed dead var; `getScale` returns `null`, handler guards |
| `mode!` non-null assertion on typed handles array | SlideLayoutPreview.tsx:265 | Created `DragMode` type alias, removed assertion |

### Remaining Issues (Non-Critical, Left For You)

| Severity | Issue | Recommendation |
|----------|-------|----------------|
| MEDIUM | `MacroAction.slideLayout` has no edit UI — macro snap actions can't customize slide placement like standalone SNAP steps can | Add SlideLayoutPreview to macro snap actions in StepEditDialog |
| MEDIUM | Framer Motion `draggable` + HTML5 drag events use `as unknown as React.DragEvent` cast — type safety risk | Consider switching to pure pointer events for step reordering |
| LOW | `onChange` prop is `(field: string, ...)` — stringly typed, loses keyof PptxLayout safety | Type as `(field: keyof PptxLayout, value: PptxLayout[keyof PptxLayout]) => void` |
| LOW | Unused `toPixels` and `toInches` helper functions in SlideLayoutPreview | Remove if not needed for future features |

### Cross-Feature Interference: NONE FOUND

- StepEditDialog: No conflict. Edits `region` (capture area), separate from `slideLayout` (PPT placement)
- RecordingOverlay: No conflict. SlideLayoutPreview has no IPC calls
- Run flow / progress tracking: No conflict. Same Zustand update path
- Drag-and-drop reorder: No conflict. `e.stopPropagation()` on layout handles prevents bubble

---

## Part 2: Radical UX Redesign Proposal

### The Problem With Current DashSnap

The current flow is: **Create Flow → Record Steps → Configure Each Step → Run → Get PPTX**

This is a **tool-centric** design. The user thinks in terms of the tool's abstractions (flows, steps, selectors, regions) rather than their actual goal:

> "I need these 4 dashboard charts on slides for my Monday meeting."

The current UX requires ~15 interactions to go from that intent to a finished deck. The radical redesign targets **3 or fewer**.

### The Radical Approach: "Capture → Slide → Done"

#### Core Concept: **The Slide is the Interface**

Instead of a step list → settings → run → PPTX pipeline, flip the model:

1. **Start with the slide deck** visible in the sidebar
2. **Capture directly onto a slide** — snap a region and it lands on the current slide immediately
3. **See the PPTX as you build it** — live preview, not after-the-fact generation

#### The Three-Screen Flow

**Screen 1: The Deck View (replaces FlowPicker)**
- Show slide thumbnails in a vertical strip (like PowerPoint's slide sorter)
- Each thumbnail is a mini 16:9 preview showing exactly what the slide will look like
- "+" button adds a blank slide
- Drag to reorder slides
- This IS the flow — each slide = a capture target

**Screen 2: The Capture Mode (replaces RecordPanel + Recording)**
- User clicks a slide thumbnail → that slide becomes "active"
- The browser panel shows the dashboard
- User draws a region on the dashboard → screenshot instantly appears on the active slide, auto-positioned using the selected layout preset
- No explicit "Record" button needed for single captures
- For automation (repeat captures weekly), user can still "Record a Flow" which records the navigation + capture sequence

**Screen 3: The Polish Mode (replaces StepEditDialog + Layout Panel)**
- Click any slide thumbnail to expand it
- Drag/resize the screenshot directly on the mini slide (current SlideLayoutPreview, but now as the primary interface, not buried in a panel)
- One-click presets: Full Bleed, Title + Chart, Centered
- Type a slide title directly — it renders in the header zone in real-time
- Click "Export" → instant PPTX

#### What This Eliminates
- Flow creation as a separate step (the deck IS the flow)
- Step list management (slides ARE the steps, visually)
- The "Run → Wait → Get PPTX" delay loop for simple captures
- Layout configuration as a buried panel (it's the main interaction)

#### What This Preserves
- Automation: "Record a flow" still works for repeatable multi-step sequences
- Batch runs: CSV variables still inject into recorded flows
- Per-slide customization: layouts, crop, fit mode all accessible on the slide view

### Design Principles Applied

#### From Consulting Slide Standards (McKinsey/BCG/Bain)
- **Action title per slide**: Auto-suggest or require a title sentence (not just "Chart 1")
- **One message per slide**: Each capture = one chart = one insight = one slide
- **Locked margins**: Title position never shifts between slides — DashSnap enforces this automatically
- **Three-zone anatomy**: Header (title) + Body (screenshot) + Footer (source/date) — the presets encode this

#### From Edward Tufte
- **Maximize data-ink ratio**: Auto-crop browser chrome from screenshots (nav bars, sidebars, URL bars = chartjunk)
- **Show data, not decoration**: Default templates should be minimal — no gradients, shadows, decorative borders
- **Small multiples**: Enable a "2x2 grid" layout preset for placing 4 related charts on one slide

#### From Beautiful.ai / Gamma.app
- **Invisible guardrails**: Presets enforce good design; users can't accidentally create ugly slides
- **Content-aware auto-layout**: When user drops a screenshot, it auto-fits to the "Title + Image" preset. No manual positioning needed for 90% of cases.
- **Continuous feedback**: The slide preview updates in real-time as the user adjusts anything

#### From CleanShot X (Capture UX Gold Standard)
- **Post-capture floating thumbnail**: After each snap, show a mini preview that can be dragged to any slide
- **One-click capture-to-slide**: The entire pipeline (snap → crop → place → layout) in a single interaction
- **Capture history**: Recent captures available as a strip; drag any previous capture onto a new slide

#### From Don Norman's Three Levels
- **Visceral**: The slide deck view should look beautiful — real slide aesthetics, not wireframes
- **Behavioral**: Capture → auto-place → done. Minimum possible steps. The "aha" moment should be: "Wait, it already looks like a real presentation?"
- **Reflective**: Users should feel like presentation experts. The output should be something they're proud to present, not "tool output"

#### From the Kano Model
- **Must-have** (currently working): Reliable capture, consistent PPTX output, repeatable flows
- **Performance** (improve): Speed of capture-to-slide, quality of auto-layout
- **Delight** (new): Auto-crop browser chrome, smart title suggestions, instant slide preview, one-click professional deck

---

## Part 3: Myers-Briggs Personality Feedback

### INTJ — The Strategic Architect
> "The tool's current architecture is sound — Zustand stores, clean IPC separation. But the UX makes me configure things I shouldn't have to. Why am I setting X/Y/W/H in inches? The tool should know the standard consulting layouts and just apply them. I want: Capture → Auto-Layout → Export. Three actions, zero configuration. The SlideLayoutPreview is a step in the right direction but it's still buried inside a step list inside a panel. Make it the primary interface. And the presets should be named after consulting conventions: 'Exhibit Slide,' 'Section Divider,' 'Full-Bleed Visual' — not generic 'Centered 80%.' I care about precision, but I don't want to think about it. The system should be precise for me."

**Key feedback**: Automate layout decisions. Surface presets with domain-specific names. Make the visual preview the primary interface, not an expansion panel.

### ESFP — The Energetic Performer
> "OK so I just want to show my boss some charts and this thing makes me create a 'flow' and add 'steps' and configure 'regions'? I don't even know what half these words mean. I want to click a button, draw a box around my chart, and get a pretty slide. Done! The celebration animation after a run is cute but I had to go through 10 steps to get there. Make the fun part faster. Also, the recording overlay with keyboard shortcuts? I'm never going to remember S for snap and R for region. Just give me big colorful buttons that say 'Take Screenshot' and 'Done.' The dark theme is nice though. Very sleek."

**Key feedback**: Reduce jargon. Fewer steps to the payoff. Replace keyboard shortcuts with visual buttons. Optimize for the 90% case (quick capture → slide).

### ISTJ — The Reliable Inspector
> "I need this to work the same way every time. Monday morning, I open DashSnap, run my flow, get my slides. The automation part is good — I recorded my steps once and now I just hit Run. But the slide layout concerns me. If I set 'Title + Image' on step 3, I need to know it will be EXACTLY the same position every run. The 0.1-inch snap grid is good but I want to see the actual inch values at all times, not just on hover. The preset matching using tolerance is smart but document what the tolerance is. And the 'Reset to global' button — what exactly are the global defaults? Show me. I'd also like a 'Lock Layout' toggle so I don't accidentally change it while scrolling through my steps."

**Key feedback**: Consistency and predictability. Always show exact values. Document defaults. Add a layout lock feature. The automation workflow is the strength — protect it.

### ENFP — The Creative Catalyst
> "What if DashSnap could make my slides TELL A STORY? Right now it just dumps screenshots onto slides. But what if it could auto-detect that I captured a line chart trending up and suggest a title like 'Revenue Growing 23% QoQ'? Or if I capture 4 related charts, it offers to arrange them as a 2x2 comparison layout with a summary title? The tool has the screenshots — it has the data, visually at least. The radical redesign where slides ARE the interface is exactly right. I want to see my deck building itself as I capture. Each snap should feel like adding a brushstroke to a painting. And please let me add annotations — a red circle around the key number, an arrow pointing to the trend. That's where the story lives."

**Key feedback**: Storytelling and narrative. Smart title suggestions. Multi-chart layouts. Annotation tools. Real-time deck building as the creative experience.

---

## Part 4: Prioritized Next Steps

### Immediate (v1.32 scope)
1. **Test the SlideLayoutPreview** in real use — all critical bugs are fixed, exe is built
2. Add `slideLayout` editing for macro snap actions (MEDIUM issue from audit)
3. Remove unused `toPixels`/`toInches` from SlideLayoutPreview

### Short-term (v1.33-1.34)
4. **Auto-crop browser chrome** from screenshots (detect and remove nav bars, URL bar, sidebars)
5. Add a "2x2 Grid" layout preset for multi-chart slides
6. Rename presets to consulting terms: "Exhibit Slide," "Full Visual," "Title + Chart"
7. Add "Lock Layout" toggle to prevent accidental changes
8. Show global defaults explicitly in the layout panel

### Medium-term (v1.35-1.40)
9. **Slide Deck View**: Replace FlowPicker with a visual slide strip showing live previews
10. **One-click capture-to-slide**: Snap region → auto-place on active slide → done
11. Add slide title editing directly in the preview
12. Post-capture floating thumbnail (CleanShot X pattern)
13. Annotation overlay (arrows, circles, callouts)

### Long-term (v2.0 vision)
14. **Deck-first interface**: The slide deck IS the flow — no separate step list
15. Smart title suggestions based on screenshot content
16. AI-powered chart detection and layout optimization
17. Template marketplace with consulting-standard decks
18. Real-time collaborative editing

---

*Generated by DashSnap Audit System — v1.31.0 stable, v1.32.0 test*
