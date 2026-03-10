import { BrowserView, BrowserWindow } from 'electron';

const CLICK_OVERLAY_JS = `
(function() {
  if (window.__dashsnap_overlay) return;
  window.__dashsnap_overlay = true;
  window.__dashsnap_result = null;
  window.__dashsnap_cancelled = false;

  // Inject a style that changes cursor and blocks pointer interactions at the CSS level
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
  tooltip.style.cssText = 'position:fixed;z-index:2147483647;background:#1C1A29;color:#EEEDF5;font:12px system-ui;padding:6px 10px;border-radius:6px;border:1px solid #7C5CFC;pointer-events:none;display:none;max-width:250px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

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

    const typeMap = {
      button: 'Button',
      a: 'Link',
      input: 'Input',
      select: 'Dropdown',
      textarea: 'Text area',
      img: 'Image',
      svg: 'Icon',
    };
    const prefix = typeMap[tag] || tag;
    return text ? prefix + ': ' + text : prefix;
  }

  function getBestSelector(el) {
    // Priority 1: data-* attributes
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && attr.name !== 'data-reactid') {
        const sel = el.tagName.toLowerCase() + '[' + attr.name + '="' + attr.value + '"]';
        if (document.querySelectorAll(sel).length === 1) {
          return { selector: sel, strategy: 'data-attr' };
        }
      }
    }

    // Priority 2: aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const sel = '[aria-label="' + ariaLabel.replace(/"/g, '\\\\\\\\"') + '"]';
      if (document.querySelectorAll(sel).length === 1) {
        return { selector: sel, strategy: 'aria-label' };
      }
    }

    // Priority 3: Unique ID
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      return { selector: '#' + CSS.escape(el.id), strategy: 'id' };
    }

    // Priority 4: Text content
    const text = (el.textContent || '').trim();
    if (text && text.length < 50) {
      const role = el.getAttribute('role');
      if (role) {
        const sel = '[role="' + role + '"]';
        const matches = [...document.querySelectorAll(sel)].filter(e => (e.textContent||'').trim() === text);
        if (matches.length === 1) {
          return { selector: sel, strategy: 'text' };
        }
      }
    }

    // Priority 5: CSS class + tag combo
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(/\\s+/).filter(c => c && !c.startsWith('__')).slice(0, 2);
      if (classes.length > 0) {
        const sel = el.tagName.toLowerCase() + '.' + classes.join('.');
        if (document.querySelectorAll(sel).length === 1) {
          return { selector: sel, strategy: 'css-combo' };
        }
      }
    }

    // Priority 6: XY fallback
    return { selector: '', strategy: 'xy-position' };
  }

  let lastEl = null;

  // Use CAPTURE phase listeners on document — these fire BEFORE the page's own handlers
  // and we can preventDefault + stopImmediatePropagation to block all page interaction

  function onMouseMove(e) {
    const el = e.target;
    if (!el || el === tooltip || el === highlight || el.id === '__dashsnap_style') return;
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
      rect: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
    };
  }

  // Block ALL interaction events in capture phase so the page never sees them
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

  // Capture phase: intercept before the page can handle them
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('mousedown', blockEvent, true);
  document.addEventListener('mouseup', blockEvent, true);
  document.addEventListener('pointerdown', blockEvent, true);
  document.addEventListener('pointerup', blockEvent, true);
  document.addEventListener('touchstart', blockEvent, true);
  document.addEventListener('touchend', blockEvent, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('keydown', onKeyDown, true);

  function cleanup() {
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('mousedown', blockEvent, true);
    document.removeEventListener('mouseup', blockEvent, true);
    document.removeEventListener('pointerdown', blockEvent, true);
    document.removeEventListener('pointerup', blockEvent, true);
    document.removeEventListener('touchstart', blockEvent, true);
    document.removeEventListener('touchend', blockEvent, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.documentElement.classList.remove('__dashsnap_inspecting');
    style.remove();
    tooltip.remove();
    highlight.remove();
    window.__dashsnap_overlay = false;
  }

  // Store cleanup fn for external stop
  window.__dashsnap_cleanup = cleanup;
})();
`;

const SNAP_OVERLAY_JS = `
(function() {
  if (window.__dashsnap_snap_overlay) return;
  window.__dashsnap_snap_overlay = true;

  const canvas = document.createElement('canvas');
  canvas.id = '__dashsnap_snap_canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;cursor:crosshair;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let startX = 0, startY = 0, drawing = false;

  const dimLabel = document.createElement('div');
  dimLabel.style.cssText = 'position:fixed;z-index:2147483647;background:#1e293b;color:#06b6d4;font:11px monospace;padding:3px 8px;border-radius:4px;border:1px solid #06b6d4;pointer-events:none;display:none;';
  document.body.appendChild(dimLabel);

  function draw(e) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    // Clear selection area
    ctx.clearRect(x, y, w, h);

    // Selection border
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(x, y, w, h);

    // Corner handles
    ctx.fillStyle = '#3b82f6';
    const handleSize = 6;
    [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([cx,cy]) => {
      ctx.fillRect(cx-handleSize/2, cy-handleSize/2, handleSize, handleSize);
    });

    // Dimension label
    dimLabel.textContent = w + ' × ' + h + ' px';
    dimLabel.style.display = 'block';
    dimLabel.style.left = (x + w/2 - 40) + 'px';
    dimLabel.style.top = (y + h + 8) + 'px';
  }

  canvas.addEventListener('mousedown', function(e) {
    startX = e.clientX;
    startY = e.clientY;
    drawing = true;
  });

  canvas.addEventListener('mousemove', function(e) {
    if (drawing) draw(e);
  });

  canvas.addEventListener('mouseup', function(e) {
    if (!drawing) return;
    drawing = false;

    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    canvas.remove();
    dimLabel.remove();
    window.__dashsnap_snap_overlay = false;

    if (w < 10 || h < 10) {
      window.__dashsnap_cancelled = true;
      return;
    }

    window.__dashsnap_snap_result = { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      canvas.remove();
      dimLabel.remove();
      window.__dashsnap_snap_overlay = false;
      window.__dashsnap_cancelled = true;
    }
  }, { once: true });
})();
`;

export class Recorder {
  private view: BrowserView;
  private window: BrowserWindow;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(view: BrowserView, window: BrowserWindow) {
    this.view = view;
    this.window = window;
  }

  async startClickRecording() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(CLICK_OVERLAY_JS);
    this.pollForClickResult();
  }

  async startSnapRecording() {
    this.stopPolling();
    // Use the same element-picker overlay as click recording
    // The renderer will create a SNAP step using the element's bounding rect
    await this.view.webContents.executeJavaScript(CLICK_OVERLAY_JS);
    this.pollForClickResult();
  }

  stop() {
    this.stopPolling();
    this.view.webContents.executeJavaScript(`
      if (window.__dashsnap_cleanup) { window.__dashsnap_cleanup(); window.__dashsnap_cleanup = null; }
      document.getElementById('__dashsnap_snap_canvas')?.remove();
      window.__dashsnap_overlay = false;
      window.__dashsnap_snap_overlay = false;
    `).catch(() => {});
    this.window.webContents.send('recorder:cancelled');
  }

  private pollForClickResult() {
    this.pollInterval = setInterval(async () => {
      try {
        const cancelled = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_cancelled || false'
        );
        if (cancelled) {
          this.stopPolling();
          await this.view.webContents.executeJavaScript('window.__dashsnap_cancelled = false;');
          this.window.webContents.send('recorder:cancelled');
          return;
        }

        const result = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_result || null'
        );
        if (result) {
          this.stopPolling();
          await this.view.webContents.executeJavaScript('window.__dashsnap_result = null;');
          this.window.webContents.send('recorder:element-picked', result);
        }
      } catch {
        // Page may have navigated
      }
    }, 100);
  }

  private pollForSnapResult() {
    this.pollInterval = setInterval(async () => {
      try {
        const cancelled = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_cancelled || false'
        );
        if (cancelled) {
          this.stopPolling();
          await this.view.webContents.executeJavaScript('window.__dashsnap_cancelled = false;');
          this.window.webContents.send('recorder:cancelled');
          return;
        }

        const result = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_snap_result || null'
        );
        if (result) {
          this.stopPolling();
          await this.view.webContents.executeJavaScript('window.__dashsnap_snap_result = null;');
          this.window.webContents.send('recorder:region-selected', result);
        }
      } catch {
        // Page may have navigated
      }
    }, 100);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
