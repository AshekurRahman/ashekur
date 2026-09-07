# Free Tools & Resources — SEO and Client-Generation Roadmap

**Owner:** Ashekur Rahman (ashekur.com)
**Created:** 2026-09-04
**Purpose:** Long-term plan for building free tools/resources on ashekur.com that (a) rank for real search intent, (b) attract WordPress, Elementor, WooCommerce and Divi site owners specifically, and (c) convert a meaningful share of that traffic into paid work — bug fixes, customization, speed work, malware removal, migrations and builds.

This file is intentionally kept out of the public site (`.htaccess` blocks `/FREE-TOOLS-SEO-ROADMAP.md` the same way it already blocks `/README.md` and `/SEO.md`). Treat it as a living document — update phase status and keyword notes as tools ship and data comes in.

**Status as of 2026-09-05:** All 8 scanner/calculator tools (Tools 0-8) are shipped and wired into the `/tools/` hub, sitemap, and their named internal links. This remains a living roadmap with real work still open: the Google Safe Browsing API key for Tool 1's malware checker, still not configured (`GOOGLE_SAFE_BROWSING_API_KEY` unset, so that check still no-ops); the first backlink push using real usage data (Phase 3 item 13), not started; and the quarterly Search Console review (Phase 3 item 14), pending until a full quarter of data exists. The monthly SEO & content plan below is ongoing by design and has no end state.

**Update 2026-09-07:** The Tool 6 supporting blog post, "Divi 4 vs Divi 5: What Actually Changes, and Whether You Should Migrate" (Phase 2 item 9), is now written and live at `blog/divi-4-vs-divi-5-migration/` — added to `blog/index.html` (grid card + JSON-LD), `sitemap.xml`, and cross-linked from `tools/divi-5-migration-checker/` (prose link + related-services sidebar), `services/divi-5-migration/` and `services/divi-customization/` ("Also worth reading" grids), and `blog/elementor-vs-divi/` (Divi section paragraph).

**Update 2026-09-07 (2):** The embeddable "scanned clean" badge for Tool 1 (Phase 2 item 10) is now built and live. A static SVG badge (`assets/images/badge-scanned-clean.svg`) reveals a ready-to-paste embed snippet in a new "EMBED THIS BADGE" field whenever `tools/wordpress-malware-checker/` returns a `clean` verdict (`assets/js/malware-checker.js`, `assets/css/template.css`), linking back to the checker so visitors can verify the result themselves. Added a matching FAQ entry (visible + JSON-LD) and a mention in the "clean" result's CTA copy. Still genuinely open: promoting the badge once real usage data exists (Phase 3 item 13's backlink push is the natural vehicle for that) — the mechanism itself is done, adoption is not something code can produce.

Three items remain blocked on something outside a code change and are still open: the Google Safe Browsing API key, the first backlink push (needs real usage data plus manual outreach), and the quarterly Search Console review (needs a full quarter of real data and Search Console access).

**Update 2026-09-07 (3):** Google Safe Browsing API key — code side is done. `malware-checker.php` now optionally loads `assets/php/inc/local-secrets.php` (gitignored, template at `local-secrets.example.php`) before reading `GOOGLE_SAFE_BROWSING_API_KEY`, so the real key never has to enter git history regardless of deploy method. The first key the owner supplied tested valid but returned `403 API_KEY_SERVICE_BLOCKED` (Safe Browsing API not enabled on that Google Cloud project).

**Update 2026-09-07 (4):** Owner enabled the API and supplied a second key — tested live against Google's official Safe Browsing test URL and confirmed fully working (`200`, correctly flagged the test-malware URL). Only step left, and it's owner-only by design (this file is gitignored so it can't be done via a commit): copy `local-secrets.example.php` to `local-secrets.php` in `assets/php/inc/` on the live server via FTP/cPanel File Manager, with the real key filled in. Once that file exists on the server, this item is fully done — no further code change needed.

---

## How this site already sets up for this

Two things already exist that everything below builds on:

- **`/tools/` hub is live**, with one tool shipped: `/tools/wordpress-website-health-checker/` — a static HTML front end (`assets/js/website-health-checker.js`) calling a same-origin PHP endpoint (`assets/php/website-health-checker.php`) that does an SSRF-safe outbound fetch of the submitted URL and returns a structured JSON report. **This is the reference architecture for every scanner-type tool below** — no framework, no database, no third-party API dependency, proven to work on this exact cPanel host.
- **15 service pages already exist** for WordPress, Elementor, Divi and WooCommerce work (development, customization, bug-fix, speed, migration, malware removal). Every tool below is chosen because it has a direct, honest path to one or more of these pages — this roadmap is not "build tools for traffic," it's "build tools that make the diagnosis the site already sells."

---

## Priority summary (read this first)

| # | Tool | Phase | Build effort | SEO difficulty | Lead potential | Primary service tie-in | Status |
|---|---|---|---|---|---|---|---|
| 0 | Extend the existing Health Checker with WP-specific checks | 1 (quick win) | Very low | N/A (existing page) | Medium | wordpress-development, seo | Done |
| 1 | WordPress Malware & Blacklist Checker | 1 | Medium | Low-medium | **Very high** | wordpress-malware-removal | Done, incl. scanned-clean badge (Safe Browsing check no-ops until API key is set) |
| 2 | What Theme/Page Builder Is This Site Using? | 1 | Medium | Medium | High (volume + backlinks) | elementor-customization, divi-customization | Done |
| 3 | WordPress Website Cost Calculator | 1 | **Low** | Medium | Very high (direct-to-quote) | wordpress-development, pricing | Done |
| 4 | Elementor Speed & Bloat Checker | 2 | Medium-high | Low | High | elementor-fix, wordpress-speed-optimization | Done |
| 5 | WooCommerce Store Health Checker | 2 | Medium-high | Low | High | woocommerce-fix, woocommerce-development | Done |
| 6 | Divi 5 Migration Readiness Checker | 2 | Medium | Very low (near-zero competition) | Medium | divi-customization | Done |
| 7 | Redirect Map Generator | 3 | High | Low | Medium (warm, low-volume) | wordpress-migration | Shipped 2026-09-05 |
| 8 | Plugin Conflict Diagnostic (interactive checklist) | 3 | Low | Low-medium | Medium | wordpress-bug-fix, elementor-fix | Shipped 2026-09-05 |

**Why this order:** Tool 3 (cost calculator) is pure client-side JavaScript — no PHP, no scanning, ships in a day, and converts the highest-intent visitor on the entire list (someone actively pricing a project) directly into a quote request. Tool 1 (malware checker) is the highest-urgency search intent that exists in this niche — someone typing "is my wordpress site hacked" needs help *today*, not eventually, which makes it the best conversion rate even if its search volume is lower than generic terms. Tool 2 (builder detector) is the traffic and backlink engine — broad, shareable, low commercial intent per visit, but it's the one people embed links to and share in Slack/Discord, which compounds over time. Tools 4-6 are more technically demanding (real scanning logic, platform-specific detection) and narrower in volume, so they come once the pattern from Tools 1-3 is proven. Tools 7-8 are genuinely useful but serve warmer, lower-volume audiences (someone already mid-migration, or already debugging) — worth building, not worth building first.

---

## Tool 0 — Extend the existing Health Checker with WordPress-specific checks

**This is not a new tool — it's a Phase 1 quick win.** The current checker is generic (SEO/security/performance for any site). Add a WordPress-detection branch: if the scanned site is running WordPress, surface WP-specific findings — outdated core/plugin version signatures, whether a caching layer is detected, whether REST API/XML-RPC is exposed, whether `wp-config.php` or `readme.html` are publicly reachable, common page-builder detection (reuse this logic in Tool 2 below).

- **Target keywords:** already ranking-adjacent to "wordpress website health checker," "free wordpress site checker," "wordpress seo audit tool" — this just deepens relevance for those terms rather than opening new ones.
- **Effort:** Low — extends `assets/php/website-health-checker.php` with additional checks, adds a "WordPress-specific" results section to the existing JS renderer. No new page, no new URL.
- **Do this in Phase 1, before Tool 1**, because the detection logic you write here (is this WordPress, what theme/plugin fingerprints are visible) is reused directly in Tools 1, 2 and 4.

---

## Tool 1 — WordPress Malware & Blacklist Checker

### Target keywords
- **Primary:** "is my wordpress site hacked", "wordpress malware checker free", "check if wordpress site is hacked", "wordpress blacklist checker"
- **Secondary / long-tail:** "why is my wordpress site redirecting to another site", "google safe browsing warning wordpress", "wordpress site flagged as dangerous", "how to check if a website has malware free"
- **Search intent:** Extremely high urgency, low competition from big SaaS tools (Sucuri/Wordfence gate their free checkers behind email capture or a plugin install — a no-signup, instant-result page is a genuine differentiator).

### Target audience & clients attracted
Site owners mid-incident: Google flagged them, their host suspended them, or a visitor reported spam pages. This is the single highest-conversion audience on this list — they are actively searching for help *right now*, not researching for later. Matches the persona in `blog/wordpress-hacked-malware-removal/` almost exactly.

### URL structure & page title
- URL: `/tools/wordpress-malware-checker/`
- `<title>`: `Free WordPress Malware & Blacklist Checker | Ashekur Rahman`
- Meta description: "Check if your WordPress site is hacked, blacklisted by Google, or serving malware — free instant scan, no signup, no plugin install."
- H1: "Is your WordPress site hacked? Check in 30 seconds."

### Required features
1. URL input → same-origin PHP endpoint (same SSRF-safe fetcher pattern as the existing health checker).
2. Checks: Google Safe Browsing status (via the public Safe Browsing lookup API, free tier), presence of common injected-script signatures in the fetched HTML, unexpected redirect chains, suspicious `wp-content/uploads/*.php` exposure (fetch and check response code — do not execute), a basic DNSBL check against 1-2 major blocklists (mirroring the diagnostic method already validated in the site owner's own mail-audit work).
3. Plain-English verdict, not a raw data dump: "Clean," "Flagged — action needed," or "Inconclusive, here's what to check manually."
4. Zero data retention beyond the session — do not store scanned URLs in a database (avoids becoming a liability, keeps it simple, no DB needed at all).

### SEO strategy
- **On-page:** H1 matches primary keyword exactly. First paragraph directly answers "how do I know if my WordPress site is hacked" for the featured-snippet box.
- **Schema:** `WebApplication` + `FAQPage` (3-4 FAQs: "Is this free?", "Do you store my URL?", "What if it says my site is flagged?", "Can you fix it for me?" — last one links straight to the service page).
- **Internal linking:** Linked prominently from `blog/wordpress-hacked-malware-removal/` (add a "Check your site now" inline CTA partway through that post, not just at the bottom), from `services/wordpress-malware-removal/`, and from the `/tools/` hub page.
- **Supporting blog content:** already have `blog/wordpress-hacked-malware-removal/` — add 1-2 more: "What Does It Mean When Google Says 'This Site May Be Hacked'?" and "Wordfence vs Sucuri vs a Manual Check: What Actually Finds Malware."

### Lead-generation strategy & CTA placement
- **On a "flagged" result:** immediate, above-the-fold CTA card: "This needs fixing today. [WordPress Malware Removal →]" plus a WhatsApp button (the site already treats WhatsApp as the fast-response channel in its contact CTAs — reuse that pattern exactly).
- **On a "clean" result:** softer CTA: "Clean today doesn't mean protected — see how a hardening pass closes the gap [WordPress Malware Removal →]," plus an email-capture-free "bookmark this / re-scan monthly" nudge rather than a hard sell.
- No email gate on the scan itself — gating it would kill the exact urgency that makes this tool convert.

### Technical requirements & implementation
- Front end: vanilla JS, same pattern as `assets/js/website-health-checker.js`.
- Back end: new `assets/php/malware-checker.php`, reusing the SSRF-safe fetch helper already written for the health checker (extract it into a shared include if not already reusable) plus a Safe Browsing API call (free, requires a Google Cloud API key — one-time setup).
- Rate-limit by IP (simple file-based or APCu counter — no DB) to stop abuse, since outbound Safe Browsing API calls likely have a quota.

---

## Tool 2 — What Theme / Page Builder Is This Site Using?

### Target keywords
- **Primary:** "what wordpress theme is this", "what page builder does this website use", "elementor or divi checker", "check what theme a website is using"
- **Secondary:** "is this site built in elementor", "wordpress theme detector free"
- **Search intent:** Broad, high-volume, lower commercial intent per visit — this is the traffic and backlink play, not the conversion play.

### Target audience & clients attracted
Two distinct groups worth targeting with different framing:
1. **Business owners researching a competitor's site** ("I like this site, what's it built on?") — mid-funnel, curious, shareable.
2. **Someone checking their own site** because a developer told them "your site is built in Elementor" and they don't know what that means — this group converts, because the result page can say "you're on Elementor — here's what that means for maintenance" and route straight to `elementor-customization` or `divi-customization`.

### URL structure & page title
- URL: `/tools/what-theme-is-this/`
- `<title>`: `What WordPress Theme or Page Builder Is This Site Using? | Free Detector`
- Meta description: "Paste any URL to instantly detect its WordPress theme, page builder (Elementor, Divi, Beaver Builder, Bricks), and key plugins — free, no signup."
- H1: "What is this website built with?"

### Required features
1. Fetch the target HTML (same shared fetcher as Tools 0 and 1) and pattern-match against known signatures: Elementor (`elementor-frontend`, `data-elementor-type`), Divi (`et_pb_`, `divi-style`), Beaver Builder, Bricks, common theme signatures (Astra, GeneratePress, Divi theme, Hello Elementor), and a shortlist of high-signal plugins (WooCommerce, Yoast/Rank Math, Elementor Pro, WPML).
2. Result page shows: theme name (best guess + confidence), builder detected, notable plugins detected, and — critically — a one-line, platform-specific pitch ("This site runs on Elementor. If yours does too and something's not working the way it should, see Elementor Bug Fix →").
3. A shareable result: "Share this result" generates a simple URL like `/tools/what-theme-is-this/?url=example.com` that re-runs the scan on load — cheap virality, no state to store.

### SEO strategy
- **On-page:** target the exact-match query in H1 and first sentence.
- **Schema:** `WebApplication`. Skip FAQPage here unless genuine FAQs emerge from usage — don't force it.
- **Internal linking:** link from `blog/elementor-vs-divi/` and `blog/wordpress-vs-webflow-vs-framer/` ("not sure what platform a site you admire is built on? check it here"), from `services/elementor-customization/` and `services/divi-customization/`, and from the `/tools/` hub.
- **Supporting blog content:** "How to Tell If a WordPress Site Uses Elementor or Divi (Without Asking the Developer)" — a natural companion piece that itself targets long-tail variants of the tool's keyword and links straight into the tool.

### Lead-generation strategy & CTA placement
- CTA is **conditional on detected platform**, not generic: Elementor detected → Elementor service links; Divi detected → Divi service links; WooCommerce detected → WooCommerce service links; no page builder / raw WordPress detected → general WordPress development/customization link. This conditional-CTA pattern is the single highest-leverage thing about this tool — build it properly rather than shipping one generic "contact me" box.
- Secondary, lower-pressure CTA for the majority who are just curious: a link into the relevant blog comparison post (`elementor-vs-divi`), not straight to a sales page.

### Technical requirements & implementation
- Front end: vanilla JS.
- Back end: `assets/php/theme-detector.php`, sharing the fetch helper from Tool 1.
- Detection is pure string/regex matching against the fetched HTML — no headless browser needed, keeps hosting cost at zero beyond what's already running.

---

## Tool 3 — WordPress Website Cost Calculator

### Target keywords
- **Primary:** "wordpress website cost calculator", "how much does a wordpress website cost", "wordpress developer cost estimator"
- **Secondary:** "elementor website cost", "woocommerce store cost calculator", "custom wordpress theme cost"
- **Search intent:** Pre-purchase research — the highest direct-to-quote intent of any tool on this list.

### Target audience & clients attracted
People who have already decided they need a website and are trying to budget for it — the exact audience `blog/website-cost-2026/` was written for, and the exact audience the `/pricing/` page exists to inform. This tool is the interactive version of both.

### URL structure & page title
- URL: `/tools/wordpress-cost-calculator/`
- `<title>`: `Free WordPress Website Cost Calculator | Instant Estimate`
- Meta description: "Answer a few questions about your project and get an instant WordPress, WooCommerce or Elementor build cost estimate — no email required."
- H1: "What will your WordPress project actually cost?"

### Required features
1. **Pure client-side JavaScript — no backend at all.** A short multi-step form: project type (new build / redesign / fix existing), platform (WordPress custom theme / Elementor / Divi / WooCommerce store), page count band, ecommerce Y/N and rough product count, content-migration needed Y/N.
2. Output: a price range, calculated from the same numbers already published on `/pricing/` (keep the JS constants in sync with that page manually, or better — extract shared pricing constants into one JS file both pages import, so they can never drift apart).
3. Explicit framing that this is a **starting estimate, not a quote** — mirrors the honest tone already used on `/pricing/` ("These are starting prices, not final ones").
4. End screen: "Get this in writing — start a project" CTA straight to `/contact/`, ideally pre-filling a hidden field or query param with the calculator inputs so the contact form (or a follow-up email) already has context.

### SEO strategy
- **On-page:** H1 and intro paragraph directly answer the "how much does a wordpress website cost" query pattern, same honest-answer structure already used in `blog/website-cost-2026/`.
- **Schema:** `WebApplication`. Consider `FAQPage` covering "Why is there a range instead of one price?" (near-identical answer already exists in `pricing/index.html`'s FAQ — reuse the copy).
- **Internal linking:** heaviest internal-linking target on the whole tools roadmap — link from `/pricing/`, `blog/website-cost-2026/`, every service page's pricing mention, and the homepage hero area if there's room.
- **Supporting content:** none strictly needed — `website-cost-2026` already exists and does this job in article form. This tool is the interactive companion, not a new content pillar.

### Lead-generation strategy & CTA placement
- The entire tool **is** the lead-gen mechanism — every path through it ends at "Start a project." No separate CTA design needed beyond making that final button impossible to miss.
- Optional (Phase 2 refinement, not required to ship): capture the estimate result server-side only if the visitor clicks through to contact — do not gate the calculator itself behind an email form, that kills completion rate.

### Technical requirements & implementation
- **Ship this first among the new builds** — it is pure front-end JavaScript, no PHP, no external API, no scanning logic. Realistically a single afternoon of work once the pricing logic is mapped out.

---

## Tool 4 — Elementor Speed & Bloat Checker

### Target keywords
- **Primary:** "elementor site slow", "elementor speed checker", "why is my elementor site slow"
- **Secondary:** "elementor css bloat", "elementor performance fix", "reduce elementor page weight"
- **Search intent:** Medium-high, low competition (Elementor's own ecosystem has almost no free public checkers for this specific angle).

### Target audience & clients attracted
Elementor site owners with a specific, nameable pain — page feels sluggish, PageSpeed score dropped after adding widgets/add-ons. Maps directly to `services/elementor-fix/` and `services/wordpress-speed-optimization/`, and to the diagnostic content already written in `blog/elementor-broken-after-update/` and `blog/improve-wordpress-website-speed/`.

### URL structure & page title
- URL: `/tools/elementor-speed-checker/`
- `<title>`: `Free Elementor Speed & Bloat Checker`
- H1: "Is Elementor slowing your site down — or is it something else?"

### Required features
1. Confirms Elementor is actually in use first (reuse Tool 2's detection).
2. Checks: number of separate Elementor-generated CSS files (unminified/uncombined is a known red flag), presence of multiple add-on libraries (Essential Addons, Crocoblock, PowerPack — each one loading its own assets is exactly the pattern documented in `blog/improve-wordpress-website-speed/`), whether Global Kit/theme style appears configured vs. default, rough total page weight and request count.
3. Verdict framed around **cause**, not just a score: "3 add-on libraries detected loading on every page — this is the most common cause of Elementor slowdown," matching the site's already-established "ranked by actual impact" content voice.

### SEO strategy
- **Schema:** `WebApplication`.
- **Internal linking:** from `blog/improve-wordpress-website-speed/`, `blog/elementor-broken-after-update/`, `services/elementor-fix/`, `services/wordpress-speed-optimization/`.
- **Supporting content:** "The 3 Add-On Libraries Making Your Elementor Site Slow (and What to Do Instead)" — long-tail companion piece.

### Lead-generation strategy & CTA placement
CTA copy conditional on findings (same principle as Tool 2): if add-on bloat detected → link to `elementor-fix`; if it's a hosting/TTFB issue the checker can also flag → link to `wordpress-speed-optimization` instead. Don't send every visitor to the same page regardless of what was actually found.

### Technical requirements & implementation
Extends the shared fetcher; new `assets/php/elementor-speed-checker.php`. Phase 2, after the detection logic from Tools 0/2 is already proven in production.

---

## Tool 5 — WooCommerce Store Health Checker

### Target keywords
- **Primary:** "woocommerce store checker", "is my woocommerce store slow", "woocommerce health check free"
- **Secondary:** "woocommerce checkout not working checker", "woocommerce speed audit"
- **Search intent:** Medium, commercial (store owners = businesses actively losing revenue when something's wrong, same urgency logic as Tool 1 but for a narrower audience).

### Target audience & clients attracted
WooCommerce store owners, mapping directly to `services/woocommerce-fix/` and `services/woocommerce-development/`, and to `blog/woocommerce-site-broken-common-fixes/`.

### URL structure & page title
- URL: `/tools/woocommerce-store-checker/`
- `<title>`: `Free WooCommerce Store Health Checker`
- H1: "Is your WooCommerce store costing you sales?"

### Required features
1. Confirms WooCommerce is in use.
2. Checks: cart/checkout page caching status (a cached checkout page is one of the most common silent failure causes — already documented in `blog/woocommerce-site-broken-common-fixes/`), SSL status on checkout, whether a payment gateway script loads, page weight on the product page vs. checkout page, plugin-count red flags.
3. Same cause-first verdict framing as Tool 4.

### SEO strategy
- **Internal linking:** from `blog/woocommerce-site-broken-common-fixes/`, `services/woocommerce-fix/`, `services/woocommerce-development/`.
- **Supporting content:** "5 Things Silently Killing WooCommerce Conversions (Checked in 30 Seconds)."

### Lead-generation strategy & CTA placement
Conditional CTA: checkout-specific issue found → link to the narrow `wordpress-fixes/woocommerce-checkout-not-working/` page and `woocommerce-fix`; broader store issues → `woocommerce-development`.

### Technical requirements & implementation
Same shared-fetcher pattern. Phase 2.

---

## Tool 6 — Divi 5 Migration Readiness Checker

### Target keywords
- **Primary:** "divi 4 to divi 5 migration", "should i upgrade to divi 5", "divi 5 migration checker"
- **Search intent:** Low volume, but **near-zero competition** — this is a brand-new, narrow, high-relevance query cluster that will only grow as more Divi sites age into needing this decision. Cheap to rank for precisely because almost nothing else targets it yet.

### Target audience & clients attracted
Existing Divi site owners specifically on the fence about upgrading — maps to the exact pain point already identified in `services/divi-customization/` ("Still stuck on old Divi 4 layouts") and `blog/elementor-vs-divi/`'s "half-migrated" warning.

### URL structure & page title
- URL: `/tools/divi-5-migration-checker/`
- `<title>`: `Free Divi 5 Migration Readiness Checker`
- H1: "Is your Divi site ready to move to Divi 5?"

### Required features
1. Confirms Divi is in use and attempts to detect Divi 4 vs. Divi 5 markup signatures.
2. Checklist-style output (this one leans more checklist than deep-scan, given the narrower technical signal available from the outside): flags legacy shortcode patterns, estimates layout complexity from module count where detectable, and gives a plain-English readiness verdict.

### SEO strategy
- **Internal linking:** from `services/divi-customization/`, `blog/elementor-vs-divi/`.
- **Supporting content:** "Divi 4 vs Divi 5: What Actually Changes, and Whether You Should Migrate" — a genuinely new blog post filling a real content gap (Divi 5 is mentioned across the site but has no dedicated explainer post yet).

### Lead-generation strategy & CTA placement
Single clear CTA regardless of verdict: `services/divi-customization/`, framed as "the migration planned properly, not left half-done" — reuse that exact phrase, it's already the site's established language for this problem.

### Technical requirements & implementation
Lower scanning complexity than Tools 4/5 since it's closer to a checklist than a deep scan — good candidate to build alongside or slightly before them if Phase 2 capacity allows.

---

## Tool 7 — Redirect Map Generator

### Target keywords
- **Primary:** "redirect map generator", "301 redirect generator wordpress", "website migration redirect tool"
- **Search intent:** Low volume, but warm — almost nobody searches this unless they are actively mid-migration, which makes it a small but highly qualified audience.

### Target audience & clients attracted
Anyone doing (or planning) a site redesign or platform migration — maps directly to `services/wordpress-migration/` and `blog/redesign-without-losing-rankings/`, arguably the most on-the-nose tie-in of any tool on this list.

### URL structure & page title
- URL: `/tools/redirect-map-generator/`
- `<title>`: `Free Redirect Map Generator for Website Migrations`
- H1: "Build your 301 redirect map before you migrate, not after."

### Required features
1. Two inputs: old sitemap URL (or pasted URL list) and new sitemap URL (or pasted list).
2. Fuzzy-match old→new URLs by path similarity/slug matching, output a downloadable CSV/`.htaccess`-ready redirect block, and clearly flag old URLs with **no confident match** — those are the ones that need a human decision, which is itself a soft lead-gen moment ("47 URLs couldn't be auto-matched — this is exactly the kind of judgment call worth getting right").

### SEO strategy
- **Internal linking:** from `blog/redesign-without-losing-rankings/` (heaviest tie-in on the site), `services/wordpress-migration/`.
- **Supporting content:** none new needed — `redesign-without-losing-rankings` already covers the "why," this tool is the "how."

### Lead-generation strategy & CTA placement
CTA on the "unmatched URLs" result specifically: "Get these mapped properly → WordPress Migration." Low volume, but the visitors who reach this tool are unusually close to actually buying.

### Technical requirements & implementation
Most technically demanding tool on the list (real fuzzy-matching logic, sitemap parsing, file generation for download). **Phase 3**, build once Tools 1-6 have validated the shared-fetcher/detection infrastructure.

---

## Tool 8 — WordPress Plugin Conflict Diagnostic (interactive checklist)

### Target keywords
- **Primary:** "wordpress plugin conflict checker", "which plugin is breaking my site", "wordpress site broken after plugin update"
- **Search intent:** High urgency, matches `wordpress-fixes/wordpress-plugin-conflict/` and `blog/elementor-broken-after-update/` almost exactly.

### Target audience & clients attracted
Site owners mid-troubleshooting after an update broke something — maps to `services/wordpress-bug-fix/` and `services/elementor-fix/`.

### URL structure & page title
- URL: `/tools/plugin-conflict-diagnostic/`
- `<title>`: `WordPress Plugin Conflict Diagnostic (Free Interactive Checklist)`
- H1: "Something broke after an update? Work through this in order."

### Required features
This is the one tool on the list that **should not be a URL-scanner** — a conflict happening on someone's own site (often in `wp-admin`, sometimes not even publicly visible) can't be diagnosed by fetching a public URL. Build it as a pure client-side interactive decision tree instead: a series of yes/no questions ("Did you just update a plugin, theme, or WordPress core?" → "Does the error happen for every visitor or just you?" → ...) that walks the visitor through the exact triage steps already written out in `blog/elementor-broken-after-update/`, ending in a specific, named next step.

### SEO strategy
- **Internal linking:** from `blog/elementor-broken-after-update/`, `wordpress-fixes/wordpress-plugin-conflict/`, `services/wordpress-bug-fix/`.
- **Supporting content:** none new needed — this tool is the interactive form of content that already exists.

### Lead-generation strategy & CTA placement
Every branch of the decision tree ends in one of two places: a specific self-service fix (for the simple cases), or "This needs a proper look → WordPress Bug Fix" (for anything the checklist can't resolve in-browser).

### Technical requirements & implementation
Pure client-side JS, no backend, no scanning — cheapest tool on the list to build besides the cost calculator. Good Phase 3 filler alongside the redirect generator, or could be pulled into Phase 2 if there's spare capacity, since effort is genuinely low.

---

## Backlink & promotion strategy

Applies across the whole roadmap, with tool-specific angles called out:

1. **Tool directories & launch platforms.** Submit the theme/builder detector (Tool 2) and the cost calculator (Tool 3) to free-tool directories (e.g. Product Hunt for a launch-day spike, AlternativeTo-style listing sites, "free SEO tools" roundup submission forms). These sites exist specifically to link out to tools like these — genuine, low-effort backlinks.
2. **Community answering, not spamming.** r/WordPress, r/ProWordPress, WordPress Facebook groups, and Elementor/Divi Facebook communities all have a constant stream of "is my site hacked," "why is my Elementor site slow," "what builder is this" questions. Answer them genuinely and drop the relevant tool link only when it's the actual answer to the question — this is slow but compounding, and matches the site's existing "honest answer" voice rather than feeling like spam.
3. **Embeddable badge (Tool 1 specifically).** A "Scanned clean by [tool name]" badge that site owners can embed after a clean malware scan, linking back to the checker. This is the single most scalable backlink mechanic on the list if it gets adoption — treat it as a Phase 2 stretch goal once Tool 1 has real usage data.
4. **Guest posts on WordPress/Elementor/Divi-adjacent blogs**, pitched around a specific finding from tool usage data once there's enough of it ("We scanned 200 Elementor sites — here's what actually slows them down") — this becomes possible only after Tool 4 has been live long enough to have real aggregate data, so it's a Phase 2-3 activity, not a launch-day one.
5. **Internal linking is itself a promotion strategy** — every existing blog post and service page identified above should get its CTA/link added in the same pass the tool ships, not "later." An unlinked tool gets none of the site's existing authority.

---

## Continuous monthly SEO & content plan

A repeatable checklist to run every month once Phase 1 tools are live, regardless of which phase the roadmap is in:

1. **One new supporting blog post**, tied to whichever tool most needs content reinforcement that month (check Search Console for tools with impressions but low click-through — that's the signal a supporting post is needed).
2. **Search Console review** for every live tool page: track impressions, CTR, and which queries are actually landing (not just the ones targeted) — long-tail queries showing up here become next month's blog post topics.
3. **One backlink/promotion push** — a community answer, a directory submission, or outreach — rotating across tools rather than always the newest one.
4. **Internal link audit** — as new blog posts and tools ship, check that older content links forward to them (this site already does this well; keep the habit going, it's how `blog/index.html`'s "featured" slot and cross-post links have stayed current so far).
5. **Tool refinement from usage data** — if a scanner tool is producing false positives/negatives or a confusing verdict, fix that before writing more content pointing at it. A tool that gives a wrong answer once will lose the trust that makes it a lead-gen asset at all.
6. **Re-sync the cost calculator (Tool 3) against `/pricing/`** whenever pricing changes — this is the one piece of content most likely to silently go stale and mislead a paying-intent visitor.

---

## Phase roadmap

### Phase 1 — Foundation (build first)
Goal: prove the shared scanning infrastructure, ship the highest-conversion tool, ship the highest-volume tool.

1. Extend the existing Health Checker with WordPress-specific + builder-detection checks (Tool 0) — reusable logic for everything after it.
2. WordPress Website Cost Calculator (Tool 3) — ship this literally first if sequencing is flexible; it's pure front-end and the fastest possible win.
3. WordPress Malware & Blacklist Checker (Tool 1).
4. What Theme/Page Builder Is This Site Using? (Tool 2).
5. Wire up all internal linking from existing blog posts/service pages to each tool as it ships — do not batch this for later.

### Phase 2 — Platform-specific depth
Goal: go deeper into the three named platforms (Elementor, WooCommerce, Divi) now that the detection/scanning pattern is proven.

6. Elementor Speed & Bloat Checker (Tool 4).
7. WooCommerce Store Health Checker (Tool 5).
8. Divi 5 Migration Readiness Checker (Tool 6) — can be pulled forward given how low-competition and comparatively simple it is, if capacity allows.
9. New supporting blog post: "Divi 4 vs Divi 5: What Actually Changes." — Done 2026-09-07.
10. Begin the embeddable "scanned clean" badge for Tool 1, if usage data supports it. — Done 2026-09-07.

### Phase 3 — Long-tail and warm-audience tools
Goal: pick up the smaller, higher-effort, but genuinely useful tools once the core lineup is generating traffic and leads.

11. Redirect Map Generator (Tool 7).
12. Plugin Conflict Diagnostic (Tool 8) — cheap enough to pull into Phase 2 if there's spare time; not urgent either way.
13. First backlink push using real tool-usage data (aggregate findings guest post, per the promotion strategy above).
14. Review all Phase 1-2 tools against a full quarter of Search Console data and decide what Phase 4 looks like — new tool ideas should come from what visitors actually searched to find these, not from guessing again.
