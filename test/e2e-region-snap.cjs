/**
 * E2E test: Navigate to Google Images for 'phone', then take
 * region screenshots of specific elements — search bar, one image, etc.
 */
const { app, BrowserWindow, BrowserView } = require('electron');
const path = require('path');
const fs = require('fs');

const outputDir = path.join(require('os').homedir(), 'DashSnap', 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

app.commandLine.appendSwitch('disable-gpu-cache');

app.whenReady().then(async () => {
  console.log('[SNAP] Starting region screenshot test...');

  const win = new BrowserWindow({
    width: 1400, height: 900, show: true,
    title: 'DashSnap Region Snap Test',
    backgroundColor: '#13111C',
  });

  const view = new BrowserView();
  win.setBrowserView(view);
  view.setBounds({ x: 0, y: 0, width: 1400, height: 900 });
  view.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Navigate to Google
  console.log('[SNAP] Navigating to Google...');
  await view.webContents.loadURL('https://www.google.com');
  await new Promise(r => setTimeout(r, 2000));

  // Search for 'phone'
  console.log('[SNAP] Searching for "phone"...');
  await view.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('input[name="q"], textarea[name="q"]');
      if (input) { input.focus(); input.value = 'phone'; input.dispatchEvent(new Event('input', { bubbles: true })); }
      const form = document.querySelector('form[role="search"], form[action="/search"]');
      if (form) form.submit();
    })()
  `);
  await new Promise(r => setTimeout(r, 3000));

  // Click Images
  console.log('[SNAP] Clicking Images tab...');
  await view.webContents.executeJavaScript(`
    (function() {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent.trim() === 'Images') { link.click(); return; }
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 4000));
  console.log('[SNAP] On:', view.webContents.getURL());

  // ── Region 1: Search bar ──────────────────────────────────────────────
  console.log('[SNAP] Finding search bar bounding box...');
  const searchBarRect = await view.webContents.executeJavaScript(`
    (function() {
      const el = document.querySelector('input[name="q"], textarea[name="q"]');
      if (!el) return null;
      // Go up to the search form container for a nicer capture
      let container = el.closest('form') || el.parentElement;
      const rect = container.getBoundingClientRect();
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    })()
  `);
  console.log('[SNAP] Search bar rect:', searchBarRect);

  if (searchBarRect && searchBarRect.width > 0) {
    const img = await view.webContents.capturePage(searchBarRect);
    const outPath = path.join(outputDir, 'snap_searchbar.png');
    fs.writeFileSync(outPath, img.toPNG());
    const size = (img.toPNG().length / 1024).toFixed(1);
    console.log('[SNAP] ✓ Search bar captured:', outPath, `(${size} KB)`);
  } else {
    console.log('[SNAP] ✗ Could not find search bar');
  }

  // ── Region 2: First image result ──────────────────────────────────────
  console.log('[SNAP] Finding first image result...');
  const imageRect = await view.webContents.executeJavaScript(`
    (function() {
      // Google Images thumbnails
      const imgs = document.querySelectorAll('img[data-src], img[src*="encrypted"]');
      for (const img of imgs) {
        const rect = img.getBoundingClientRect();
        // Must be visible and a reasonable size (not tiny icons)
        if (rect.width > 80 && rect.height > 80 && rect.top > 0 && rect.top < window.innerHeight) {
          return {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            alt: img.alt || '(no alt)',
          };
        }
      }
      // Fallback: any visible image > 80px
      const allImgs = document.querySelectorAll('img');
      for (const img of allImgs) {
        const rect = img.getBoundingClientRect();
        if (rect.width > 80 && rect.height > 80 && rect.top > 100) {
          return {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            alt: img.alt || '(no alt)',
          };
        }
      }
      return null;
    })()
  `);
  console.log('[SNAP] First image rect:', imageRect);

  if (imageRect && imageRect.width > 0) {
    const region = { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height };
    const img = await view.webContents.capturePage(region);
    const outPath = path.join(outputDir, 'snap_single_image.png');
    fs.writeFileSync(outPath, img.toPNG());
    const size = (img.toPNG().length / 1024).toFixed(1);
    console.log('[SNAP] ✓ Single image captured:', outPath, `(${size} KB, alt: "${imageRect.alt}")`);
  } else {
    console.log('[SNAP] ✗ Could not find an image result');
  }

  // ── Region 3: Top row of image results (custom rectangle) ─────────────
  console.log('[SNAP] Capturing top row of images (custom region)...');
  const topRowRect = await view.webContents.executeJavaScript(`
    (function() {
      // Find the first and last visible image in the top row
      const imgs = [...document.querySelectorAll('img')].filter(img => {
        const r = img.getBoundingClientRect();
        return r.width > 60 && r.height > 60 && r.top > 100 && r.top < 500;
      });
      if (imgs.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      const firstRowTop = imgs[0].getBoundingClientRect().top;
      for (const img of imgs) {
        const r = img.getBoundingClientRect();
        // Only same row (within 50px of first image's top)
        if (Math.abs(r.top - firstRowTop) > 50) continue;
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
      }
      return {
        x: Math.round(Math.max(0, minX - 5)),
        y: Math.round(Math.max(0, minY - 5)),
        width: Math.round(maxX - minX + 10),
        height: Math.round(maxY - minY + 10),
      };
    })()
  `);
  console.log('[SNAP] Top row rect:', topRowRect);

  if (topRowRect && topRowRect.width > 0) {
    const img = await view.webContents.capturePage(topRowRect);
    const outPath = path.join(outputDir, 'snap_top_row.png');
    fs.writeFileSync(outPath, img.toPNG());
    const size = (img.toPNG().length / 1024).toFixed(1);
    console.log('[SNAP] ✓ Top row captured:', outPath, `(${size} KB)`);
  } else {
    console.log('[SNAP] ✗ Could not determine top row bounds');
  }

  // ── Build PPTX with region screenshots ────────────────────────────────
  console.log('\n[SNAP] Building PowerPoint from region screenshots...');
  const PptxGenJS = require('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const snapFiles = [
    { name: 'Google Search Bar', file: 'snap_searchbar.png' },
    { name: 'Single Phone Image', file: 'snap_single_image.png' },
    { name: 'Top Row of Results', file: 'snap_top_row.png' },
  ];

  for (const snap of snapFiles) {
    const filePath = path.join(outputDir, snap.file);
    if (!fs.existsSync(filePath)) continue;

    const slide = pptx.addSlide();
    // Header
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.6, fill: { color: '13111C' } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.58, w: '100%', h: 0.02, fill: { color: '7C5CFC' } });
    slide.addText(snap.name, { x: 0.4, y: 0.05, w: 8, h: 0.5, fontSize: 16, fontFace: 'Segoe UI', color: 'EEEDF5', bold: true });
    // Image
    const data = fs.readFileSync(filePath).toString('base64');
    slide.addImage({
      data: 'image/png;base64,' + data,
      x: 0.5, y: 1.0, w: 12.3, h: 5.8,
      sizing: { type: 'contain', w: 12.3, h: 5.8 },
    });
    // Footer
    const ts = new Date().toLocaleString();
    slide.addText('DashSnap Region Capture — ' + ts, { x: 0.4, y: 7.1, w: 10, h: 0.3, fontSize: 8, fontFace: 'Segoe UI', color: '716D87' });
  }

  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const pptxPath = path.join(outputDir, `DashSnap_RegionSnap_${now}.pptx`);
  await pptx.writeFile({ fileName: pptxPath });
  console.log('[SNAP] ✓ PowerPoint saved:', pptxPath);

  // ── Results ──────────────────────────────────────────────────
  console.log('\n[SNAP] ════════════════════════════════════════');
  console.log('[SNAP] OUTPUT FILES:');
  console.log('[SNAP] ════════════════════════════════════════');
  const files = fs.readdirSync(outputDir).filter(f => f.startsWith('snap_') || f.includes('RegionSnap'));
  for (const f of files) {
    const stat = fs.statSync(path.join(outputDir, f));
    console.log(`  ${f} — ${(stat.size / 1024).toFixed(1)} KB`);
  }

  await new Promise(r => setTimeout(r, 2000));
  app.quit();
});
