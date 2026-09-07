#!/usr/bin/env python3
"""One-time bulk edit: add a 'Questions' link into every existing page's
desktop nav, mobile nav, and footer sitemap column, right after the
existing 'Blog' link. Newly generated /questions/ pages already include
this link natively (see scripts/build-questions.mjs) and are excluded.

Matches the site's established pattern for site-wide nav edits (see
SERVICES-ROADMAP.md's notes on prior Soon->real-link swaps): derive the
relative-path prefix from the existing 'Blog' link in the same file,
rather than computing directory depth, so it can't drift out of sync
with however that file already links to blog/.

Usage: python3 scripts/add-questions-nav.py [--dry-run]
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY_RUN = '--dry-run' in sys.argv

DESKTOP_RE = re.compile(r'<a href="([^"]*)blog/" class="nav-link( is-active)?">Blog</a>')
# Negative lookbehind excludes the breadcrumb "Blog" link on individual blog
# posts (<li><a href="...">Blog</a></li>), which uses the same bare anchor
# markup as the mobile-nav/footer links this is meant to target.
BARE_RE = re.compile(r'(?<!<li>)<a href="([^"]*)blog/">Blog</a>')

SKIP_DIRS = {'.git', 'questions', 'node_modules'}


def already_has_questions_nav(content):
    return 'class="nav-link">Questions</a>' in content or 'class="nav-link is-active">Questions</a>' in content


def process(path):
    with open(path, encoding='utf-8') as f:
        content = f.read()

    if 'nav-link' not in content:
        return None  # not a full chrome page (e.g. a partial/manifest tool)

    if already_has_questions_nav(content):
        return 'skip (already has Questions nav)'

    desktop_matches = list(DESKTOP_RE.finditer(content))
    bare_matches = list(BARE_RE.finditer(content))

    if not desktop_matches:
        return 'WARN: no desktop Blog nav-link match found'

    def desktop_repl(m):
        prefix = m.group(1)
        return m.group(0) + f'\n      <a href="{prefix}questions/" class="nav-link">Questions</a>'

    def bare_repl(m):
        prefix = m.group(1)
        return m.group(0) + f'\n    <a href="{prefix}questions/">Questions</a>'

    new_content = DESKTOP_RE.sub(desktop_repl, content)
    new_content = BARE_RE.sub(bare_repl, new_content)

    if not DRY_RUN:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)

    return f'ok: {len(desktop_matches)} desktop, {len(bare_matches)} bare (mobile+footer)'


def main():
    files = sorted(glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True))
    files = [f for f in files if not any(f'{os.sep}{d}{os.sep}' in f or f.endswith(f'{os.sep}{d}') for d in SKIP_DIRS)]

    summary = {}
    for f in files:
        rel = os.path.relpath(f, ROOT)
        result = process(f)
        if result is None:
            continue
        summary[rel] = result

    warn_count = sum(1 for v in summary.values() if v.startswith('WARN'))
    ok_count = sum(1 for v in summary.values() if v.startswith('ok'))
    skip_count = sum(1 for v in summary.values() if v.startswith('skip'))

    for rel, result in summary.items():
        if not result.startswith('ok') or DRY_RUN:
            print(f'{rel}: {result}')

    print(f'\n{"[DRY RUN] " if DRY_RUN else ""}{ok_count} files updated, {skip_count} skipped, {warn_count} warnings, out of {len(files)} html files scanned.')


if __name__ == '__main__':
    main()
