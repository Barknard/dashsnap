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
    function cssEscapeVal(v) { return v.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"'); }
    function unique(sel) { try { return document.querySelectorAll(sel).length === 1; } catch(e) { return false; } }

    // Priority 1: aria-label
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      var sel = '[aria-label="' + cssEscapeVal(ariaLabel) + '"]';
      if (unique(sel)) return { selector: sel, strategy: 'aria-label' };
    }

    // Priority 2: data-* attributes (skip unstable session tokens)
    var UNSTABLE = ['data-ved','data-csiid','data-ei','data-jsarwt','data-usg','data-lpage','data-atf',
      'data-frt','data-ictx','data-surl','data-docid','data-deferred','data-ri','data-tbnid','data-cb',
      'data-nhd','data-lhid','data-ctbid','data-reactid'];
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (attr.name.startsWith('data-') && UNSTABLE.indexOf(attr.name) === -1) {
        if (attr.value && attr.value.length < 100) {
          var sel = el.tagName.toLowerCase() + '[' + attr.name + '="' + cssEscapeVal(attr.value) + '"]';
          if (unique(sel)) return { selector: sel, strategy: 'data-attr' };
        }
      }
    }

    // Priority 3: Unique ID
    if (el.id && !/^[:_]/.test(el.id) && el.id.length < 50) {
      var sel = '#' + CSS.escape(el.id);
      if (unique(sel)) return { selector: sel, strategy: 'id' };
    }

    // Priority 4: name attribute
    var nameAttr = el.getAttribute('name');
    if (nameAttr) {
      var sel = el.tagName.toLowerCase() + '[name="' + cssEscapeVal(nameAttr) + '"]';
      if (unique(sel)) return { selector: sel, strategy: 'name' };
    }

    // Priority 5: Role + text content
    var text = (el.textContent || '').trim();
    if (text && text.length < 50) {
      var role = el.getAttribute('role');
      if (role) {
        var sel = '[role="' + role + '"]';
        var matches = [].slice.call(document.querySelectorAll(sel)).filter(function(e) { return (e.textContent||'').trim() === text; });
        if (matches.length === 1) return { selector: sel, strategy: 'role-text' };
      }
    }

    // Priority 6: CSS class + tag combo
    if (el.className && typeof el.className === 'string') {
      var classes = el.className.split(/\\s+/).filter(function(c) { return c && !c.startsWith('__'); }).slice(0, 2);
      if (classes.length > 0) {
        var sel = el.tagName.toLowerCase() + '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
        if (unique(sel)) return { selector: sel, strategy: 'css-combo' };
      }
    }

    // Priority 7: XY fallback
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

  const getBestSelector = (function() {
    function cssEscapeVal(v) { return v.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"'); }
    function unique(sel) { try { return document.querySelectorAll(sel).length === 1; } catch(e) { return false; } }
    var UNSTABLE = ['data-ved','data-csiid','data-ei','data-jsarwt','data-usg','data-lpage','data-atf',
      'data-frt','data-ictx','data-surl','data-docid','data-deferred','data-ri','data-tbnid','data-cb',
      'data-nhd','data-lhid','data-ctbid','data-reactid'];
    return function getBestSelector(el) {
      var ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) {
        var sel = '[aria-label="' + cssEscapeVal(ariaLabel) + '"]';
        if (unique(sel)) return { selector: sel, strategy: 'aria-label' };
      }
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (attr.name.startsWith('data-') && UNSTABLE.indexOf(attr.name) === -1) {
          if (attr.value && attr.value.length < 100) {
            var sel = el.tagName.toLowerCase() + '[' + attr.name + '="' + cssEscapeVal(attr.value) + '"]';
            if (unique(sel)) return { selector: sel, strategy: 'data-attr' };
          }
        }
      }
      if (el.id && !/^[:_]/.test(el.id) && el.id.length < 50) {
        var sel = '#' + CSS.escape(el.id);
        if (unique(sel)) return { selector: sel, strategy: 'id' };
      }
      var text = (el.textContent || '').trim();
      if (text && text.length < 50) {
        var role = el.getAttribute('role');
        if (role) {
          var sel = '[role="' + role + '"]';
          var matches = [].slice.call(document.querySelectorAll(sel)).filter(function(e) { return (e.textContent||'').trim() === text; });
          if (matches.length === 1) return { selector: sel, strategy: 'role-text' };
        }
      }
      if (el.className && typeof el.className === 'string') {
        var classes = el.className.split(/\\s+/).filter(function(c) { return c && !c.startsWith('__'); }).slice(0, 2);
        if (classes.length > 0) {
          var sel = el.tagName.toLowerCase() + '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
          if (unique(sel)) return { selector: sel, strategy: 'css-combo' };
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

  // Crosshair cursor during recording
  const macroStyle = document.createElement('style');
  macroStyle.id = '__dashsnap_macro_style';
  macroStyle.textContent = '.__dashsnap_macro_recording, .__dashsnap_macro_recording * { cursor: crosshair !important; } #__ds_done_btn { transition: all 0.15s ease; } #__ds_done_btn:hover { background: #6A4CE0 !important; transform: scale(1.05); box-shadow: 0 2px 8px rgba(124,92,252,0.4); }';
  document.head.appendChild(macroStyle);
  document.documentElement.classList.add('__dashsnap_macro_recording');

  const getBestSelector = (function() {
    // Session-specific data attributes that change every page load — skip these
    const UNSTABLE = new Set(['data-ved', 'data-csiid', 'data-ei', 'data-jsarwt', 'data-usg',
      'data-lpage', 'data-atf', 'data-frt', 'data-ictx', 'data-surl', 'data-docid', 'data-deferred',
      'data-ri', 'data-tbnid', 'data-cb', 'data-nhd', 'data-lhid', 'data-ctbid', 'data-reactid']);

    // Safely escape a value for use inside a CSS attribute selector: [attr="value"]
    function cssEscapeVal(v) { return v.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"'); }

    function unique(sel) {
      try { return document.querySelectorAll(sel).length === 1; } catch(e) { return false; }
    }

    return function getBestSelector(el) {
      // 0. aria-label — most stable across sessions
      var ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) {
        var sel = '[aria-label="' + cssEscapeVal(ariaLabel) + '"]';
        if (unique(sel)) return { selector: sel, strategy: 'aria-label' };
      }
      // 1. Stable data attributes (skip session-specific ones)
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (attr.name.startsWith('data-') && !UNSTABLE.has(attr.name)) {
          if (attr.value && attr.value.length < 100) {
            var sel = el.tagName.toLowerCase() + '[' + attr.name + '="' + cssEscapeVal(attr.value) + '"]';
            if (unique(sel)) return { selector: sel, strategy: 'data-attr' };
          }
        }
      }
      // 2. ID (skip session-generated IDs)
      if (el.id && !/^[:_]/.test(el.id) && el.id.length < 50) {
        var sel = '#' + CSS.escape(el.id);
        if (unique(sel)) return { selector: sel, strategy: 'id' };
      }
      // 3. name attribute (very stable for form elements)
      var nameAttr = el.getAttribute('name');
      if (nameAttr) {
        var sel = el.tagName.toLowerCase() + '[name="' + cssEscapeVal(nameAttr) + '"]';
        if (unique(sel)) return { selector: sel, strategy: 'name' };
      }
      // 4. role + text content
      var text = (el.textContent || '').trim();
      if (text && text.length < 50) {
        var role = el.getAttribute('role');
        if (role) {
          var sel = '[role="' + role + '"]';
          var matches = [].slice.call(document.querySelectorAll(sel)).filter(function(e) { return (e.textContent||'').trim() === text; });
          if (matches.length === 1) return { selector: sel, strategy: 'role-text' };
        }
        // 5. Links/buttons: use tag + text content as CSS-only approach
        var tag = el.tagName.toLowerCase();
        if (tag === 'a' || tag === 'button') {
          // Try href for links first — more reliable than text matching
          if (tag === 'a' && el.getAttribute('href')) {
            var href = el.getAttribute('href');
            if (href.length < 200) {
              var sel = 'a[href="' + cssEscapeVal(href) + '"]';
              if (unique(sel)) return { selector: sel, strategy: 'href' };
            }
          }
          // Use xpath for text match — most reliable way to match by text
          var sameTag = [].slice.call(document.querySelectorAll(tag)).filter(function(e) { return (e.textContent||'').trim() === text; });
          if (sameTag.length === 1) {
            return { selector: 'xpath://' + tag + '[normalize-space(.)="' + text.replace(/"/g, '\\"') + '"]', strategy: 'text-match' };
          }
        }
      }
      // 6. href for links (if text match didn't work above)
      if (el.tagName === 'A' && el.getAttribute('href')) {
        var href = el.getAttribute('href');
        if (href.length < 200) {
          var sel = 'a[href="' + cssEscapeVal(href) + '"]';
          if (unique(sel)) return { selector: sel, strategy: 'href' };
        }
      }
      // 7. CSS class combo
      if (el.className && typeof el.className === 'string') {
        var classes = el.className.split(/\\s+/).filter(function(c) { return c && !c.startsWith('__'); }).slice(0, 2);
        if (classes.length > 0) {
          var sel = el.tagName.toLowerCase() + '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
          if (unique(sel)) return { selector: sel, strategy: 'css-combo' };
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

  // No longer needed — text is captured via the prompt dialog

  // Banner — pointer-events:auto so Done button is clickable
  const banner = document.createElement('div');
  banner.id = '__dashsnap_macro_banner';
  banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1C1A29;color:#EEEDF5;font:13px system-ui;padding:10px 20px;border-radius:10px;border:2px solid #7C5CFC;pointer-events:auto;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:10px;';
  document.body.appendChild(banner);

  // Highlight
  const highlight = document.createElement('div');
  highlight.id = '__dashsnap_macro_highlight';
  highlight.style.cssText = 'position:fixed;z-index:2147483646;border:2px solid #7C5CFC;background:rgba(124,92,252,0.12);border-radius:3px;pointer-events:none;display:none;transition:all 0.05s ease;';
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
      + '<span style="color:#7C5CFC;font-weight:700">REC</span> '
      + count + ' action' + (count !== 1 ? 's' : '') + ' · '
      + '<span style="font-size:10px;color:#aaa"><kbd style="background:#333;padding:1px 5px;border-radius:3px;font-size:10px">S</kbd> snap element · <kbd style="background:#333;padding:1px 5px;border-radius:3px;font-size:10px">R</kbd> snap region</span> · '
      + '<button id="__ds_done_btn" style="background:#7C5CFC;color:white;border:none;padding:5px 16px;border-radius:6px;font:bold 12px system-ui;cursor:pointer;">Done</button>';
  }
  updateBanner();

  // Tooltip for hovered element
  const tooltip = document.createElement('div');
  tooltip.id = '__dashsnap_macro_tooltip';
  tooltip.style.cssText = 'position:fixed;z-index:2147483647;background:#1C1A29;color:#EEEDF5;font:12px system-ui;padding:6px 10px;border-radius:6px;border:1px solid #7C5CFC;pointer-events:none;display:none;max-width:250px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  document.body.appendChild(tooltip);

  let lastEl = null;
  function onMouseMove(e) {
    var rawEl = e.target;
    if (!rawEl || rawEl === banner || rawEl === highlight || rawEl === tooltip || rawEl.closest('#__dashsnap_macro_banner')) return;
    // Show the interactive ancestor, not the inner div/span
    const el = findInteractiveAncestor(rawEl);
    if (el === lastEl) return;
    lastEl = el;
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    tooltip.textContent = getLabel(el);
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 260) + 'px';
    tooltip.style.top = (e.clientY - 35) + 'px';
  }

  // Scroll tracking (debounced — only records after scrolling stops)
  let scrollTimer = null;
  let lastScrollX = window.scrollX;
  let lastScrollY = window.scrollY;
  function onScroll(e) {
    clearTimeout(scrollTimer);
    const target = e.target;
    scrollTimer = setTimeout(() => {
      if (target === document || target === window || target === document.documentElement) {
        // Page scroll — only record if moved significantly (>20px)
        const newX = window.scrollX;
        const newY = window.scrollY;
        if (Math.abs(newX - lastScrollX) > 20 || Math.abs(newY - lastScrollY) > 20) {
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
    }, 1000);
  }

  // Inline text prompt — replaces the banner with a text input when user clicks a typeable element
  var promptOverlay = null;
  function showTextPrompt(targetEl, actionObj) {
    // Temporarily hide the main recording UI
    banner.style.display = 'none';
    highlight.style.display = 'none';
    tooltip.style.display = 'none';

    var placeholder = '';
    if (targetEl.placeholder) placeholder = targetEl.placeholder;
    else if (targetEl.getAttribute('aria-label')) placeholder = targetEl.getAttribute('aria-label');
    else placeholder = 'Enter text to type...';

    // Inject hover styles
    var promptStyle = document.createElement('style');
    promptStyle.id = '__dashsnap_prompt_style';
    promptStyle.textContent = '#__ds_prompt_ok:hover { background: #6A4CE0 !important; transform: scale(1.03); } #__ds_prompt_cancel:hover { background: #444 !important; color: #eee !important; transform: scale(1.03); } #__ds_prompt_ok, #__ds_prompt_cancel { transition: all 0.15s ease; } #__ds_text_input:focus { border-color: #7C5CFC !important; box-shadow: 0 0 0 2px rgba(124,92,252,0.25); }';
    document.head.appendChild(promptStyle);

    promptOverlay = document.createElement('div');
    promptOverlay.id = '__dashsnap_text_prompt';
    promptOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    promptOverlay.innerHTML = '<div style="background:#1C1A29;border:2px solid #7C5CFC;border-radius:12px;padding:20px 24px;min-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;">'
      + '<div style="color:#EEEDF5;font-size:14px;font-weight:600;margin-bottom:4px;">Type text into: <span style="color:#7C5CFC;">' + (actionObj.label || 'input').substring(0, 40) + '</span></div>'
      + '<div style="color:#888;font-size:11px;margin-bottom:12px;">Use <code style="background:#333;padding:1px 4px;border-radius:3px;">{{variable}}</code> for dynamic values</div>'
      + '<input id="__ds_text_input" type="text" placeholder="' + placeholder.replace(/"/g, '&quot;') + '" style="width:100%;box-sizing:border-box;background:#13111C;border:1px solid #444;color:#EEEDF5;font-size:14px;padding:10px 12px;border-radius:8px;outline:none;margin-bottom:12px;" autofocus />'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '  <button id="__ds_prompt_cancel" style="background:#333;color:#aaa;border:none;padding:8px 16px;border-radius:6px;font:13px system-ui;cursor:pointer;">Skip</button>'
      + '  <button id="__ds_prompt_ok" style="background:#7C5CFC;color:white;border:none;padding:8px 20px;border-radius:6px;font:bold 13px system-ui;cursor:pointer;">Record</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(promptOverlay);

    var input = document.getElementById('__ds_text_input');
    input.focus();

    function finish(confirmed) {
      var textVal = input.value || '';
      promptOverlay.remove();
      promptOverlay = null;
      if (promptStyle.parentNode) promptStyle.remove();
      banner.style.display = 'flex';

      if (confirmed && textVal) {
        actionObj.value = textVal;
        actionObj.label = 'Type: "' + textVal.substring(0, 30) + '"';
        window.__dashsnap_macro_actions.push(actionObj);
        // Always record Enter after typing
        window.__dashsnap_macro_actions.push({
          action: 'key',
          key: 'Enter',
          selector: actionObj.selector,
          selectorStrategy: actionObj.selectorStrategy,
          fallbackXY: actionObj.fallbackXY,
          label: 'Press Enter',
        });

        // Signal the main process to type text + press Enter using trusted input events
        // Store the pending action so the polling loop can pick it up
        window.__dashsnap_macro_pending_type = {
          selector: actionObj.selector,
          text: textVal,
          pressEnter: true,
        };

      } else if (confirmed) {
        actionObj.action = 'click';
        actionObj.label = 'Click: ' + (actionObj.label || 'input');
        window.__dashsnap_macro_actions.push(actionObj);
      }
      updateBanner();
    }

    document.getElementById('__ds_prompt_ok').addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      finish(true);
    });
    document.getElementById('__ds_prompt_cancel').addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    });
    input.addEventListener('keydown', function(ev) {
      ev.stopPropagation(); // Prevent overlay's onKeyDown from seeing it
      if (ev.key === 'Enter') {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    });
  }

  // Walk up from the clicked element to find the nearest meaningful/interactive element
  function findInteractiveAncestor(el) {
    var current = el;
    var interactiveTags = ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'LABEL'];
    // Walk up max 5 levels to find an interactive ancestor
    for (var i = 0; i < 5 && current && current !== document.body; i++) {
      if (interactiveTags.includes(current.tagName)) return current;
      if (current.getAttribute('role') === 'button' || current.getAttribute('role') === 'link' ||
          current.getAttribute('role') === 'tab' || current.getAttribute('role') === 'menuitem') return current;
      if (current.onclick || current.getAttribute('tabindex')) return current;
      current = current.parentElement;
    }
    // No interactive ancestor found — check if original element has a good selector
    var { selector } = getBestSelector(el);
    if (selector) return el;
    // Try parents for better selectors
    current = el.parentElement;
    for (var i = 0; i < 3 && current && current !== document.body; i++) {
      var { selector } = getBestSelector(current);
      if (selector) return current;
      current = current.parentElement;
    }
    return el; // give up, use original
  }

  function onClick(e) {
    var rawEl = e.target;
    if (!rawEl || rawEl === highlight) return;
    // Ignore clicks while text prompt is open
    if (promptOverlay) return;
    // Ignore clicks while automated typing is in progress
    if (window.__dashsnap_macro_typing) return;
    // Done button or banner click = finish recording
    if (rawEl.id === '__ds_done_btn' || rawEl === banner || rawEl.closest('#__dashsnap_macro_banner')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.__dashsnap_macro_actions.length > 0) {
        window.__dashsnap_macro_done = true;
        cleanup();
      } else {
        banner.style.borderColor = '#EF4444';
        banner.style.transition = 'border-color 0.3s';
        setTimeout(function() { banner.style.borderColor = '#7C5CFC'; }, 800);
      }
      return;
    }

    // Walk up to find the real interactive element (not a generic div/span wrapper)
    const el = findInteractiveAncestor(rawEl);
    // Let click go through to the page
    const { selector, strategy } = getBestSelector(el);
    const label = getLabel(el);
    const rect = el.getBoundingClientRect();
    const meta = getElementMeta(el);
    const actionType = isTypeable(el) ? 'type' : (el.tagName === 'SELECT' ? 'select' : 'click');

    var actionObj = {
      selector: selector,
      selectorStrategy: strategy,
      fallbackXY: [Math.round(rect.left + rect.width/2), Math.round(rect.top + rect.height/2)],
      label: label,
      action: actionType,
      value: '',
      elementMeta: meta,
    };

    // If typeable, show a prompt for the user to enter the text value
    if (actionType === 'type') {
      flashElement(el);
      // Show inline text prompt
      showTextPrompt(el, actionObj);
      return; // Don't push yet — the prompt callback will push it
    }

    window.__dashsnap_macro_actions.push(actionObj);
    // Immediately log action so main process can capture it via console-message
    // (prevents loss when click triggers navigation before poll sync)
    console.log('__DASHSNAP_ACTION__' + JSON.stringify(actionObj));
    flashElement(el);
    updateBanner();
  }

  // Capture select/dropdown changes
  function onSelectChange(e) {
    var el = e.target;
    if (!el || el.tagName !== 'SELECT') return;
    // Find the last action for this element and update its value
    var actions = window.__dashsnap_macro_actions;
    for (var i = actions.length - 1; i >= 0; i--) {
      if (actions[i].action === 'select' && actions[i].selector) {
        var match = document.querySelector(actions[i].selector);
        if (match === el) {
          actions[i].value = el.value;
          var selectedText = el.options[el.selectedIndex] ? el.options[el.selectedIndex].textContent.trim() : el.value;
          actions[i].label = 'Select: ' + selectedText;
          updateBanner();
          break;
        }
      }
    }
  }

  function onKeyDown(e) {
    // S key = snapshot hovered element (skip if typing in an input)
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var active = document.activeElement;
      var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true');
      if (!isInput && lastEl && lastEl !== highlight && lastEl !== tooltip && lastEl !== banner && !lastEl.closest('#__dashsnap_macro_banner')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var rect = lastEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          window.__dashsnap_macro_actions.push({
            action: 'snap',
            label: 'Snap: ' + getLabel(lastEl),
            snapRegion: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
          });
          flashElement(lastEl);
          updateBanner();
        }
        return;
      }
    }
    // R key = snapshot drawn region (skip if typing)
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var active = document.activeElement;
      var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true');
      if (!isInput) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Temporarily hide macro overlay, show snap region drawer
        highlight.style.display = 'none';
        tooltip.style.display = 'none';
        banner.style.display = 'none';
        // Inline region drawer
        var canvas = document.createElement('canvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;cursor:crosshair;';
        document.body.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        var sx = 0, sy = 0, drawing = false;
        canvas.addEventListener('mousedown', function(ev) { sx = ev.clientX; sy = ev.clientY; drawing = true; });
        canvas.addEventListener('mousemove', function(ev) {
          if (!drawing) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          var rx = Math.min(sx, ev.clientX), ry = Math.min(sy, ev.clientY);
          var rw = Math.abs(ev.clientX - sx), rh = Math.abs(ev.clientY - sy);
          ctx.clearRect(rx, ry, rw, rh);
          ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.setLineDash([6,3]);
          ctx.strokeRect(rx, ry, rw, rh);
        });
        canvas.addEventListener('mouseup', function(ev) {
          if (!drawing) return;
          drawing = false;
          var rx = Math.min(sx, ev.clientX), ry = Math.min(sy, ev.clientY);
          var rw = Math.abs(ev.clientX - sx), rh = Math.abs(ev.clientY - sy);
          canvas.remove();
          banner.style.display = 'flex';
          if (rw >= 10 && rh >= 10) {
            window.__dashsnap_macro_actions.push({
              action: 'snap',
              label: 'Snap region ' + rw + 'x' + rh,
              snapRegion: { x: Math.round(rx), y: Math.round(ry), width: Math.round(rw), height: Math.round(rh) },
            });
            updateBanner();
          }
        });
        return;
      }
    }
    // Enter key — finish recording (unless prompt is open or focus is in a page input)
    if (e.key === 'Enter') {
      if (promptOverlay) return; // Prompt handles its own Enter
      var active = document.activeElement;
      var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true');
      if (isInput) return; // Let Enter go through to the page normally
      // Enter on body = finish recording
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.__dashsnap_macro_actions.length > 0) {
        window.__dashsnap_macro_done = true;
        cleanup();
      }
    }
    if (e.key === 'Escape') {
      window.__dashsnap_macro_cancelled = true;
      cleanup();
    }
  }

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('change', onSelectChange, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('scroll', onScroll, true);

  function cleanup() {
    if (promptOverlay) { promptOverlay.remove(); promptOverlay = null; }
    clearTimeout(scrollTimer);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('change', onSelectChange, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('scroll', onScroll, true);
    banner.remove();
    highlight.remove();
    tooltip.remove();
    document.documentElement.classList.remove('__dashsnap_macro_recording');
    if (macroStyle.parentNode) macroStyle.remove();
    window.__dashsnap_macro_active = false;
  }

  window.__dashsnap_macro_cleanup = cleanup;
})();
`;

export class Recorder {
  private view: BrowserView;
  private window: BrowserWindow;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private _macroNavHandler: (() => void) | null = null;
  private _macroWillNavHandler: ((_e: Electron.Event, url: string) => void) | null = null;
  private _macroConsoleHandler: ((_e: Electron.Event, level: number, message: string) => void) | null = null;
  private _macroStartUrl: string = '';
  private _macroAccumulatedActions: unknown[] = [];  // Actions preserved across navigations
  private _lastSyncedCount: number = 0;

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
    this._macroStartUrl = this.view.webContents.getURL();
    this._macroAccumulatedActions = [];
    this._lastSyncedCount = 0;
    await this.view.webContents.executeJavaScript(MACRO_OVERLAY_JS);

    // Real-time action capture via console.log — catches actions even if navigation
    // destroys the page before the poll loop can read them
    this._macroConsoleHandler = (_e: Electron.Event, _level: number, message: string) => {
      if (message.startsWith('__DASHSNAP_ACTION__')) {
        try {
          const action = JSON.parse(message.substring('__DASHSNAP_ACTION__'.length));
          // Only append if this is a new action (check by comparing length)
          const isDuplicate = this._macroAccumulatedActions.some(
            (a: any) => a.selector === action.selector && a.action === action.action && a.label === action.label
              && JSON.stringify(a.fallbackXY) === JSON.stringify(action.fallbackXY)
          );
          if (!isDuplicate) {
            this._macroAccumulatedActions.push(action);
            this._lastSyncedCount = this._macroAccumulatedActions.length;
            console.log('[Macro] Real-time capture:', action.action, action.label, '| selector:', action.selector || 'XY fallback');
          }
        } catch { /* parse error, ignore */ }
      }
    };
    this.view.webContents.on('console-message', this._macroConsoleHandler);

    this._macroNavHandler = () => {
      // Re-inject overlay on new page after navigation completes
      setTimeout(() => {
        this.view.webContents.executeJavaScript(MACRO_OVERLAY_JS).catch(() => {});
        // Restore accumulated actions into the new page's overlay (REPLACE, don't concat — avoids duplicates)
        if (this._macroAccumulatedActions.length > 0) {
          const serialized = JSON.stringify(this._macroAccumulatedActions);
          setTimeout(() => {
            this.view.webContents.executeJavaScript(`
              if (window.__dashsnap_macro_actions !== undefined) {
                window.__dashsnap_macro_actions = ${serialized};
              }
            `).catch(() => {});
          }, 300);
        }
      }, 800);
    };
    this.view.webContents.on('did-navigate', this._macroNavHandler);
    this.view.webContents.on('did-navigate-in-page', this._macroNavHandler);
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
          // Read final actions from the page (most complete snapshot)
          const finalPageActions = await this.view.webContents.executeJavaScript(
            'JSON.parse(JSON.stringify(window.__dashsnap_macro_actions))'
          ).catch(() => []);
          // Use whichever has more actions: the final page read or our accumulated copy
          const allActions = (finalPageActions && finalPageActions.length >= this._macroAccumulatedActions.length)
            ? finalPageActions
            : this._macroAccumulatedActions;
          this._macroAccumulatedActions = [];
          const startUrl = this._macroStartUrl || this.view.webContents.getURL();
          await this.view.webContents.executeJavaScript(`
            window.__dashsnap_macro_done = false;
            window.__dashsnap_macro_actions = [];
          `).catch(() => {});
          this.window.webContents.send('recorder:macro-recorded', allActions, startUrl);
          return;
        }

        // Check for pending type action — the overlay signals us to type text using trusted events
        const pendingType = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_macro_pending_type ? JSON.parse(JSON.stringify(window.__dashsnap_macro_pending_type)) : null'
        );
        if (pendingType) {
          await this.view.webContents.executeJavaScript('window.__dashsnap_macro_pending_type = null;');
          await this.executeTrustedType(pendingType.selector, pendingType.text, pendingType.pressEnter);
        }

        // Continuously sync actions from the page to main process
        // Only update if page has MORE actions than our accumulated copy (avoids losing real-time captured ones)
        const currentActions = await this.view.webContents.executeJavaScript(
          'window.__dashsnap_macro_actions ? JSON.parse(JSON.stringify(window.__dashsnap_macro_actions)) : null'
        );
        if (currentActions && currentActions.length > this._macroAccumulatedActions.length) {
          this._macroAccumulatedActions = currentActions;
          this._lastSyncedCount = currentActions.length;
        }
      } catch {
        // Page may have navigated — accumulated actions are safe in main process
      }
    }, 200);
  }

  /**
   * Type text into a page element using trusted Electron input events,
   * then press Enter. Called from the polling loop when the overlay signals
   * a pending type action.
   */
  private async executeTrustedType(selector: string, text: string, pressEnter: boolean) {
    const wc = this.view.webContents;
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Set flag so overlay ignores focus — no click, just focus
    await wc.executeJavaScript('window.__dashsnap_macro_typing = true;').catch(() => {});

    if (selector) {
      await wc.executeJavaScript(`
        (function() {
          var el = document.querySelector(${JSON.stringify(selector)});
          if (el) el.focus();
        })()
      `).catch(() => {});
    }
    await delay(300);

    // Re-check focus (Google may swap input→textarea)
    await wc.executeJavaScript(`
      (function() {
        var el = document.activeElement;
        if (!el || el === document.body) {
          el = document.querySelector(${JSON.stringify(selector)});
          if (el) el.focus();
        }
      })()
    `).catch(() => {});
    await delay(200);

    // Type each character using trusted sendInputEvent
    for (const char of text) {
      wc.sendInputEvent({ type: 'char', keyCode: char });
      await delay(40);
    }
    await delay(300);

    if (pressEnter) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    }

    // Clear the typing flag so overlay resumes normal click handling
    await delay(500);
    await wc.executeJavaScript('window.__dashsnap_macro_typing = false;').catch(() => {});
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this._macroConsoleHandler) {
      this.view.webContents.removeListener('console-message', this._macroConsoleHandler);
      this._macroConsoleHandler = null;
    }
    if (this._macroWillNavHandler) {
      this.view.webContents.removeListener('will-navigate', this._macroWillNavHandler);
      this._macroWillNavHandler = null;
    }
    if (this._macroNavHandler) {
      this.view.webContents.removeListener('did-navigate', this._macroNavHandler);
      this.view.webContents.removeListener('did-navigate-in-page', this._macroNavHandler);
      this._macroNavHandler = null;
    }
    this._macroAccumulatedActions = [];
    this._lastSyncedCount = 0;
  }
}
