/* Free Website Health Checker — drives the form on
   /tools/wordpress-website-health-checker/, posts to the SSRF-safe PHP
   endpoint named on the form's data-endpoint attribute, and renders the
   structured JSON report. No framework, vanilla JS, matches main.js's style. */

(function () {
  'use strict';

  var form = document.getElementById('healthCheckerForm');
  if (!form) return;

  var input = form.querySelector('#checkerUrl');
  var submitBtn = form.querySelector('button[type="submit"]');
  // Must be innerHTML, not textContent: the arrow icon's glyph comes from a
  // CSS ::before content on the empty <i>, so textContent would silently
  // drop the icon here and then permanently wipe it out on the first restore.
  var submitLabel = submitBtn ? submitBtn.innerHTML : 'Check Website';
  var note = document.getElementById('checkerNote');
  var results = document.getElementById('checkerResults');
  var resultsGrid = document.getElementById('checkerResultsGrid');
  var resultsHeading = document.getElementById('checkerResultsHeading');

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(value, max) {
    if (value === null || value === undefined) return null;
    var s = String(value);
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  // og:image (and any other value pulled from the *scanned* page's own HTML,
  // as opposed to built by our PHP endpoint from a validated URL) must never
  // be linkified without checking its scheme first — a crafted page could set
  // content="javascript:..." and turn our results into a click-to-run link.
  function isSafeHttpUrl(value) {
    if (!value) return false;
    return /^https?:\/\//i.test(String(value).trim());
  }

  var BADGE_LABEL = {
    good: 'Good',
    warn: 'Needs attention',
    not_found: 'Not found',
    unknown: 'Could not check'
  };

  var BADGE_ICON = {
    good: 'ri-checkbox-circle-fill',
    warn: 'ri-error-warning-fill',
    not_found: 'ri-subtract-line',
    unknown: 'ri-question-line'
  };

  // Higher rank = more worth a second look. Used to pick each panel's accent
  // color and "N need a look" summary from its own rows, so the card itself
  // signals what's inside before anyone reads a single row.
  var SEVERITY_RANK = { good: 0, not_found: 1, warn: 1, unknown: 2 };

  function badge(status) {
    var key = BADGE_LABEL.hasOwnProperty(status) ? status : 'unknown';
    return '<span class="checker-badge checker-badge-' + key + '"><i class="' + BADGE_ICON[key] + '" aria-hidden="true"></i>' + BADGE_LABEL[key] + '</span>';
  }

  // Each check renders as a label/value pair, not a table row — long values
  // (a full CSP header, a long meta description) would force horizontal
  // scrolling in a table on mobile, and a results grid of literal <table>s
  // reads as an admin dashboard rather than a plain-language report.
  // `statuses` collects every row's status for the enclosing panel() call to
  // summarize — rows passing a null status (purely informational, no verdict,
  // e.g. "Image count") are correctly left out of that summary.
  function row(statuses, label, valueHtml, status, note) {
    if (status) statuses.push(status);
    var html = '<div class="checker-row"><dt>' + escapeHtml(label) + (status ? badge(status) : '') + '</dt><dd>' + valueHtml;
    if (note) html += '<span class="checker-row-note mt-1">' + escapeHtml(note) + '</span>';
    html += '</dd></div>';
    return html;
  }

  function textOrNotFound(value) {
    return value ? escapeHtml(value) : '<em>Not found</em>';
  }

  function signalItem(text) {
    return '<li><i class="ri-checkbox-circle-line" aria-hidden="true"></i><span>' + escapeHtml(text) + '</span></li>';
  }

  function panel(title, iconClass, bodyHtml, introText, statuses, forcedAccent) {
    statuses = statuses || [];
    var worst = 'good';
    var worstRank = 0;
    var needsAttention = 0;
    statuses.forEach(function (s) {
      if (s !== 'good') needsAttention++;
      var rank = SEVERITY_RANK.hasOwnProperty(s) ? SEVERITY_RANK[s] : 2;
      if (rank > worstRank) {
        worstRank = rank;
        worst = s;
      }
    });
    // A panel with no evaluated checks (WordPress Detection has none — a
    // "likely" verdict isn't pass/fail) stays neutral by default. forcedAccent
    // lets a caller still color the border for a verdict that isn't a
    // pass/fail row set, without inventing a fake statuses array that would
    // also trigger a "N need a look" summary chip that wouldn't make sense here.
    var accentClass = forcedAccent ? ' checker-panel-' + forcedAccent : '';
    var summaryHtml = '';
    if (!forcedAccent && statuses.length) {
      var accent = worst === 'good' ? 'good' : (worst === 'unknown' ? 'unknown' : 'warn');
      accentClass = ' checker-panel-' + accent;
      summaryHtml = needsAttention === 0
        ? '<span class="checker-summary checker-summary-good">All good</span>'
        : '<span class="checker-summary checker-summary-warn">' + needsAttention + ' of ' + statuses.length + ' need a look</span>';
    }
    // Wrapped in .col here (not by each render() call site) because a
    // panel() result is always a grid item — #checkerResultsGrid is a plain
    // Bootstrap "row row-cols-1 g-4" (full-width, single column), no
    // hand-written CSS grid.
    return (
      '<div class="col"><div class="stat-card checker-panel' + accentClass + ' h-100">' +
        '<div class="checker-section-head"><h3><i class="' + iconClass + '" aria-hidden="true"></i> ' + escapeHtml(title) + '</h3>' + summaryHtml + '</div>' +
        (introText ? '<p class="checker-row-note mt-1 mb-3">' + escapeHtml(introText) + '</p>' : '') +
        bodyHtml +
      '</div></div>'
    );
  }

  function table(rowsHtml) {
    return '<dl class="checker-rows">' + rowsHtml + '</dl>';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function render(data) {
    var html = '';

    // 1. Website Status
    var ws = data.website_status || {};
    var wsStatuses = [];
    var wsRows = '';
    wsRows += row(wsStatuses, 'HTTP status', escapeHtml(ws.http_status), ws.http_status_status);
    wsRows += row(wsStatuses, 'HTTPS enabled', ws.https_enabled ? 'Yes' : 'No', ws.https_status);
    var finalUrlNote = ws.redirected ? 'Redirected ' + ws.redirect_count + ' time' + (ws.redirect_count === 1 ? '' : 's') + ' from the address you entered.' : null;
    wsRows += row(wsStatuses, 'Final URL', '<a href="' + escapeHtml(ws.final_url) + '" target="_blank" rel="noopener noreferrer nofollow">' + escapeHtml(ws.final_url) + '</a>', null, finalUrlNote);
    wsRows += row(wsStatuses, 'Response time', ws.response_time_ms + ' ms', ws.response_time_status, ws.response_time_note);
    html += panel('Website Status', 'ri-signal-tower-line', table(wsRows), null, wsStatuses);

    // 2. SEO Basics
    var seo = data.seo_basics || {};
    var seoStatuses = [];
    var seoRows = '';
    var titleNote = seo.title ? seo.title.length + ' characters — Google typically shows around 50–60.' : null;
    seoRows += row(seoStatuses, 'Page title', textOrNotFound(seo.title), seo.title_status, titleNote);
    var descNote = seo.meta_description ? seo.meta_description.length + ' characters — Google typically shows around 150–160.' : null;
    seoRows += row(seoStatuses, 'Meta description', textOrNotFound(truncate(seo.meta_description, 220)), seo.meta_description_status, descNote);
    seoRows += row(seoStatuses, 'Canonical URL', textOrNotFound(seo.canonical_url), seo.canonical_status);
    seoRows += row(seoStatuses, 'Robots meta', textOrNotFound(seo.robots_meta), seo.robots_meta_status, seo.robots_meta_status === 'warn' ? 'Contains "noindex" — this page is being told not to appear in search results.' : null);
    seoRows += row(seoStatuses, 'Viewport / mobile meta', textOrNotFound(seo.viewport_meta), seo.viewport_status);
    seoRows += row(seoStatuses, 'Open Graph title', textOrNotFound(seo.og_title), seo.og_title_status);
    var ogImageHtml = '<em>Not found</em>';
    if (seo.og_image && isSafeHttpUrl(seo.og_image)) {
      ogImageHtml = '<a href="' + escapeHtml(seo.og_image) + '" target="_blank" rel="noopener noreferrer nofollow">' + escapeHtml(truncate(seo.og_image, 60)) + '</a>';
    } else if (seo.og_image) {
      ogImageHtml = escapeHtml(truncate(seo.og_image, 60));
    }
    seoRows += row(seoStatuses, 'Open Graph image', ogImageHtml, seo.og_image_status);
    html += panel('SEO Basics', 'ri-search-eye-line', table(seoRows), null, seoStatuses);

    // 3. WordPress Detection — not a pass/fail row set, so no "N need a
    // look" summary chip, but the verdict itself still earns a border color:
    // confidently detected reads as good, a single weak signal as worth a
    // second look, and no signal at all as the one worth flagging red on a
    // WordPress-focused tool, even though it isn't a security problem.
    var wp = data.wordpress_detection || {};
    var wpAccent = wp.status || 'danger';
    var wpBody = '<p class="checker-verdict">' + escapeHtml(wp.verdict) + '</p>';
    if (wp.signals && wp.signals.length) {
      wpBody += '<ul class="checker-signals">' + wp.signals.map(signalItem).join('') + '</ul>';
    } else {
      wpBody += '<p class="checker-row-note mt-1">No public WordPress signals were found on the homepage. This checks common public indicators only — it is not a guarantee either way.</p>';
    }
    html += panel('WordPress Detection', 'ri-wordpress-line', wpBody, null, null, wpAccent);

    // 4. Security Basics
    var sec = data.security_basics || {};
    var secStatuses = [];
    var secRows = '';
    secRows += row(secStatuses, 'HTTPS', sec.https && sec.https.present ? 'Enabled' : 'Not enabled', sec.https ? sec.https.status : null);
    secRows += row(secStatuses, 'Strict-Transport-Security', sec.strict_transport_security && sec.strict_transport_security.present ? '<code>' + escapeHtml(truncate(sec.strict_transport_security.value, 90)) + '</code>' : 'Not set', sec.strict_transport_security ? sec.strict_transport_security.status : null);
    secRows += row(secStatuses, 'X-Content-Type-Options', sec.x_content_type_options && sec.x_content_type_options.present ? '<code>' + escapeHtml(sec.x_content_type_options.value) + '</code>' : 'Not set', sec.x_content_type_options ? sec.x_content_type_options.status : null);
    secRows += row(secStatuses, 'Content-Security-Policy', sec.content_security_policy && sec.content_security_policy.present ? '<code>' + escapeHtml(truncate(sec.content_security_policy.value, 90)) + '</code>' : 'Not set', sec.content_security_policy ? sec.content_security_policy.status : null);
    secRows += row(secStatuses, 'Referrer-Policy', sec.referrer_policy && sec.referrer_policy.present ? '<code>' + escapeHtml(sec.referrer_policy.value) + '</code>' : 'Not set', sec.referrer_policy ? sec.referrer_policy.status : null);
    html += panel('Security Basics', 'ri-shield-check-line', table(secRows), 'These are publicly observable response headers, checked for information only — not a full security audit. A missing header here is common and is not automatically a vulnerability.', secStatuses);

    // 5. Crawlability
    var crawl = data.crawlability || {};
    var crawlStatuses = [];
    var crawlRows = '';
    crawlRows += row(crawlStatuses, 'robots.txt', crawl.robots_txt && crawl.robots_txt.found ? '<a href="' + escapeHtml(crawl.robots_txt.url) + '" target="_blank" rel="noopener noreferrer nofollow">Found</a>' : 'Not found', crawl.robots_txt ? crawl.robots_txt.status : null, crawl.robots_txt && crawl.robots_txt.references_sitemap ? 'References a sitemap.' : null);
    crawlRows += row(crawlStatuses, 'sitemap.xml', crawl.sitemap_xml && crawl.sitemap_xml.found ? '<a href="' + escapeHtml(crawl.sitemap_xml.url) + '" target="_blank" rel="noopener noreferrer nofollow">Found</a>' : 'Not found', crawl.sitemap_xml ? crawl.sitemap_xml.status : null);
    var wpSitemapNote = crawl.wp_sitemap_xml && !crawl.wp_sitemap_xml.applicable ? 'Only expected on WordPress sites using the default sitemap feature.' : null;
    crawlRows += row(crawlStatuses, 'wp-sitemap.xml', crawl.wp_sitemap_xml && crawl.wp_sitemap_xml.found ? '<a href="' + escapeHtml(crawl.wp_sitemap_xml.url) + '" target="_blank" rel="noopener noreferrer nofollow">Found</a>' : 'Not found', crawl.wp_sitemap_xml ? crawl.wp_sitemap_xml.status : null, wpSitemapNote);
    html += panel('Crawlability', 'ri-robot-2-line', table(crawlRows), null, crawlStatuses);

    // 6. Page Basics
    var pb = data.page_basics || {};
    var pbStatuses = [];
    var pbRows = '';
    pbRows += row(pbStatuses, 'HTML response size', formatBytes(pb.html_size_bytes), null, pb.truncated ? 'Analysis based on the first 2 MB of the page — a very large page may show partial results.' : null);
    pbRows += row(pbStatuses, 'Image count', String(pb.image_count), null);
    pbRows += row(pbStatuses, 'Images missing alt text', String(pb.images_missing_alt), pb.images_missing_alt_status, pb.images_missing_alt > 0 ? 'Images without descriptive alt text are harder for search engines and screen readers to understand.' : null);
    var headingNote = pb.h1_count === 0 ? 'No H1 found on this page.' : (pb.h1_count > 1 ? 'Multiple H1s found — most pages should have exactly one.' : null);
    pbRows += row(pbStatuses, 'Heading structure', pb.h1_count + ' × H1, ' + pb.h2_count + ' × H2', pb.h1_status, headingNote);
    pbRows += row(pbStatuses, 'Canonical tag present', pb.canonical_present ? 'Yes' : 'No', pb.canonical_present_status);
    html += panel('Page Basics', 'ri-file-text-line', table(pbRows), null, pbStatuses);

    resultsGrid.innerHTML = html;
  }

  // .checker-note, a custom-styled banner (not Bootstrap's .alert) — 'info'
  // while checking, 'error' when something needs the visitor's attention,
  // or no message at all to hide it. role switches to "alert" (assertive)
  // only for errors; a routine status update stays "status" (polite).
  function showNotice(type, message) {
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var url = (input.value || '').trim();
    input.setAttribute('aria-invalid', url ? 'false' : 'true');

    if (!url) {
      showNotice('error', 'Please enter a website address.');
      input.focus();
      return;
    }

    var endpoint = form.getAttribute('data-endpoint') || '';
    if (!endpoint) {
      showNotice('error', 'This tool has no endpoint configured.');
      return;
    }

    results.classList.remove('is-visible');
    resultsGrid.innerHTML = '';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line checker-loading-icon" aria-hidden="true"></i> Checking…';
    }
    // No "Checking…" notice here — the button's own spinner + label already
    // says that. This just clears any error notice left over from a
    // previous attempt so it doesn't sit there stale during the new check.
    showNotice(null);

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({ url: url })
    })
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        });
      })
      .then(function (result) {
        if (result.status !== 'ok') {
          showNotice('error', result.message || 'Could not check this website. Please try again.');
          return;
        }
        showNotice(null);
        render(result);
        results.classList.add('is-visible');
        if (resultsHeading) {
          // tabindex="-1" is static in the HTML now that rendering only
          // replaces #checkerResultsGrid — this heading itself is never
          // wiped from the DOM, so it stays a valid, stable focus target.
          resultsHeading.focus({ preventScroll: false });
          resultsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      })
      .catch(function () {
        showNotice('error', 'Something went wrong while checking this website. Please try again in a moment.');
      })
      .then(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitLabel;
        }
      });
  });
})();
