(function (root) {
  'use strict';

  root.AD_esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  root.AD_loadEntries = function () {
    return fetch(root.AD_BASE + '/data/entries.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); });
  };

  root.AD_formulaHtml = function (src) {
    var out = root.AD_esc(src);
    out = out.replace(/\^\{([^}]*)\}/g, function (m, x) { return '<sup>' + x + '</sup>'; });
    out = out.replace(/_\{([^}]*)\}/g, function (m, x) { return '<sub>' + x + '</sub>'; });
    return out;
  };

  root.AD_symHtml = function (sym) {
    return root.AD_formulaHtml(sym);
  };

  root.AD_values = function (block, params, der) {
    return (block.show || []).map(function (s) {
      var raw = s.der ? der[s.der] : params[s.key];
      var text;
      if (Array.isArray(raw)) {
        text = raw.map(function (v) { return root.AD_num(v, s.digits); }).join('  ');
      } else if (raw === Infinity) {
        text = '∞';
      } else {
        text = root.AD_num(raw, s.digits);
      }
      return { sym: s.sym, text: text, unit: s.unit || '' };
    });
  };

  root.AD_valuesHtml = function (block, params, der) {
    return root.AD_values(block, params, der).map(function (v) {
      return '<span class="val"><b>' + root.AD_symHtml(v.sym) + '</b> = ' +
        root.AD_esc(v.text) + (v.unit ? ' <i>' + root.AD_esc(v.unit) + '</i>' : '') + '</span>';
    }).join('');
  };

  root.AD_buildControls = function (host, entry, params, onChange) {
    host.innerHTML = '';
    var refresh = [];
    entry.controls.forEach(function (c) {
      var wrap = document.createElement('div');
      wrap.className = 'ctl';
      var label = document.createElement('label');
      var name = document.createElement('span');
      name.setAttribute('data-i18n', c.labelToken);
      var value = document.createElement('var');
      label.appendChild(name);
      label.appendChild(value);
      var input = document.createElement('input');
      input.type = 'range';
      input.min = c.min; input.max = c.max; input.step = c.step;
      input.value = params[c.key];
      function show() {
        var digits = c.step >= 1 ? 0 : String(c.step).split('.')[1].length;
        value.textContent = root.AD_num(Number(input.value), digits) + (c.unit ? ' ' + c.unit : '');
      }
      input.addEventListener('input', function () {
        params[c.key] = Number(input.value);
        show();
        onChange(params, c.key, 'preview');
      });
      input.addEventListener('change', function () {
        params[c.key] = Number(input.value);
        show();
        onChange(params, c.key, 'commit');
      });
      show();
      refresh.push(show);
      wrap.appendChild(label);
      wrap.appendChild(input);
      host.appendChild(wrap);
      root.AD_applyI18n(wrap);
    });
    root.AD_onLangChange(function () { refresh.forEach(function (f) { f(); }); });
  };

  root.AD_applyParams = function (ctrl, params, phase) {
    ctrl.setParams(params);
    if (!ctrl.preview) return;
    if (phase === 'preview') ctrl.preview(true);
    else if (phase === 'commit') ctrl.preview(false);
  };

  root.AD_figure = function (entry) {
    return (root.AD_FIGURES || {})[entry.figure];
  };

  root.AD_bindStage = function (canvas, ctrl) {
    var ro = new ResizeObserver(function () { ctrl.resize(); });
    ro.observe(canvas.parentElement || canvas);
    function point(ev) {
      var r = canvas.getBoundingClientRect();
      var dpr = canvas.width / r.width;
      ctrl.setPointer({
        x: (ev.clientX - r.left) * dpr, y: (ev.clientY - r.top) * dpr,
        pressed: ev.buttons > 0 || ev.type === 'pointerdown'
      });
    }
    function release() { ctrl.setPointer(null); }
    canvas.addEventListener('pointermove', point);
    canvas.addEventListener('pointerdown', point);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', release);
    return function () { ro.disconnect(); };
  };
})(window);
