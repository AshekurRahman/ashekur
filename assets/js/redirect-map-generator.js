/* Free Redirect Map Generator — drives the two-field form on
   /tools/redirect-map-generator/, posts to redirect-map-generator.php, and
   renders the structured JSON report plus two client-side file downloads
   (CSV and an .htaccess-ready snippet) built straight from that JSON — no
   second server round-trip, no file storage, matching this site's
   no-build-step, no-DB tool architecture. No framework, vanilla JS, matches
   main.js and the other checker scripts' style (helpers intentionally
   duplicated rather than shared). */

(function () {
  'use strict';

  var form = document.getElementById('redirectForm');
  if (!form) return;

  var oldInput = document.getElementById('redirectOld');
  var newInput = document.getElementById('redirectNew');
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitLabel = submitBtn ? submitBtn.innerHTML : 'Build Redirect Map';
  var note = document.getElementById('redirectNote');
  var results = document.getElementById('redirectResults');
  var resultsBody = document.getElementById('redirectResultsBody');
  var resultsHeading = document.getElementById('redirectResultsHeading');

  var lastData = null;

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function row(label, valueHtml, noteText) {
    var html = '<div class="checker-row"><dt>' + escapeHtml(label) + '</dt><dd>' + valueHtml;
    if (noteText) html += '<span class="checker-row-note mt-1">' + escapeHtml(noteText) + '</span>';
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

  var CONFIDENCE_BADGE = {
    exact: 'good',
    high: 'good',
    medium: 'warn'
  };

  var CONFIDENCE_LABEL = {
    exact: 'Exact',
    high: 'High',
    medium: 'Medium'
  };

  function confidenceBadge(confidence) {
    var accent = CONFIDENCE_BADGE[confidence] || 'warn';
    var label = CONFIDENCE_LABEL[confidence] || confidence;
    return '<span class="checker-badge checker-badge-' + accent + '">' + escapeHtml(label) + '</span>';
  }

  var CTA = {
    unmatched_found: {
      icon: 'ri-signpost-line',
      heading: 'Some of these URLs need a human decision.',
      body: 'This is exactly the kind of judgment call worth getting right &mdash; a wrong guess here loses rankings and traffic that took years to build.',
      primary: { href: '../../services/domain-migration-redirects/', label: 'Domain Change & 301 Redirects' },
      secondary: { href: '../../blog/redesign-without-losing-rankings/', label: 'Redesign Without Losing Rankings' }
    },
    all_matched: {
      icon: 'ri-checkbox-circle-line',
      heading: 'Every old URL found a confident match.',
      body: 'That covers the mapping itself &mdash; the redirects still need implementing correctly, tested, and checked against crawl errors after launch. Worth having a second pair of eyes on that before it goes live.',
      primary: { href: '../../services/domain-migration-redirects/', label: 'Domain Change & 301 Redirects' },
      secondary: { href: '../../blog/redesign-without-losing-rankings/', label: 'Redesign Without Losing Rankings' }
    }
  };

  function renderCta(hint) {
    var c = CTA[hint] || CTA.unmatched_found;
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

  function sideSummaryBody(side) {
    var rows = row('Source', side.mode === 'sitemap' ? '<code>' + escapeHtml(side.source) + '</code>' : escapeHtml(side.source));
    rows += row('URLs read', String(side.count));
    if (side.note) {
      rows += row('Note', escapeHtml(side.note));
    }
    return table(rows);
  }

  function matchesTable(matches) {
    if (matches.length === 0) {
      return '<div class="redirect-table-empty">No confident matches were found.</div>';
    }
    var rowsHtml = matches.map(function (m) {
      return (
        '<tr>' +
          '<td><code>' + escapeHtml(m.old_path) + '</code></td>' +
          '<td><code>' + escapeHtml(m.new_full_url || m.new_path) + '</code></td>' +
          '<td>' + confidenceBadge(m.confidence) + '</td>' +
        '</tr>'
      );
    }).join('');
    return (
      '<div class="redirect-table-wrap"><table class="redirect-table">' +
        '<thead><tr><th>Old URL</th><th>New URL</th><th>Confidence</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table></div>'
    );
  }

  function unmatchedTable(unmatched) {
    if (unmatched.length === 0) {
      return '<div class="redirect-table-empty">Every old URL found a confident match &mdash; nothing here needs a manual decision.</div>';
    }
    var rowsHtml = unmatched.map(function (u) {
      return '<tr><td><code>' + escapeHtml(u.old_path) + '</code></td></tr>';
    }).join('');
    return (
      '<div class="redirect-table-wrap"><table class="redirect-table">' +
        '<thead><tr><th>Old URL &mdash; no confident match</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table></div>'
    );
  }

  function render(data) {
    lastData = data;
    var html = '';

    html += '<div class="row row-cols-1 row-cols-lg-2 g-4 mb-2">';
    html += panel('Old Site', 'ri-file-list-3-line', sideSummaryBody(data.old), data.old.truncated ? 'warn' : 'unknown');
    html += panel('New Site', 'ri-file-list-3-line', sideSummaryBody(data.new), data.new.truncated ? 'warn' : 'unknown');
    html += '</div>';

    html += '<div class="checker-panel stat-card' + (data.counts.unmatched > 0 ? ' checker-panel-warn' : ' checker-panel-good') + ' mb-4">';
    html += '<div class="checker-section-head"><h3><i class="ri-git-merge-line" aria-hidden="true"></i> Match Summary</h3></div>';
    html += '<p class="checker-verdict">' + escapeHtml(data.counts.matched) + ' matched &middot; ' + escapeHtml(data.counts.unmatched) + ' unmatched</p>';
    html += '<p class="checker-row-note mt-1">' + escapeHtml(data.summary) + '</p>';
    html += '</div>';

    html += '<h3 class="mb-3">Matched redirects (' + data.counts.matched + ')</h3>';
    html += matchesTable(data.matches);

    html += '<h3 class="mb-3 mt-4">Needs a human decision (' + data.counts.unmatched + ')</h3>';
    html += unmatchedTable(data.unmatched);

    html += '<div class="btn-row mt-4 mb-4">';
    html += '<button type="button" class="btn btn-primary" id="redirectDownloadCsv"><i class="ri-file-download-line" aria-hidden="true"></i> Download CSV</button>';
    html += '<button type="button" class="btn btn-ghost" id="redirectDownloadHtaccess"><i class="ri-file-download-line" aria-hidden="true"></i> Download .htaccess snippet</button>';
    html += '</div>';
    html += '<p class="checker-row-note mb-4">The .htaccess snippet only covers matched redirects &mdash; paste it near the top of your .htaccess, above the WordPress block. The ' + data.counts.unmatched + ' unmatched URL' + (data.counts.unmatched === 1 ? '' : 's') + ' still need' + (data.counts.unmatched === 1 ? 's' : '') + ' a manual decision.</p>';

    html += renderCta(data.cta_hint);

    resultsBody.innerHTML = html;
    results.classList.add('is-visible');
    resultsHeading.focus();
    resultsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });

    var csvBtn = document.getElementById('redirectDownloadCsv');
    if (csvBtn) csvBtn.addEventListener('click', downloadCsv);
    var htaccessBtn = document.getElementById('redirectDownloadHtaccess');
    if (htaccessBtn) htaccessBtn.addEventListener('click', downloadHtaccess);
  }

  function csvField(value) {
    var s = String(value === null || value === undefined ? '' : value);
    // Formula-injection guard (CWE-1236): old/new URLs can come from a
    // third-party sitemap this tool's user doesn't control, so a value
    // starting with =, +, -, @ or a tab/CR is neutralised the standard way
    // (a leading apostrophe forces text interpretation) before a spreadsheet
    // app gets the chance to read it as a formula.
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s;
    }
    if (/[",\n]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function triggerDownload(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadCsv() {
    if (!lastData) return;
    var lines = [['Old URL', 'New URL', 'Confidence', 'Status'].map(csvField).join(',')];
    lastData.matches.forEach(function (m) {
      lines.push([m.old_path, m.new_full_url || m.new_path, CONFIDENCE_LABEL[m.confidence] || m.confidence, 'Matched'].map(csvField).join(','));
    });
    lastData.unmatched.forEach(function (u) {
      lines.push([u.old_path, '', '', 'Needs manual review'].map(csvField).join(','));
    });
    triggerDownload('redirect-map.csv', lines.join('\r\n'), 'text/csv;charset=utf-8;');
  }

  function downloadHtaccess() {
    if (!lastData) return;
    var pathOnlyNew = lastData.matches.some(function (m) { return !m.new_full_url; });
    var lines = [
      '# Redirect map generated by https://ashekur.com/tools/redirect-map-generator/',
      '# ' + lastData.counts.matched + ' confident match' + (lastData.counts.matched === 1 ? '' : 'es') + ', ' + lastData.counts.unmatched + ' unmatched (see the CSV export for the full list)',
      '# Paste this near the top of your .htaccess, above the WordPress block.'
    ];
    if (pathOnlyNew) {
      lines.push('# NOTE: some "new" URLs were pasted as paths only — replace them below with the full URL on your new domain.');
    }
    lines.push('');
    lastData.matches.forEach(function (m) {
      lines.push('Redirect 301 ' + m.old_path + ' ' + (m.new_full_url || m.new_path));
    });
    triggerDownload('redirect-map-snippet.txt', lines.join('\n'), 'text/plain;charset=utf-8;');
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

  function runCheck(oldValue, newValue) {
    showNote('info', 'Building the redirect map… large sitemaps can take a little while.');
    results.classList.remove('is-visible');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line checker-loading-icon" aria-hidden="true"></i> Building…';
    }

    fetch(form.getAttribute('data-endpoint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old: oldValue, new: newValue })
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
        showNote('error', 'Could not reach the redirect map generator. Please try again in a moment.');
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
    var oldValue = (oldInput.value || '').trim();
    var newValue = (newInput.value || '').trim();
    if (!oldValue || !newValue) {
      showNote('error', 'Please provide both the old and new URLs.');
      (oldValue ? newInput : oldInput).focus();
      return;
    }
    runCheck(oldValue, newValue);
  });
})();
