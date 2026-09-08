#!/usr/bin/env node
/* Static-site generator for the /questions/ Q&A Knowledge Base.
 *
 * ashekur.com has no CMS or build step — every other page on the site is a
 * hand-authored HTML file. A 100+ question knowledge base can't reasonably
 * be hand-authored one HTML file at a time without templates drifting out
 * of sync, so this script is the one deliberate exception: content lives as
 * structured JSON in content/questions/, and this script renders it into
 * the exact same static HTML the rest of the site uses. Nothing here ships
 * to the browser — it's an authoring-time tool only.
 *
 * Usage: node scripts/build-questions.mjs
 *
 * To add a new question: create a new content/questions/<name>.json file
 * (copy an existing one as a starting point), then re-run this script. To
 * add a new category or subcategory: edit content/questions/taxonomy.json.
 * Neither requires touching this script or any template.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'questions');
const OUT_DIR = path.join(ROOT, 'questions');
const PLACEHOLDER_DIR = path.join(ROOT, 'assets', 'images', 'placeholders');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SITE_URL = 'https://ashekur.com';
const TODAY = new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------------------------
 * Load content
 * ------------------------------------------------------------------------- */

const taxonomy = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'taxonomy.json'), 'utf8'));

const questionFiles = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json') && f !== 'taxonomy.json');
const questions = questionFiles.map((f) => {
  const data = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8'));
  data._file = f;
  return data;
});

function findCategory(catSlug) {
  const cat = taxonomy.categories.find((c) => c.slug === catSlug);
  if (!cat) throw new Error(`Unknown category "${catSlug}" (check taxonomy.json)`);
  return cat;
}

function findSubcategory(catSlug, subSlug) {
  if (!subSlug) return null;
  const cat = findCategory(catSlug);
  const sub = (cat.children || []).find((s) => s.slug === subSlug);
  if (!sub) throw new Error(`Unknown subcategory "${subSlug}" under "${catSlug}" (check taxonomy.json)`);
  return sub;
}

// Validate every question up front so a typo fails the whole build loudly
// rather than silently producing a broken page.
for (const q of questions) {
  findCategory(q.category);
  if (q.subcategory) findSubcategory(q.category, q.subcategory);
  for (const field of ['slug', 'question', 'metaDescription', 'shortAnswer', 'bodyHtml']) {
    if (!q[field]) throw new Error(`${q._file} is missing required field "${field}"`);
  }
}

function urlPath(q) {
  const parts = ['questions', q.category];
  if (q.subcategory) parts.push(q.subcategory);
  parts.push(q.slug);
  return '/' + parts.join('/') + '/';
}

function catUrlPath(catSlug) {
  return `/questions/${catSlug}/`;
}

function subUrlPath(catSlug, subSlug) {
  return `/questions/${catSlug}/${subSlug}/`;
}

/* ---------------------------------------------------------------------------
 * Related questions — same subcategory first, then same category, excluding
 * self, capped at 4. No manual per-question list to keep in sync.
 * ------------------------------------------------------------------------- */

function relatedQuestions(q, max = 4) {
  const sameSub = questions.filter((o) => o !== q && o.category === q.category && o.subcategory === q.subcategory);
  const sameCat = questions.filter((o) => o !== q && o.category === q.category && o.subcategory !== q.subcategory);
  return [...sameSub, ...sameCat].slice(0, max);
}

/* ---------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------- */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// Google's SERP title display reliably starts truncating past ~65
// characters. Past that, drop the " | Ashekur Rahman" suffix rather than
// let it get cut off mid-word — Google usually appends the site name in
// results on its own once the title alone approaches this length anyway.
const SITE_TITLE_SUFFIX = ' | Ashekur Rahman';
function pageTitle(base) {
  return base.length + SITE_TITLE_SUFFIX.length > 65 ? base : `${base}${SITE_TITLE_SUFFIX}`;
}

function relPrefix(depth) {
  return depth === 0 ? './' : '../'.repeat(depth);
}

// depth = number of path segments in the page's own URL, e.g.
// /questions/woocommerce/subscriptions/slug/ has depth 4.
function depthOf(urlPathStr) {
  return urlPathStr.split('/').filter(Boolean).length;
}

function extractHeadings(html) {
  const re = /<h2 id="([^"]+)">(.*?)<\/h2>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    out.push({ id: m[1], label: m[2].replace(/<[^>]+>/g, '') });
  }
  return out;
}

function hasCodeBlock(html) {
  return /<pre[^>]*>\s*<code/.test(html);
}

/* ---------------------------------------------------------------------------
 * Placeholder SVG — one simple, on-brand template, written out to a unique
 * per-question file path so a real generated illustration can later replace
 * each file in place without touching any HTML.
 * ------------------------------------------------------------------------- */

function placeholderSvg(title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720" role="img" aria-labelledby="phTitle">
  <title id="phTitle">${escapeHtml(title)}</title>
  <defs>
    <radialGradient id="bgFade" cx="50%" cy="36%" r="78%">
      <stop offset="0%" stop-color="#141f38" />
      <stop offset="100%" stop-color="#0a1020" />
    </radialGradient>
    <radialGradient id="gIndigo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.42" />
      <stop offset="66%" stop-color="#4f46e5" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="gGreen" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.28" />
      <stop offset="66%" stop-color="#34d399" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bgFade)" />
  <circle cx="360" cy="230" r="360" fill="url(#gIndigo)" />
  <circle cx="960" cy="520" r="380" fill="url(#gGreen)" />
  <rect x="440" y="260" width="400" height="260" rx="18" fill="none" stroke="#818cf8" stroke-width="2" opacity="0.5" />
  <circle cx="500" cy="320" r="22" fill="none" stroke="#a5b4fc" stroke-width="2" opacity="0.8" />
  <path d="M460 470 L560 390 L640 440 L780 340" fill="none" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />
  <text x="640" y="640" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#64748b">Illustration placeholder</text>
</svg>
`;
}

/* ---------------------------------------------------------------------------
 * Chrome — header/nav/footer, identical to the rest of the site, templated
 * by depth so relative links resolve correctly at any nesting level.
 * ------------------------------------------------------------------------- */

function headerNav(prefix, activeIsQuestions) {
  const qClass = activeIsQuestions ? ' is-active' : '';
  return `<header class="site-header" id="siteHeader">
  <div class="container header-inner">
    <a class="brand" href="${prefix}" aria-label="Ashekur Rahman &mdash; home">
      <picture>
        <source srcset="${prefix}assets/images/ashekur-logo-light.webp" type="image/webp" />
        <img src="${prefix}assets/images/ashekur-logo-light.png" alt="Ashekur Rahman" width="480" height="125" fetchpriority="high" decoding="async" />
      </picture>
    </a>
    <nav class="nav-desktop" aria-label="Main">
      <a href="${prefix}" class="nav-link">Home</a>
      <a href="${prefix}tools/" class="nav-link">Tools</a>
      <div class="nav-item" data-dropdown>
        <div class="nav-row">
          <a href="${prefix}services/" class="nav-link">Services</a>
          <button class="nav-caret" type="button" aria-label="Services submenu" aria-expanded="false" aria-controls="navDrop-services" data-dropdown-toggle><i class="ri-arrow-down-s-line" aria-hidden="true"></i></button>
        </div>
        <div class="nav-panel" id="navDrop-services">
          <a class="nav-panel-all" href="${prefix}services/">All services</a>
          <div class="nav-panel-cols">
            <div class="nav-panel-col">
              <p class="nav-panel-col-head">WordPress</p>
              <a href="${prefix}services/wordpress-development/">WordPress Development</a>
              <a href="${prefix}services/wordpress-customization/">WordPress Customization</a>
              <a href="${prefix}services/wordpress-bug-fix/">WordPress Bug Fix</a>
              <a href="${prefix}services/wordpress-maintenance/">WordPress Maintenance<em>New</em></a>
            </div>
            <div class="nav-panel-col">
              <p class="nav-panel-col-head">Page Builders</p>
              <a href="${prefix}services/elementor-fix/">Elementor Bug Fix</a>
              <a href="${prefix}services/elementor-customization/">Elementor Customization</a>
              <a href="${prefix}services/elementor-custom-widgets/">Elementor Custom Widgets</a>
              <a href="${prefix}services/divi-customization/">Divi Customization</a>
              <a href="${prefix}services/divi-5-migration/">Divi 5 Migration<em>New</em></a>
            </div>
            <div class="nav-panel-col">
              <p class="nav-panel-col-head">WooCommerce</p>
              <a href="${prefix}services/woocommerce-development/">WooCommerce Development</a>
              <a href="${prefix}services/woocommerce-fix/">WooCommerce Fixes</a>
            </div>
            <div class="nav-panel-col">
              <p class="nav-panel-col-head">Performance &amp; Security</p>
              <a href="${prefix}services/wordpress-speed-optimization/">WordPress Speed Optimization</a>
              <a href="${prefix}services/core-web-vitals-fix/">Core Web Vitals Fix<em>New</em></a>
              <a href="${prefix}services/wordpress-malware-removal/">WordPress Malware Removal</a>
              <a href="${prefix}services/google-blacklist-removal/">Google Blacklist Removal<em>New</em></a>
              <a href="${prefix}services/caching-cdn-setup/">Caching &amp; CDN Setup<em>New</em></a>
              <a href="${prefix}services/wordpress-security-hardening/">WordPress Security Hardening<em>New</em></a>
            </div>
            <div class="nav-panel-col">
              <p class="nav-panel-col-head">Migration</p>
              <a href="${prefix}services/wordpress-migration/">WordPress Migration</a>
              <a href="${prefix}services/domain-migration-redirects/">Domain Migration &amp; 301 Redirects<em>New</em></a>
              <a href="${prefix}services/wordpress-migration/#hosting">Host Migration</a>
            </div>
            <div class="nav-panel-col">
              <p class="nav-panel-col-head">SEO</p>
              <a href="${prefix}services/seo/">SEO</a>
              <a href="${prefix}services/technical-seo-audit/">Technical SEO Audit<em>New</em></a>
            </div>
            <div class="nav-panel-col">
              <p class="nav-panel-col-head">Other</p>
              <a href="${prefix}services/webflow-development/">Webflow Development</a>
              <a href="${prefix}services/frontend-development/">Frontend Development</a>
              <a href="${prefix}services/website-redesign/">Website Redesign<em>New</em></a>
              <a href="${prefix}services/white-label-wordpress-development/">White Label Development<em>New</em></a>
            </div>
          </div>
        </div>
      </div>
      <a href="${prefix}pricing/" class="nav-link">Pricing</a>
      <a href="${prefix}portfolio/" class="nav-link">Portfolio</a>
      <a href="${prefix}blog/" class="nav-link">Blog</a>
      <a href="${prefix}questions/" class="nav-link${qClass}">Questions</a>
      <a href="${prefix}contact/" class="btn btn-primary btn-sm nav-cta">Start a project</a>
    </nav>
    <button class="burger" id="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobileNav">
      <span></span><span></span><span></span>
    </button>
  </div>
  <nav class="nav-mobile" id="mobileNav" aria-label="Mobile" hidden>
    <a href="${prefix}">Home</a>
    <a href="${prefix}tools/">Tools</a>
    <div class="nav-item" data-dropdown>
      <div class="nav-row">
        <a href="${prefix}services/">Services</a>
        <button class="nav-caret" type="button" aria-label="Services submenu" aria-expanded="false" aria-controls="navDropM-services" data-dropdown-toggle><i class="ri-arrow-down-s-line" aria-hidden="true"></i></button>
      </div>
      <div class="nav-panel" id="navDropM-services">
        <a href="${prefix}services/">All services</a>
        <a href="${prefix}services/wordpress-development/">WordPress Development</a>
        <a href="${prefix}services/wordpress-customization/">WordPress Customization</a>
        <a href="${prefix}services/wordpress-bug-fix/">WordPress Bug Fix</a>
        <a href="${prefix}services/wordpress-maintenance/">WordPress Maintenance</a>
        <a href="${prefix}services/elementor-fix/">Elementor Bug Fix</a>
        <a href="${prefix}services/elementor-customization/">Elementor Customization</a>
        <a href="${prefix}services/divi-customization/">Divi Customization</a>
        <a href="${prefix}services/divi-5-migration/">Divi 5 Migration</a>
        <a href="${prefix}services/elementor-custom-widgets/">Elementor Custom Widgets</a>
        <a href="${prefix}services/wordpress-speed-optimization/">WordPress Speed Optimization</a>
        <a href="${prefix}services/core-web-vitals-fix/">Core Web Vitals Fix</a>
        <a href="${prefix}services/woocommerce-fix/">WooCommerce Fixes</a>
        <a href="${prefix}services/woocommerce-development/">WooCommerce Development</a>
        <a href="${prefix}services/wordpress-migration/">WordPress Migration</a>
        <a href="${prefix}services/domain-migration-redirects/">Domain Migration &amp; 301 Redirects</a>
        <a href="${prefix}services/seo/">WordPress SEO</a>
        <a href="${prefix}services/wordpress-malware-removal/">WordPress Malware Removal</a>
        <a href="${prefix}services/google-blacklist-removal/">Google Blacklist Removal</a>
        <a href="${prefix}services/wordpress-security-hardening/">WordPress Security Hardening</a>
        <a href="${prefix}services/webflow-development/">Webflow Development</a>
        <a href="${prefix}services/frontend-development/">Frontend Development</a>
        <a href="${prefix}services/website-redesign/">Website Redesign</a>
        <a href="${prefix}services/white-label-wordpress-development/">White Label Development</a>
      </div>
    </div>
    <a href="${prefix}pricing/">Pricing</a>
    <a href="${prefix}portfolio/">Portfolio</a>
    <a href="${prefix}blog/">Blog</a>
    <a href="${prefix}questions/">Questions</a>
    <a href="${prefix}contact/" class="btn btn-primary">Start a project</a>
  </nav>
</header>`;
}

function footer(prefix) {
  return `<footer class="site-footer">
  <div class="container footer-top">
    <div class="row gx-4 gy-5 align-items-start">
      <div class="footer-brand col-12 col-lg-5">
        <div class="brand brand-lg">
          <picture>
            <source srcset="${prefix}assets/images/ashekur-logo-light.webp" type="image/webp" />
            <img src="${prefix}assets/images/ashekur-logo-light.png" alt="ashekur.com" width="480" height="125" loading="lazy" decoding="async" />
          </picture>
        </div>
        <p class="footer-blurb">Frontend development and WordPress engineering for teams that care how it feels, not just how it looks. Based in Bangladesh &mdash; serving clients worldwide.</p>
      </div>
      <div class="col-12 col-lg-7">
        <div class="footer-cols row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4">
          <nav class="col" aria-label="Services">
            <p class="mono footer-head">SERVICES</p>
            <a href="${prefix}services/wordpress-development/">WordPress Development</a>
            <a href="${prefix}services/wordpress-customization/">WordPress Customization</a>
            <a href="${prefix}services/elementor-customization/">Elementor Customization</a>
            <a href="${prefix}services/woocommerce-development/">WooCommerce Development</a>
            <a href="${prefix}services/wordpress-speed-optimization/">WordPress Speed Optimization</a>
            <a href="${prefix}services/wordpress-bug-fix/">WordPress Bug Fix</a>
            <a href="${prefix}services/elementor-fix/">Elementor Bug Fix</a>
            <a href="${prefix}services/wordpress-migration/">WordPress Migration</a>
            <a href="${prefix}services/seo/">WordPress SEO</a>
          </nav>
          <nav class="col" aria-label="Site">
            <p class="mono footer-head">SITEMAP</p>
            <a href="${prefix}">Home</a>
            <a href="${prefix}tools/">Tools</a>
            <a href="${prefix}portfolio/">Portfolio</a>
            <a href="${prefix}blog/">Blog</a>
            <a href="${prefix}questions/">Questions</a>
            <a href="${prefix}#experience">Experience</a>
            <a href="${prefix}contact/">Contact</a>
            <a href="${prefix}privacy/">Privacy Policy</a>
          </nav>
          <div class="col">
            <p class="mono footer-head">ELSEWHERE</p>
            <a href="mailto:hello@ashekur.com"><i class="ri-mail-line" aria-hidden="true"></i>hello@ashekur.com</a>
            <a href="https://wa.me/8801812764112" target="_blank" rel="noopener noreferrer"><i class="ri-whatsapp-line" aria-hidden="true"></i>WhatsApp</a>
            <a href="https://www.linkedin.com/in/ashekur-rahman-1ab205122/" target="_blank" rel="noopener noreferrer"><i class="ri-linkedin-fill" aria-hidden="true"></i>LinkedIn</a>
            <a href="https://github.com/AshekurRahman" target="_blank" rel="noopener noreferrer"><i class="ri-github-fill" aria-hidden="true"></i>GitHub</a>
            <a href="https://www.upwork.com/freelancers/~010aabe60ec2ae6679" target="_blank" rel="noopener noreferrer"><i class="ri-upwork-fill" aria-hidden="true"></i>Upwork</a>
            <a href="https://www.facebook.com/ashekur.rahman.hridoy" target="_blank" rel="noopener noreferrer"><i class="ri-facebook-circle-fill" aria-hidden="true"></i>Facebook</a>
            <a href="https://www.instagram.com/ashekurhridoy/" target="_blank" rel="noopener noreferrer"><i class="ri-instagram-line" aria-hidden="true"></i>Instagram</a>
            <a href="https://www.youtube.com/@ashekurrahman1431" target="_blank" rel="noopener noreferrer"><i class="ri-youtube-fill" aria-hidden="true"></i>YouTube</a>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="container footer-bottom">
    <p class="mono copyright">&copy; 2026 Ashekur Rahman. All rights reserved.</p>
    <a class="to-top-inline" href="#main"><i class="ri-arrow-up-line" aria-hidden="true"></i> Back to top</a>
  </div>
</footer>`;
}

function scripts(prefix, needsPrism) {
  const prismScripts = needsPrism
    ? `
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js" defer></script>`
    : '';
  return `<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js" integrity="sha384-HOvlOYPIs/zjoIkWUGXkVmXsjr8GuZLV+Q+rcPwmJOVZVpvTSXQChiN4t9Euv9Vc" crossorigin="anonymous" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js" integrity="sha384-P8VzCVnT9NBUkMrpcIZrJbA7EBjJvh/fJS6PmP+4nLIM284DtsImIv8D0fFjIkeh" crossorigin="anonymous" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js" integrity="sha384-xb96EMJeax+NLXMC88ZBa1xAeAW+kn+horHh/zFlbMLG2UPWhMJJSlv7fi57hS+Q" crossorigin="anonymous" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollSmoother.min.js" integrity="sha384-dd8lT3AimXbI347qlZzlijPa4qnSlgGxuTqK2HlcfvF5+aOIeddPdMFmFpypQPZN" crossorigin="anonymous" defer></script>
<script src="${prefix}assets/js/anim.js" defer></script>
<script src="${prefix}assets/js/main.js" defer></script>${prismScripts}`;
}

function page({ prefix, title, metaDescription, canonicalPath, ogImage, jsonLd, bodyHtml, needsPrism, ogType = 'website', noindex = false }) {
  const prismCss = needsPrism
    ? `<link rel="stylesheet" href="${prefix}assets/css/qa-code.css" />`
    : '';
  const ogImageUrl = ogImage ? `${SITE_URL}${ogImage}` : `${SITE_URL}/assets/images/og-default.jpg`;
  // Empty category/subcategory archives (no questions tagged yet) are real,
  // linked pages — useful for users browsing the taxonomy — but publishing
  // several near-identical "nothing here yet" pages as index,follow is
  // exactly the thin/near-duplicate-content pattern search engines flag.
  // noindex,follow keeps them crawlable (so a new question underneath is
  // still discovered) without asking Google to rank an empty page. Once a
  // category/subcategory gets its first question, its next generator run
  // switches this back to index,follow automatically.
  const robotsContent = noindex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(metaDescription)}" />
<meta name="author" content="Ashekur Rahman" />
<meta name="robots" content="${robotsContent}" />
<meta name="theme-color" content="#0F172A" />
<link rel="canonical" href="${SITE_URL}${canonicalPath}" />
<link rel="icon" href="${prefix}assets/images/mark.png" type="image/png" />
<link rel="apple-touch-icon" href="${prefix}assets/images/mark.png" />
<link rel="manifest" href="${prefix}site.webmanifest" />
<meta property="og:type" content="${ogType}" />
<meta property="og:site_name" content="Ashekur Rahman" />
<meta property="og:url" content="${SITE_URL}${canonicalPath}" />
<meta property="og:title" content="${escapeAttr(title)}" />
<meta property="og:description" content="${escapeAttr(metaDescription)}" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="og:locale" content="en_US" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeAttr(title)}" />
<meta name="twitter:description" content="${escapeAttr(metaDescription)}" />
<meta name="twitter:image" content="${ogImageUrl}" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preconnect" href="https://www.googletagmanager.com" />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap" rel="stylesheet" />
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous" />
<link rel="stylesheet" href="${prefix}assets/fonts/remixicon.css" />
<link rel="stylesheet" href="${prefix}assets/css/template.css" />
${prismCss}
<script>var d=document.documentElement;d.classList.remove('no-js');d.classList.add('js-anim');</script>
<script type="application/ld+json">
${jsonLd}
</script>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-SGTGDFXH6K"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-SGTGDFXH6K');
</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

${headerNav(prefix, true)}

<div id="smooth-wrapper">
<div id="smooth-content">
<main id="main" class="page-shell">

${bodyHtml}

</main>

${footer(prefix)}
</div>
</div>


<a class="wa-float" href="https://wa.me/8801812764112" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"><i class="ri-whatsapp-fill" aria-hidden="true"></i></a>

${scripts(prefix, needsPrism)}
</body>
</html>
`;
}

/* ---------------------------------------------------------------------------
 * Shared partials: breadcrumbs, related questions, CTA
 * ------------------------------------------------------------------------- */

function breadcrumbNav(items) {
  // items: [{label, href}], last item has no href (current page)
  const li = items
    .map((it, i) => {
      if (i === items.length - 1) return `<li><span aria-current="page">${escapeHtml(it.label)}</span></li>`;
      return `<li><a href="${it.href}">${escapeHtml(it.label)}</a></li>`;
    })
    .join('\n              ');
  return `<nav class="breadcrumb" aria-label="Breadcrumb">
            <ol>
              ${li}
            </ol>
          </nav>`;
}

function breadcrumbJsonLd(items, baseUrl) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.label,
      item: it.href ? `${baseUrl}${it.href.replace(/^(\.\.\/)+|^\.\//, '/')}` : undefined,
    })),
  };
}

function relatedQuestionsBlock(prefix, related, headingLabel) {
  if (!related.length) return '';
  const cards = related
    .map((r) => {
      const href = `${prefix}${urlPath(r).slice(1)}`;
      return `<div class="col">
          <a data-anim="item" class="related-card h-100" href="${href}">
            <strong>${escapeHtml(r.question)}</strong>
            <span>${escapeHtml(r.metaDescription)}</span>
          </a>
        </div>`;
    })
    .join('\n        ');
  return `<section class="section section-dark">
    <div class="container">
      <p data-anim="fade" class="eyebrow mb-4"><span class="eyebrow-mark eyebrow-mark-light" aria-hidden="true"></span><span class="mono">RELATED ${escapeHtml(headingLabel).toUpperCase()}</span></p>
      <div data-anim="stagger" class="row row-cols-1 row-cols-sm-2 row-cols-lg-4 g-4 related-grid">
        ${cards}
      </div>
    </div>
  </section>`;
}

function ctaBlock(cta, prefix) {
  return `<aside class="post-cta">
            <p class="mono post-cta-head">NEED THIS SORTED?</p>
            <h2>${escapeHtml(cta.heading)}</h2>
            <p>${cta.body}</p>
            <div data-anim="fade" class="btn-row">
              <a class="btn btn-primary" href="${prefix}${cta.href}">${escapeHtml(cta.label)} <i class="ri-arrow-right-line" aria-hidden="true"></i></a>
              <a class="btn btn-ghost" href="${prefix}contact/">Ask a question</a>
            </div>
          </aside>`;
}

function contactCtaSection() {
  return `<section class="section section-dark section-contact">
    <div class="hero-grid-bg contact-grid-bg" aria-hidden="true"></div>
    <div class="glow glow-d" aria-hidden="true"></div>
    <div class="container">
      <div class="contact-cta-shell">
        <div data-anim="fade" class="contact-cta-card">
          <div class="contact-cta-copy">
            <p class="badge badge-live mx-auto"><span class="dot" aria-hidden="true"></span>Available for new projects</p>
            <p class="eyebrow eyebrow-center"><span class="eyebrow-mark eyebrow-mark-light" aria-hidden="true"></span><span class="mono">NEXT STEP</span></p>
            <h2 data-anim="lines">Rather have it fixed than keep reading?</h2>
            <p class="body-lg">Based in Bangladesh &mdash; serving clients worldwide. Tell me what's happening and you'll have a reply within one working day.</p>
          </div>
          <ul class="tech-chips justify-content-center">
            <li>Reply within one working day</li>
            <li>Fixed quote before work starts</li>
            <li>UK, EU and US hours covered</li>
          </ul>
          <div class="contact-cta-actions">
            <a class="btn btn-primary" href="contact/">Start a project <i class="ri-arrow-right-line" aria-hidden="true"></i></a>
            <a class="btn btn-ghost" href="mailto:hello@ashekur.com">hello@ashekur.com</a>
            <a class="btn btn-ghost" href="https://wa.me/8801812764112" target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

// contactCtaSection uses root-relative-ish hrefs above only as a fallback;
// build per-depth version instead so it works at every nesting level.
function contactCtaSectionAtDepth(prefix) {
  return contactCtaSection().replace('href="contact/"', `href="${prefix}contact/"`);
}

/* ---------------------------------------------------------------------------
 * Individual question page
 * ------------------------------------------------------------------------- */

const generatedUrls = [];
const placeholderAssetPaths = [];

function buildQuestionPage(q) {
  const cat = findCategory(q.category);
  const sub = q.subcategory ? findSubcategory(q.category, q.subcategory) : null;
  const cta = q.cta || sub?.cta || cat.cta;

  const uPath = urlPath(q);
  const depth = depthOf(uPath);
  const prefix = relPrefix(depth);

  const imgName = `${q.category}${q.subcategory ? '-' + q.subcategory : ''}-${q.slug}.svg`;
  const imgPublicPath = `/assets/images/placeholders/${imgName}`;
  fs.mkdirSync(PLACEHOLDER_DIR, { recursive: true });
  fs.writeFileSync(path.join(PLACEHOLDER_DIR, imgName), placeholderSvg(q.image.alt));
  placeholderAssetPaths.push(imgName);

  const headings = extractHeadings(q.bodyHtml);
  const needsPrism = q.hasCode || hasCodeBlock(q.bodyHtml);

  const breadcrumbItems = [{ label: 'Home', href: `${prefix}` }, { label: 'Questions', href: `${prefix}questions/` }, { label: cat.shortName, href: `${prefix}${catUrlPath(q.category).slice(1)}` }];
  if (sub) breadcrumbItems.push({ label: sub.shortName, href: `${prefix}${subUrlPath(q.category, q.subcategory).slice(1)}` });
  breadcrumbItems.push({ label: q.question });

  const toc = headings.length
    ? `<nav class="toc" aria-label="On this page">
              <p class="toc-head mono">ON THIS PAGE</p>
              <ol>
              ${headings.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.label)}</a></li>`).join('\n              ')}
              </ol>
            </nav>`
    : '';

  const related = relatedQuestions(q);
  const relatedHeadingLabel = sub ? `${sub.shortName} Questions` : `${cat.shortName} Questions`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbJsonLd(breadcrumbItems, SITE_URL),
      {
        '@type': 'TechArticle',
        '@id': `${SITE_URL}${uPath}#article`,
        headline: q.question,
        description: q.metaDescription,
        url: `${SITE_URL}${uPath}`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}${uPath}` },
        image: `${SITE_URL}${imgPublicPath}`,
        datePublished: q.datePublished,
        dateModified: q.dateModified || q.datePublished,
        author: { '@type': 'Person', '@id': `${SITE_URL}/#person`, name: 'Ashekur Rahman', url: SITE_URL },
        publisher: { '@type': 'Person', '@id': `${SITE_URL}/#person`, name: 'Ashekur Rahman', url: SITE_URL },
        articleSection: sub ? sub.name : cat.name,
        inLanguage: 'en',
        isAccessibleForFree: true,
      },
    ],
  };

  const bodyHtml = `  <article>
  <section class="section section-dark page-intro page-hero">
    <div class="hero-grid-bg" aria-hidden="true"></div>
    <div class="glow glow-a" aria-hidden="true"></div>
    <div class="glow glow-b" aria-hidden="true"></div>
    <div class="container">
      <div class="row hero-split">
        <div data-anim-hero class="col-12 col-lg-9">
          ${breadcrumbNav(breadcrumbItems)}
          <p class="post-meta mono"><span class="post-cat">${escapeHtml(sub ? sub.shortName : cat.shortName)}</span><span>${escapeHtml(q.readTime || '5 min read')}</span><span>${q.datePublished}</span><span>Ashekur Rahman</span></p>
          <h1 data-anim="lines">${escapeHtml(q.question)}</h1>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-white">
    <div class="container">
      <figure data-anim="reveal" class="shot mb-5">
        <img src="${prefix}${imgPublicPath.slice(1)}" alt="${escapeAttr(q.image.alt)}" width="1280" height="720" loading="lazy" decoding="async" />
        <!-- IMAGE PROMPT:
        ${q.image.prompt}
        -->
      </figure>

      <div class="row gx-5 gy-4">
        <aside class="col-12 col-lg-4 order-lg-2">
          <div class="post-aside">
            <div class="qa-short-answer">
              <p class="mono post-cta-head">SHORT ANSWER</p>
              ${q.shortAnswer}
            </div>
            ${toc}
          </div>
        </aside>
        <div class="col-12 col-lg-8 order-lg-1">
          <div class="prose">
${q.bodyHtml}
          </div>

          ${ctaBlock(cta, prefix)}
        </div>
      </div>
    </div>
  </section>
  </article>

  ${relatedQuestionsBlock(prefix, related, relatedHeadingLabel)}

  ${contactCtaSectionAtDepth(prefix)}`;

  const html = page({
    prefix,
    title: pageTitle(q.question),
    metaDescription: q.metaDescription,
    canonicalPath: uPath,
    ogImage: imgPublicPath,
    jsonLd: JSON.stringify(jsonLd, null, 2),
    bodyHtml,
    needsPrism,
    ogType: 'article',
  });

  const outFile = path.join(OUT_DIR, q.category, q.subcategory || '', q.slug, 'index.html');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  generatedUrls.push({ loc: uPath, lastmod: q.dateModified || q.datePublished });
}

/* ---------------------------------------------------------------------------
 * Archive pages: subcategory, category, and the main /questions/ hub
 * ------------------------------------------------------------------------- */

function questionCard(prefix, q) {
  const cat = findCategory(q.category);
  const sub = q.subcategory ? findSubcategory(q.category, q.subcategory) : null;
  const href = `${prefix}${urlPath(q).slice(1)}`;
  return `<div class="col">
          <article data-anim="item" class="post-card h-100">
            <div class="post-card-body">
              <p class="post-meta mono"><span class="post-cat">${escapeHtml(sub ? sub.shortName : cat.shortName)}</span><span>${escapeHtml(q.readTime || '5 min read')}</span></p>
              <h3><a href="${href}">${escapeHtml(q.question)}</a></h3>
              <p>${escapeHtml(q.metaDescription)}</p>
              <a class="mono text-link" href="${href}">Read the answer &rarr;</a>
            </div>
          </article>
        </div>`;
}

function buildSubcategoryArchive(catSlug, sub) {
  const cat = findCategory(catSlug);
  const uPath = subUrlPath(catSlug, sub.slug);
  const depth = depthOf(uPath);
  const prefix = relPrefix(depth);
  const list = questions.filter((q) => q.category === catSlug && q.subcategory === sub.slug);

  const breadcrumbItems = [{ label: 'Home', href: prefix }, { label: 'Questions', href: `${prefix}questions/` }, { label: cat.shortName, href: `${prefix}${catUrlPath(catSlug).slice(1)}` }, { label: sub.shortName }];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbJsonLd(breadcrumbItems, SITE_URL),
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${uPath}`,
        name: `${sub.name} Questions`,
        description: sub.description,
        url: `${SITE_URL}${uPath}`,
        isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: 'Ashekur Rahman' },
      },
    ],
  };

  const cards = list.length
    ? list.map((q) => questionCard(prefix, q)).join('\n        ')
    : `<div class="col-12"><p class="body-lg">More ${escapeHtml(sub.name)} questions are being added regularly &mdash; check back soon, or <a href="${prefix}contact/">ask yours directly</a>.</p></div>`;

  const bodyHtml = `  <section class="section section-dark page-intro page-hero">
    <div class="hero-grid-bg" aria-hidden="true"></div>
    <div class="glow glow-a" aria-hidden="true"></div>
    <div class="glow glow-b" aria-hidden="true"></div>
    <div class="container">
      <div class="row hero-split">
        <div data-anim-hero class="col-12 col-lg-9">
          ${breadcrumbNav(breadcrumbItems)}
          <h1 data-anim="lines">${escapeHtml(sub.name)} Questions</h1>
          <p class="body-lg">${escapeHtml(sub.description)}</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-white">
    <div class="container">
      <div data-anim="stagger" class="row row-cols-1 row-cols-md-2 g-4 blog-grid">
        ${cards}
      </div>
    </div>
  </section>

  ${contactCtaSectionAtDepth(prefix)}`;

  const html = page({
    prefix,
    title: pageTitle(`${sub.name} Questions & Answers`),
    metaDescription: sub.description,
    canonicalPath: uPath,
    jsonLd: JSON.stringify(jsonLd, null, 2),
    bodyHtml,
    needsPrism: false,
    noindex: list.length === 0,
  });

  const outFile = path.join(OUT_DIR, catSlug, sub.slug, 'index.html');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  // Don't ask Google to index a page we're simultaneously telling it not
  // to — leave empty archives out of the sitemap until they have content.
  if (list.length > 0) generatedUrls.push({ loc: uPath, lastmod: TODAY });
}

function buildCategoryArchive(cat) {
  const uPath = catUrlPath(cat.slug);
  const depth = depthOf(uPath);
  const prefix = relPrefix(depth);
  const allInCategory = questions.filter((q) => q.category === cat.slug).sort((a, b) => (b.datePublished || '').localeCompare(a.datePublished || ''));
  const totalInCategory = allInCategory.length;

  const breadcrumbItems = [{ label: 'Home', href: prefix }, { label: 'Questions', href: `${prefix}questions/` }, { label: cat.shortName }];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbJsonLd(breadcrumbItems, SITE_URL),
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${uPath}`,
        name: `${cat.name} Questions`,
        description: cat.description,
        url: `${SITE_URL}${uPath}`,
        isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: 'Ashekur Rahman' },
      },
    ],
  };

  const subCards = (cat.children || [])
    .map((sub) => {
      const count = questions.filter((q) => q.category === cat.slug && q.subcategory === sub.slug).length;
      const href = `${prefix}${subUrlPath(cat.slug, sub.slug).slice(1)}`;
      return `<div class="col">
          <a data-anim="item" class="related-card h-100" href="${href}">
            <strong>${escapeHtml(sub.name)}</strong>
            <span>${escapeHtml(sub.description)} (${count} question${count === 1 ? '' : 's'})</span>
          </a>
        </div>`;
    })
    .join('\n        ');

  const allCards = allInCategory.length
    ? `<div class="row row-cols-1 row-cols-md-2 g-4 blog-grid mt-2">
        ${allInCategory.map((q) => questionCard(prefix, q)).join('\n        ')}
      </div>`
    : `<p class="body-lg">More ${escapeHtml(cat.name)} questions are being added regularly &mdash; check back soon, or <a href="${prefix}contact/">ask yours directly</a>.</p>`;

  const subSection = (cat.children || []).length
    ? `<section class="section section-white">
    <div class="container">
      <div class="row gx-0">
        <div class="section-head col-12 col-lg-6">
          <p data-anim="fade" class="eyebrow"><span class="eyebrow-mark" aria-hidden="true"></span><span class="mono">BROWSE BY TOPIC</span></p>
          <h2 data-anim="lines">${escapeHtml(cat.name)} categories</h2>
        </div>
      </div>
      <div data-anim="stagger" class="row row-cols-1 row-cols-sm-2 row-cols-lg-4 g-4 related-grid">
        ${subCards}
      </div>
    </div>
  </section>`
    : '';

  const bodyHtml = `  <section class="section section-dark page-intro page-hero">
    <div class="hero-grid-bg" aria-hidden="true"></div>
    <div class="glow glow-a" aria-hidden="true"></div>
    <div class="glow glow-b" aria-hidden="true"></div>
    <div class="container">
      <div class="row hero-split">
        <div data-anim-hero class="col-12 col-lg-9">
          ${breadcrumbNav(breadcrumbItems)}
          <h1 data-anim="lines">${escapeHtml(cat.name)} Questions</h1>
          <p class="body-lg">${escapeHtml(cat.description)}</p>
        </div>
      </div>
    </div>
  </section>

  ${subSection}

  <section class="section section-light">
    <div class="container">
      <div class="row gx-0">
        <div class="section-head col-12 col-lg-6">
          <p data-anim="fade" class="eyebrow"><span class="eyebrow-mark" aria-hidden="true"></span><span class="mono">ALL QUESTIONS</span></p>
          <h2 data-anim="lines">Every ${escapeHtml(cat.name)} question</h2>
        </div>
      </div>
      ${allCards}
    </div>
  </section>

  ${contactCtaSectionAtDepth(prefix)}`;

  const html = page({
    prefix,
    title: pageTitle(`${cat.name} Questions & Answers`),
    metaDescription: cat.description,
    canonicalPath: uPath,
    jsonLd: JSON.stringify(jsonLd, null, 2),
    bodyHtml,
    needsPrism: false,
    noindex: totalInCategory === 0,
  });

  const outFile = path.join(OUT_DIR, cat.slug, 'index.html');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  if (totalInCategory > 0) generatedUrls.push({ loc: uPath, lastmod: TODAY });
}

function buildHub() {
  const uPath = '/questions/';
  const prefix = '../';
  const breadcrumbItems = [{ label: 'Home', href: prefix }, { label: 'Questions' }];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbJsonLd(breadcrumbItems, SITE_URL),
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${uPath}`,
        name: 'Questions & Answers Knowledge Base',
        description: 'Practical answers to real WooCommerce, WooCommerce Subscriptions, WordPress and Elementor questions.',
        url: `${SITE_URL}${uPath}`,
        isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: 'Ashekur Rahman' },
      },
    ],
  };

  const catCards = taxonomy.categories
    .map((cat) => {
      const count = questions.filter((q) => q.category === cat.slug).length;
      const href = `${prefix}${catUrlPath(cat.slug).slice(1)}`;
      return `<div class="col">
          <a data-anim="item" class="related-card h-100" href="${href}">
            <strong>${escapeHtml(cat.name)}</strong>
            <span>${escapeHtml(cat.description)} (${count} question${count === 1 ? '' : 's'})</span>
          </a>
        </div>`;
    })
    .join('\n        ');

  const allQuestions = [...questions].sort((a, b) => (b.datePublished || '').localeCompare(a.datePublished || ''));
  const allQuestionCards = allQuestions.map((q) => questionCard(prefix, q)).join('\n        ');

  const bodyHtml = `  <section class="section section-dark page-intro page-hero">
    <div class="hero-grid-bg" aria-hidden="true"></div>
    <div class="glow glow-a" aria-hidden="true"></div>
    <div class="glow glow-b" aria-hidden="true"></div>
    <div class="container">
      <div class="row gx-5 gy-4 align-items-center hero-split">
        <div data-anim-hero class="col-12 col-lg-8">
          ${breadcrumbNav(breadcrumbItems)}
          <h1 data-anim="lines">Questions &amp; Answers</h1>
          <p class="body-lg">A growing knowledge base of real WooCommerce, WooCommerce Subscriptions, WordPress and Elementor questions &mdash; answered directly, with the troubleshooting steps that actually apply.</p>
          <ul class="tech-chips"><li>WooCommerce</li><li>WooCommerce Subscriptions</li><li>WordPress</li><li>Elementor</li></ul>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-white">
    <div class="container">
      <div class="row gx-0">
        <div class="section-head col-12 col-lg-6">
          <p data-anim="fade" class="eyebrow"><span class="eyebrow-mark" aria-hidden="true"></span><span class="mono">BROWSE BY TOPIC</span></p>
          <h2 data-anim="lines">Pick a category</h2>
        </div>
      </div>
      <div data-anim="stagger" class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4 related-grid">
        ${catCards}
      </div>
    </div>
  </section>

  <section class="section section-light">
    <div class="container">
      <div class="row gx-0">
        <div class="section-head col-12 col-lg-6">
          <p data-anim="fade" class="eyebrow"><span class="eyebrow-mark" aria-hidden="true"></span><span class="mono">ALL QUESTIONS</span></p>
          <h2 data-anim="lines">Every question, newest first</h2>
        </div>
      </div>
      <div data-anim="stagger" class="row row-cols-1 row-cols-md-2 g-4 blog-grid">
        ${allQuestionCards}
      </div>
    </div>
  </section>

  ${contactCtaSectionAtDepth(prefix)}`;

  const html = page({
    prefix,
    title: 'WooCommerce, WordPress & Elementor Q&A | Ashekur Rahman',
    metaDescription: 'Practical answers to real WooCommerce, WooCommerce Subscriptions, WordPress and Elementor questions, from an eleven-year WordPress and WooCommerce developer.',
    canonicalPath: uPath,
    jsonLd: JSON.stringify(jsonLd, null, 2),
    bodyHtml,
    needsPrism: false,
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
  generatedUrls.push({ loc: uPath, lastmod: TODAY });
}

/* ---------------------------------------------------------------------------
 * Run
 * ------------------------------------------------------------------------- */

// Clean previously generated output so a removed/renamed question doesn't
// leave an orphaned stale page behind.
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });

for (const q of questions) buildQuestionPage(q);
for (const cat of taxonomy.categories) {
  for (const sub of cat.children || []) buildSubcategoryArchive(cat.slug, sub);
  buildCategoryArchive(cat);
}
buildHub();

/* ---------------------------------------------------------------------------
 * sitemap.xml — replace any previously generated /questions/ block, then
 * insert a fresh one before </urlset>.
 * ------------------------------------------------------------------------- */

let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');
sitemap = sitemap.replace(/\n?<!-- BEGIN generated questions urls -->[\s\S]*?<!-- END generated questions urls -->\n?/, '\n');

const urlEntries = generatedUrls
  .map(
    (u) => `  <url>
    <loc>${SITE_URL}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
  )
  .join('\n');

const block = `<!-- BEGIN generated questions urls -->\n${urlEntries}\n<!-- END generated questions urls -->\n`;
sitemap = sitemap.replace('</urlset>', `${block}</urlset>`);
fs.writeFileSync(SITEMAP_PATH, sitemap);

console.log(`Generated ${questions.length} question page(s), ${taxonomy.categories.reduce((n, c) => n + (c.children || []).length, 0)} subcategory archive(s), ${taxonomy.categories.length} category archive(s), 1 hub page.`);
console.log(`${generatedUrls.length} URLs written to sitemap.xml.`);
