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
    function cssEscapeVal(v) { return v.replace(/"/g, '\\"'); }
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
    function cssEscapeVal(v) { return v.replace(/"/g, '\\"'); }
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
// Intercept-then-replay recorder: a transparent overlay catches every click,
// records the element underneath via elementFromPoint, then programmatically
// replays the full event sequence to the real element. No event listener
// conflicts, no dedup needed — one interception = one action, guaranteed.
const MACRO_OVERLAY_JS = `
(function() {
  if (window.__dashsnap_macro_active) return;
  window.__dashsnap_macro_active = true;
  window.__dashsnap_macro_done = false;
  window.__dashsnap_macro_cancelled = false;
  window.__dashsnap_macro_actions = [];

  const macroStyle = document.createElement('style');
  macroStyle.id = '__dashsnap_macro_style';
  macroStyle.textContent = '#__ds_done_btn { transition: all 0.15s ease; } #__ds_done_btn:hover { background: #6A4CE0 !important; transform: scale(1.05); box-shadow: 0 2px 8px rgba(124,92,252,0.4); }';
  document.head.appendChild(macroStyle);

  ${/* Shared utilities — getBestSelector, getLabel, getElementMeta, isTypeable */''}
  const getBestSelector = (function() {
    const UNSTABLE = new Set(['data-ved', 'data-csiid', 'data-ei', 'data-jsarwt', 'data-usg',
      'data-lpage', 'data-atf', 'data-frt', 'data-ictx', 'data-surl', 'data-docid', 'data-deferred',
      'data-ri', 'data-tbnid', 'data-cb', 'data-nhd', 'data-lhid', 'data-ctbid', 'data-reactid']);
    function cssEscapeVal(v) { return v.replace(/"/g, '\\\\"'); }
    function unique(sel) {
      try { return document.querySelectorAll(sel).length === 1; } catch(e) { return false; }
    }
    return function getBestSelector(el) {
      var ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) {
        var sel = '[aria-label="' + cssEscapeVal(ariaLabel) + '"]';
        if (unique(sel)) return { selector: sel, strategy: 'aria-label' };
      }
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (attr.name.startsWith('data-') && !UNSTABLE.has(attr.name)) {
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
      var nameAttr = el.getAttribute('name');
      if (nameAttr) {
        var sel = el.tagName.toLowerCase() + '[name="' + cssEscapeVal(nameAttr) + '"]';
        if (unique(sel)) return { selector: sel, strategy: 'name' };
      }
      var text = (el.textContent || '').trim();
      if (text && text.length < 50) {
        var role = el.getAttribute('role');
        if (role) {
          var sel = '[role="' + role + '"]';
          var matches = [].slice.call(document.querySelectorAll(sel)).filter(function(e) { return (e.textContent||'').trim() === text; });
          if (matches.length === 1) return { selector: sel, strategy: 'role-text' };
        }
        var tag = el.tagName.toLowerCase();
        if (tag === 'a' || tag === 'button') {
          if (tag === 'a' && el.getAttribute('href')) {
            var href = el.getAttribute('href');
            if (href.length < 200) {
              var sel = 'a[href="' + cssEscapeVal(href) + '"]';
              if (unique(sel)) return { selector: sel, strategy: 'href' };
            }
          }
          var sameTag = [].slice.call(document.querySelectorAll(tag)).filter(function(e) { return (e.textContent||'').trim() === text; });
          if (sameTag.length === 1) {
            return { selector: 'xpath://' + tag + '[normalize-space(.)="' + text.replace(/"/g, '\\\\"') + '"]', strategy: 'text-match' };
          }
        }
      }
      if (el.tagName === 'A' && el.getAttribute('href')) {
        var href = el.getAttribute('href');
        if (href.length < 200) {
          var sel = 'a[href="' + cssEscapeVal(href) + '"]';
          if (unique(sel)) return { selector: sel, strategy: 'href' };
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
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    var text = (el.textContent || '').trim().substring(0, 30);
    return text || el.tagName.toLowerCase();
  }

  function getElementMeta(el) {
    var meta = { tagName: el.tagName.toLowerCase() };
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      meta.inputType = el.type || 'text';
      if (el.placeholder) meta.placeholder = el.placeholder;
    }
    if (el.tagName === 'SELECT') {
      meta.options = [].slice.call(el.options).map(function(o) { return o.textContent.trim(); }).slice(0, 20);
    }
    return meta;
  }

  function isTypeable(el) {
    var tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      var t = (el.type || 'text').toLowerCase();
      return ['text','search','email','tel','url','number','password'].indexOf(t) >= 0;
    }
    if (el.contentEditable === 'true') return true;
    return false;
  }

  // --- UI elements ---
  var banner = document.createElement('div');
  banner.id = '__dashsnap_macro_banner';
  banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1C1A29;color:#EEEDF5;font:13px system-ui;padding:10px 20px;border-radius:10px;border:2px solid #7C5CFC;pointer-events:auto;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:10px;';
  document.body.appendChild(banner);

  var highlight = document.createElement('div');
  highlight.id = '__dashsnap_macro_highlight';
  highlight.style.cssText = 'position:fixed;z-index:2147483645;border:2px solid #7C5CFC;background:rgba(124,92,252,0.12);border-radius:3px;pointer-events:none;display:none;transition:all 0.05s ease;';
  document.body.appendChild(highlight);

  var tooltip = document.createElement('div');
  tooltip.id = '__dashsnap_macro_tooltip';
  tooltip.style.cssText = 'position:fixed;z-index:2147483647;background:#1C1A29;color:#EEEDF5;font:12px system-ui;padding:6px 10px;border-radius:6px;border:1px solid #7C5CFC;pointer-events:none;display:none;max-width:250px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  document.body.appendChild(tooltip);

  // Full-screen transparent click interceptor — catches ALL clicks reliably
  var clickShield = document.createElement('div');
  clickShield.id = '__dashsnap_click_shield';
  clickShield.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;cursor:crosshair;background:transparent;';
  document.body.appendChild(clickShield);

  function flashElement(el) {
    var flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;z-index:2147483645;background:rgba(34,211,238,0.3);border:2px solid #22D3EE;border-radius:3px;pointer-events:none;transition:opacity 0.5s;';
    var rect = el.getBoundingClientRect();
    flash.style.left = rect.left + 'px';
    flash.style.top = rect.top + 'px';
    flash.style.width = rect.width + 'px';
    flash.style.height = rect.height + 'px';
    document.body.appendChild(flash);
    setTimeout(function() { flash.style.opacity = '0'; }, 100);
    setTimeout(function() { flash.remove(); }, 600);
  }

  function updateBanner() {
    var count = window.__dashsnap_macro_actions.length;
    banner.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#EF4444;animation:pulse 1s infinite;display:inline-block"></span> '
      + '<span style="color:#7C5CFC;font-weight:700">REC</span> '
      + count + ' action' + (count !== 1 ? 's' : '') + ' \\u00b7 '
      + '<span style="font-size:10px;color:#aaa"><kbd style="background:#333;padding:1px 5px;border-radius:3px;font-size:10px">S</kbd> snap element \\u00b7 <kbd style="background:#333;padding:1px 5px;border-radius:3px;font-size:10px">R</kbd> snap region</span> \\u00b7 '
      + '<button id="__ds_done_btn" style="background:#7C5CFC;color:white;border:none;padding:5px 16px;border-radius:6px;font:bold 12px system-ui;cursor:pointer;">Done</button>';
  }
  updateBanner();

  // --- Hover tracking (on the shield, resolve element underneath) ---
  var lastEl = null;
  var lastClientX = 0, lastClientY = 0;

  clickShield.addEventListener('mousemove', function(e) {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    // Temporarily hide shield to find the real element underneath
    clickShield.style.pointerEvents = 'none';
    highlight.style.display = 'none';
    var el = document.elementFromPoint(e.clientX, e.clientY);
    clickShield.style.pointerEvents = 'auto';
    if (!el || el === banner || el === highlight || el === tooltip || (el.closest && el.closest('#__dashsnap_macro_banner'))) {
      highlight.style.display = 'none';
      tooltip.style.display = 'none';
      lastEl = null;
      return;
    }
    if (el === lastEl) {
      // Still update tooltip position even if same element
      tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 260) + 'px';
      tooltip.style.top = (e.clientY - 35) + 'px';
      return;
    }
    lastEl = el;
    var rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    tooltip.textContent = getLabel(el);
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 260) + 'px';
    tooltip.style.top = (e.clientY - 35) + 'px';
  });

  // --- Click interception: record element, then replay click to real element ---
  clickShield.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Resolve the real element under the click
    clickShield.style.pointerEvents = 'none';
    highlight.style.display = 'none';
    var el = document.elementFromPoint(e.clientX, e.clientY);
    clickShield.style.pointerEvents = 'auto';

    if (!el) return;

    // Done button click
    if (el.id === '__ds_done_btn' || el === banner || (el.closest && el.closest('#__dashsnap_macro_banner'))) {
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

    if (promptOverlay) return;

    // Record the element
    var rect = el.getBoundingClientRect();
    var cx = Math.round(rect.left + rect.width/2);
    var cy = Math.round(rect.top + rect.height/2);
    var info = getBestSelector(el);
    var label = getLabel(el);
    var meta = getElementMeta(el);
    var actionType = isTypeable(el) ? 'type' : (el.tagName === 'SELECT' ? 'select' : 'click');

    var actionObj = {
      selector: info.selector,
      selectorStrategy: info.strategy,
      fallbackXY: [cx, cy],
      label: label,
      action: actionType,
      value: '',
      elementMeta: meta,
    };

    if (actionType === 'type') {
      flashElement(el);
      showTextPrompt(el, actionObj);
      return;
    }

    window.__dashsnap_macro_actions.push(actionObj);
    console.log('__DASHSNAP_ACTION__' + JSON.stringify(actionObj));
    flashElement(el);
    updateBanner();

    // Replay the full event sequence to the real element
    var evtOpts = { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', evtOpts));
    el.dispatchEvent(new MouseEvent('mousedown', evtOpts));
    el.dispatchEvent(new PointerEvent('pointerup', evtOpts));
    el.dispatchEvent(new MouseEvent('mouseup', evtOpts));
    el.click();
    // Focus the element if it's focusable (inputs, buttons, links)
    if (el.focus) try { el.focus(); } catch(ex) {}
  });

  // --- Scroll tracking ---
  var scrollTimer = null;
  var lastScrollX = window.scrollX;
  var lastScrollY = window.scrollY;
  function onScroll(e) {
    clearTimeout(scrollTimer);
    var target = e.target;
    scrollTimer = setTimeout(function() {
      if (target === document || target === window || target === document.documentElement) {
        var newX = window.scrollX;
        var newY = window.scrollY;
        if (Math.abs(newX - lastScrollX) > 20 || Math.abs(newY - lastScrollY) > 20) {
          var scrollAction = {
            action: 'scroll',
            label: 'Page scroll to (' + Math.round(newX) + ', ' + Math.round(newY) + ')',
            scrollTarget: { x: Math.round(newX), y: Math.round(newY), isPage: true },
          };
          window.__dashsnap_macro_actions.push(scrollAction);
          console.log('__DASHSNAP_ACTION__' + JSON.stringify(scrollAction));
          lastScrollX = newX;
          lastScrollY = newY;
          updateBanner();
        }
      } else if (target && target.nodeType === 1) {
        var sInfo = getBestSelector(target);
        var rect = target.getBoundingClientRect();
        var elScrollAction = {
          action: 'scroll',
          selector: sInfo.selector,
          selectorStrategy: sInfo.strategy,
          fallbackXY: [Math.round(rect.left + rect.width/2), Math.round(rect.top + rect.height/2)],
          label: 'Scroll: ' + getLabel(target),
          scrollTarget: { x: Math.round(target.scrollLeft), y: Math.round(target.scrollTop), isPage: false },
        };
        window.__dashsnap_macro_actions.push(elScrollAction);
        console.log('__DASHSNAP_ACTION__' + JSON.stringify(elScrollAction));
        updateBanner();
      }
    }, 1000);
  }

  // --- Text prompt ---
  var promptOverlay = null;
  function showTextPrompt(targetEl, actionObj) {
    banner.style.display = 'none';
    highlight.style.display = 'none';
    tooltip.style.display = 'none';
    clickShield.style.display = 'none';

    var placeholder = '';
    if (targetEl.placeholder) placeholder = targetEl.placeholder;
    else if (targetEl.getAttribute('aria-label')) placeholder = targetEl.getAttribute('aria-label');
    else placeholder = 'Enter text to type...';

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
      clickShield.style.display = 'block';

      if (confirmed && textVal) {
        actionObj.value = textVal;
        actionObj.label = 'Type: "' + textVal.substring(0, 30) + '"';
        window.__dashsnap_macro_actions.push(actionObj);
        window.__dashsnap_macro_actions.push({
          action: 'key',
          key: 'Enter',
          selector: actionObj.selector,
          selectorStrategy: actionObj.selectorStrategy,
          fallbackXY: actionObj.fallbackXY,
          label: 'Press Enter',
        });
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
      ev.preventDefault(); ev.stopPropagation(); finish(true);
    });
    document.getElementById('__ds_prompt_cancel').addEventListener('click', function(ev) {
      ev.preventDefault(); ev.stopPropagation(); finish(false);
    });
    input.addEventListener('keydown', function(ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
  }

  // --- Keyboard shortcuts ---
  function onKeyDown(e) {
    if (promptOverlay) return;

    // S key = snapshot hovered element
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var active = document.activeElement;
      var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true');
      if (!isInput && lastEl) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var rect = lastEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          var snapAction = {
            action: 'snap',
            label: 'Snap: ' + getLabel(lastEl),
            snapRegion: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
          };
          window.__dashsnap_macro_actions.push(snapAction);
          console.log('__DASHSNAP_ACTION__' + JSON.stringify(snapAction));
          flashElement(lastEl);
          updateBanner();
        }
        return;
      }
    }

    // R key = snapshot drawn region
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var active = document.activeElement;
      var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true');
      if (!isInput) {
        e.preventDefault();
        e.stopImmediatePropagation();
        highlight.style.display = 'none';
        tooltip.style.display = 'none';
        banner.style.display = 'none';
        clickShield.style.display = 'none';
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
          clickShield.style.display = 'block';
          if (rw >= 10 && rh >= 10) {
            var regionAction = {
              action: 'snap',
              label: 'Snap region ' + rw + 'x' + rh,
              snapRegion: { x: Math.round(rx), y: Math.round(ry), width: Math.round(rw), height: Math.round(rh) },
            };
            window.__dashsnap_macro_actions.push(regionAction);
            console.log('__DASHSNAP_ACTION__' + JSON.stringify(regionAction));
            updateBanner();
          }
        });
        return;
      }
    }

    // Enter = finish recording
    if (e.key === 'Enter') {
      var active = document.activeElement;
      var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true');
      if (isInput) return;
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

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('scroll', onScroll, true);

  function cleanup() {
    if (promptOverlay) { promptOverlay.remove(); promptOverlay = null; }
    clearTimeout(scrollTimer);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('scroll', onScroll, true);
    banner.remove();
    highlight.remove();
    tooltip.remove();
    clickShield.remove();
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
  private _macroConsoleHandler: ((_e: Electron.Event, level: number, message: string) => void) | null = null;
  private _macroStartUrl: string = '';
  private _macroAccumulatedActions: unknown[] = [];

  constructor(view: BrowserView, window: BrowserWindow) {
    this.view = view;
    this.window = window;
  }

  /** Start element-picker recording (used by click, snap, hover, select, type, scroll-element) */
  private async startElementPicker() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(CLICK_OVERLAY_JS);
    this.pollForClickResult();
  }

  async startClickRecording() { return this.startElementPicker(); }
  async startSnapRecording() { return this.startElementPicker(); }
  async startHoverRecording() { return this.startElementPicker(); }
  async startSelectRecording() { return this.startElementPicker(); }
  async startTypeRecording() { return this.startElementPicker(); }
  async startScrollElementRecording() { return this.startElementPicker(); }

  async startFilterRecording() {
    this.stopPolling();
    await this.view.webContents.executeJavaScript(FILTER_OVERLAY_JS);
    this.pollForFilterResult();
  }

  async startMacroRecording() {
    this.stopPolling();
    this._macroStartUrl = this.view.webContents.getURL();
    this._macroAccumulatedActions = [];
    await this.view.webContents.executeJavaScript(MACRO_OVERLAY_JS);

    // Real-time action capture via console.log — catches actions even if navigation
    // destroys the page before the poll loop can read them
    this._macroConsoleHandler = (_e: Electron.Event, _level: number, message: string) => {
      if (message.startsWith('__DASHSNAP_ACTION__')) {
        try {
          const action = JSON.parse(message.substring('__DASHSNAP_ACTION__'.length));
          // Simply append — the page-side dedup already prevents true duplicates.
          // Using length-based sync: only append if this would be a new entry.
          const pageCount = this._macroAccumulatedActions.length;
          this._macroAccumulatedActions.push(action);
          console.log('[Macro] Real-time capture #' + (pageCount + 1) + ':', action.action, action.label, '| selector:', action.selector || 'none');
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
        // Single JS call to read all state at once — avoids race conditions from multiple round-trips
        const state = await this.view.webContents.executeJavaScript(`
          (function() {
            return {
              cancelled: window.__dashsnap_macro_cancelled || false,
              done: window.__dashsnap_macro_done || false,
              pendingType: window.__dashsnap_macro_pending_type ? JSON.parse(JSON.stringify(window.__dashsnap_macro_pending_type)) : null,
              actions: window.__dashsnap_macro_actions ? JSON.parse(JSON.stringify(window.__dashsnap_macro_actions)) : null,
            };
          })()
        `);

        if (state.cancelled) {
          this.stopPolling();
          await this.view.webContents.executeJavaScript('window.__dashsnap_macro_cancelled = false;').catch(() => {});
          this.window.webContents.send('recorder:cancelled');
          return;
        }

        if (state.done) {
          this.stopPolling();
          const allActions = (state.actions && state.actions.length >= this._macroAccumulatedActions.length)
            ? state.actions
            : this._macroAccumulatedActions;
          this._macroAccumulatedActions = [];
          const startUrl = this._macroStartUrl || this.view.webContents.getURL();
          await this.view.webContents.executeJavaScript('window.__dashsnap_macro_done = false; window.__dashsnap_macro_actions = [];').catch(() => {});
          this.window.webContents.send('recorder:macro-recorded', allActions, startUrl);
          return;
        }

        if (state.pendingType) {
          await this.view.webContents.executeJavaScript('window.__dashsnap_macro_pending_type = null;').catch(() => {});
          await this.executeTrustedType(state.pendingType.selector, state.pendingType.text, state.pendingType.pressEnter);
        }

        // Sync actions — only update if page has more than our accumulated copy
        if (state.actions && state.actions.length > this._macroAccumulatedActions.length) {
          this._macroAccumulatedActions = state.actions;
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
    if (this._macroNavHandler) {
      this.view.webContents.removeListener('did-navigate', this._macroNavHandler);
      this.view.webContents.removeListener('did-navigate-in-page', this._macroNavHandler);
      this._macroNavHandler = null;
    }
    this._macroAccumulatedActions = [];
  }
}
