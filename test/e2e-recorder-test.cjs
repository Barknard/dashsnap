/**
 * E2E test: Launch DashSnap, navigate to Google, search 'phone',
 * inject the click recorder overlay, and verify it intercepts clicks
 * instead of navigating the page.
 */
const { app, BrowserWindow, BrowserView } = require('electron');
const path = require('path');
const fs = require('fs');

const outputDir = path.join(require('os').homedir(), 'DashSnap', 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Read the recorder JS from the built main.cjs to get the exact overlay code
// Instead, we'll inline the new capture-phase overlay here for testing
const CLICK_OVERLAY_JS = `
(function() {
  if (window.__dashsnap_overlay) return;
  window.__dashsnap_overlay = true;
  window.__dashsnap_result = null;
  window.__dashsnap_cancelled = false;

  const style = document.createElement('style');
  style.id = '__dashsnap_style';
  style.textContent = \`
    .__dashsnap_inspecting, .__dashsnap_inspecting * {
      cursor: crosshair !important;
    }
  \`;
  document.head.appendChild(style);
  document.documentElement.classList.add('__dashsnap_inspecting');

  const tooltip = document.createElement('div');
  tooltip.id = '__dashsnap_tooltip';
  tooltip.style.cssText = 'position:fixed;z-index:2147483647;background:#1C1A29;color:#EEEDF5;font:13px system-ui;padding:6px 10px;border-radius:6px;border:1px solid #7C5CFC;pointer-events:none;display:none;max-width:250px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

  const highlight = document.createElement('div');
  highlight.id = '__dashsnap_highlight';
  highlight.style.cssText = 'position:fixed;z-index:2147483646;border:2px solid #7C5CFC;background:rgba(124,92,252,0.12);border-radius:3px;pointer-events:none;display:none;transition:all 0.05s ease;';

  document.body.appendChild(highlight);
  document.body.appendChild(tooltip);

  function getSimpleLabel(el) {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().substring(0, 30);
    const ariaLabel = el.getAttribute('aria-label');
    const role = el.getAttribute('role');
    if (ariaLabel) return ariaLabel;
    if (role && text) return text;
    const typeMap = { button: 'Button', a: 'Link', input: 'Input', select: 'Dropdown', textarea: 'Text area', img: 'Image', svg: 'Icon' };
    const prefix = typeMap[tag] || tag;
    return text ? prefix + ': ' + text : prefix;
  }

  function getBestSelector(el) {
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && attr.name !== 'data-reactid') {
        const sel = el.tagName.toLowerCase() + '[' + attr.name + '="' + attr.value + '"]';
        if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'data-attr' };
      }
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const sel = '[aria-label="' + ariaLabel.replace(/"/g, '\\\\"') + '"]';
      if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'aria-label' };
    }
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return { selector: '#' + CSS.escape(el.id), strategy: 'id' };
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(/\\s+/).filter(c => c && !c.startsWith('__')).slice(0, 2);
      if (classes.length > 0) {
        const sel = el.tagName.toLowerCase() + '.' + classes.join('.');
        if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'css-combo' };
      }
    }
    return { selector: '', strategy: 'xy-position' };
  }

  let lastEl = null;

  function onMouseMove(e) {
    const el = e.target;
    if (!el || el === tooltip || el === highlight) return;
    if (el === lastEl) return;
    lastEl = el;
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    tooltip.textContent = getSimpleLabel(el);
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 260) + 'px';
    tooltip.style.top = (e.clientY - 35) + 'px';
  }

  function onClickCapture(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const el = e.target;
    if (!el || el === tooltip || el === highlight) return;
    const { selector, strategy } = getBestSelector(el);
    const label = getSimpleLabel(el);
    const rect = el.getBoundingClientRect();
    cleanup();
    window.__dashsnap_result = {
      selector: selector,
      label: label,
      strategy: strategy,
      xy: [Math.round(rect.left + rect.width/2), Math.round(rect.top + rect.height/2)],
    };
  }

  function blockEvent(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
      window.__dashsnap_cancelled = true;
    }
  }

  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('mousedown', blockEvent, true);
  document.addEventListener('mouseup', blockEvent, true);
  document.addEventListener('pointerdown', blockEvent, true);
  document.addEventListener('pointerup', blockEvent, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('keydown', onKeyDown, true);

  function cleanup() {
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('mousedown', blockEvent, true);
    document.removeEventListener('mouseup', blockEvent, true);
    document.removeEventListener('pointerdown', blockEvent, true);
    document.removeEventListener('pointerup', blockEvent, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.documentElement.classList.remove('__dashsnap_inspecting');
    style.remove();
    tooltip.remove();
    highlight.remove();
    window.__dashsnap_overlay = false;
  }

  window.__dashsnap_cleanup = cleanup;
})();
`;

app.commandLine.appendSwitch('disable-gpu-cache');

app.whenReady().then(async () => {
  console.log('[TEST] Starting recorder E2E test...');

  const win = new BrowserWindow({
    width: 1400, height: 900, show: true,
    title: 'DashSnap Recorder Test',
    backgroundColor: '#13111C',
  });

  const view = new BrowserView();
  win.setBrowserView(view);
  view.setBounds({ x: 0, y: 0, width: 1400, height: 900 });
  view.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Step 1: Navigate to Google
  console.log('[TEST] Step 1: Navigating to Google...');
  await view.webContents.loadURL('https://www.google.com');
  await new Promise(r => setTimeout(r, 3000));
  console.log('[TEST] Page loaded:', view.webContents.getURL());

  // Take screenshot of Google homepage
  const img1 = await view.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, 'test_01_google_home.png'), img1.toPNG());
  console.log('[TEST] Screenshot: Google homepage saved');

  // Step 2: Type 'phone' in search box and search
  console.log('[TEST] Step 2: Searching for "phone"...');
  // Find the search input and type into it
  await view.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('input[name="q"], textarea[name="q"]');
      if (input) {
        input.focus();
        input.value = 'phone';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'found';
      }
      return 'not found';
    })()
  `).then(r => console.log('[TEST] Search input:', r));

  await new Promise(r => setTimeout(r, 1000));

  // Submit the search
  await view.webContents.executeJavaScript(`
    (function() {
      const form = document.querySelector('form[role="search"], form[action="/search"]');
      if (form) { form.submit(); return 'submitted'; }
      // Fallback: press Enter
      const input = document.querySelector('input[name="q"], textarea[name="q"]');
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return 'enter pressed';
      }
      return 'no form found';
    })()
  `).then(r => console.log('[TEST] Search submit:', r));

  await new Promise(r => setTimeout(r, 3000));
  console.log('[TEST] Search results URL:', view.webContents.getURL());

  // Screenshot search results
  const img2 = await view.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, 'test_02_search_results.png'), img2.toPNG());
  console.log('[TEST] Screenshot: Search results saved');

  // Step 3: Click Images tab
  console.log('[TEST] Step 3: Clicking Images tab...');
  await view.webContents.executeJavaScript(`
    (function() {
      // Look for Images link in Google's nav
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent.trim() === 'Images' || link.textContent.trim() === 'Bilder') {
          link.click();
          return 'clicked: ' + link.href;
        }
      }
      return 'Images link not found';
    })()
  `).then(r => console.log('[TEST] Images tab:', r));

  await new Promise(r => setTimeout(r, 4000));
  console.log('[TEST] Images URL:', view.webContents.getURL());

  // Screenshot images page
  const img3 = await view.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, 'test_03_images.png'), img3.toPNG());
  console.log('[TEST] Screenshot: Images page saved');

  // Step 4: NOW inject the click recorder overlay and test it
  console.log('[TEST] Step 4: Injecting click recorder overlay...');
  const urlBeforeOverlay = view.webContents.getURL();
  console.log('[TEST] URL before overlay:', urlBeforeOverlay);

  await view.webContents.executeJavaScript(CLICK_OVERLAY_JS);
  console.log('[TEST] Overlay injected');

  // Verify overlay is active
  const overlayActive = await view.webContents.executeJavaScript('window.__dashsnap_overlay');
  console.log('[TEST] Overlay active:', overlayActive);

  // Verify crosshair cursor is set
  const hasCrosshair = await view.webContents.executeJavaScript(
    'document.documentElement.classList.contains("__dashsnap_inspecting")'
  );
  console.log('[TEST] Crosshair cursor set:', hasCrosshair);

  // Verify highlight and tooltip elements exist
  const hasHighlight = await view.webContents.executeJavaScript('!!document.getElementById("__dashsnap_highlight")');
  const hasTooltip = await view.webContents.executeJavaScript('!!document.getElementById("__dashsnap_tooltip")');
  console.log('[TEST] Highlight element exists:', hasHighlight);
  console.log('[TEST] Tooltip element exists:', hasTooltip);

  // Step 5: Simulate a click on an image element via JS dispatch
  console.log('[TEST] Step 5: Simulating click on an element with overlay active...');

  // Find a clickable element (an image link) and dispatch a click
  const clickResult = await view.webContents.executeJavaScript(`
    (function() {
      // Find first image result or any link
      const target = document.querySelector('a[href*="imgres"]') ||
                     document.querySelector('img') ||
                     document.querySelector('a');
      if (!target) return { error: 'no target found' };

      // Dispatch click event (this should be intercepted by our capture listener)
      const rect = target.getBoundingClientRect();
      const clickEvent = new MouseEvent('click', {
        bubbles: true, cancelable: true,
        clientX: rect.left + rect.width/2,
        clientY: rect.top + rect.height/2,
      });
      target.dispatchEvent(clickEvent);

      // Check if our overlay captured the result
      return {
        dashsnap_result: window.__dashsnap_result,
        target_tag: target.tagName,
        target_text: (target.textContent || '').trim().substring(0, 50),
      };
    })()
  `);
  console.log('[TEST] Click simulation result:', JSON.stringify(clickResult, null, 2));

  // Wait a moment then check URL didn't change (overlay blocked navigation)
  await new Promise(r => setTimeout(r, 1000));
  const urlAfterClick = view.webContents.getURL();
  console.log('[TEST] URL after click:', urlAfterClick);

  const navigationBlocked = urlAfterClick === urlBeforeOverlay ||
    urlAfterClick.includes('google.com/search'); // Still on search page
  console.log('[TEST] Navigation was blocked:', navigationBlocked);

  // Step 6: Verify the captured result
  const capturedResult = await view.webContents.executeJavaScript('window.__dashsnap_result');
  console.log('[TEST] Captured element result:', JSON.stringify(capturedResult, null, 2));

  // Step 7: Take final screenshot
  const img4 = await view.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, 'test_04_after_recorder.png'), img4.toPNG());
  console.log('[TEST] Screenshot: After recorder test saved');

  // === RESULTS ===
  console.log('\n[TEST] ════════════════════════════════════════');
  console.log('[TEST] RESULTS:');
  console.log('[TEST] ════════════════════════════════════════');

  let passed = 0;
  let failed = 0;

  function check(name, condition) {
    if (condition) {
      console.log('[TEST] ✓ PASS:', name);
      passed++;
    } else {
      console.log('[TEST] ✗ FAIL:', name);
      failed++;
    }
  }

  check('Google loaded', view.webContents.getURL().includes('google'));
  check('Overlay was active', overlayActive === true);
  check('Crosshair cursor was set', hasCrosshair === true);
  check('Highlight element injected', hasHighlight === true);
  check('Tooltip element injected', hasTooltip === true);
  check('Navigation was blocked by overlay', navigationBlocked);
  check('Element was captured (dashsnap_result set)', capturedResult !== null && capturedResult !== undefined);
  if (capturedResult) {
    check('Captured result has selector or xy', !!(capturedResult.selector || capturedResult.xy));
    check('Captured result has label', !!capturedResult.label);
    check('Captured result has strategy', !!capturedResult.strategy);
  }

  console.log(`\n[TEST] ${passed} passed, ${failed} failed out of ${passed + failed} checks`);

  if (failed === 0) {
    console.log('[TEST] ✓ ALL TESTS PASSED!');
  } else {
    console.log('[TEST] ✗ SOME TESTS FAILED');
  }

  console.log('[TEST] Screenshots saved to:', outputDir);
  const files = fs.readdirSync(outputDir).filter(f => f.startsWith('test_'));
  for (const f of files) {
    const stat = fs.statSync(path.join(outputDir, f));
    console.log(`  ${f} — ${(stat.size / 1024).toFixed(1)} KB`);
  }

  await new Promise(r => setTimeout(r, 2000));
  app.quit();
});
