<?php
/* Free Redirect Map Generator — Tool 7 from FREE-TOOLS-SEO-ROADMAP.md.
   Takes an "old" and a "new" URL source (each either a single sitemap URL to
   fetch, or a pasted list of URLs/paths, one per line) and builds a fuzzy
   old-to-new URL mapping for a 301 redirect map.

   Unlike every other tool under assets/php/, this one isn't a single-URL
   scan — it's two independent URL lists that get matched against each
   other. The shared SSRF-safe fetcher (inc/safe-fetch.php) is still reused
   for the sitemap-fetch case, since a sitemap URL is exactly the kind of
   visitor-submitted remote address every other tool already guards.

   Mode decision (fetch vs. paste) is never guessed from the shape of the
   input alone: a side is only ever treated as "fetch this as a sitemap" when
   it is a single line that is itself URL-shaped, and even then the decision
   to actually treat it as a sitemap is confirmed by inspecting the fetched
   body (does it parse as a urlset/sitemapindex?) rather than assumed from
   the request text — same "never guess, surface unknown" principle as
   divi5-migration-checker.php's unknown_version verdict.

   Matching itself is a greedy, explainable heuristic: exact normalized-path
   matches first, then a Jaccard token-similarity score (weighted toward the
   final path segment/slug) for everything left, assigned highest-score-first
   so no old or new URL is used twice. Old URLs with no confident match are
   flagged rather than force-matched to the nearest thing available — the
   roadmap calls this out explicitly as the tool's own soft lead-gen moment.

   Receives {"old": "...", "new": "..."} as JSON, returns a structured JSON
   report. The frontend builds the downloadable CSV/.htaccess files itself
   from that JSON (no build step, no server-side file storage, matching this
   site's other tools). See /tools/redirect-map-generator/ for the caller. */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
set_time_limit(50);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

register_shutdown_function(static function (): void {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['status' => 'error', 'message' => 'Something went wrong while building the redirect map. Please try again.']);
    }
});

require __DIR__ . '/inc/safe-fetch.php';

const MAX_URLS_PER_SIDE = 500;
const MAX_CHILD_SITEMAPS = 8;
const MAX_FIELD_CHARS = 100_000;
const MULTI_FETCH_BUDGET_SECONDS = 40; // shared across every sitemap/child-sitemap fetch this request makes
const MIN_CANDIDATE_SCORE = 0.15;
const CONFIDENT_SCORE = 0.34;
const HIGH_SCORE = 0.66;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Method not allowed', 405);
}

$raw = file_get_contents('php://input');
$data = json_decode((string) $raw, true);
if (!is_array($data)) {
    fail('Invalid request body.', 400);
}

$oldRaw = trim((string) ($data['old'] ?? ''));
$newRaw = trim((string) ($data['new'] ?? ''));

if ($oldRaw === '' || $newRaw === '') {
    fail('Please provide both an old and a new URL source.');
}
if (mb_strlen($oldRaw) > MAX_FIELD_CHARS || mb_strlen($newRaw) > MAX_FIELD_CHARS) {
    fail('That input is too large to process. Please paste a shorter list, or link to a sitemap instead.');
}

/* ---------------------------------------------------------------------------
 * Per-side resolution — sitemap fetch or pasted list, normalised to a flat
 * array of raw URL/path strings.
 * ------------------------------------------------------------------------- */

function splitLines(string $raw): array
{
    $lines = preg_split('/\r\n|\r|\n/', $raw);
    $lines = array_map('trim', $lines);
    return array_values(array_filter($lines, static fn(string $l): bool => $l !== ''));
}

function looksLikeSingleUrl(string $line): bool
{
    if (preg_match('/\s/', $line)) {
        return false; // a single "line" with internal whitespace isn't one URL
    }
    if (preg_match('#^[a-zA-Z][a-zA-Z0-9+.\-]*://#', $line)) {
        return true;
    }
    // bare-domain shape, same tolerance readRequestedUrl() gives a single URL field
    return (bool) preg_match('#^[a-z0-9.\-]+\.[a-z]{2,}(/.*)?$#i', $line);
}

function normalizeUrlInput(string $line): string
{
    if (!preg_match('#^[a-zA-Z][a-zA-Z0-9+.\-]*://#', $line)) {
        $line = 'https://' . $line;
    }
    return $line;
}

/**
 * Parses one sitemap body. Returns ['type' => 'urlset', 'locs' => [...]] or
 * ['type' => 'sitemapindex', 'locs' => [...child sitemap URLs...]], or
 * ['error' => '...'] if the body isn't a recognisable sitemap document.
 */
function parseSitemapBody(string $body): array
{
    $prev = libxml_use_internal_errors(true);
    $xml = simplexml_load_string($body, SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_use_internal_errors($prev);

    if ($xml === false) {
        return ['error' => 'not_xml'];
    }

    $root = strtolower($xml->getName());
    if ($root === 'urlset') {
        $locs = [];
        foreach ($xml->url as $urlNode) {
            $loc = trim((string) $urlNode->loc);
            if ($loc !== '') {
                $locs[] = $loc;
            }
        }
        return ['type' => 'urlset', 'locs' => $locs];
    }

    if ($root === 'sitemapindex') {
        $locs = [];
        foreach ($xml->sitemap as $smNode) {
            $loc = trim((string) $smNode->loc);
            if ($loc !== '') {
                $locs[] = $loc;
            }
        }
        return ['type' => 'sitemapindex', 'locs' => $locs];
    }

    return ['error' => 'unrecognised_root'];
}

/**
 * Fetches a sitemap URL (following one level of sitemapindex -> child
 * sitemaps), returning a flat list of page URLs capped at
 * MAX_URLS_PER_SIDE. $deadline is a shared wall-clock budget across every
 * fetch this request makes on both sides, so one huge sitemap can't starve
 * the other side or run past the script's own time limit.
 */
function fetchSitemapUrls(string $url, float $deadline): array
{
    if (microtime(true) >= $deadline) {
        return ['error' => 'This is taking too long to fetch. Please try a smaller sitemap, or paste a URL list instead.'];
    }

    $main = safeFetchWithRedirects($url, MAX_BODY_BYTES);
    if (isset($main['error'])) {
        return ['error' => friendlyError($main['error'])];
    }

    $parsed = parseSitemapBody($main['body']);
    if (isset($parsed['error'])) {
        return ['error' => "That address didn't return a valid XML sitemap (a &lt;urlset&gt; or &lt;sitemapindex&gt; document). Paste a list of URLs instead, or double-check the sitemap link."];
    }

    $sourceUrl = $main['final_target']['origin'] . $main['final_target']['path'];
    $truncated = false;
    $incomplete = false;

    if ($parsed['type'] === 'urlset') {
        $urls = array_slice($parsed['locs'], 0, MAX_URLS_PER_SIDE);
        $truncated = count($parsed['locs']) > MAX_URLS_PER_SIDE;
        return ['urls' => $urls, 'truncated' => $truncated, 'incomplete' => false, 'source_url' => $sourceUrl];
    }

    // sitemapindex: fetch child sitemaps (one level deep — enough for how
    // virtually every real site's sitemap is actually structured) until the
    // URL cap or the shared time budget is reached.
    $childLocs = array_slice($parsed['locs'], 0, MAX_CHILD_SITEMAPS);
    if (count($parsed['locs']) > MAX_CHILD_SITEMAPS) {
        $incomplete = true; // more child sitemaps existed than we fetched
    }

    $urls = [];
    foreach ($childLocs as $childUrl) {
        if (microtime(true) >= $deadline || count($urls) >= MAX_URLS_PER_SIDE) {
            $incomplete = true;
            break;
        }
        $child = safeFetchWithRedirects($childUrl, MAX_AUX_BODY_BYTES);
        if (isset($child['error'])) {
            $incomplete = true;
            continue;
        }
        $childParsed = parseSitemapBody($child['body']);
        if (isset($childParsed['error']) || $childParsed['type'] !== 'urlset') {
            $incomplete = true;
            continue;
        }
        foreach ($childParsed['locs'] as $loc) {
            $urls[] = $loc;
            if (count($urls) >= MAX_URLS_PER_SIDE) {
                break;
            }
        }
    }

    $truncated = count($urls) >= MAX_URLS_PER_SIDE;
    return ['urls' => array_slice($urls, 0, MAX_URLS_PER_SIDE), 'truncated' => $truncated, 'incomplete' => $incomplete, 'source_url' => $sourceUrl];
}

/**
 * Resolves one side (old or new) to ['mode', 'urls', 'source', 'truncated',
 * 'note'] or ['error' => '...'].
 */
function resolveSide(string $raw, float $deadline, string $label): array
{
    $lines = splitLines($raw);
    if ($lines === []) {
        return ['error' => "Please provide the {$label} URLs."];
    }

    if (count($lines) === 1 && looksLikeSingleUrl($lines[0])) {
        $fetched = fetchSitemapUrls(normalizeUrlInput($lines[0]), $deadline);
        if (isset($fetched['error'])) {
            return ['error' => $fetched['error']];
        }
        if ($fetched['urls'] === []) {
            return ['error' => "No URLs were found in that {$label} sitemap."];
        }
        $note = null;
        if ($fetched['incomplete']) {
            $note = 'This sitemap references more child sitemaps than could be read in one pass — the map below is built from a partial read.';
        } elseif ($fetched['truncated']) {
            $note = 'Only the first ' . MAX_URLS_PER_SIDE . ' URLs from this sitemap were used.';
        }
        return [
            'mode' => 'sitemap',
            'urls' => $fetched['urls'],
            'source' => $fetched['source_url'],
            'truncated' => $fetched['truncated'] || $fetched['incomplete'],
            'note' => $note,
        ];
    }

    $truncated = count($lines) > MAX_URLS_PER_SIDE;
    $urls = array_slice($lines, 0, MAX_URLS_PER_SIDE);
    return [
        'mode' => 'list',
        'urls' => $urls,
        'source' => 'Pasted list (' . count($urls) . ' URL' . (count($urls) === 1 ? '' : 's') . ')',
        'truncated' => $truncated,
        'note' => $truncated ? ('Only the first ' . MAX_URLS_PER_SIDE . ' pasted lines were used.') : null,
    ];
}

/* ---------------------------------------------------------------------------
 * URL analysis + fuzzy matching
 * ------------------------------------------------------------------------- */

/**
 * Normalises one raw URL/path string into a comparable shape: the path
 * component (host stripped when present), plus word-token sets for the
 * whole path and just its final segment (the slug — weighted higher in
 * scoring below, since it's usually the strongest signal of "same page").
 */
function analyzeUrl(string $raw): array
{
    // parse_url() runs unconditionally so a query string or #fragment is
    // stripped from the path for a bare pasted path too, not just a full
    // URL — it handles a relative path safely on its own (e.g.
    // "/blog/post?utm=1" -> path "/blog/post"). Host is only ever trusted
    // when the strict scheme regex below also matches, so a stray
    // "12:34"-shaped bare path can't be misread as a host:port authority.
    $hasScheme = (bool) preg_match('#^[a-zA-Z][a-zA-Z0-9+.\-]*://#', $raw);
    $parts = parse_url($raw);
    if ($parts === false) {
        $parts = [];
    }

    $host = null;
    $path = $parts['path'] ?? '';

    if ($hasScheme && isset($parts['host'])) {
        $host = strtolower($parts['host']);
        if ($path === '') {
            $path = '/'; // a bare "https://example.com" with no path at all is the site root
        }
    }

    if ($path === '') {
        // parse_url() found no path-shaped structure at all (e.g. a stray
        // "12:34" that reads as host:port, or a totally malformed string) —
        // fall back to the raw text rather than silently losing it.
        $path = $raw;
    }

    $path = rawurldecode($path);
    $path = strtolower($path);
    if ($path === '') {
        $path = '/';
    }
    if ($path !== '/' && str_ends_with($path, '/')) {
        $path = rtrim($path, '/');
    }

    $tokens = preg_split('/[^a-z0-9]+/', $path, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $segments = array_values(array_filter(explode('/', trim($path, '/')), static fn(string $s): bool => $s !== ''));
    $slug = $segments === [] ? '' : end($segments);
    $slugTokens = $slug === '' ? [] : (preg_split('/[^a-z0-9]+/', $slug, -1, PREG_SPLIT_NO_EMPTY) ?: []);

    return ['raw' => $raw, 'host' => $host, 'path' => $path, 'tokens' => $tokens, 'slugTokens' => $slugTokens];
}

function jaccard(array $a, array $b): float
{
    if ($a === [] && $b === []) {
        return 0.0;
    }
    $setA = array_unique($a);
    $setB = array_unique($b);
    $intersection = count(array_intersect($setA, $setB));
    $union = count(array_unique(array_merge($setA, $setB)));
    return $union === 0 ? 0.0 : $intersection / $union;
}

function similarityScore(array $a, array $b): float
{
    $pathScore = jaccard($a['tokens'], $b['tokens']);
    $slugScore = jaccard($a['slugTokens'], $b['slugTokens']);
    return (0.4 * $pathScore) + (0.6 * $slugScore);
}

/**
 * Greedy bipartite matching: exact normalized-path matches first (free,
 * O(n)), then every remaining pair scored and assigned highest-score-first
 * so no old or new URL is ever used twice. Anything left over on the old
 * side is genuinely ambiguous — reported as unmatched rather than forced
 * onto the nearest remaining candidate.
 */
function matchUrls(array $oldRawUrls, array $newRawUrls): array
{
    $old = array_map('analyzeUrl', $oldRawUrls);
    $new = array_map('analyzeUrl', $newRawUrls);

    $usedOld = [];
    $usedNew = [];
    $matches = [];

    $newByPath = [];
    foreach ($new as $j => $n) {
        if (!isset($newByPath[$n['path']])) {
            $newByPath[$n['path']] = $j;
        }
    }

    foreach ($old as $i => $o) {
        if (isset($newByPath[$o['path']])) {
            $j = $newByPath[$o['path']];
            $matches[] = ['oldIdx' => $i, 'newIdx' => $j, 'score' => 1.0, 'confidence' => 'exact'];
            $usedOld[$i] = true;
            $usedNew[$j] = true;
            unset($newByPath[$o['path']]);
        }
    }

    $candidates = [];
    foreach ($old as $i => $o) {
        if (isset($usedOld[$i])) {
            continue;
        }
        foreach ($new as $j => $n) {
            if (isset($usedNew[$j])) {
                continue;
            }
            $score = similarityScore($o, $n);
            if ($score >= MIN_CANDIDATE_SCORE) {
                $candidates[] = ['oldIdx' => $i, 'newIdx' => $j, 'score' => $score];
            }
        }
    }

    usort($candidates, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);

    foreach ($candidates as $c) {
        if ($c['score'] < CONFIDENT_SCORE) {
            break; // sorted descending — nothing after this clears the bar either
        }
        if (isset($usedOld[$c['oldIdx']]) || isset($usedNew[$c['newIdx']])) {
            continue;
        }
        $matches[] = [
            'oldIdx' => $c['oldIdx'],
            'newIdx' => $c['newIdx'],
            'score' => $c['score'],
            'confidence' => $c['score'] >= HIGH_SCORE ? 'high' : 'medium',
        ];
        $usedOld[$c['oldIdx']] = true;
        $usedNew[$c['newIdx']] = true;
    }

    $matchOut = [];
    foreach ($matches as $m) {
        $o = $old[$m['oldIdx']];
        $n = $new[$m['newIdx']];
        $matchOut[] = [
            'old' => $o['raw'],
            'new' => $n['raw'],
            'old_path' => $o['path'],
            'new_path' => $n['path'],
            'new_full_url' => $n['host'] !== null ? $n['raw'] : null,
            'confidence' => $m['confidence'],
            'score' => round($m['score'], 2),
        ];
    }

    $unmatchedOut = [];
    foreach ($old as $i => $o) {
        if (!isset($usedOld[$i])) {
            $unmatchedOut[] = ['old' => $o['raw'], 'old_path' => $o['path']];
        }
    }

    // Keep output order stable and readable: matches by descending
    // confidence/score, unmatched in original old-list order.
    usort($matchOut, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);

    return ['matches' => $matchOut, 'unmatched' => $unmatchedOut];
}

/* ---------------------------------------------------------------------------
 * Run it
 * ------------------------------------------------------------------------- */

$deadline = microtime(true) + MULTI_FETCH_BUDGET_SECONDS;

$oldSide = resolveSide($oldRaw, $deadline, 'old');
if (isset($oldSide['error'])) {
    fail($oldSide['error']);
}
$newSide = resolveSide($newRaw, $deadline, 'new');
if (isset($newSide['error'])) {
    fail($newSide['error']);
}

$result = matchUrls($oldSide['urls'], $newSide['urls']);

$matchedCount = count($result['matches']);
$unmatchedCount = count($result['unmatched']);
$oldCount = count($oldSide['urls']);

if ($unmatchedCount === 0) {
    $summary = "Every one of the {$oldCount} old URLs found a confident match on the new site.";
    $ctaHint = 'all_matched';
} else {
    $summary = "{$matchedCount} of {$oldCount} old URLs matched confidently. {$unmatchedCount} couldn't be auto-matched — those need a human decision.";
    $ctaHint = 'unmatched_found';
}

echo json_encode([
    'status' => 'ok',
    'checked_at' => gmdate('c'),
    'old' => [
        'mode' => $oldSide['mode'],
        'source' => $oldSide['source'],
        'count' => $oldCount,
        'truncated' => $oldSide['truncated'],
        'note' => $oldSide['note'],
    ],
    'new' => [
        'mode' => $newSide['mode'],
        'source' => $newSide['source'],
        'count' => count($newSide['urls']),
        'truncated' => $newSide['truncated'],
        'note' => $newSide['note'],
    ],
    'matches' => $result['matches'],
    'unmatched' => $result['unmatched'],
    'counts' => [
        'old_total' => $oldCount,
        'new_total' => count($newSide['urls']),
        'matched' => $matchedCount,
        'unmatched' => $unmatchedCount,
    ],
    'summary' => $summary,
    'cta_hint' => $ctaHint,
], JSON_UNESCAPED_SLASHES);
