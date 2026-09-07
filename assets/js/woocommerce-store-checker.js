/* Free WooCommerce Store Health Checker — drives the form on
   /tools/woocommerce-store-checker/, posts to
   woocommerce-store-checker.php, and renders the structured JSON report.
   No framework, vanilla JS, matches elementor-speed-checker.js and
   website-health-checker.js's style (helpers are intentionally duplicated
   rather than shared — this site has no build step). */

(function () {
  'use strict';

  var form = document.getElementById('woocommerceForm');
  if (!form) return;

  var input = form.querySelector('#woocommerceUrl');
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitLabel = submitBtn ? submitBtn.innerHTML : 'Check My Store';
  var note = document.getElementById('woocommerceNote');
  var results = document.getElementById('woocommerceResults');
  var resultsGrid = document.getElementById('woocommerceResultsGrid');
  var resultsHeading = document.getElementById('woocommerceResultsHeading');
  var ctaWrap = document.getElementById('woocommerceCta');

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var VERDICT_ACCENT = { clean: 'good', watch: 'warn', store_issues: 'danger', checkout_risk: 'danger', inconclusive: 'unknown', not_woocommerce: 'unknown' };
  var VERDICT_ICON = { clean: 'ri-checkbox-circle-line', watch: 'ri-eye-line', store_issues: 'ri-store-2-line', checkout_risk: 'ri-bank-card-line', inconclusive: 'ri-question-line', not_woocommerce: 'ri-question-line' };

  // Same badge vocabulary as website-health-checker.js: 'unknown' means
  // "could not check", distinct from 'not_found' (checked, wasn't there) —
  // this is exactly the distinction checkout verification needs.
  var BADGE_LABEL = { good: 'Good', warn: 'Needs attention', not_found: 'Not found', unknown: 'Could not check' };
  var BADGE_ICON = { good: 'ri-checkbox-circle-fill', warn: 'ri-error-warning-fill', not_found: 'ri-subtract-line', unknown: 'ri-question-line' };

  function badge(status) {
    var key = BADGE_LABEL.hasOwnProperty(status) ? status : 'unknown';
    return '<span class="checker-badge checker-badge-' + key + '"><i class="' + BADGE_ICON[key] + '" aria-hidden="true"></i>' + BADGE_LABEL[key] + '</span>';
  }

  function signalItem(signal) {
    var isStrong = signal.severity === 'strong';
    var cls = isStrong ? 'is-strong' : 'is-weak';
    var icon = isStrong ? 'ri-close-circle-line' : 'ri-error-warning-line';
    return (
      '<li class="' + cls + '"><i class="' + icon + '" aria-hidden="true"></i>' +
      '<span><strong>' + escapeHtml(signal.label) + '.</strong> ' + escapeHtml(signal.detail) + '</span></li>'
    );
  }

  function row(label, valueHtml, status, note) {
    var html = '<div class="checker-row"><dt>' + escapeHtml(label) + (status ? badge(status) : '') + '</dt><dd>' + valueHtml;
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
    checkout_risk: {
      icon: 'ri-bank-card-line',
      heading: 'Checkout has a real, fixable risk right now.',
      body: 'This is the single most expensive place a WooCommerce store can be quietly broken — every hour it stays this way is orders that never complete. The checkout guide below covers exactly this; a direct fix goes further.',
      primary: { href: '../../wordpress-fixes/woocommerce-checkout-not-working/', label: 'Checkout Troubleshooting Guide' },
      secondary: { href: '../../services/woocommerce-fix/', label: 'WooCommerce Fixes' }
    },
    inconclusive: {
      icon: 'ri-question-line',
      heading: "Checkout couldn't be verified — this isn't a clean bill of health.",
      body: "This tool couldn't confirm your checkout page publicly, which means the most important checks on a WooCommerce store haven't actually run. That's worth treating as seriously as a real result, not skipping.",
      primary: { href: '../../services/woocommerce-fix/', label: 'Get a Proper Diagnosis' },
      secondary: { href: '../../wordpress-fixes/woocommerce-checkout-not-working/', label: 'Checkout Troubleshooting Guide' }
    },
    store_issues: {
      icon: 'ri-store-2-line',
      heading: 'Checkout is fine — this is a broader store issue.',
      body: 'Nothing wrong at checkout itself, but something found elsewhere is worth a proper look before it grows into a bigger problem.',
      primary: { href: '../../services/woocommerce-development/', label: 'WooCommerce Development' },
      secondary: { href: '../../services/woocommerce-fix/', label: 'WooCommerce Fixes' }
    },
    watch: {
      icon: 'ri-eye-line',
      heading: 'Nothing major, but worth a proper look.',
      body: 'Checkout looks fine and nothing serious turned up — a couple of smaller signals are worth keeping an eye on before they add up.',
      primary: { href: '../../services/woocommerce-fix/', label: 'WooCommerce Fixes' },
      secondary: { href: '../../blog/woocommerce-site-broken-common-fixes/', label: 'Common WooCommerce fixes' }
    },
    clean: {
      icon: 'ri-checkbox-circle-line',
      heading: 'Checkout looks healthy right now.',
      body: "This only checks what's publicly visible on the homepage and checkout right now — it can't see every setting in wp-admin, or catch a change the moment it's made. Worth a re-check after any update to caching, gateways or plugins.",
      primary: { href: '../../services/woocommerce-development/', label: 'See WooCommerce development options' },
      secondary: { href: '../', label: 'More free tools' }
    },
    not_woocommerce: {
      icon: 'ri-question-line',
      heading: 'No WooCommerce signal found on this homepage.',
      body: "This tool only runs its store-specific checks once it confirms WooCommerce is actually in use. If you're not sure what this site is built with, the theme detector below gives a straight answer.",
      primary: { href: '../what-theme-is-this/', label: 'What Theme Is This?' },
      secondary: { href: '../../services/', label: 'See all services' }
    }
  };

  function renderCta(hint) {
    var c = CTA[hint] || CTA.clean;
    return (
      '<aside class="post-cta">' +
        '<p class="mono post-cta-head">' + (hint === 'checkout_risk' || hint === 'inconclusive' || hint === 'store_issues' ? 'ACT ON THIS' : 'WHAT THIS MEANS') + '</p>' +
        '<h2><i class="' + c.icon + '" aria-hidden="true"></i> ' + c.heading + '</h2>' +
        '<p>' + c.body + '</p>' +
        '<div class="btn-row">' +
          '<a class="btn btn-primary" href="' + escapeHtml(c.primary.href) + '">' + escapeHtml(c.primary.label) + ' <i class="ri-arrow-right-line" aria-hidden="true"></i></a>' +
          '<a class="btn btn-ghost" href="' + escapeHtml(c.secondary.href) + '">' + escapeHtml(c.secondary.label) + '</a>' +
        '</div>' +
      '</aside>'
    );
  }

  var PAGE_WEIGHT_REASON = {
    skipped_time_budget: 'Skipped to keep this scan fast — this comparison is opportunistic only and never affects the result above.',
    checkout_not_verified: 'Not applicable — checkout could not be verified.',
    shop_page_unreachable: 'Not applicable — no /shop/ page was found to compare against.'
  };

  function checkoutSection(checkout) {
    var html = '<div class="checker-section-head mt-4"><h3><i class="ri-bank-card-line" aria-hidden="true"></i> Checkout</h3></div>';

    if (!checkout.verified) {
      html += '<p class="checker-note checker-note-info"><i class="ri-information-line" aria-hidden="true"></i><span>' +
        escapeHtml(checkout.unavailable_reason || "Checkout couldn't be verified.") +
        ' Every checkout-dependent check below is reported as <strong>could not check</strong>, not as healthy.</span></p>';
    }

    var rows = '';
    rows += row('Served over HTTPS', checkout.https.enabled === null ? '<em>Unknown</em>' : (checkout.https.enabled ? 'Yes' : 'No'), checkout.https.status);
    rows += row('Cart/checkout caching', checkout.caching.cached === null ? '<em>Unknown</em>' : (checkout.caching.cached ? 'Appears cached' : 'Not cached'), checkout.caching.status,
      checkout.caching.evidence && checkout.caching.evidence.length ? checkout.caching.evidence.join(' ') : null);
    rows += row('Payment gateway detected', checkout.payment_gateway.detected === null ? '<em>Unknown</em>' : (checkout.payment_gateway.detected ? (checkout.payment_gateway.gateways_found.length ? escapeHtml(checkout.payment_gateway.gateways_found.join(', ')) : 'A payment method was found') : 'None detected'), checkout.payment_gateway.status);
    html += table(rows);

    return html;
  }

  function metricsTable(m) {
    var rows = '';
    rows += row('Plugins detected (lower bound)', String(m.plugin_count), m.plugin_count_status, 'Counted from what actually loads in the pages checked — the real number is likely higher.');
    rows += row('Homepage HTML weight', m.homepage_html_weight_kb + ' KB', null, m.truncated ? 'Response was truncated at the size cap.' : null);
    rows += row('Server response time', m.response_time_ms + 'ms');
    if (m.page_weight_comparison.available) {
      rows += row('Shop vs checkout page weight', m.page_weight_comparison.shop_html_weight_kb + ' KB vs ' + m.page_weight_comparison.checkout_html_weight_kb + ' KB', null, m.page_weight_comparison.note);
    } else {
      rows += row('Shop vs checkout page weight', '<em>Not applicable</em>', null, PAGE_WEIGHT_REASON[m.page_weight_comparison.reason] || 'Not applicable.');
    }
    return table(rows);
  }

  function render(data) {
    if (!data.woocommerce || !data.woocommerce.detected) {
      var naBody = '<div class="checker-section-head"><h3><i class="ri-question-line" aria-hidden="true"></i> Scan Result</h3></div>';
      naBody += '<p class="checker-verdict">' + escapeHtml(data.summary) + '</p>';
      resultsGrid.innerHTML = panel(naBody, 'unknown');
      ctaWrap.innerHTML = renderCta('not_woocommerce');
      results.classList.add('is-visible');
      resultsHeading.focus();
      resultsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var accent = VERDICT_ACCENT[data.verdict] || 'unknown';
    var icon = VERDICT_ICON[data.verdict] || 'ri-question-line';

    var body = '<div class="checker-section-head"><h3><i class="' + icon + '" aria-hidden="true"></i> Scan Result</h3></div>';
    body += '<p class="checker-verdict">' + escapeHtml(data.summary) + '</p>';

    var signals = data.signals || [];
    if (signals.length) {
      body += '<ul class="checker-signals">' + signals.map(signalItem).join('') + '</ul>';
    } else {
      body += '<p class="checker-row-note mt-1">No store-wide signals were found beyond what\'s covered above.</p>';
    }

    if (data.checkout) {
      body += checkoutSection(data.checkout);
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
