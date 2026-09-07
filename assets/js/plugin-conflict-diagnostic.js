/* Free WordPress Plugin Conflict Diagnostic — Tool 8 from
   FREE-TOOLS-SEO-ROADMAP.md. Unlike every other tool under /tools/, this
   one isn't a URL scanner at all — a conflict happening on someone's own
   site (often inside wp-admin, sometimes invisible from the outside) can't
   be diagnosed by fetching a public page. Pure client-side decision tree,
   no backend, no network request: a series of yes/no-style questions that
   walk the visitor through the same triage steps already written out in
   blog/elementor-broken-after-update/ and
   wordpress-fixes/wordpress-plugin-conflict/, ending in either a specific
   self-service fix or a named next step (Elementor Bug Fix / WordPress Bug
   Fix / a related free tool).

   Reuses the Cost Calculator's .calc-step/.calc-options/.calc-option/
   .calc-nav vocabulary wholesale (assets/css/template.css section 23) —
   this needed zero new CSS, matching Tools 4-6's own "reuse before
   inventing" pattern. The only change from that wizard's interaction model
   is that a choice here auto-advances immediately on selection (there's
   nothing else to fill in per step), rather than waiting for a separate
   Next button click. No framework, vanilla JS. */

(function () {
  'use strict';

  var app = document.getElementById('pcdApp');
  if (!app) return;

  var breadcrumbEl = document.getElementById('pcdBreadcrumb');
  var headingEl = document.getElementById('pcdHeading');
  var bodyEl = document.getElementById('pcdBody');
  var optionsEl = document.getElementById('pcdOptions');
  var ctaEl = document.getElementById('pcdCta');
  var navEl = document.getElementById('pcdNav');
  var backBtn = document.getElementById('pcdBack');
  var restartBtn = document.getElementById('pcdRestart');

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toolLinks(items) {
    return '<p class="mono post-cta-head mt-3">RELATED FREE TOOLS</p><ul class="mt-2 mb-0">' +
      items.map(function (t) {
        return '<li><a href="' + escapeHtml(t.href) + '"><i class="ri-arrow-right-s-line" aria-hidden="true"></i>' + escapeHtml(t.label) + '</a></li>';
      }).join('') +
      '</ul>';
  }

  function ctaRow(cta) {
    var html = '<div class="btn-row mt-4">' +
      '<a class="btn btn-primary" href="' + escapeHtml(cta.primary.href) + '">' + escapeHtml(cta.primary.label) + ' <i class="ri-arrow-right-line" aria-hidden="true"></i></a>';
    if (cta.secondary) {
      html += '<a class="btn btn-ghost" href="' + escapeHtml(cta.secondary.href) + '">' + escapeHtml(cta.secondary.label) + '</a>';
    }
    return html + '</div>';
  }

  /* ---------------------------------------------------------------------
   * The decision tree. Every node is either a question (one or more
   * `options`, each pointing at another node id) or a terminal/near-
   * terminal result (`body` explains what to actually do, `cta` names the
   * one specific next step). A result can still carry `options` of its own
   * — the "I already tried that, still broken" escape hatches — so the
   * schema doesn't need a separate node "kind" at all: a node with options
   * is answerable, a node without any is a true dead end.
   * ------------------------------------------------------------------- */
  var NODES = {
    start: {
      heading: 'Did something update — a plugin, a theme, or WordPress core — right before this started?',
      options: [
        { label: 'Yes, something updated', next: 'visitor_scope' },
        { label: 'No, nothing changed that I know of', next: 'nothing_changed' }
      ]
    },

    nothing_changed: {
      heading: 'That points away from a plugin conflict.',
      body: '<p>A plugin or WordPress core update running quietly in the background is still the most common cause here — check <strong>Dashboard → Updates</strong> and your host’s update log before ruling it out. If nothing shows up there, this looks more like a hack, a corrupted file, or a hosting problem than a plugin conflict.</p>' +
        toolLinks([
          { href: '../wordpress-malware-checker/', label: 'WordPress Malware & Blacklist Checker' },
          { href: '../wordpress-website-health-checker/', label: 'Website Health Checker' }
        ]),
      options: [
        { label: 'Actually, something probably did update automatically — check for a conflict anyway', next: 'visitor_scope' }
      ]
    },

    visitor_scope: {
      heading: 'Does the problem happen for every visitor, or only for you?',
      options: [
        { label: 'Only for me', next: 'browser_cache' },
        { label: 'Every visitor', next: 'area' }
      ]
    },

    browser_cache: {
      heading: 'Rule out your own browser first.',
      body: '<p>Try a hard refresh and an incognito/private window. If a caching or page-optimization plugin is active, clear its cache too — a stale copy of the old CSS or JS is a common reason it looks broken only for you.</p>',
      options: [
        { label: 'Still broken after that', next: 'area' }
      ]
    },

    area: {
      heading: 'Where exactly is the problem showing up?',
      options: [
        { label: 'The Elementor editor won’t load, spins forever, or errors inside the builder', next: 'el_editor' },
        { label: 'An Elementor widget or section is missing or broken, but the editor opens fine', next: 'el_widget' },
        { label: 'Elementor Pro’s template library or licensed features aren’t working', next: 'el_license' },
        { label: 'Layout looks broken only on mobile or tablet', next: 'mobile' },
        { label: 'Something else — a blank page, a fatal error, a broken form or checkout, a console error', next: 'troubleshoot' }
      ]
    },

    el_editor: {
      heading: 'Editor won’t load — try this',
      body: '<ol>' +
        '<li>Temporarily raise the PHP memory limit — many hosts default to 64–128MB, Elementor recommends 256MB or higher — then retest.</li>' +
        '<li>On staging, deactivate other plugins one at a time and retest the editor after each, rather than all at once.</li>' +
        '<li>Check the browser console for a JavaScript error naming a specific file — that traces straight back to the plugin causing it.</li>' +
        '<li>If only one specific page won’t open, suspect a corrupted revision or a widget referencing deleted content, not a site-wide conflict.</li>' +
        '</ol>',
      cta: { primary: { href: '../../services/elementor-fix/', label: 'Elementor Bug Fix' }, secondary: { href: '../../contact/', label: 'Ask a question' } }
    },

    el_widget: {
      heading: 'Missing or broken widget — try this',
      body: '<ol>' +
        '<li>Confirm the add-on plugin (Essential Addons, Crocoblock, PowerPack, etc.) is actually still active — it can get deactivated by accident during a bulk update.</li>' +
        '<li>Check that add-on’s changelog against your current Elementor core version for a documented compatibility fix.</li>' +
        '<li>Check the widget’s own settings — a reference to a deleted or renamed image, dynamic field, or saved template shows up as a missing or broken widget too.</li>' +
        '</ol>',
      cta: { primary: { href: '../../services/elementor-fix/', label: 'Elementor Bug Fix' }, secondary: { href: '../../contact/', label: 'Ask a question' } }
    },

    el_license: {
      heading: 'License or template library issue — try this',
      body: '<ol>' +
        '<li>Check the license first — an expired or nulled Elementor Pro license can silently block template library access.</li>' +
        '<li>Clear any page or object cache — a cached copy of the old CSS/JS is a common reason it still looks stale after the real issue is fixed.</li>' +
        '<li>If a Theme Builder template isn’t applying where it should, check its display conditions — these quietly stop matching after a URL or post type changes elsewhere on the site.</li>' +
        '</ol>',
      cta: { primary: { href: '../../services/elementor-fix/', label: 'Elementor Bug Fix' }, secondary: { href: '../../contact/', label: 'Ask a question' } }
    },

    mobile: {
      heading: 'Mobile-only layout break — try this',
      body: '<ol>' +
        '<li>Check the specific responsive breakpoint setting first — padding, column gap, a "hide on mobile" toggle. Most of these are one control away from fixed, not a rebuild.</li>' +
        '<li>Confirm you’re testing against the actual breakpoint values your builder is using, not just resizing the browser loosely — tablet and mobile breakpoints are editable and can drift out of sync with what you think you’re testing.</li>' +
        '<li>Rebuilding the section from scratch should be the last resort, not the first move. If this is specifically inside Elementor, <a href="../../services/elementor-fix/">Elementor Bug Fix</a> covers it too.</li>' +
        '</ol>',
      cta: { primary: { href: '../../services/wordpress-bug-fix/', label: 'WordPress Bug Fix' }, secondary: { href: '../../contact/', label: 'Ask a question' } }
    },

    troubleshoot: {
      heading: 'Have you already tried isolating it — Health Check’s Troubleshooting Mode, or manually deactivating every plugin — to see if the problem disappears?',
      options: [
        { label: 'Not yet', next: 'try_troubleshooting' },
        { label: 'Yes — it disappeared with everything off', next: 'isolate' },
        { label: 'Yes — it’s still broken even with everything off', next: 'not_a_conflict' }
      ]
    },

    try_troubleshooting: {
      heading: 'Try this first',
      body: '<ol>' +
        '<li>Install <strong>Health Check &amp; Troubleshooting</strong> — the free, official plugin from WordPress.org — and switch on its Troubleshooting Mode.</li>' +
        '<li>This disables every other plugin and switches to a default theme, but only for your own logged-in session — every visitor keeps seeing the live site normally the whole time.</li>' +
        '<li>Prefer not to install another plugin? Deactivate everything manually from the Plugins screen instead, confirm the site works, then reactivate one at a time.</li>' +
        '</ol>',
      options: [
        { label: 'It disappeared with everything off', next: 'isolate' },
        { label: 'Still broken even with everything off', next: 'not_a_conflict' }
      ]
    },

    not_a_conflict: {
      heading: 'This isn’t a plugin conflict',
      body: '<p>If it’s still broken with literally every plugin off and the theme switched to default, the cause is somewhere else — a hosting/server issue, a corrupted core file, or a hack. That’s outside what a plugin-conflict checklist can diagnose.</p>' +
        toolLinks([
          { href: '../wordpress-website-health-checker/', label: 'Website Health Checker' },
          { href: '../wordpress-malware-checker/', label: 'WordPress Malware & Blacklist Checker' }
        ]),
      cta: { primary: { href: '../../services/wordpress-bug-fix/', label: 'WordPress Bug Fix' }, secondary: { href: '../../contact/', label: 'Ask a question' } }
    },

    isolate: {
      heading: 'Reactivating plugins one at a time, does the problem come back the moment you re-enable one specific plugin?',
      options: [
        { label: 'Yes — I found the one that triggers it', next: 'found_culprit' },
        { label: 'No — it only happens with several together, or I can’t pin it to just one', next: 'complex' }
      ]
    },

    found_culprit: {
      heading: 'You’ve found the pair — next steps',
      body: '<ol>' +
        '<li>Check both that plugin and whichever one it clashes with for a recent update — update the older one first. A real share of conflicts get silently resolved by a version bump neither plugin called a "conflict fix."</li>' +
        '<li>Search that plugin’s support forum for "conflict" plus the other plugin’s name — this exact pairing has often already been reported, sometimes with a documented fix.</li>' +
        '<li>If one of the two is easily replaceable and isn’t central to the site, swapping it is often faster than waiting on either developer to patch a niche conflict.</li>' +
        '<li>Once it’s fixed, write down which two plugins conflicted and what fixed it — the same pairing can resurface after either plugin’s next update.</li>' +
        '</ol>',
      cta: { primary: { href: '../../services/wordpress-bug-fix/', label: 'WordPress Bug Fix' }, secondary: { href: '../../contact/', label: 'Ask a question' } }
    },

    complex: {
      heading: 'This needs a proper look',
      body: '<p>A conflict that survives one-at-a-time isolation, or spans several plugins at once, usually means a hook-priority collision or a shared-library clash — the kind of thing <strong>Query Monitor</strong> (a free WordPress.org plugin that shows every hook, filter and query firing) or a developer’s eyes can isolate quickly, but more guessing can’t.</p>',
      cta: { primary: { href: '../../services/wordpress-bug-fix/', label: 'WordPress Bug Fix' }, secondary: { href: '../../contact/', label: 'Ask a question' } }
    }
  };

  var history = [];
  var trail = [];
  var currentId = 'start';

  function render(id, moveFocus) {
    var node = NODES[id];
    currentId = id;

    if (trail.length) {
      breadcrumbEl.hidden = false;
      breadcrumbEl.textContent = trail.join(' → ');
    } else {
      breadcrumbEl.hidden = true;
      breadcrumbEl.textContent = '';
    }

    headingEl.textContent = node.heading;

    if (node.body) {
      bodyEl.innerHTML = node.body;
      bodyEl.hidden = false;
    } else {
      bodyEl.innerHTML = '';
      bodyEl.hidden = true;
    }

    if (node.options && node.options.length) {
      optionsEl.innerHTML = node.options.map(function (opt, i) {
        return '<div class="calc-option"><input type="radio" name="pcdChoice" id="pcdOpt' + i + '" value="' + i + '"><label for="pcdOpt' + i + '">' + escapeHtml(opt.label) + '</label></div>';
      }).join('');
      optionsEl.hidden = false;
    } else {
      optionsEl.innerHTML = '';
      optionsEl.hidden = true;
    }

    if (node.cta) {
      ctaEl.innerHTML = ctaRow(node.cta);
      ctaEl.hidden = false;
    } else {
      ctaEl.innerHTML = '';
      ctaEl.hidden = true;
    }

    navEl.hidden = history.length === 0;

    // Only steal focus on an actual question change (a choice, Back, or
    // Start over), never on the initial page-load render — matching
    // wordpress-cost-calculator.js's showStep(): grabbing focus before the
    // visitor has done anything would pull it away from the skip-link/URL
    // bar for no reason.
    headingEl.setAttribute('tabindex', '-1');
    if (moveFocus) {
      headingEl.focus();
    }
  }

  // Listens for "click", not "change": a native radiogroup fires "change"
  // on every arrow-key press too, which would auto-advance to a new
  // question the instant a keyboard user starts arrowing through options,
  // before they ever get to compare more than one. Activating a radio via
  // mouse click, or via keyboard Space/label click, dispatches a real
  // "click" event with the input itself as the target; arrow-key-only
  // navigation between options never does, so this only fires on an
  // actual, deliberate selection.
  optionsEl.addEventListener('click', function (e) {
    var input = e.target.closest('input[name="pcdChoice"]');
    if (!input) return;
    var idx = parseInt(input.value, 10);
    var opt = NODES[currentId].options[idx];
    history.push(currentId);
    trail.push(opt.label);
    render(opt.next, true);
  });

  backBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (!history.length) return;
    trail.pop();
    render(history.pop(), true);
  });

  restartBtn.addEventListener('click', function (e) {
    e.preventDefault();
    history = [];
    trail = [];
    render('start', true);
  });

  render('start');
})();
