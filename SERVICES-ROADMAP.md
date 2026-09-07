# "Soon" Services — Build Plan

**Owner:** Ashekur Rahman (ashekur.com)
**Created:** 2026-09-05
**Purpose:** A build plan for the 5 services currently shown as `Soon` in the Services mega-menu, so each new page ships with the same discipline as the last batch (see git log: "feat: add remaining service pages", "feat: wire remaining service pages") — a real page, wired into the nav, the sitemap, and the right internal links, not a placeholder.

**Status as of 2026-09-06:** Item 1, Divi 5 Migration, is built — `/services/divi-5-migration/` is live in both mega-menus (`Soon` swapped for `New`), on `/services/`, in `sitemap.xml`, and the Divi 5 Migration Readiness Checker's three content CTAs (contact-cta button, "what to do with the result" paragraph, related-services list) plus its dynamic per-result CTA config (`assets/js/divi5-migration-checker.js`) now point here instead of the general `divi-customization/` page. Item 2, WordPress Security Hardening, is also built — `/services/wordpress-security-hardening/` is live in both mega-menus (`Soon` swapped for `New`), on `/services/`, in `sitemap.xml`; `wordpress-malware-removal/` and `google-blacklist-removal/` now cross-link it as the "prevent it happening again" next step (FAQ answer, process step or related-reading card), `blog/wordpress-hacked-malware-removal/` links it from the hardening checklist, and both `tools/wordpress-malware-checker/` (the "clean" result's per-result CTA in `assets/js/malware-checker.js`, previously mislabeled "See hardening options" while linking to `wordpress-malware-removal/`) and `tools/wordpress-website-health-checker/` (Security Basics findings) now route to it. Item 3, Caching & CDN Setup, is now built — see its own status note below. Item 4, Host Migration, is resolved (option A executed — anchor link, no standalone page) — see its own status note below. **Decision made 2026-09-06, not yet executed:** Technical SEO Audit → option B (build a standalone page; requires narrowing `services/seo/` copy alongside it) — see item 5 below, still open.

**Bulk nav-edit gotcha found and fixed 2026-09-06:** the site-wide `Soon`→real-link swap scripts derived each file's relative-path prefix from an existing sibling link elsewhere in the same file — this breaks on a page's *own* self-referencing link, where an absolute `https://ashekur.com/...` URL (from the `<link rel="canonical">` or `og:url` meta tag, which appears earlier in `<head>`) gets matched instead of the relative nav-panel pattern. Caught and fixed on `services/wordpress-migration/index.html` (its own new Host Migration link) and `services/wordpress-security-hardening/index.html` (its own new Caching & CDN Setup link) — both were live with a working but non-relative absolute URL, now corrected to match the site's relative-path convention. Any future site-wide nav link-swap should either exclude `http`-prefixed matches when deriving the prefix, or special-case the page whose own filename matches the target slug.

This file is intentionally kept out of the public site — add `SERVICES-ROADMAP` to the same `RedirectMatch 404` line in `.htaccess` that already blocks `README`, `SEO` and `FREE-TOOLS-SEO-ROADMAP`.

---

## Where things stand today

**5 services are flagged `Soon`** in `#navDrop-services` (`index.html`, `.nav-panel-future` spans) with empty stub directories already scaffolded under `services/`:

| Category | Item | Stub dir |
|---|---|---|
| Page Builders | Divi 5 Migration | `services/divi-5-migration/` |
| Performance & Security | Caching & CDN Setup | `services/caching-cdn-setup/` |
| Performance & Security | WordPress Security Hardening | `services/wordpress-security-hardening/` |
| Migration | Host Migration | `services/host-migration/` |
| SEO | Technical SEO Audit | `services/technical-seo-audit/` |

**3 more empty stub directories exist but are wired into nothing** — not in the mega-menu (desktop or mobile), not in `sitemap.xml`, not linked from any page:

- `services/custom-plugin-development/`
- `services/custom-post-type-development/`
- `services/wordpress-update-management/`

These are orphaned scaffolding, not part of the current "Soon" plan. **Open question for you:** fold them into a future phase (add `Soon` badges for them too) or delete the empty directories so they stop showing up in audits as dead stubs. Not touched in this plan — flagging only.

**Reference template** (what every live service page already does, confirmed from `services/google-blacklist-removal/`): hero → "Why does X happen?" (education) → "The signs it's actually X" (diagnostic) → "What I deliver" (scope) → "How it runs" (process) → "What you get out of it" (outcomes) → "Projects built this way" (portfolio) → "What clients say" (testimonials) → "Questions I get asked" (FAQ) → contact CTA. Schema: `BreadcrumbList` + `Service` (with `Person` provider, `ServiceChannel` phone, `OfferCatalog` of deliverables) + `FAQPage`. Every new page below follows this shape.

---

## Priority summary

| # | Service | Overlap risk | Effort | Why this order |
|---|---|---|---|---|
| 1 | Divi 5 Migration | None | Low-medium | Fixes a live mismatch: the shipped Divi 5 Migration Readiness Checker tool CTAs to `services/divi-customization/` today because this page doesn't exist yet — building it converts existing traffic immediately, no new SEO required |
| 2 | WordPress Security Hardening | None | Medium | Clean preventative complement to the two already-`New` reactive services (`wordpress-malware-removal`, `google-blacklist-removal`) — natural upsell after either |
| 3 | Caching & CDN Setup | Low | Medium | Pairs with `core-web-vitals-fix` and `wordpress-speed-optimization` (both live); distinct enough as an implementation service vs. those diagnostic/fix pages |
| 4 | Technical SEO Audit | **High — needs a decision first** | Medium-high | `services/seo/` already lists "Full technical SEO audit" as a line item of its own scope (see its offer catalog and FAQ). Building a second page for the same phrase risks keyword cannibalization and duplicated content |
| 5 | Host Migration | **High — needs a decision first** | Medium | `services/wordpress-migration/` already covers "Changing hosting providers" as its first listed scenario, in nearly identical language to what a standalone Host Migration page would say |

**Items 4 and 5 are not simple "go build the stub" items** — see the per-service notes below. Building either as a standalone page without resolving the overlap first will likely cannibalize an existing live page rather than add a new one.

---

## 1. Divi 5 Migration

### Target keywords
- **Primary:** "divi 5 migration service", "migrate divi 4 to divi 5", "divi 5 migration help"
- **Secondary:** "divi 5 broken after migration", "divi 5 presets not working", "should I migrate to divi 5"
- **Search intent:** Low volume, near-zero competition (same read as Tool 6 in the tools roadmap) — this ranks on being the only dedicated page, not on keyword difficulty.

### Target audience & clients attracted
People who ran the Divi 5 Migration Readiness Checker and got a "not ready" or "partially ready" result, or who migrated already and something (presets, custom CSS, third-party modules) didn't carry over cleanly. Matches the tool's existing "Confirmed on Divi 4? ... Confirmed on Divi 5?" framing almost exactly.

### URL, title, meta description
- URL: `/services/divi-5-migration/`
- `<title>`: `Divi 5 Migration Service | Ashekur Rahman`
- Meta description (≤155 chars, matching the recent cleanup standard): "Migrating from Divi 4 to Divi 5, or already migrated and something broke? I handle the move or fix what didn't carry over cleanly."
- H1 direction: something in the site's existing voice, e.g. "Move to Divi 5 without breaking what Divi 4 already had working."

### What's different from `divi-customization`
`divi-customization` is general Divi build/customization work. This page is scoped narrowly: pre-migration readiness, the migration itself, and post-migration cleanup (presets, custom CSS, third-party modules, visual regressions). Keep the two pages' "What I deliver" lists non-overlapping.

### SEO strategy & internal linking
- **Fix the existing mismatch first:** once this page ships, update every `services/divi-customization/` link on `tools/divi-5-migration-checker/index.html` (nav-panel, results CTA card, related-services list, bottom CTA — 4 occurrences found) to point here instead. This is the highest-leverage single edit in this whole plan since it redirects traffic that already exists.
- Add a "Get a migration done for you" CTA inline in the checker tool's results (not just the bottom card), matching the pattern the roadmap doc used for Tool 1.
- Internal links from: `blog/elementor-vs-divi/` (if it mentions Divi 5), `services/divi-customization/` (cross-link both ways), `/tools/divi-5-migration-checker/`.
- Mega-menu: move from `<span class="nav-panel-future">…Soon</span>` to a real `<a href="services/divi-5-migration/">Divi 5 Migration<em>New</em></a>` in both `#navDrop-services` and `#navDropM-services`, plus `services/index.html` and `sitemap.xml`.

---

## 2. WordPress Security Hardening

### Target keywords
- **Primary:** "wordpress security hardening service", "harden wordpress site", "wordpress security service"
- **Secondary:** "prevent wordpress hack", "wordpress firewall setup", "secure wordpress after hack"
- **Search intent:** Medium competition (established security plugin brands rank here), but strong warm-audience fit as a cross-sell rather than a cold-search play.

### Target audience & clients attracted
Two distinct entry points: (a) someone who just went through `wordpress-malware-removal/` or `google-blacklist-removal/` and doesn't want a repeat, and (b) someone proactively searching before an incident happens. Position primarily for (a) — it's the warmer, higher-converting audience and the one this site already has traffic for.

### URL, title, meta description
- URL: `/services/wordpress-security-hardening/`
- `<title>`: `WordPress Security Hardening Service | Ashekur Rahman`
- Meta description: "WordPress security hardening: close the entry points that let hacks happen — before an incident, or right after one gets cleaned up."

### SEO strategy & internal linking
- **Internal linking is the main lever here, not cold search:** add a "Prevent this happening again" CTA to the end of the clean-up process on both `services/wordpress-malware-removal/` and `services/google-blacklist-removal/` (both currently end at the fix, not the prevention step).
- Cross-link from `blog/wordpress-hacked-malware-removal/`.
- The two already-planned `nav-panel-future` items "Caching & CDN Setup" and this one sit in the same "Performance & Security" column — keep this page's scope to hardening only (file permissions, login/auth, firewall rules, update policy) so it doesn't creep into the caching page's territory.

---

## 3. Caching & CDN Setup — SHIPPED 2026-09-06

`/services/caching-cdn-setup/` is live in both mega-menus (`Soon` swapped for `New` across all 97 site-wide nav instances), on `/services/`, and in `sitemap.xml`. Cross-linked from `core-web-vitals-fix/` and `wordpress-speed-optimization/` (both "Also worth reading" grids), and from `tools/elementor-speed-checker/`'s `hosting` verdict (the check that flags slow server response time) — its secondary CTA now points here instead of a blog post, alongside the primary `wordpress-speed-optimization/` link. Reused the Formatry/Canvascroft case studies and the standard 3-testimonial block, following the same template as Divi 5 Migration and Security Hardening. Not yet committed to git.

<!-- original spec below, kept for reference -->


### Target keywords
- **Primary:** "wordpress caching setup service", "wordpress cdn setup", "setup cloudflare wordpress"
- **Secondary:** "wordpress caching plugin setup", "reduce wordpress server response time"
- **Search intent:** Medium — competes with generic "best WordPress caching plugin" content, but "setup service" qualifier narrows it to commercial intent.

### Target audience & clients attracted
Site owners who got a Core Web Vitals or PageSpeed report telling them to "leverage browser caching" or "use a CDN" and don't know how, or whose site fails LCP specifically because there's no caching layer at all. Direct overlap audience with `core-web-vitals-fix/` — this page is the *implementation* half of what that page diagnoses.

### URL, title, meta description
- URL: `/services/caching-cdn-setup/`
- `<title>`: `WordPress Caching & CDN Setup Service | Ashekur Rahman`
- Meta description: "WordPress caching and CDN setup done right for your specific host and stack — not a generic plugin install. Faster TTFB and LCP, measured before and after."

### What's different from `core-web-vitals-fix`
`core-web-vitals-fix` diagnoses and fixes the specific metric/element failing in Search Console (could be LCP, INP or CLS, could have nothing to do with caching). This page is scoped to one implementation: server-side/page caching plus CDN configuration. Cross-link both directions; `core-web-vitals-fix` should recommend this page when its diagnosis is specifically "no caching layer."

### SEO strategy & internal linking
- Link from `core-web-vitals-fix/` and `wordpress-speed-optimization/` (both live).
- Link from `tools/elementor-speed-checker/` results when the check flags server response time or missing cache headers — that tool already checks for exactly this.
- FAQ should address the practical friction point for this audience: "Will this conflict with my host's built-in caching?" and "Do I need a paid CDN?"

---

## 4. Technical SEO Audit — SHIPPED 2026-09-06 (option B executed)

`/services/technical-seo-audit/` is live in both mega-menus, on `/services/`, and in `sitemap.xml`. Positioned as diagnosis-only: a fixed-price, one-time written report (crawl/indexation, Core Web Vitals baseline, on-page audit, architecture review), explicitly with no fix work included — that's what `services/seo/` (the full engagement) covers. `services/seo/`'s own copy was narrowed alongside it per the roadmap's instruction: its offer-catalog/scope-list wording for the audit line changed from "Full technical SEO audit" to "A technical SEO audit as the first phase, folded into the full engagement," a new FAQ pair was added to both pages disambiguating the two ("Can I just get an audit, without the fix work?" / "How is this different from your full SEO service?"), and each page links to the other in its FAQ and "Also worth reading" grid. Reused `services/seo/`'s own "Where this experience comes from" job-history section (rather than portfolio case cards) since audit work is the same discipline, not a build/visual deliverable.

`services/seo/` already lists "Full technical SEO audit — crawlability, indexation, redirects, canonicals and duplicate content" as one line inside its own `OfferCatalog`, and its own imagery/copy already leans on the audit angle (`assets/images/service-seo-audit.jpeg`). Shipping a second standalone page targeting the same phrase risks the two pages competing against each other in search rather than each pulling its own traffic.

**Two ways to resolve it, pick one before building:**

- **A — Don't build a second page.** Point the mega-menu's `Technical SEO Audit` item at `services/seo/#audit` (an anchor into the existing offer list) instead of a new URL. Zero cannibalization risk, near-zero effort, but loses the standalone-page SEO value of a dedicated audit landing page.
- **B — Build it, but reposition both pages first.** Make `services/technical-seo-audit/` a fixed-scope, fixed-price, one-time deliverable (a written audit report, no ongoing work), and narrow `services/seo/`'s copy to explicitly ongoing monthly work (it already says "I do not sell open-ended content retainers" in its FAQ, so the ongoing-vs-one-time distinction is already half-established). This is more work but captures "seo audit" search intent, which converts well as a low-commitment first purchase before someone buys ongoing SEO.

Recommend **B** if you want the standalone page — one-time audits are a good low-friction entry product — but it means a content edit to `services/seo/` alongside building the new page, not just building the new page in isolation.

---

## 5. Host Migration — RESOLVED 2026-09-06 (option A executed)

`services/host-migration/` stays an empty, unwired stub — no second page built. Instead, the mega-menu item across all 98 site-wide nav instances now links to `services/wordpress-migration/#hosting`, and the "Changing hosting providers" scenario card on `services/wordpress-migration/` got an `id="hosting"` anchor (with `scroll-margin-top` so the sticky header doesn't cover it on jump) plus a one-clause addition ("a same-domain, host-only move included") to make the anchor land on copy that actually says so.

<!-- original spec below, kept for reference -->
## 5. Host Migration — decision needed before building

`services/wordpress-migration/`'s "situations that call for a proper migration" section already opens with "Changing hosting providers... I handle the full transfer, DNS cutover and SSL reissue with minimal downtime" — nearly the exact scope a standalone Host Migration page would cover.

**Same two options:**

- **A — Don't build a second page.** Point the mega-menu item at `services/wordpress-migration/#hosting` (anchor into the existing scenario). Zero cannibalization.
- **B — Build it, but narrow the wedge.** Position `services/host-migration/` specifically as *same-domain, host-only* moves — a smaller, faster, cheaper service than the full `wordpress-migration/` page (which also covers domain consolidation, platform migration off Wix/Squarespace/Shopify, and account-recovery cases). The pitch becomes "just moving hosts, nothing else changing" as a distinctly lighter-weight offer, which also gives `pricing/` a cheaper entry point in the migration category.

Recommend **A** here specifically — unlike the SEO audit case, a host-only move genuinely isn't different enough in delivery to justify a second full page and second `Service` schema block; an anchor link keeps one strong page instead of two thin ones.

---

## Suggested execution order

1. **Divi 5 Migration** — DONE.
2. **WordPress Security Hardening** — DONE.
3. **Caching & CDN Setup** — DONE (2026-09-06).
4. **Host Migration** — DONE (2026-09-06, option A: anchor link).
5. **Technical SEO Audit** — DONE (2026-09-06, option B: standalone page built, `services/seo/` copy narrowed alongside it).

**All 5 items in this roadmap are now shipped or resolved, and committed and pushed** (`40102b2`, 2026-09-06).

**Update 2026-09-07:** The "Open question" flagged above is resolved by inspection — the 3 orphaned stub directories (`custom-plugin-development/`, `custom-post-type-development/`, `wordpress-update-management/`) no longer exist in the repo (confirmed via a fresh directory listing under `services/`). Nothing to fold into a future phase or delete; no action needed.

Each shipped page needs the same wrap-up checklist as the last batch: swap `Soon` → `New` badge in both `#navDrop-services` and `#navDropM-services`, add to `services/index.html`, add to `sitemap.xml`, and add the internal links called out above — not just the page itself.
