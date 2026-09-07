/* Free WordPress Website Cost Calculator — drives the wizard on
   /tools/wordpress-cost-calculator/. Pure client-side: no backend, no
   network request. Base prices ($1,299 WordPress / $1,999 Webflow) are the
   same numbers published on /pricing/ — keep PRICING in sync with that page
   by hand if either changes. No framework, vanilla JS, matches main.js and
   website-health-checker.js's style. */

(function () {
  'use strict';

  var form = document.getElementById('calcForm');
  if (!form) return;

  var stepsEl = form.querySelectorAll('.calc-step');
  var progressLabel = document.getElementById('calcProgressLabel');
  var progressFill = document.getElementById('calcProgressFill');
  var note = document.getElementById('calcNote');
  var resultWrap = document.getElementById('calcResult');
  var resultInner = document.getElementById('calcResultInner');
  var restartBtn = document.getElementById('calcRestart');

  /* Adjustable estimate model. These are starting-point deltas on top of the
     published base price, not fixed line items — see the "starting
     estimate, not a quote" framing repeated throughout the result output. */
  var PRICING = {
    base: { wordpress: 1299, webflow: 1999 },
    pages: { '1-5': 0, '6-10': 300, '11-20': 700, '20plus': 1200 },
    design: { template: 0, custom: 600 },
    ecommerce: { none: 0, small: 500, medium: 900, large: 1600 },
    integrations: { none: 0, few: 400, many: 800 },
    migration: { no: 0, yes: 400 },
    seo: { no: 0, yes: 500 }
  };

  var PAGES_LABEL = { '1-5': '1–5 pages', '6-10': '6–10 pages', '11-20': '11–20 pages', '20plus': '20+ pages' };
  var DESIGN_LABEL = { template: 'Theme/template as the starting point', custom: 'Fully custom design from Figma' };
  var ECOM_LABEL = { none: 'No online store', small: 'Small catalog (under 20 products)', medium: 'Medium catalog (20–100 products)', large: 'Large catalog or subscriptions (100+)' };
  var INTEGRATIONS_LABEL = { none: 'None needed', few: 'A couple (booking, CRM, payment gateway)', many: 'Several (3+)' };
  var MIGRATION_LABEL = { no: 'No, starting fresh', yes: 'Yes, migrating existing content' };
  var SEO_LABEL = { no: 'Not included', yes: 'Included' };
  var PLATFORM_LABEL = { wordpress: 'WordPress', webflow: 'Webflow', unsure: 'Not sure yet' };
  var GOAL_LABEL = { new: 'A new website', redesign: 'A redesign of an existing site', fix: 'Fixing or troubleshooting an existing site' };

  var FIX_SERVICE = {
    hacked: { name: 'WordPress Malware Removal', url: '../../services/wordpress-malware-removal/', note: 'Hacked, flagged by Google, or serving spam/redirects.' },
    broken: { name: 'WordPress Bug Fix', url: '../../services/wordpress-bug-fix/', note: 'An error, white screen, or something that just stopped working. If it is specifically the Elementor editor stuck, see <a href="../../services/elementor-fix/">Elementor Bug Fix</a> instead.' },
    slow: { name: 'WordPress Speed Optimization', url: '../../services/wordpress-speed-optimization/', note: 'Slow to load, poor Core Web Vitals, or feels sluggish.' },
    migrating: { name: 'WordPress Migration', url: '../../services/wordpress-migration/', note: 'Moving hosts or domains without losing your search rankings.' },
    'design-update': { name: 'WordPress Customization', url: '../../services/wordpress-customization/', note: 'The site works, but the design, theme or layout needs to change. Built in Divi? See <a href="../../services/divi-customization/">Divi Customization</a> instead.' },
    woocommerce: { name: 'WooCommerce Fixes', url: '../../services/woocommerce-fix/', note: 'Checkout, payments, shipping or stock issues on a store.' }
  };

  /* Build-path order. The "fix" goal branches to #calcStepFix instead of
     this list — see next(). */
  var BUILD_STEPS = ['calcStep1', 'calcStep2', 'calcStep3', 'calcStep4', 'calcStep5', 'calcStep6', 'calcStep7', 'calcStep8'];
  var FIX_STEPS = ['calcStep1', 'calcStepFix'];

  var path = BUILD_STEPS;
  var index = 0;
  var answers = {};

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function currentStepId() {
    return path[index];
  }

  function checkedValue(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function showStep(id, moveFocus) {
    for (var i = 0; i < stepsEl.length; i++) {
      stepsEl[i].hidden = stepsEl[i].id !== id;
    }
    showNote(null);
    // Only steal focus on an actual step change (Next/Back), never on the
    // initial page-load render — grabbing focus before the visitor has done
    // anything would pull it away from the skip-link/URL bar for no reason.
    if (moveFocus) {
      var heading = form.querySelector('#' + id + ' h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }
    var stepNum = index + 1;
    var stepTotal = path.length;
    progressLabel.textContent = 'STEP ' + stepNum + ' OF ' + stepTotal;
    progressFill.style.width = Math.round((stepNum / stepTotal) * 100) + '%';
  }

  function showNote(message) {
    if (!message) {
      note.classList.add('d-none');
      note.innerHTML = '';
      return;
    }
    note.classList.remove('d-none');
    note.classList.add('checker-note-error');
    note.setAttribute('role', 'alert');
    note.innerHTML = '<i class="ri-error-warning-line" aria-hidden="true"></i><span>' + escapeHtml(message) + '</span>';
  }

  function next() {
    var id = currentStepId();
    var stepEl = document.getElementById(id);
    var radioName = stepEl.querySelector('input[type="radio"]') ? stepEl.querySelector('input[type="radio"]').name : null;
    if (radioName && !checkedValue(radioName)) {
      showNote('Pick an option to continue.');
      return;
    }
    if (radioName) answers[radioName] = checkedValue(radioName);

    if (id === 'calcStep1') {
      path = answers.goal === 'fix' ? FIX_STEPS : BUILD_STEPS;
    }

    if (index < path.length - 1) {
      index++;
      showStep(currentStepId(), true);
    } else {
      renderResult();
    }
  }

  function back() {
    if (index === 0) return;
    index--;
    showStep(currentStepId(), true);
  }

  function restart() {
    answers = {};
    index = 0;
    path = BUILD_STEPS;
    form.reset();
    resultWrap.hidden = true;
    form.hidden = false;
    showStep(currentStepId(), true);
  }

  function estimateFor(basePrice) {
    var total = basePrice
      + (PRICING.pages[answers.pages] || 0)
      + (PRICING.design[answers.design] || 0)
      + (PRICING.ecommerce[answers.ecommerce] || 0)
      + (PRICING.integrations[answers.integrations] || 0)
      + (PRICING.migration[answers.migration] || 0)
      + (PRICING.seo[answers.seo] || 0);
    var low = total;
    var high = Math.round((total * 1.2) / 50) * 50;
    return { low: low, high: high };
  }

  function breakdownRows() {
    var rows = [
      ['Project type', GOAL_LABEL[answers.goal]],
      ['Platform', PLATFORM_LABEL[answers.platform]],
      ['Pages', PAGES_LABEL[answers.pages]],
      ['Design', DESIGN_LABEL[answers.design]],
      ['Online store', ECOM_LABEL[answers.ecommerce]],
      ['Integrations', INTEGRATIONS_LABEL[answers.integrations]],
      ['Content migration', MIGRATION_LABEL[answers.migration]],
      ['SEO foundations', SEO_LABEL[answers.seo]]
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += '<div class="checker-row"><dt>' + escapeHtml(rows[i][0]) + '</dt><dd>' + escapeHtml(rows[i][1]) + '</dd></div>';
    }
    return html;
  }

  function contactUrl() {
    var params = [];
    for (var key in answers) {
      if (Object.prototype.hasOwnProperty.call(answers, key)) {
        params.push(encodeURIComponent(key) + '=' + encodeURIComponent(answers[key]));
      }
    }
    return '../../contact/?source=cost-calculator&' + params.join('&');
  }

  function ctaRow(primaryHref, primaryLabel) {
    return '<div class="btn-row mt-0">'
      + '<a class="btn btn-primary" href="' + escapeHtml(primaryHref) + '">' + escapeHtml(primaryLabel) + ' <i class="ri-arrow-right-line" aria-hidden="true"></i></a>'
      + '<a class="btn btn-ghost" href="https://wa.me/8801812764112" target="_blank" rel="noopener noreferrer"><i class="ri-whatsapp-line" aria-hidden="true"></i> WhatsApp</a>'
      + '</div>';
  }

  function renderFixResult() {
    var service = FIX_SERVICE[answers.issue];
    var html = ''
      + '<p class="calc-result-label">SCOPED INDIVIDUALLY</p>'
      + '<h2 class="calc-result-price calc-result-price-sm">' + escapeHtml(service.name) + '</h2>'
      + '<p class="calc-result-caveat">' + service.note + ' Fix and troubleshooting work is priced after a quick look at what is actually wrong, not from a page-count questionnaire &mdash; there is no honest range to show without that. You will get a fixed quote before anything starts.</p>'
      + ctaRow(service.url, 'See ' + service.name);
    resultInner.innerHTML = html;
    form.hidden = true;
    resultWrap.hidden = false;
    resultWrap.setAttribute('tabindex', '-1');
    resultWrap.focus();
  }

  function renderBuildResult() {
    var html = '';

    if (answers.platform === 'unsure') {
      var wp = estimateFor(PRICING.base.wordpress);
      var wf = estimateFor(PRICING.base.webflow);
      html += '<p class="calc-result-label">STARTING ESTIMATE &mdash; BOTH PLATFORMS</p>'
        + '<div class="row row-cols-1 row-cols-sm-2 g-3 mb-3">'
        + '<div class="col"><p class="calc-result-split-label">WordPress</p><p class="calc-result-price calc-result-price-sm">' + money(wp.low) + '&ndash;' + money(wp.high) + '</p></div>'
        + '<div class="col"><p class="calc-result-split-label">Webflow</p><p class="calc-result-price calc-result-price-sm">' + money(wf.low) + '&ndash;' + money(wf.high) + '</p></div>'
        + '</div>'
        + '<p class="calc-result-caveat">Not sure which platform fits is completely normal at this stage &mdash; see <a href="../wordpress-vs-webflow-vs-framer/">WordPress vs Webflow vs Framer</a> for how to actually decide, or skip straight to a conversation about it.</p>';
    } else {
      var base = PRICING.base[answers.platform];
      var est = estimateFor(base);
      html += '<p class="calc-result-label">STARTING ESTIMATE</p>'
        + '<p class="calc-result-price">' + money(est.low) + '&ndash;' + money(est.high) + '</p>'
        + '<p class="calc-result-caveat">This is a starting point for budgeting, not a fixed quote &mdash; the same honest framing as every other price on this site. What you actually pay depends on the full scope, agreed in writing before anything starts.</p>';
    }

    html += '<dl class="calc-result-breakdown">' + breakdownRows() + '</dl>'
      + ctaRow(contactUrl(), 'Start a project')
      + '<p class="mt-3 calc-result-footnote"><a class="mono text-link" href="../../pricing/">See full pricing breakdown &rarr;</a></p>';

    resultInner.innerHTML = html;
    form.hidden = true;
    resultWrap.hidden = false;
    resultWrap.setAttribute('tabindex', '-1');
    resultWrap.focus();
  }

  function renderResult() {
    if (answers.goal === 'fix') {
      renderFixResult();
    } else {
      renderBuildResult();
    }
  }

  form.addEventListener('click', function (e) {
    var nextBtn = e.target.closest('[data-calc-next]');
    var backBtn = e.target.closest('[data-calc-back]');
    if (nextBtn) {
      e.preventDefault();
      next();
    } else if (backBtn) {
      e.preventDefault();
      back();
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
  });

  if (restartBtn) {
    restartBtn.addEventListener('click', function (e) {
      e.preventDefault();
      restart();
    });
  }

  showStep(currentStepId());
})();
