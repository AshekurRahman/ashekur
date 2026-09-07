/* Free Elementor Speed & Bloat Checker — drives the form on
   /tools/elementor-speed-checker/, posts to elementor-speed-checker.php, and
   renders the structured JSON report. No framework, vanilla JS, matches
   malware-checker.js and theme-detector.js's style (helpers are
   intentionally duplicated rather than shared — this site has no build
   step, so each tool's JS stays self-contained). */

(function () {
  'use strict';

  var form = document.getElementById('elementorForm');
  if (!form) return;

  var input = form.querySelector('#elementorUrl');
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitLabel = submitBtn ? submitBtn.innerHTML : 'Check My Site';
  var note = document.getElementById('elementorNote');
  var results = document.getElementById('elementorResults');
  var resultsGrid = document.getElementById('elementorResultsGrid');
  var resultsHeading = document.getElementById('elementorResultsHeading');
  var ctaWrap = document.getElementById('elementorCta');

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var VERDICT_ACCENT = { clean: 'good', watch: 'warn', bloated: 'danger', slow_hosting: 'danger', not_elementor: 'unknown' };
  var VERDICT_ICON = { clean: 'ri-flashlight-line', watch: 'ri-eye-line', bloated: 'ri-file-warning-line', slow_hosting: 'ri-time-line', not_elementor: 'ri-question-line' };

  // Each signal carries its own severity — 'strong' alone is enough to name
  // a likely cause, 'weak' is worth a look but not a verdict on its own —
  // so the icon and its color need to say that at a glance, matching the
  // pattern malware-checker.js uses for its own severity-ranked signals.
  function signalItem(signal) {
    var isStrong = signal.severity === 'strong';
    var cls = isStrong ? 'is-strong' : 'is-weak';
    var icon = isStrong ? 'ri-close-circle-line' : 'ri-error-warning-line';
    return (
      '<li class="' + cls + '"><i class="' + icon + '" aria-hidden="true"></i>' +
      '<span><strong>' + escapeHtml(signal.label) + '.</strong> ' + escapeHtml(signal.detail) + '</span></li>'
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
    addon_bloat: {
      icon: 'ri-file-warning-line',
      heading: 'Add-on libraries are the fix here.',
      body: 'This is the single most common cause of a slow Elementor site, and it is rarely obvious from the dashboard which plugin is doing it. Trimmed or reconfigured so each add-on only loads assets on pages that actually use it.',
      primary: { href: '../../services/elementor-fix/', label: 'Elementor Bug Fix' },
      secondary: { href: '../../blog/improve-wordpress-website-speed/', label: 'How to improve WordPress speed' }
    },
    hosting: {
      icon: 'ri-time-line',
      heading: 'Elementor looks fine — this is a hosting issue.',
      body: 'A slow server response adds to every page load regardless of what Elementor itself is doing. Proper caching, a right-sized server, and the housekeeping that keeps response time down.',
      primary: { href: '../../services/wordpress-speed-optimization/', label: 'WordPress Speed Optimization' },
      secondary: { href: '../../services/caching-cdn-setup/', label: 'Caching & CDN Setup' }
    },
    watch: {
      icon: 'ri-eye-line',
      heading: 'Nothing major, but worth a proper look.',
      body: 'A couple of smaller signals turned up — not enough to call this page bloated outright, but worth checking before they add up. A full speed pass catches what a homepage-only scan can’t.',
      primary: { href: '../../services/wordpress-speed-optimization/', label: 'WordPress Speed Optimization' },
      secondary: { href: '../../services/elementor-fix/', label: 'Elementor Bug Fix' }
    },
    clean: {
      icon: 'ri-flashlight-line',
      heading: 'No obvious Elementor-specific bloat here.',
      body: 'This only checks what’s publicly visible on the homepage right now — it can’t see every page on the site, or catch a new add-on plugin the moment it’s installed. Worth a re-check after any major change.',
      primary: { href: '../../services/wordpress-speed-optimization/', label: 'See speed optimization options' },
      secondary: { href: '../', label: 'More free tools' }
    },
    not_elementor: {
      icon: 'ri-question-line',
      heading: 'No Elementor signal found on this homepage.',
      body: 'This tool only runs its Elementor-specific checks once it confirms Elementor is actually in use. If you’re not sure what this site is built with, the theme detector below gives a straight answer.',
      primary: { href: '../what-theme-is-this/', label: 'What Theme Is This?' },
      secondary: { href: '../../services/', label: 'See all services' }
    }
  };

  function renderCta(hint) {
    var c = CTA[hint] || CTA.clean;
    return (
      '<aside class="post-cta">' +
        '<p class="mono post-cta-head">' + (hint === 'addon_bloat' || hint === 'hosting' ? 'ACT ON THIS' : 'WHAT THIS MEANS') + '</p>' +
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
    rows += row('Add-on libraries detected', m.addons_detected && m.addons_detected.length ? escapeHtml(m.addons_detected.join(', ')) : 'None');
    rows += row('Elementor CSS files', String(m.elementor_css_files));
    rows += row('Total stylesheets / scripts', m.total_stylesheets + ' / ' + m.total_scripts);
    rows += row('Server response time', m.response_time_ms + 'ms');
    rows += row('Homepage HTML weight', m.html_weight_kb + ' KB', m.truncated ? 'Response was truncated at the size cap.' : null);
    rows += row('Global Kit configured', m.global_kit_configured ? 'Yes' : 'Not detected');
    return table(rows);
  }

  function render(data) {
    if (!data.elementor || !data.elementor.detected) {
      var naBody = '<div class="checker-section-head"><h3><i class="ri-question-line" aria-hidden="true"></i> Scan Result</h3></div>';
      naBody += '<p class="checker-verdict">' + escapeHtml(data.summary) + '</p>';
      resultsGrid.innerHTML = panel(naBody, 'unknown');
      ctaWrap.innerHTML = renderCta('not_elementor');
      results.classList.add('is-visible');
      resultsHeading.focus();
      resultsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var accent = VERDICT_ACCENT[data.verdict] || 'unknown';
    var icon = VERDICT_ICON[data.verdict] || 'ri-flashlight-line';

    var body = '<div class="checker-section-head"><h3><i class="' + icon + '" aria-hidden="true"></i> Scan Result</h3></div>';
    body += '<p class="checker-verdict">' + escapeHtml(data.summary) + '</p>';

    var signals = data.signals || [];
    if (signals.length) {
      body += '<ul class="checker-signals">' + signals.map(signalItem).join('') + '</ul>';
    } else {
      body += '<p class="checker-row-note mt-1">No Elementor-specific bloat signals were found on the homepage.</p>';
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
