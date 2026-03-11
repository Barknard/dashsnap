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

// ─── Filter multi-phase recording overlay ────────────────────────────────────
// Unlike the click overlay, this lets clicks go through to the page so the user
// actually opens the filter, selects options, etc. while we record each element.
const FILTER_OVERLAY_JS = `
(function() {
  if (window.__dashsnap_filter_active) return;
  window.__dashsnap_filter_active = true;
  window.__dashsnap_filter_done = false;
  window.__dashsnap_filter_cancelled = false;
  window.__dashsnap_filter_phase = 'trigger';
  window.__dashsnap_filter_results = { trigger: null, options: [], apply: null };

  const getBestSelector = ${/* reuse the same function inline */ ''}(function() {
    return function getBestSelector(el) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-') && attr.name !== 'data-reactid') {
          const sel = el.tagName.toLowerCase() + '[' + attr.name + '="' + attr.value + '"]';
          if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'data-attr' };
        }
      }
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) {
        const sel = '[aria-label="' + ariaLabel.replace(/"/g, '\\\\\\\\"') + '"]';
        if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'aria-label' };
      }
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        return { selector: '#' + CSS.escape(el.id), strategy: 'id' };
      }
      const text = (el.textContent || '').trim();
      if (text && text.length < 50) {
        const role = el.getAttribute('role');
        if (role) {
          const sel = '[role="' + role + '"]';
          const matches = [...document.querySelectorAll(sel)].filter(e => (e.textContent||'').trim() === text);
          if (matches.length === 1) return { selector: sel, strategy: 'text' };
        }
      }
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\\s+/).filter(c => c && !c.startsWith('__')).slice(0, 2);
        if (classes.length > 0) {
          const sel = el.tagName.toLowerCase() + '.' + classes.join('.');
          if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'css-combo' };
        }
      }
      return { selector: '', strategy: 'xy-position' };
    };
  })();

  function getLabel(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const text = (el.textContent || '').trim().substring(0, 30);
    return text || el.tagName.toLowerCase();
  }

  // Instruction banner — sits at top, pointer-events: auto so Enter works
  const banner = document.createElement('div');
  banner.id = '__dashsnap_filter_banner';
  banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1C1A29;color:#EEEDF5;font:13px system-ui;padding:10px 20px;border-radius:10px;border:2px solid #F59E0B;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:10px;';
  document.body.appendChild(banner);

  // Highlight overlay (pointer-events: none so clicks go through)
  const highlight = document.createElement('div');
  highlight.id = '__dashsnap_filter_highlight';
  highlight.style.cssText = 'position:fixed;z-index:2147483646;border:2px solid #F59E0B;background:rgba(245,158,11,0.12);border-radius:3px;pointer-events:none;display:none;transition:all 0.05s ease;';
  document.body.appendChild(highlight);

  // Flash element on record
  function flashElement(el) {
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;z-index:2147483645;background:rgba(34,211,238,0.3);border:2px solid #22D3EE;border-radius:3px;pointer-events:none;transition:opacity 0.5s;';
    const rect = el.getBoundingClientRect();
    flash.style.left = rect.left + 'px';
    flash.style.top = rect.top + 'px';
    flash.style.width = rect.width + 'px';
    flash.style.height = rect.height + 'px';
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; }, 100);
    setTimeout(() => flash.remove(), 600);
  }

  const phases = {
    trigger: '<span style="color:#F59E0B;font-weight:700">Step 1/3</span> — Click the filter to <b>open</b> it',
    options: '<span style="color:#F59E0B;font-weight:700">Step 2/3</span> — Click options to select · <kbd data-advance="true" style="background:#333;padding:2px 6px;border-radius:3px;font-size:11px;cursor:pointer;user-select:none">Enter</kbd> when done',
    apply:   '<span style="color:#F59E0B;font-weight:700">Step 3/3</span> — Click <b>apply</b> button · <kbd data-advance="true" style="background:#333;padding:2px 6px;border-radius:3px;font-size:11px;cursor:pointer;user-select:none">Enter</kbd> to re-click trigger instead',
  };

  function updateBanner() {
    banner.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#EF4444;animation:pulse 1s infinite;display:inline-block"></span> ' + phases[window.__dashsnap_filter_phase];
  }
  updateBanner();

  let lastEl = null;
  function onMouseMove(e) {
    const el = e.target;
    if (!el || el === banner || el === highlight) return;
    if (el === lastEl) return;
    lastEl = el;
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
  }

  function onClick(e) {
    // DON'T block the event — let clicks go through to the page
    const el = e.target;
    if (!el || el === highlight) return;
    // Clicking "Enter" kbd in the banner advances the phase
    if (el.closest('[data-advance]') || el === banner) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.__dashsnap_filter_phase === 'options' && window.__dashsnap_filter_results.options.length > 0) {
        window.__dashsnap_filter_phase = 'apply';
        updateBanner();
      } else if (window.__dashsnap_filter_phase === 'apply') {
        window.__dashsnap_filter_done = true;
        cleanup();
      }
      return;
    }

    const { selector, strategy } = getBestSelector(el);
    const label = getLabel(el);
    const rect = el.getBoundingClientRect();
    const data = {
      selector: selector,
      strategy: strategy,
      label: label,
      xy: [Math.round(rect.left + rect.width/2), Math.round(rect.top + rect.height/2)],
    };

    flashElement(el);

    switch (window.__dashsnap_filter_phase) {
      case 'trigger':
        window.__dashsnap_filter_results.trigger = data;
        window.__dashsnap_filter_phase = 'options';
        updateBanner();
        break;
      case 'options':
        window.__dashsnap_filter_results.options.push(data);
        break;
      case 'apply':
        window.__dashsnap_filter_results.apply = data;
        window.__dashsnap_filter_done = true;
        cleanup();
        break;
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.__dashsnap_filter_phase === 'options') {
        if (window.__dashsnap_filter_results.options.length === 0) return; // must pick at least one
        window.__dashsnap_filter_phase = 'apply';
        updateBanner();
      } else if (window.__dashsnap_filter_phase === 'apply') {
        // Skip apply — will re-click trigger
        window.__dashsnap_filter_done = true;
        cleanup();
      }
    }
    if (e.key === 'Escape') {
      window.__dashsnap_filter_cancelled = true;
      cleanup();
    }
  }

  // Capture phase for mousemove/keydown, but NOT blocking clicks
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    banner.remove();
    highlight.remove();
    window.__dashsnap_filter_active = false;
  }

  window.__dashsnap_filter_cleanup = cleanup;
})();
`;

// ─── Macro recording overlay ─────────────────────────────────────────────────
// Free-form interaction recorder: clicks go through, scrolls are captured,
// each interaction is recorded in sequence with element metadata for
// variable detection. Banner shows action count and controls.
const MACRO_OVERLAY_JS = `
(function() {
  if (window.__dashsnap_macro_active) return;
  window.__dashsnap_macro_active = true;
  window.__dashsnap_macro_done = false;
  window.__dashsnap_macro_cancelled = false;
  window.__dashsnap_macro_actions = [];

  const getBestSelector = (function() {
    return function getBestSelector(el) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-') && attr.name !== 'data-reactid') {
          const sel = el.tagName.toLowerCase() + '[' + attr.name + '="' + attr.value + '"]';
          if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'data-attr' };
        }
      }
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) {
        const sel = '[aria-label="' + ariaLabel.replace(/"/g, '\\\\\\\\"') + '"]';
        if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'aria-label' };
      }
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        return { selector: '#' + CSS.escape(el.id), strategy: 'id' };
      }
      const text = (el.textContent || '').trim();
      if (text && text.length < 50) {
        const role = el.getAttribute('role');
        if (role) {
          const sel = '[role="' + role + '"]';
          const matches = [...document.querySelectorAll(sel)].filter(e => (e.textContent||'').trim() === text);
          if (matches.length === 1) return { selector: sel, strategy: 'text' };
        }
      }
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\\s+/).filter(c => c && !c.startsWith('__')).slice(0, 2);
        if (classes.length > 0) {
          const sel = el.tagName.toLowerCase() + '.' + classes.join('.');
          if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'css-combo' };
        }
      }
      return { selector: '', strategy: 'xy-position' };
    };
  })();

  function getLabel(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const text = (el.textContent || '').trim().substring(0, 30);
    return text || el.tagName.toLowerCase();
  }

  function getElementMeta(el) {
    const meta = { tagName: el.tagName.toLowerCase() };
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      meta.inputType = el.type || 'text';
      if (el.placeholder) meta.placeholder = el.placeholder;
    }
    if (el.tagName === 'SELECT') {
      meta.options = [...el.options].map(o => o.textContent.trim()).slice(0, 20);
    }
    return meta;
  }

  function isTypeable(el) {
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      return ['text','search','email','tel','url','number','password'].includes(t);
    }
    if (el.contentEditable === 'true') return true;
    return false;
  }

  // Banner
  const banner = document.createElement('div');
  banner.id = '__dashsnap_macro_banner';
  banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1C1A29;color:#EEEDF5;font:13px system-ui;padding:10px 20px;border-radius:10px;border:2px solid #7C5CFC;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:10px;';
  document.body.appendChild(banner);

  // Highlight
  const highlight = document.createElement('div');
  highlight.id = '__dashsnap_macro_highlight';
  highlight.style.cssText = 'position:fixed;z-index:2147483646;border:3px solid #7C5CFC;background:rgba(124,92,252,0.18);border-radius:4px;pointer-events:none;display:none;transition:all 0.05s ease;box-shadow:0 0 8px rgba(124,92,252,0.4);';
  document.body.appendChild(highlight);

  function flashElement(el) {
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;z-index:2147483645;background:rgba(34,211,238,0.3);border:2px solid #22D3EE;border-radius:3px;pointer-events:none;transition:opacity 0.5s;';
    const rect = el.getBoundingClientRect();
    flash.style.left = rect.left + 'px';
    flash.style.top = rect.top + 'px';
    flash.style.width = rect.width + 'px';
    flash.style.height = rect.height + 'px';
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; }, 100);
    setTimeout(() => flash.remove(), 600);
  }

  function updateBanner() {
    const count = window.__dashsnap_macro_actions.length;
    banner.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#EF4444;animation:pulse 1s infinite;display:inline-block"></span> '
      + '<span style="color:#7C5CFC;font-weight:700">MACRO</span> — '
      + count + ' action' + (count !== 1 ? 's' : '') + ' · '
      + '<kbd style="background:#333;padding:2px 6px;border-radius:3px;font-size:10px">S</kbd> snap · '
      + '<kbd style="background:#333;padding:2px 6px;border-radius:3px;font-size:10px">R</kbd> region · '
      + '<kbd data-macro-done="true" style="background:#333;padding:2px 6px;border-radius:3px;font-size:10px;cursor:pointer;user-select:none">Enter</kbd> done';
  }
  updateBanner();

  let lastEl = null;
  function onMouseMove(e) {
    const el = e.target;
    if (!el || el === banner || el === highlight || el.closest('#__dashsnap_macro_banner')) return;
    if (el === lastEl) return;
    lastEl = el;
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
  }

  // Scroll tracking (debounced)
  let scrollTimer = null;
  let lastScrollEl = null;
  let lastScrollX = window.scrollX;
  let lastScrollY = window.scrollY;
  function onScroll(e) {
    clearTimeout(scrollTimer);
    const target = e.target;
    scrollTimer = setTimeout(() => {
      if (target === document || target === window || target === document.documentElement) {
        // Page scroll
        const newX = window.scrollX;
        const newY = window.scrollY;
        if (newX !== lastScrollX || newY !== lastScrollY) {
          window.__dashsnap_macro_actions.push({
            action: 'scroll',
            label: 'Page scroll to (' + Math.round(newX) + ', ' + Math.round(newY) + ')',
            scrollTarget: { x: Math.round(newX), y: Math.round(newY), isPage: true },
          });
          lastScrollX = newX;
          lastScrollY = newY;
          updateBanner();
        }
      } else if (target && target.nodeType === 1) {
        // Element scroll
        const { selector, strategy } = getBestSelector(target);
        const rect = target.getBoundingClientRect();
        window.__dashsnap_macro_actions.push({
          action: 'scroll',
          selector: selector,
          selectorStrategy: strategy,
          fallbackXY: [Math.round(rect.left + rect.width/2), Math.round(rect.top + rect.height/2)],
          label: 'Scroll: ' + getLabel(target),
          scrollTarget: { x: Math.round(target.scrollLeft), y: Math.round(target.scrollTop), isPage: false },
        });
        updateBanner();
      }
    }, 400);
  }

  function onClick(e) {
    const el = e.target;
    if (!el || el === highlight) return;
    // "Enter" button in banner or banner click = finish
    if (el.closest('[data-macro-done]') || el === banner || el.closest('#__dashsnap_macro_banner')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.__dashsnap_macro_actions.length > 0) {
        window.__dashsnap_macro_done = true;
        cleanup();
      }
      return;
    }

    // Let click go through to the page
    const { selector, strategy } = getBestSelector(el);
    const label = getLabel(el);
    const rect = el.getBoundingClientRect();
    const meta = getElementMeta(el);
    const actionType = isTypeable(el) ? 'type' : (el.tagName === 'SELECT' ? 'select' : 'click');

    window.__dashsnap_macro_actions.push({
      selector: selector,
      selectorStrategy: strategy,
      fallbackXY: [Math.round(rect.left + rect.width/2), Math.round(rect.top + rect.height/2)],
      label: label,
      action: actionType,
      value: '',
      elementMeta: meta,
    });

    flashElement(el);
    updateBanner();
  }

  // Region-draw mode for screenshots
  let drawingRegion = false;
  let regionCanvas = null;
  let regionStartX = 0, regionStartY = 0;

  function startRegionDraw() {
    drawingRegion = true;
    highlight.style.display = 'none';
    regionCanvas = document.createElement('canvas');
    regionCanvas.width = window.innerWidth;
    regionCanvas.height = window.innerHeight;
    regionCanvas.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;cursor:crosshair;';
    document.body.appendChild(regionCanvas);

    const ctx = regionCanvas.getContext('2d');
    let drawing = false;

    regionCanvas.addEventListener('mousedown', function(ev) {
      regionStartX = ev.clientX;
      regionStartY = ev.clientY;
      drawing = true;
    });
    regionCanvas.addEventListener('mousemove', function(ev) {
      if (!drawing) return;
      ctx.clearRect(0, 0, regionCanvas.width, regionCanvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, regionCanvas.width, regionCanvas.height);
      const x = Math.min(regionStartX, ev.clientX);
      const y = Math.min(regionStartY, ev.clientY);
      const w = Math.abs(ev.clientX - regionStartX);
      const h = Math.abs(ev.clientY - regionStartY);
      ctx.clearRect(x, y, w, h);
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
    });
    regionCanvas.addEventListener('mouseup', function(ev) {
      if (!drawing) return;
      drawing = false;
      const x = Math.min(regionStartX, ev.clientX);
      const y = Math.min(regionStartY, ev.clientY);
      const w = Math.abs(ev.clientX - regionStartX);
      const h = Math.abs(ev.clientY - regionStartY);
      regionCanvas.remove();
      regionCanvas = null;
      drawingRegion = false;
      if (w >= 10 && h >= 10) {
        window.__dashsnap_macro_actions.push({
          action: 'snap',
          label: 'Screenshot ' + Math.round(w) + 'x' + Math.round(h) + 'px',
          snapRegion: { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) },
        });
        updateBanner();
      }
    });
    regionCanvas.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') {
        regionCanvas.remove();
        regionCanvas = null;
        drawingRegion = false;
      }
    });
  }

  function onKeyDown(e) {
    if (drawingRegion) return;

    if (e.key === 'Enter' && (e.target === document.body || e.target === document.documentElement)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.__dashsnap_macro_actions.length > 0) {
        window.__dashsnap_macro_done = true;
        cleanup();
      }
    }
    // S = snap hovered element
    if ((e.key === 's' || e.key === 'S') && lastEl && lastEl !== banner && lastEl !== highlight) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const rect = lastEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        window.__dashsnap_macro_actions.push({
          action: 'snap',
          label: 'Snap: ' + getLabel(lastEl),
          snapRegion: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
        });
        flashElement(lastEl);
        updateBanner();
      }
    }
    // R = draw region screenshot
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      e.stopImmediatePropagation();
      startRegionDraw();
    }
    if (e.key === 'Escape') {
      window.__dashsnap_macro_cancelled = true;
      cleanup();
    }
  }

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('scroll', onScroll, true);

  function cleanup() {
    clearTimeout(scrollTimer);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('scroll', onScroll, true);
    banner.remove();
    highlight.remove();
    window.__dashsnap_macro_active = false;
  }

  window.__dashsnap_macro_cleanup = cleanup;
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

  async startHoverRecording() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(CLICK_OVERLAY_JS);
    this.pollForClickResult();
  }

  async startSelectRecording() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(CLICK_OVERLAY_JS);
    this.pollForClickResult();
  }

  async startTypeRecording() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(CLICK_OVERLAY_JS);
    this.pollForClickResult();
  }

  async startScrollElementRecording() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(CLICK_OVERLAY_JS);
    this.pollForClickResult();
  }

  async startFilterRecording() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(FILTER_OVERLAY_JS);
    this.pollForFilterResult();
  }

  async startMacroRecording() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(MACRO_OVERLAY_JS);
    this.pollForMacroResult();
  }

  async startScreenshotRecording() {
    this.stopPolling();
    // Use the region-drawing overlay for freeform screenshot area
    await this.view.webContents.executeJavaScript(SNAP_OVERLAY_JS);
    this.pollForSnapResult();
  }

  stop() {
    this.stopPolling();
    this.view.webContents.executeJavaScript(`
      if (window.__dashsnap_cleanup) { window.__dashsnap_cleanup(); window.__dashsnap_cleanup = null; }
      if (window.__dashsnap_filter_cleanup) { window.__dashsnap_filter_cleanup(); window.__dashsnap_filter_cleanup = null; }
      if (window.__dashsnap_macro_cleanup) { window.__dashsnap_macro_cleanup(); window.__dashsnap_macro_cleanup = null; }
      document.getElementById('__dashsnap_snap_canvas')?.remove();
      window.__dashsnap_overlay = false;
      window.__dashsnap_snap_overlay = false;
      window.__dashsnap_filter_active = false;
      window.__dashsnap_macro_active = false;
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

  private pollForFilterResult() {
    this.pollInterval = setInterval(async () => {
      try {
        const cancelled = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_filter_cancelled || false'
        );
        if (cancelled) {
          this.stopPolling();
          await this.view.webContents.executeJavaScript('window.__dashsnap_filter_cancelled = false;');
          this.window.webContents.send('recorder:cancelled');
          return;
        }

        const done = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_filter_done || false'
        );
        if (done) {
          this.stopPolling();
          const results = await this.view.webContents.executeJavaScript(
            'JSON.parse(JSON.stringify(window.__dashsnap_filter_results))'
          );
          await this.view.webContents.executeJavaScript(`
            window.__dashsnap_filter_done = false;
            window.__dashsnap_filter_results = null;
          `);
          this.window.webContents.send('recorder:filter-recorded', results);
        }
      } catch {
        // Page may have navigated
      }
    }, 100);
  }

  private pollForMacroResult() {
    this.pollInterval = setInterval(async () => {
      try {
        const cancelled = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_macro_cancelled || false'
        );
        if (cancelled) {
          this.stopPolling();
          await this.view.webContents.executeJavaScript('window.__dashsnap_macro_cancelled = false;');
          this.window.webContents.send('recorder:cancelled');
          return;
        }

        const done = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_macro_done || false'
        );
        if (done) {
          this.stopPolling();
          const actions = await this.view.webContents.executeJavaScript(
            'JSON.parse(JSON.stringify(window.__dashsnap_macro_actions))'
          );
          const startUrl = this.view.webContents.getURL();
          await this.view.webContents.executeJavaScript(`
            window.__dashsnap_macro_done = false;
            window.__dashsnap_macro_actions = [];
          `);
          this.window.webContents.send('recorder:macro-recorded', actions, startUrl);
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
