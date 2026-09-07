/* Free Divi 5 Migration Readiness Checker — drives the form on
   /tools/divi-5-migration-checker/, posts to divi5-migration-checker.php,
   and renders the structured JSON report. Supports a ?url= query param so a
   shared link re-runs the scan on load. No framework, vanilla JS, matches
   main.js and the other checker scripts' style (helpers intentionally
   duplicated rather than shared — this site has no build step). */

(function () {
  'use strict';

  var form = document.getElementById('detectorForm');
  if (!form) return;

  var input = form.querySelector('#detectorUrl');
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitLabel = submitBtn ? submitBtn.innerHTML : 'Check My Site';
  var note = document.getElementById('detectorNote');
  var results = document.getElementById('detectorResults');
  var resultsGrid = document.getElementById('detectorResultsGrid');
  var resultsHeading = document.getElementById('detectorResultsHeading');
  var ctaWrap = document.getElementById('detectorCta');
  var shareRow = document.getElementById('detectorShare');
  var shareLink = document.getElementById('detectorShareLink');

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isSafeHttpUrl(value) {
    if (!value) return false;
    return /^https?:\/\//i.test(String(value).trim());
  }

  function signalItem(text) {
    return '<li><i class="ri-checkbox-circle-line" aria-hidden="true"></i><span>' + escapeHtml(text) + '</span></li>';
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

  function panel(title, iconClass, bodyHtml, accent) {
    var accentClass = accent ? ' checker-panel-' + accent : '';
    return (
      '<div class="col"><div class="stat-card checker-panel' + accentClass + ' h-100">' +
        '<div class="checker-section-head"><h3><i class="' + iconClass + '" aria-hidden="true"></i> ' + escapeHtml(title) + '</h3></div>' +
        bodyHtml +
      '</div></div>'
    );
  }

  var CTA = {
    divi5: {
      icon: 'ri-stack-line',
      heading: 'This site is confirmed on Divi 5.',
      body: 'Being on Divi 5 doesn’t mean the migration itself finished cleanly — mixed old and new layouts, presets that didn’t carry over, or a Design System that was never actually set up. Worth having that planned properly, not left half-done.',
      primary: { href: '../../services/divi-5-migration/', label: 'Divi 5 Migration' },
      secondary: { href: '../../blog/elementor-vs-divi/', label: 'Elementor vs Divi' }
    },
    divi4: {
      icon: 'ri-stack-line',
      heading: 'This site is confirmed still on Divi 4.',
      body: 'A move to Divi 5’s builder and Design System is worth planning properly, not left half-done — that’s exactly what this covers.',
      primary: { href: '../../services/divi-5-migration/', label: 'Divi 5 Migration' },
      secondary: { href: '../../blog/elementor-vs-divi/', label: 'Elementor vs Divi' }
    },
    unknown_version: {
      icon: 'ri-stack-line',
      heading: 'Divi confirmed — version couldn’t be pinned down from the outside.',
      body: 'Whichever version this turns out to be, a Divi 4 → 5 migration (or a clean-up of one already started) is worth planning properly, not left half-done.',
      primary: { href: '../../services/divi-5-migration/', label: 'Divi 5 Migration' },
      secondary: { href: '../../contact/', label: 'Ask a question' }
    },
    not_divi: {
      icon: 'ri-layout-top-line',
      heading: 'No Divi signal was found on this site.',
      body: 'It may be running a different theme or page builder entirely — the theme &amp; page builder detector below will identify what it’s actually built with.',
      primary: { href: '../what-theme-is-this/', label: 'What Theme Is This?' },
      secondary: { href: '../../services/', label: 'See all services' }
    }
  };

  function renderCta(hint) {
    var c = CTA[hint] || CTA.unknown_version;
    return (
      '<aside class="post-cta">' +
        '<p class="mono post-cta-head">WHAT THIS MEANS</p>' +
        '<h2><i class="' + c.icon + '" aria-hidden="true"></i> ' + c.heading + '</h2>' +
        '<p>' + c.body + '</p>' +
        '<div class="btn-row">' +
          '<a class="btn btn-primary" href="' + escapeHtml(c.primary.href) + '">' + escapeHtml(c.primary.label) + ' <i class="ri-arrow-right-line" aria-hidden="true"></i></a>' +
          '<a class="btn btn-ghost" href="' + escapeHtml(c.secondary.href) + '">' + escapeHtml(c.secondary.label) + '</a>' +
        '</div>' +
      '</aside>'
    );
  }

  var VERDICT_LABEL = {
    confirmed_divi5: 'Confirmed on Divi 5',
    confirmed_divi4: 'Confirmed still on Divi 4',
    unknown_version: 'Divi confirmed, version unknown',
    not_divi: 'Divi not detected'
  };

  var VERDICT_ACCENT = {
    confirmed_divi5: 'good',
    confirmed_divi4: 'warn',
    unknown_version: 'unknown',
    not_divi: 'unknown'
  };

  function render(data) {
    // not_divi short-circuits to a single minimal panel — Version Evidence
    // and Layout Complexity are meaningless once Divi itself isn't
    // confirmed, same reasoning as woocommerce-store-checker.js's
    // not_woocommerce special case.
    if (data.verdict === 'not_divi') {
      resultsGrid.innerHTML = panel('Scan Result', 'ri-question-line', '<p class="checker-verdict">' + escapeHtml(data.summary) + '</p>', 'unknown');
      ctaWrap.innerHTML = renderCta('not_divi');
      results.classList.add('is-visible');
      resultsHeading.focus();
      resultsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (shareRow) shareRow.hidden = true;
      return;
    }

    var html = '';

    // 1. Divi detection
    var divi = data.divi || {};
    var diviAccent = divi.detected ? (divi.confidence === 'high' ? 'good' : 'warn') : 'unknown';
    var diviBody = '<p class="checker-verdict">' + escapeHtml(divi.detected ? 'Divi detected' : 'Not detected') + '</p>';
    if (divi.signals && divi.signals.length) {
      diviBody += '<ul class="checker-signals">' + divi.signals.map(signalItem).join('') + '</ul>';
    } else {
      diviBody += '<p class="checker-row-note mt-1">No Divi signals were found on the homepage.</p>';
    }
    html += panel('Divi Detection', 'ri-search-eye-line', diviBody, diviAccent);

    // 2. Readiness verdict
    var verdictAccent = VERDICT_ACCENT[data.verdict] || 'unknown';
    var verdictBody = '<p class="checker-verdict">' + escapeHtml(VERDICT_LABEL[data.verdict] || data.verdict) + '</p>';
    verdictBody += '<p class="checker-row-note mt-1">' + escapeHtml(data.summary) + '</p>';
    html += panel('Readiness Verdict', 'ri-shield-check-line', verdictBody, verdictAccent);

    // 3. Version evidence
    var version = data.version || {};
    var divi5Modules = data.divi5_modules || [];
    var versionBody = '';
    if (version.string) {
      versionBody += table(row('Version string found', escapeHtml(version.string), 'Read from a ?ver= query string on a Divi asset URL.'));
    } else {
      versionBody += '<p class="checker-row-note">No version query string survived on this homepage — common when a caching or optimization plugin strips them.</p>';
    }
    if (divi5Modules.length) {
      versionBody += '<ul class="checker-signals mt-2">' + divi5Modules.map(function (m) { return signalItem(m + ' (Divi 5-only)'); }).join('') + '</ul>';
    }
    html += panel('Version Evidence', 'ri-price-tag-3-line', versionBody, version.string || divi5Modules.length ? 'good' : 'unknown');

    // 4. Layout complexity
    var layout = data.layout;
    var layoutNote = layout ? layout.label + ' — a lower-bound count from what’s visible in the page source.' : null;
    if (layout && layout.truncated) {
      layoutNote += ' Response was truncated at the size cap, so the true count may be higher.';
    }
    var layoutBody = layout
      ? table(row('Modules on this page', String(layout.module_count), layoutNote))
      : '<p class="checker-row-note">Not applicable — Divi wasn’t confirmed on this site.</p>';
    html += panel('Layout Complexity', 'ri-stack-line', layoutBody, layout ? 'unknown' : 'unknown');

    resultsGrid.innerHTML = html;
    ctaWrap.innerHTML = renderCta(data.cta_hint);
    results.classList.add('is-visible');
    resultsHeading.focus();
    resultsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (shareRow && shareLink) {
      var shareUrl = window.location.origin + window.location.pathname + '?url=' + encodeURIComponent(data.requested_url);
      shareLink.value = shareUrl;
      shareRow.hidden = false;
    }
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
    showNote('info', 'Checking ' + url + '…');
    results.classList.remove('is-visible');
    if (shareRow) shareRow.hidden = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line checker-loading-icon" aria-hidden="true"></i> Checking…';
    }

    fetch(form.getAttribute('data-endpoint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    })
      .then(function (res) { return res.json().catch(function () { return { status: 'error', message: 'Something went wrong. Please try again.' }; }); })
      .then(function (data) {
        if (data.status !== 'ok') {
          showNote('error', data.message || 'Something went wrong. Please try again.');
          return;
        }
        showNote(null);
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

  if (shareLink) {
    shareLink.addEventListener('focus', function () { shareLink.select(); });
  }

  var params = new URLSearchParams(window.location.search);
  var prefill = params.get('url');
  if (prefill && isSafeHttpUrl(prefill) === false && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(prefill)) {
    prefill = null; // ignore anything that isn't at least URL/domain-shaped
  }
  if (prefill) {
    input.value = prefill;
    runCheck(prefill);
  }
})();
