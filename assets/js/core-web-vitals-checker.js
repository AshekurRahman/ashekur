/* Free Core Web Vitals Checker — drives the form on
   /tools/core-web-vitals-checker/, posts to core-web-vitals-checker.php, and
   renders the structured JSON report. No framework, vanilla JS, matches
   elementor-speed-checker.js's style (helpers are intentionally duplicated
   rather than shared — this site has no build step, so each tool's JS
   stays self-contained). */

(function () {
  'use strict';

  var form = document.getElementById('cwvForm');
  if (!form) return;

  var input = form.querySelector('#cwvUrl');
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitLabel = submitBtn ? submitBtn.innerHTML : 'Check My Site';
  var note = document.getElementById('cwvNote');
  var results = document.getElementById('cwvResults');
  var resultsGrid = document.getElementById('cwvResultsGrid');
  var resultsHeading = document.getElementById('cwvResultsHeading');
  var ctaWrap = document.getElementById('cwvCta');

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var VERDICT_ACCENT = { clean: 'good', watch: 'warn', at_risk: 'danger' };
  var VERDICT_ICON = { clean: 'ri-speed-up-line', watch: 'ri-eye-line', at_risk: 'ri-alarm-warning-line' };
  var METRIC_ICON = { LCP: 'ri-image-line', CLS: 'ri-layout-grid-line', INP: 'ri-cursor-line' };

  // Each signal carries its own severity — 'strong' alone is enough to name
  // a likely cause, 'weak' is worth a look but not a verdict on its own —
  // matching the pattern elementor-speed-checker.js and malware-checker.js
  // both use for their own severity-ranked signals.
  function signalItem(signal) {
    var isStrong = signal.severity === 'strong';
    var cls = isStrong ? 'is-strong' : 'is-weak';
    var icon = isStrong ? 'ri-close-circle-line' : 'ri-error-warning-line';
    var metricTag = signal.metric ? '<span class="checker-metric-tag mono">' + escapeHtml(signal.metric) + '</span> ' : '';
    return (
      '<li class="' + cls + '"><i class="' + icon + '" aria-hidden="true"></i>' +
      '<span>' + metricTag + '<strong>' + escapeHtml(signal.label) + '.</strong> ' + escapeHtml(signal.detail) + '</span></li>'
    );
  }

  function row(label, valueHtml, note) {
    var html = '<div class="checker-row"><dt>' + escapeHtml(label) + '</dt><dd>' + valueHtml;
    if (note) html += '<span class="checker-row-note mt-1">' + escapeHtml(note) + '</span>';
    html += '</dd></div>';
    return html;
  }

  function table(rowsHtml) {
    return '<dl class="checker-rows">' + rowsHtml + '</dl>';
  }

  function panel(bodyHtml, accent) {
    var accentClass = accent ? ' checker-panel-' + accent : '';
    return '<div class="col"><div class="stat-card checker-panel' + accentClass + ' h-100">' + bodyHtml + '</div></div>';
  }

  var CTA = {
    structural: {
      icon: 'ri-alarm-warning-line',
      heading: 'This is a Core Web Vitals fix, not a hosting problem.',
      body: 'Unset image dimensions, render-blocking markup or an unmanaged font load are the kind of causes Search Console names but doesn’t explain how to fix. Diagnosed against the specific metric that’s failing, with before-and-after numbers.',
      primary: { href: '../../services/core-web-vitals-fix/', label: 'Core Web Vitals Fix' },
      secondary: { href: '../../services/wordpress-speed-optimization/', label: 'WordPress Speed Optimization' }
    },
    hosting: {
      icon: 'ri-time-line',
      heading: 'The page structure looks fine — this is a hosting issue.',
      body: 'A slow server response delays every paint metric equally, regardless of how clean the markup is. Proper caching, a right-sized server, and the housekeeping that keeps response time down.',
      primary: { href: '../../services/wordpress-speed-optimization/', label: 'WordPress Speed Optimization' },
      secondary: { href: '../../services/core-web-vitals-fix/', label: 'Core Web Vitals Fix' }
    },
    watch: {
      icon: 'ri-eye-line',
      heading: 'Nothing major, but worth a proper look.',
      body: 'A couple of smaller signals turned up — not enough to call this page at risk outright, but worth checking before they add up, especially once real visitor data starts populating Search Console.',
      primary: { href: '../../services/core-web-vitals-fix/', label: 'Core Web Vitals Fix' },
      secondary: { href: '../../services/wordpress-speed-optimization/', label: 'WordPress Speed Optimization' }
    },
    clean: {
      icon: 'ri-speed-up-line',
      heading: 'No obvious structural risk found here.',
      body: 'This only checks what’s publicly visible in the homepage’s HTML right now — it can’t see your real Search Console field data, or every page on the site. If Search Console is still flagging a metric, that’s worth a second, closer look.',
      primary: { href: '../../services/core-web-vitals-fix/', label: 'Get a second opinion' },
      secondary: { href: '../', label: 'More free tools' }
    }
  };

  function renderCta(hint) {
    var c = CTA[hint] || CTA.clean;
    return (
      '<aside class="post-cta">' +
        '<p class="mono post-cta-head">' + (hint === 'structural' || hint === 'hosting' ? 'ACT ON THIS' : 'WHAT THIS MEANS') + '</p>' +
        '<h2><i class="' + c.icon + '" aria-hidden="true"></i> ' + c.heading + '</h2>' +
        '<p>' + c.body + '</p>' +
        '<div class="btn-row">' +
          '<a class="btn btn-primary" href="' + escapeHtml(c.primary.href) + '">' + escapeHtml(c.primary.label) + ' <i class="ri-arrow-right-line" aria-hidden="true"></i></a>' +
          '<a class="btn btn-ghost" href="' + escapeHtml(c.secondary.href) + '">' + escapeHtml(c.secondary.label) + '</a>' +
        '</div>' +
      '</aside>'
    );
  }

  function metricsTable(m) {
    var rows = '';
    rows += row('Images missing width/height', m.images_missing_dimensions + ' of ' + m.images_total);
    rows += row('Render-blocking stylesheets', String(m.render_blocking_stylesheets));
    rows += row('Render-blocking scripts (head)', String(m.render_blocking_scripts));
    rows += row('Google Fonts without display strategy', m.google_fonts_without_display > 0 ? 'Yes' : 'Not detected');
    rows += row('Total scripts on page', String(m.total_scripts));
    rows += row('Server response time', m.response_time_ms + 'ms');
    rows += row('Homepage HTML weight', m.html_weight_kb + ' KB', m.truncated ? 'Response was truncated at the size cap.' : null);
    return table(rows);
  }

  function render(data) {
    var accent = VERDICT_ACCENT[data.verdict] || 'unknown';
    var icon = VERDICT_ICON[data.verdict] || 'ri-speed-up-line';

    var body = '<div class="checker-section-head"><h3><i class="' + icon + '" aria-hidden="true"></i> Scan Result</h3></div>';
    body += '<p class="checker-verdict">' + escapeHtml(data.summary) + '</p>';

    var signals = data.signals || [];
    if (signals.length) {
      body += '<ul class="checker-signals">' + signals.map(signalItem).join('') + '</ul>';
    } else {
      body += '<p class="checker-row-note mt-1">No structural Core Web Vitals risk signals were found on the homepage.</p>';
    }

    if (data.metrics) {
      body += '<div class="mt-3">' + metricsTable(data.metrics) + '</div>';
    }

    resultsGrid.innerHTML = panel(body, accent);
    ctaWrap.innerHTML = renderCta(data.cta_hint);
    results.classList.add('is-visible');
    resultsHeading.focus();
    resultsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showNote(type, message) {
    if (!message) {
      note.classList.add('d-none');
      note.classList.remove('checker-note-info', 'checker-note-error');
      note.innerHTML = '';
      return;
    }
    note.classList.remove('d-none', 'checker-note-info', 'checker-note-error');
    note.classList.add(type === 'error' ? 'checker-note-error' : 'checker-note-info');
    note.setAttribute('role', type === 'error' ? 'alert' : 'status');
    var icon = type === 'error' ? 'ri-error-warning-line' : 'ri-information-line';
    note.innerHTML = '<i class="' + icon + '" aria-hidden="true"></i><span>' + escapeHtml(message) + '</span>';
  }

  function runCheck(url) {
    showNote(null);
    results.classList.remove('is-visible');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line checker-loading-icon" aria-hidden="true"></i> Checking…';
    }

    fetch(form.getAttribute('data-endpoint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({ url: url })
    })
      .then(function (res) { return res.json().catch(function () { return { status: 'error', message: 'Something went wrong. Please try again.' }; }); })
      .then(function (data) {
        if (data.status !== 'ok') {
          showNote('error', data.message || 'Something went wrong. Please try again.');
          return;
        }
        render(data);
      })
      .catch(function () {
        showNote('error', 'Could not reach the checker. Please try again in a moment.');
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitLabel;
        }
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var url = (input.value || '').trim();
    if (!url) {
      showNote('error', 'Please enter a website address.');
      input.focus();
      return;
    }
    runCheck(url);
  });
})();
