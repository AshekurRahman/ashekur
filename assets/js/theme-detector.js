/* Free WordPress Theme & Page Builder Detector — drives the form on
   /tools/what-theme-is-this/, posts to theme-detector.php, and renders the
   structured JSON report. Supports a ?url= query param so a shared link
   re-runs the scan on load. No framework, vanilla JS, matches main.js and
   website-health-checker.js's style (the panel/table/row/badge helpers
   below are intentionally duplicated from that file rather than shared —
   this site has no build step, so each tool's JS stays self-contained). */

(function () {
  'use strict';

  var form = document.getElementById('detectorForm');
  if (!form) return;

  var input = form.querySelector('#detectorUrl');
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitLabel = submitBtn ? submitBtn.innerHTML : 'Check Website';
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
    elementor: {
      icon: 'ri-layout-top-line',
      heading: 'This site runs on Elementor.',
      body: 'If yours does too and something is not working the way it should — a layout break, a slow editor, a widget that will not save — that is exactly what this covers.',
      primary: { href: '../../services/elementor-customization/', label: 'Elementor Customization' },
      secondary: { href: '../../services/elementor-fix/', label: 'Elementor Bug Fix' }
    },
    divi: {
      icon: 'ri-stack-line',
      heading: 'This site runs on Divi.',
      body: 'Templates built once in the Theme Builder, global presets actually set up, and a proper Divi 4 &rarr; 5 migration if it is still needed &mdash; not left half-done.',
      primary: { href: '../../services/divi-customization/', label: 'Divi Customization' },
      secondary: { href: '../../blog/elementor-vs-divi/', label: 'Elementor vs Divi' }
    },
    woocommerce: {
      icon: 'ri-shopping-cart-2-line',
      heading: 'This site runs on WooCommerce.',
      body: 'Checkout, payments, shipping and stock issues fixed fast, or new store features built properly the first time.',
      primary: { href: '../../services/woocommerce-development/', label: 'WooCommerce Development' },
      secondary: { href: '../../services/woocommerce-fix/', label: 'WooCommerce Fixes' }
    },
    wordpress: {
      icon: 'ri-wordpress-fill',
      heading: 'This site runs on WordPress.',
      body: 'Custom themes, WooCommerce stores, speed work and site rescues &mdash; eleven years of it, for businesses across the UK, Germany, the US and beyond.',
      primary: { href: '../../services/wordpress-development/', label: 'WordPress Development' },
      secondary: { href: '../../services/wordpress-bug-fix/', label: 'WordPress Bug Fix' }
    },
    not_wordpress: {
      icon: 'ri-global-line',
      heading: "This site doesn't appear to run on WordPress.",
      body: 'No public WordPress signal was found on the homepage &mdash; it may be Webflow, a custom build, or another platform entirely. Frontend and Webflow work are covered too.',
      primary: { href: '../../services/', label: 'See all services' },
      secondary: { href: '../../blog/wordpress-vs-webflow-vs-framer/', label: 'WordPress vs Webflow vs Framer' }
    }
  };

  function renderCta(hint) {
    var c = CTA[hint] || CTA.wordpress;
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

  function render(data) {
    var html = '';

    // 1. WordPress Detection
    var wp = data.wordpress || {};
    var wpAccent = wp.status || 'danger';
    var wpBody = '<p class="checker-verdict">' + escapeHtml(wp.verdict) + '</p>';
    if (wp.signals && wp.signals.length) {
      wpBody += '<ul class="checker-signals">' + wp.signals.map(signalItem).join('') + '</ul>';
    } else {
      wpBody += '<p class="checker-row-note mt-1">No public WordPress signals were found on the homepage.</p>';
    }
    html += panel('WordPress', 'ri-wordpress-line', wpBody, wpAccent);

    // 2. Page Builder
    var builder = data.builder || {};
    var builderAccent = builder.name ? (builder.confidence === 'high' ? 'good' : 'warn') : 'unknown';
    var builderBody = '<p class="checker-verdict">' + escapeHtml(builder.name || 'No major page builder detected') + '</p>';
    if (builder.signals && builder.signals.length) {
      builderBody += '<ul class="checker-signals">' + builder.signals.map(signalItem).join('') + '</ul>';
    } else if (builder.name === null) {
      builderBody += '<p class="checker-row-note mt-1">This usually means a fully custom theme with hand-coded templates, not a drag-and-drop builder.</p>';
    }
    html += panel('Page Builder', 'ri-layout-top-line', builderBody, builderAccent);

    // 3. Theme
    var theme = data.theme || {};
    var themeRows = row('Theme', theme.name ? escapeHtml(theme.name) : '<em>Not detected</em>', theme.slug && theme.slug !== theme.name ? 'Slug: ' + theme.slug : null);
    html += panel('Theme', 'ri-brush-line', table(themeRows), theme.name ? 'good' : 'unknown');

    // 4. Plugins
    var plugins = data.plugins || {};
    var notable = plugins.notable || [];
    var other = plugins.other || [];
    var pluginsBody = '';
    if (notable.length) {
      pluginsBody += '<ul class="checker-signals">' + notable.map(signalItem).join('') + '</ul>';
    }
    if (other.length) {
      pluginsBody += '<p class="checker-row-note mt-2">Also detected: ' + escapeHtml(other.join(', ')) + '</p>';
    }
    if (!notable.length && !other.length) {
      pluginsBody = '<p class="checker-row-note">No plugin asset paths were found on the homepage.</p>';
    }
    html += panel('Plugins Detected', 'ri-puzzle-line', pluginsBody, notable.length ? 'good' : 'unknown');

    resultsGrid.innerHTML = html;
    ctaWrap.innerHTML = renderCta(data.cta_hint);
    results.classList.add('is-visible');
    resultsHeading.focus();

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
