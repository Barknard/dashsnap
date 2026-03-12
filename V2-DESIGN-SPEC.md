# DashSnap V2 "Slide-First" Design Specification

**Consolidated from 13 expert reviews — 2026-03-11**
**Status**: Final design spec, ready for implementation

---

## The Core Insight (Universal Consensus)

All 13 experts agree: **the slide-first direction is correct.** The shift from recall (imagining what "SNAP 800x600" looks like) to recognition (seeing the slide preview) is a 5-10x cognitive efficiency gain. But 11 of 13 experts identified implementation risks that must be addressed.

---

## Top 5 Design Decisions (Expert Consensus)

### 1. The mini-preview is DISPLAY-ONLY — not for drag positioning
**Experts 6, 10, 12, 13 agree.**

The 348px-wide thumbnail is too small for precision drag interaction. Instead:
- Mini-preview shows a live, accurate 16:9 slide preview (display only)
- Layout is controlled via **3 preset buttons** (large, prominent) + a collapsible "Fine-tune" panel with numeric inputs
- Keyboard positioning via `Ctrl+Arrow` (0.1" steps)
- The SlideLayoutPreview drag interaction is kept as a **bonus** for mouse users who want it, but is not the primary positioning method

### 2. No modes — one progressive interface
**Experts 3, 4, 7, 10 agree.**

Kill Quick/Builder/Power modes. One interface that grows with context:
- No flow → show "New Report" button + onboarding
- Empty flow → show Record button prominently + one empty slide placeholder
- Flow with steps → show slide strip + contextual controls
- Running → lock to progress view

### 3. Rename "Flow" to "Report" in all user-facing UI
**Experts 5, 7 agree.**

- "Flow" → "Report" (user-facing labels only; code stays `Flow`)
- "Steps" → "Actions"
- "Run Flow" → "Run Report"
- "SNAP" → "Capture" (in labels)

### 4. Minimum 12px font size — no exceptions
**Experts 10, 13 agree.**

- Slide card title: 14px semibold
- Metadata (action count, layout): 12px regular
- Section headers: 13px medium uppercase
- No text below 12px anywhere in the app

### 5. Expand preset layouts from 3 to 6
**Expert 1 (Presentation Consultant) — critical gap.**

| Preset | Description | Use Case |
|--------|-------------|----------|
| **Full Bleed** | Screenshot fills entire slide, no chrome | Maximum visual impact |
| **Standard** | Header + centered screenshot + footer | Default, 70% of slides |
| **Split Panel** | 60% screenshot right, 40% text left | Annotated analysis |
| **Two-Panel** | Two screenshots side by side (48% each) | Before/after, comparison |
| **Triple Panel** | Three screenshots in a row | KPI dashboard comparisons |
| **Appendix** | Smaller title, "APPENDIX" watermark | Backup/reference slides |

---

## Sidebar Layout (380px)

### Structure: Split Panel with Contextual Detail

```
┌──────────────────────────────┐
│ DashSnap          ⚙️  v1.32  │  ← Header (44px)
├──────────────────────────────┤
│ ◀️ ▶️ 🔄 [https://...    ] ⭐ │  ← URL Bar (44px)
├──────────────────────────────┤
│ 📊 Weekly Revenue Report  ▾  │  ← Report Menu (36px)
│     9 actions · 3 slides     │
╞══════════════════════════════╡
│                              │
│ ┌─ SLIDE 1 ────────────────┐│  ← Active slide: expanded
│ │ ┌─────────────────────┐  ││    (356px × 200px preview)
│ │ │ [live 16:9 preview] │  ││
│ │ └─────────────────────┘  ││
│ │ Revenue grew 23% YoY     ││  ← Inline editable title
│ │ [Full][Std][Split] ⚙️     ││  ← Layout presets
│ └──────────────────────────┘│
│                              │
│ ┌─ SLIDE 2 ─────────── 5a ┐│  ← Compact slide cards
│ │ [tiny preview]  Users... ││    (80px tall each)
│ └──────────────────────────┘│
│ ┌─ SLIDE 3 ─────────── 3a ┐│
│ │ [tiny preview]  Costs... ││
│ └──────────────────────────┘│
│                              │
│        [+ Add Slide]         │
│                              │
╞══════════════════════════════╡  ← Draggable divider
│ ACTIONS FOR SLIDE 1          │  ← Contextual detail panel
│  1. 🌐 Navigate → tableau... │
│  2. 🖱️ Click "Revenue" tab  │
│  3. ⏱️ Wait 3s               │
│  4. 📸 Capture region        │
│  ──────────────────────────  │
│  Status: ● 94% reliable     │  ← Confidence score
├──────────────────────────────┤
│ [     ▶️ RUN REPORT     ]    │  ← Primary action (44px)
│ [Validate] [Export PPTX]     │  ← Secondary actions (36px)
└──────────────────────────────┘
```

### Key interactions:
- Click a slide card → it expands to show full preview + presets
- Previous active card collapses to compact view
- Bottom panel shows actions for the selected slide
- Divider is draggable (min top: 200px, min bottom: 150px)

---

## Button Hierarchy (Strict)

### Primary (max 1 visible at a time): 44px height, full width, 10px radius
- **Record** = `ds-accent` (#7C5CFC) with subtle pulsing glow
- **Run Report** = `ds-emerald` (#34D399) with shadow
- **Export** = `ds-cyan` (#22D3EE) with shadow

### Secondary (up to 3): 36px height, auto width, 8px radius, outline variant
- Validate, Load CSV, Browse Template, Test Action

### Tertiary (unlimited): 28px height, ghost/icon-only
- Duplicate, delete, reorder, settings

### Color differentiation:
- Purple = capture/record actions
- Green = execute/run actions
- Cyan = output/export actions
- Red = stop/delete (destructive)
- Amber = warnings/overrides

---

## Slide Card States (Visual Progression)

| State | Border | Icon | Background |
|-------|--------|------|------------|
| **Empty** | 2px dashed `ds-border` | `+` centered | `ds-bg` |
| **Captured** | 1px solid `ds-border` | 📸 camera (10px) | Preview thumbnail |
| **Verified** | 1px solid `ds-emerald/30` | ✓ checkmark (8px) | Preview thumbnail |
| **Stale** (>7 days) | 1px solid `ds-amber/30` | 🕐 clock (8px) | Preview thumbnail |
| **Failed** | 2px solid `ds-red/30` | ❌ error (10px) | Preview with red tint |

---

## Critical Features to Build (Priority Order)

### P0 — Ship with V2
1. **Slide strip with expand/collapse cards** (the core layout)
2. **6 layout presets** with visual thumbnails
3. **Action titles** — placeholder coaching: "State your insight as a sentence"
4. **Confidence score per action** (success rate over last 10 runs)
5. **Validate mode** — fast dry-run checking selectors without capturing
6. **12px minimum font size** enforcement

### P1 — Ship within 2 weeks of V2
7. **Deck Settings panel** — font, accent color, footer template, logo
8. **Capture-to-slide animation** (thumbnail flies from browser to slide card)
9. **Source line auto-population** from page URL/title
10. **Screenshot health check** — load/content/freshness status icons
11. **Alt-text auto-generation** in exported PPTX

### P2 — Fast follow
12. **Smart Wait** — wait for network idle + DOM stable, not fixed seconds
13. **Continuity mode** — first slide's layout becomes template for all
14. **Deck map** (zoom-out minimap of all slides at tiny scale)
15. **Step Healing** — fuzzy match broken selectors by text/position/visual similarity
16. **Flow Health Check** — pre-flight validation before scheduled runs
17. **Compare to Previous** — overlay last run's screenshots for diff detection

### P3 — Future
18. **Narrative Arc templates** (Status Update, Problem-Solution, Quarterly Review)
19. **Slide pinning** for round-trip PPTX preservation
20. **Scheduled runs** via Windows Task Scheduler
21. **One-click re-run** from system tray
22. **ROI Dashboard** in settings (time saved, runs completed)
23. **Capture sound** (mechanical shutter, 120ms, toggleable)
24. **Streak counter** per report (12-week streak badge)
25. **Focus Crop** — highlighted region with context background at reduced opacity
26. **Viewport-aware capture** — resize browser for optimal resolution before snap

---

## Microinteraction Spec

### Capture-to-Slide Animation (800ms)
```
0-100ms:   White border flash on captured region in browser
100-200ms: Thumbnail (32x18px) flies in arc toward sidebar
200-500ms: Thumbnail lands on slide card, card pulses ds-accent/20
500-800ms: Card settles with spring(260, 20), checkmark fades in
```

### Drag on Mini-Preview (bonus, not primary)
```
Hover:     Corner handles 9→12px, border 2→3px, shadow appears (150ms ease-out)
Grab:      Cursor grabbing, shadow elevation, bg ds-accent/25 (100ms)
Drag:      Position updates per frame, snap grid guides at 0.1" near edges
Release:   Snap to final position (200ms ease), flash confirmation (150ms)
```

### Completion Celebration (targeted, not diffused)
```
0-400ms:   Output card slides up from bottom with spring(300, 22)
0-600ms:   Emerald top border animates width 0→100%
0-400ms:   Sparkles icon rotates 180°
0-800ms:   "3 captures in 0:47" types in character-by-character (60ms/char)
```

---

## Expert Killer Features (Ranked by Impact)

| Feature | Expert | Impact | Effort |
|---------|--------|--------|--------|
| Step Healing (auto-fix broken selectors) | RPA Designer | 🔥🔥🔥🔥🔥 | High |
| Deck QC Audit (consistency checker) | Consultant | 🔥🔥🔥🔥 | Medium |
| Flow Health Check (pre-flight validation) | Service Designer | 🔥🔥🔥🔥 | Medium |
| Living Deck (hyperlinks back to live dashboards) | Product Manager | 🔥🔥🔥🔥 | Low |
| Capture-to-slide animation | Game UX | 🔥🔥🔥 | Low |
| Alt-text auto-generation | Accessibility | 🔥🔥🔥 | Low |
| Story Flow preview (slideshow read-through) | Film Editor | 🔥🔥🔥 | Medium |
| Focus Crop (context-preserving zoom) | Data Viz | 🔥🔥🔥 | Medium |
| Snap sound design | Microinteraction | 🔥🔥 | Low |
| Deck streak counter | Game UX | 🔥🔥 | Low |
| Cognitive load meter | Cog Psych | 🔥🔥 | Medium |
| Slide Map minimap | Info Architect | 🔥🔥 | Low |
| Replay Overlay (visible automation) | I/O Psych | 🔥🔥🔥 | Medium |

---

## What NOT to Build (Expert Warnings)

1. **Do NOT gate features behind modes** (Experts 3, 4, 10) — progressive disclosure by context, not user self-classification
2. **Do NOT make mini-preview the primary positioning method** (Experts 6, 13) — it is a display + bonus interaction, not the main control
3. **Do NOT invest in AI-generated content** before nailing the capture pipeline (Expert 5)
4. **Do NOT add slide transitions** (Expert 9) — they are presentation-time features, not authoring features
5. **Do NOT ship CSV batch before single-flow is rock solid** (Expert 2)

---

*This spec consolidates critical opinions from: Presentation Design Consultant, Dashboard Analytics PM, Automation/RPA UX Designer, I/O Psychologist, Business Management Strategist, Microinteraction Designer, Information Architect, Game UX Designer, Film Editor, Cognitive Psychologist, Service Designer, Data Visualization Expert, and Accessibility Expert.*
