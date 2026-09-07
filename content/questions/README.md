# Questions & Answers Knowledge Base — authoring guide

`ashekur.com` has no CMS — every page is a hand-authored static HTML file,
built and deployed via git. A 100+ question knowledge base can't reasonably
be hand-authored one file at a time without templates drifting out of sync,
so this is the one deliberate exception: content lives here as structured
JSON, and `scripts/build-questions.mjs` renders it into the same static
HTML the rest of the site uses. Nothing in that script ships to a visitor's
browser — it's an authoring-time tool only, run locally before committing.

**There is no WordPress admin here.** If the goal is ever to hand this off
to someone non-technical to maintain day to day, that's a real platform
change (an actual WordPress migration, or a small custom admin UI) — not
something this static setup can grow into on its own.

## Adding a new question

1. Copy an existing file in this directory as a starting point, e.g.
   `woocommerce-subscriptions-renewal-not-working.json`.
2. Fill in the fields — see any existing file for the exact shape:
   - `slug`, `category`, `subcategory` (must match `taxonomy.json`)
   - `question` — used as the page's H1 and title
   - `metaDescription` — under ~155 characters
   - `shortAnswer` — 1–3 sentences of HTML, the direct answer
   - `bodyHtml` — the full explanation as an HTML string. Use `<h2 id="...">`
     for major sections (the table of contents and heading hierarchy are
     both generated automatically from these) and `<pre class="language-php">`
     (or `-js`, `-css`, `-json`, `-markup`) for code blocks — only include a
     code example when it's genuinely useful, not for its own sake.
   - `image.alt` — a real, specific description of the placeholder
   - `image.prompt` — a specific, non-generic prompt for the real
     illustration to eventually replace the placeholder SVG with (this
     never renders on the page — it's written into an HTML comment under
     the `<img>` tag for future reference)
   - `hasCode` — `true` if the body contains a code block (also
     auto-detected, but set it explicitly if unsure)
3. Run `node scripts/build-questions.mjs` from the repo root.
4. Check the generated page under `questions/<category>/[<subcategory>/]<slug>/`,
   commit both the new JSON file and everything the script regenerated
   (it rewrites the whole `questions/` output directory, the relevant
   `assets/images/placeholders/*.svg`, and `sitemap.xml` each run).

No template file needs editing to add a question. Related questions,
breadcrumbs, the table of contents, and the CTA are all generated from the
taxonomy and content automatically.

## Adding a new category or subcategory

Edit `taxonomy.json` — add an entry with `slug`, `name`, `shortName`,
`description`, and a `cta` object (`heading`, `body`, `href` — root-relative,
e.g. `services/woocommerce-development/` — and `label`). Re-run the
generator. No question needs to reference it until you're ready to start
tagging questions with the new slug.

## What's intentionally NOT automated

- **The generator is not a build step for the live site** — it's run
  locally (or in CI, if that's ever added) before committing. Visitors
  never load Node or touch this script.
- **Prism.js (code syntax highlighting)** only loads on pages the generator
  detects contain a `<pre><code>` block — most questions won't pull it in
  at all.
- **Placeholder images** are a single shared SVG design written out to a
  unique file per question, specifically so a real generated illustration
  can later replace each file in place without touching any HTML.
