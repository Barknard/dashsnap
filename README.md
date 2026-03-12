# DashSnap

**Point-and-click dashboard screenshot automation for PowerPoint.**

DashSnap was built to eliminate the tedious, repetitive work of manually screenshotting dashboards, cropping images, and pasting them into slide decks. If you've ever spent your Monday morning clicking through the same 15 dashboards, snipping each chart, and dragging them onto slides — DashSnap does all of that for you in one click.

---

## The Problem

Every reporting cycle, analysts and managers do the same thing:

1. Open a dozen dashboards
2. Screenshot each one (or worse, snip specific regions)
3. Open PowerPoint
4. Paste, resize, position, repeat
5. Do it all again next week

It's boring. It's error-prone. It eats hours that should go toward actual analysis.

## The Solution

DashSnap lets you **record** your dashboard workflow once, then **replay** it whenever you need fresh screenshots — automatically assembled into a polished PowerPoint deck.

---

## How It Works

### 1. Record

Point and click through your dashboards like you normally would. DashSnap watches and records each action:

- **Click** elements (buttons, tabs, filters)
- **Type** into search boxes and inputs
- **Select** dropdown options
- **Scroll** to specific sections
- **Hover** to trigger tooltips or menus
- **Snap** screenshot regions you care about
- **Filter** multi-option filter panels
- **Navigate** to different URLs
- **Macro** sequences of complex interactions

### 2. Replay

Hit "Run Report" and DashSnap replays your recorded steps against the live dashboard, capturing fresh screenshots at each snap point. It waits for pages to load, retries selectors that haven't rendered yet, and falls back to coordinates if elements move.

### 3. Export

Screenshots are automatically assembled into a PowerPoint file using your layout preferences — or your own `.pptx` template. Headers, footers, positioning, cropping, and fit modes are all configurable per slide.

---

## Features

| Feature | Description |
|---|---|
| **Visual Recorder** | Record clicks, types, scrolls, hovers, and snaps by interacting with your dashboard |
| **12 Step Types** | Click, Wait, Snap, Navigate, Scroll, Hover, Select, Type, Scroll Element, Search Select, Filter, Macro |
| **Region Snapping** | Drag to select exactly the part of the page you want — no full-page screenshots you have to crop later |
| **Template Support** | Use your own branded `.pptx` template with per-slide layout control |
| **Batch Mode** | Load a CSV and run the same flow for each row — great for per-client or per-region reports |
| **Variables** | Use `{{variable}}` placeholders in steps, replaced at runtime or from CSV batch data |
| **Smart Selectors** | Multiple selector strategies (CSS, ARIA, text, data attributes) with XY fallback |
| **Live Previews** | See slide thumbnails update in real-time as screenshots are captured |
| **Persistent Sessions** | SSO cookies and auth tokens persist between launches — log in once |
| **DPAPI Encryption** | Optionally encrypt config files with Windows Data Protection API |
| **Audit Logging** | JSONL audit trail of all flow runs, exports, and builds |
| **Auto-Purge** | Automatically clean up old screenshots after a configurable number of days |
| **Portable Mode** | Run from a USB drive or shared folder — no install required |

---

## Getting Started

### Download

Grab the latest release from the [Releases page](https://github.com/Barknard/dashsnap/releases):

- **DashSnap Setup** — Standard Windows installer
- **DashSnap Portable** — Single `.exe`, no installation needed

### First Run

1. Launch DashSnap
2. Enter a dashboard URL in the address bar
3. Log into your dashboard (credentials are saved in the browser profile)
4. Click **New Report** to create a flow
5. Use the recording buttons to capture your workflow
6. Hit **Run Report** to replay and generate screenshots
7. Click **Export PPTX** to build your slide deck

Data is stored locally in `Desktop/DashSnap_Data/` — nothing is sent to the internet.

---

## Enterprise

DashSnap includes features for managed deployments:

- **Disable Auto-Update** — Prevent update checks for locked-down environments
- **Config Encryption** — Encrypt settings and flow definitions with Windows DPAPI
- **Code Signing** — Certificate signing support via `build-resources/sign.js`
- **Audit Log** — Every flow run, export, and settings change is logged to `audit.log`
- **Output Retention** — Auto-purge screenshots older than N days (default: 5)

---

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (hot reload)
npm run dev

# Build for production
npm run build

# Package Windows exe
npm run package
```

### Tech Stack

- **Electron 33** — Desktop shell with BrowserView for dashboard rendering
- **React 19** — Sidebar UI with Zustand state management
- **TypeScript** — Full type safety across main and renderer processes
- **Tailwind CSS 4** — Utility-first styling
- **pptxgenjs** — PowerPoint generation
- **Radix UI** — Accessible component primitives
- **Vite 7** — Build tooling

---

## Privacy

DashSnap runs entirely on your local machine. No telemetry, no analytics, no cloud services. Screenshots and PowerPoint files are saved to your local output folder. The only network requests are to your dashboards and (optionally) GitHub for update checks.

---

## License

[MIT](LICENSE) — free for personal and commercial use.
