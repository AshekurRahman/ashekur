<?php
/* Free Core Web Vitals Checker — reuses the shared SSRF-safe fetcher in
   inc/safe-fetch.php, then looks for the structural, publicly-visible
   causes of poor LCP, CLS and INP: images missing width/height (the
   documented, primary cause of unexpected layout shift), render-blocking
   stylesheets and scripts sitting in <head> with no defer/async (delaying
   first paint), Google Fonts loaded without a display strategy (invisible
   text / a second layout shift when the real font swaps in), slow server
   response time (delays every paint metric equally, a hosting issue not a
   markup one), and total script count as a rough main-thread-load proxy
   for INP. Receives {"url": "..."} as JSON, returns a structured JSON
   report. Same-origin only, so no CORS handling. See
   /tools/core-web-vitals-checker/ for the frontend that calls this.

   Deliberately does NOT claim to reproduce a real LCP/INP/CLS number —
   those are field or lab metrics that need a real browser (Lighthouse) or
   real-user data (Chrome UX Report), neither of which a static HTML fetch
   can produce. This is a structural pre-check: the same class of causes
   Search Console's Core Web Vitals report names, made visible without
   waiting for enough field data to accumulate there. See "What this can't
   do" on the tool page for the same caveat in plain language. */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
set_time_limit(25);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

register_shutdown_function(static function (): void {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['status' => 'error', 'message' => 'Something went wrong while checking this website. Please try again.']);
    }
});

require __DIR__ . '/inc/safe-fetch.php';

$inputUrl = readRequestedUrl();

$main = safeFetchWithRedirects($inputUrl, MAX_BODY_BYTES);
if (isset($main['error'])) {
    fail(friendlyError($main['error']));
}

$finalTarget = $main['final_target'];
$finalUrl = $finalTarget['origin'] . $finalTarget['path'];
$body = $main['body'];
$responseTimeMs = $main['time_ms'];

$doc = parseHtml($body);
$xpath = new DOMXPath($doc);

/* ---------------------------------------------------------------------------
 * CLS — images missing explicit width/height. This is the primary,
 * documented cause of layout shift the browser can't predict: without a
 * declared size (or an aspect-ratio in CSS this fetch can't see, since
 * that would require reading a linked stylesheet), the image's box is
 * unknown until it downloads, and surrounding content jumps when it does.
 * ------------------------------------------------------------------------- */

$images = $xpath->query('//img');
$imagesTotal = $images->length;
$imagesMissingDimensions = 0;
foreach ($images as $img) {
    $w = trim($img->getAttribute('width'));
    $h = trim($img->getAttribute('height'));
    if ($w === '' || $h === '') {
        $imagesMissingDimensions++;
    }
}

/* ---------------------------------------------------------------------------
 * CLS / LCP — Google Fonts loaded without a display strategy. Without
 * display=swap (or optional/fallback), the browser hides text until the
 * webfont arrives (FOIT), which delays LCP if that text is the largest
 * element, and can itself cause a layout shift when the swap happens.
 * Only checked for the Google Fonts CDN pattern, since a self-hosted
 * @font-face rule lives in a linked stylesheet this fetch doesn't follow.
 * ------------------------------------------------------------------------- */

$googleFontsWithoutDisplay = 0;
$stylesheetLinks = $xpath->query("//link[translate(@rel,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='stylesheet']");
foreach ($stylesheetLinks as $link) {
    $href = $link->getAttribute('href');
    if (stripos($href, 'fonts.googleapis.com') !== false && stripos($href, 'display=') === false) {
        $googleFontsWithoutDisplay++;
    }
}

/* ---------------------------------------------------------------------------
 * LCP — render-blocking stylesheets and scripts sitting in <head>. A
 * synchronous <link rel="stylesheet"> or a <script src> with no defer/async
 * both delay the point the browser can start painting anything, which
 * delays LCP directly regardless of what the largest element actually is.
 * ------------------------------------------------------------------------- */

$headNode = $doc->getElementsByTagName('head')->item(0);
$renderBlockingStylesheets = 0;
$renderBlockingScripts = 0;
if ($headNode !== null) {
    foreach ($headNode->childNodes as $node) {
        if (!($node instanceof DOMElement)) {
            continue;
        }
        $tag = strtolower($node->tagName);
        if ($tag === 'link' && strtolower($node->getAttribute('rel')) === 'stylesheet') {
            $media = strtolower(trim($node->getAttribute('media')));
            if ($media !== 'print') {
                $renderBlockingStylesheets++;
            }
        }
        if ($tag === 'script' && $node->getAttribute('src') !== '') {
            if (!$node->hasAttribute('defer') && !$node->hasAttribute('async')) {
                $renderBlockingScripts++;
            }
        }
    }
}

/* ---------------------------------------------------------------------------
 * INP proxy — total external scripts across the whole document. Not a
 * measurement of actual input latency (that needs a real interaction in a
 * real browser), but a heavier script count correlates with more
 * main-thread work competing with the next interaction.
 * ------------------------------------------------------------------------- */

$totalScripts = $xpath->query('//script[@src]')->length;
$htmlWeightKb = (int) round(strlen($body) / 1024);

/* ---------------------------------------------------------------------------
 * Signals, ranked. 'strong' alone is enough to name a likely cause; 'weak'
 * is shown but framed as worth a look, not a verdict on its own — same
 * convention as elementor-speed-checker.php.
 * ------------------------------------------------------------------------- */

$signals = [];

if ($imagesMissingDimensions >= 5) {
    $signals[] = [
        'metric' => 'CLS',
        'severity' => 'strong',
        'label' => $imagesMissingDimensions . ' of ' . $imagesTotal . ' images missing a width/height attribute',
        'detail' => "Without a declared size, the browser can't reserve space for these images before they load, so surrounding content jumps when they do — the single most common cause of a poor CLS score.",
    ];
} elseif ($imagesMissingDimensions >= 1) {
    $signals[] = [
        'metric' => 'CLS',
        'severity' => 'weak',
        'label' => $imagesMissingDimensions . ' of ' . $imagesTotal . ' images missing a width/height attribute',
        'detail' => 'Not extreme, but each one is a small layout-shift risk until it has an explicit size or a CSS aspect-ratio.',
    ];
}

if ($renderBlockingScripts >= 3) {
    $signals[] = [
        'metric' => 'LCP',
        'severity' => 'strong',
        'label' => $renderBlockingScripts . ' render-blocking scripts in the page head',
        'detail' => 'Scripts loaded without defer or async in <head> stop the browser from continuing to parse the page until each one downloads and runs, delaying the first paint and everything after it, including LCP.',
    ];
} elseif ($renderBlockingScripts >= 1) {
    $signals[] = [
        'metric' => 'LCP',
        'severity' => 'weak',
        'label' => $renderBlockingScripts . ' render-blocking script' . ($renderBlockingScripts === 1 ? '' : 's') . ' in the page head',
        'detail' => 'Worth adding defer or async if these don’t need to run before the rest of the page parses.',
    ];
}

if ($renderBlockingStylesheets >= 6) {
    $signals[] = [
        'metric' => 'LCP',
        'severity' => 'strong',
        'label' => $renderBlockingStylesheets . ' render-blocking stylesheets loading before first paint',
        'detail' => 'Every one of these has to download before the browser can safely paint anything, since any of them could still change how the page looks. A high count like this is a direct, fixable delay to LCP.',
    ];
} elseif ($renderBlockingStylesheets >= 3) {
    $signals[] = [
        'metric' => 'LCP',
        'severity' => 'weak',
        'label' => $renderBlockingStylesheets . ' render-blocking stylesheets loading before first paint',
        'detail' => 'Not extreme, but each one delays first paint slightly. Worth combining or deferring non-critical ones.',
    ];
}

if ($googleFontsWithoutDisplay > 0) {
    $signals[] = [
        'metric' => 'CLS',
        'severity' => 'weak',
        'label' => 'Google Fonts loaded without a display strategy',
        'detail' => "No display=swap (or optional) parameter was found on the Google Fonts stylesheet link, which can hide text until the font arrives and shift the layout again once it swaps in.",
    ];
}

if ($responseTimeMs >= 1500) {
    $signals[] = [
        'metric' => 'LCP',
        'severity' => 'strong',
        'label' => 'Slow server response time (' . $responseTimeMs . 'ms)',
        'detail' => "This is the total time it took to fetch this page's HTML from the server. Nothing can paint until this finishes, so a slow response delays LCP and every other paint metric equally — a hosting issue, not a markup one.",
    ];
} elseif ($responseTimeMs >= 800) {
    $signals[] = [
        'metric' => 'LCP',
        'severity' => 'weak',
        'label' => 'Server response time is on the slower side (' . $responseTimeMs . 'ms)',
        'detail' => 'Not necessarily a problem on its own, but it adds to whatever else is delaying first paint.',
    ];
}

if ($totalScripts >= 25) {
    $signals[] = [
        'metric' => 'INP',
        'severity' => 'weak',
        'label' => $totalScripts . ' total scripts loading on this page',
        'detail' => "Not a direct measurement of input responsiveness — that needs a real interaction in a real browser — but this much script competing for the main thread correlates with slower response to clicks and taps.",
    ];
}

/* ---------------------------------------------------------------------------
 * Verdict — a slow server response is called out as a hosting cause
 * (routes toward Speed Optimization); a structural cause — layout shift or
 * render-blocking markup — routes toward Core Web Vitals Fix, since that's
 * the targeted, per-metric diagnosis rather than general hosting work.
 * Same bifurcation pattern as elementor-speed-checker.php.
 * ------------------------------------------------------------------------- */

$strongSignals = array_values(array_filter($signals, static fn ($s) => $s['severity'] === 'strong'));
$weakCount = count(array_filter($signals, static fn ($s) => $s['severity'] === 'weak'));

$hostingCauseSignal = null;
$structuralCauseSignal = null;
foreach ($strongSignals as $signal) {
    if ($hostingCauseSignal === null && str_contains($signal['label'], 'response time')) {
        $hostingCauseSignal = $signal;
    } elseif ($structuralCauseSignal === null) {
        $structuralCauseSignal = $signal;
    }
}

if ($structuralCauseSignal !== null) {
    $verdict = 'at_risk';
    $summary = $structuralCauseSignal['label'] . '.';
    $ctaHint = 'structural';
} elseif ($hostingCauseSignal !== null) {
    $verdict = 'at_risk';
    $summary = 'The page structure looks reasonable here — the risk points to server response time instead.';
    $ctaHint = 'hosting';
} elseif ($weakCount > 0) {
    $verdict = 'watch';
    $summary = 'Nothing major, but a few things below are worth keeping an eye on.';
    $ctaHint = 'watch';
} else {
    $verdict = 'clean';
    $summary = 'No obvious structural Core Web Vitals risks found on this page.';
    $ctaHint = 'clean';
}

/* ---------------------------------------------------------------------------
 * Assemble response
 * ------------------------------------------------------------------------- */

$response = [
    'status' => 'ok',
    'requested_url' => $inputUrl,
    'final_url' => $finalUrl,
    'checked_at' => gmdate('c'),

    'verdict' => $verdict,
    'summary' => $summary,
    'signals' => $signals,

    'metrics' => [
        'images_total' => $imagesTotal,
        'images_missing_dimensions' => $imagesMissingDimensions,
        'render_blocking_stylesheets' => $renderBlockingStylesheets,
        'render_blocking_scripts' => $renderBlockingScripts,
        'google_fonts_without_display' => $googleFontsWithoutDisplay,
        'total_scripts' => $totalScripts,
        'response_time_ms' => $responseTimeMs,
        'html_weight_kb' => $htmlWeightKb,
        'truncated' => $main['truncated'] ?? false,
    ],

    'cta_hint' => $ctaHint,
];

echo json_encode($response, JSON_UNESCAPED_SLASHES);
