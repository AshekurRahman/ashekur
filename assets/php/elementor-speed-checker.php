<?php
/* Free Elementor Speed & Bloat Checker — reuses the shared SSRF-safe fetcher
   and WordPress-detection helper in inc/safe-fetch.php, confirms Elementor
   is actually in use (a small, intentionally duplicated subset of
   theme-detector.php's Elementor signature set — this site has no build
   step, so tool-specific detection logic stays self-contained per tool
   rather than being pulled into a shared file for two callers), then looks
   for the publicly-visible causes of a slow Elementor page: known add-on
   library suites loading their own assets, a high count of separate
   Elementor-generated stylesheets, and slow server response time (a
   hosting/TTFB issue, not an Elementor problem). Receives {"url": "..."}
   as JSON, returns a structured JSON report. Same-origin only, so no CORS
   handling. See /tools/elementor-speed-checker/ for the frontend that
   calls this.

   Deliberately does NOT attempt to measure true total page weight (every
   image/script/stylesheet byte) — fetching every linked asset from a
   third-party origin would multiply outbound requests per scan and drift
   toward the kind of scanning this site's SSRF-safe fetcher is built to
   avoid. Instead it reports the homepage HTML document's own size and the
   number of separate CSS/JS files it links to — an honest, verifiable
   proxy for request-count bloat, not a claim of exact page weight. */

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
$headers = $main['headers'];
$responseTimeMs = $main['time_ms'];

$doc = parseHtml($body);
$generator = metaContent($doc, 'name', 'generator');
$wordpress = detectWordPressSignals($body, $headers, $generator);

/* ---------------------------------------------------------------------------
 * Elementor detection — confirms Elementor is actually in use before doing
 * any bloat analysis. Same signature set theme-detector.php uses for
 * Elementor specifically (data-elementor-type, elementor-frontend, plugin
 * asset path, Global Kit stylesheet).
 * ------------------------------------------------------------------------- */

$elementorSignatures = [
    'data-elementor-type' => 'A data-elementor-type attribute is present in the markup.',
    'elementor-frontend' => "Elementor's frontend script/style handle is loaded.",
    '/wp-content/plugins/elementor/' => 'Elementor plugin assets are loaded from /wp-content/plugins/elementor/.',
    'elementor-kit-' => 'An Elementor Global Kit stylesheet is loaded.',
];
$elementorSignalsFound = [];
foreach ($elementorSignatures as $needle => $description) {
    if (stripos($body, $needle) !== false) {
        $elementorSignalsFound[] = $description;
    }
}
$elementorScore = count($elementorSignalsFound);
$isElementor = $elementorScore > 0;
$elementorConfidence = $elementorScore >= 2 ? 'high' : ($elementorScore === 1 ? 'medium' : 'none');
$globalKitConfigured = str_contains($body, 'elementor-kit-');

if (!$isElementor) {
    $notElementorCta = 'not_elementor';
    if ($wordpress['is_wordpress']) {
        $notElementorSummary = "This site is running WordPress, but no Elementor signal was found on the homepage — it may use a different page builder, or a fully custom theme.";
    } else {
        $notElementorSummary = 'No WordPress or Elementor signal was found on the homepage.';
    }

    echo json_encode([
        'status' => 'ok',
        'requested_url' => $inputUrl,
        'final_url' => $finalUrl,
        'checked_at' => gmdate('c'),
        'elementor' => ['detected' => false, 'confidence' => 'none', 'signals' => []],
        'verdict' => 'not_elementor',
        'summary' => $notElementorSummary,
        'signals' => [],
        'metrics' => null,
        'cta_hint' => $notElementorCta,
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---------------------------------------------------------------------------
 * Add-on library suites — each one loading its own CSS/JS on every page is
 * the pattern documented in blog/improve-wordpress-website-speed/. Grouped
 * by vendor (Crocoblock ships several jet-* plugins that together count as
 * one detected suite, not three) rather than by individual plugin slug.
 * ------------------------------------------------------------------------- */

$addonVendorSlugs = [
    'Essential Addons for Elementor' => ['essential-addons-for-elementor-lite', 'essential-addons-elementor'],
    'Crocoblock (JetPlugins)' => ['jet-elements', 'jet-tricks', 'jet-blog', 'jet-popup', 'jet-menu', 'jet-woo-builder', 'jet-engine'],
    'PowerPack for Elementor' => ['powerpack-lite-for-elementor', 'powerpack-elements'],
    'Ultimate Addons for Elementor' => ['ultimate-addons-for-elementor'],
    'Happy Addons for Elementor' => ['happy-elementor-addons'],
    'ElementsKit' => ['elementskit-lite', 'elementskit'],
    'Premium Addons for Elementor' => ['premium-addons-for-elementor'],
    'Livemesh Addons for Elementor' => ['livemesh-el-addons'],
];

$addonsDetected = [];
foreach ($addonVendorSlugs as $vendorName => $slugs) {
    foreach ($slugs as $slug) {
        if (str_contains($body, '/wp-content/plugins/' . $slug . '/')) {
            $addonsDetected[] = $vendorName;
            break;
        }
    }
}

/* ---------------------------------------------------------------------------
 * Elementor-generated stylesheet count — every <link> whose id contains
 * "elementor" and ends "-css" (elementor-frontend-css, elementor-post-123-
 * css, elementor-global-css, elementor-icons-css, etc.) is one separate
 * request. A rough, honest proxy for "uncombined CSS" bloat.
 * ------------------------------------------------------------------------- */

$elementorCssHandles = [];
if (preg_match_all('/<link\b[^>]*\bid=["\']([a-z0-9_-]*elementor[a-z0-9_-]*-css)["\'][^>]*>/i', $body, $m)) {
    $elementorCssHandles = array_values(array_unique($m[1]));
}
$elementorCssFileCount = count($elementorCssHandles);

/* ---------------------------------------------------------------------------
 * Overall request-count proxy — every stylesheet and external script the
 * homepage links to, Elementor-related or not.
 * ------------------------------------------------------------------------- */

$xpath = new DOMXPath($doc);
$totalStylesheets = $xpath->query("//link[translate(@rel,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='stylesheet']")->length;
$totalScripts = $xpath->query('//script[@src]')->length;
$htmlWeightKb = (int) round(strlen($body) / 1024);

/* ---------------------------------------------------------------------------
 * Cause-first signals, ranked. 'strong' alone is enough to name a likely
 * cause; 'weak' is shown but framed as worth a look, not a verdict on its
 * own.
 * ------------------------------------------------------------------------- */

$signals = [];

$addonCount = count($addonsDetected);
if ($addonCount >= 2) {
    $signals[] = [
        'severity' => 'strong',
        'label' => $addonCount . ' add-on libraries detected loading on every page',
        'detail' => 'This is the most common cause of Elementor slowdown: ' . implode(', ', $addonsDetected) . ' each load their own CSS and JS on every page load, whether or not that page actually uses their widgets.',
    ];
} elseif ($addonCount === 1) {
    $signals[] = [
        'severity' => 'weak',
        'label' => '1 add-on library detected (' . $addonsDetected[0] . ')',
        'detail' => 'A single add-on suite is usually fine on its own, but it is still adding its own CSS/JS to every page load — worth checking it is configured to only load assets the page actually uses, if the plugin offers that option.',
    ];
}

if ($elementorCssFileCount >= 8) {
    $signals[] = [
        'severity' => 'strong',
        'label' => $elementorCssFileCount . ' separate Elementor-generated stylesheets loading on this page',
        'detail' => 'Each one is its own HTTP request. A high count like this usually means per-element or per-post CSS files are not being combined — one of the most direct, fixable causes of a slow first paint on an Elementor page.',
    ];
} elseif ($elementorCssFileCount >= 5) {
    $signals[] = [
        'severity' => 'weak',
        'label' => $elementorCssFileCount . ' separate Elementor-generated stylesheets loading on this page',
        'detail' => 'Not extreme, but each is a separate request. Worth a look alongside whatever else this report finds.',
    ];
}

if ($responseTimeMs >= 1500) {
    $signals[] = [
        'severity' => 'strong',
        'label' => 'Slow server response time (' . $responseTimeMs . 'ms)',
        'detail' => "This is the total time it took to fetch this page's HTML from the server — a hosting or server response issue rather than something caused by Elementor itself. It adds to any Elementor-specific slowdown found elsewhere in this report.",
    ];
} elseif ($responseTimeMs >= 800) {
    $signals[] = [
        'severity' => 'weak',
        'label' => 'Server response time is on the slower side (' . $responseTimeMs . 'ms)',
        'detail' => 'Not necessarily a problem on its own, but it adds to whatever else is slowing this page down.',
    ];
}

$totalAssetRequests = $totalStylesheets + $totalScripts;
if ($totalAssetRequests >= 30) {
    $signals[] = [
        'severity' => 'weak',
        'label' => $totalAssetRequests . ' separate CSS/JS files loading on this page in total',
        'detail' => 'Not all of this is necessarily Elementor-related, but this many separate files is worth trimming regardless of the specific cause.',
    ];
}

/* ---------------------------------------------------------------------------
 * Verdict — cause-first: an Elementor-specific cause (add-ons, uncombined
 * CSS) takes priority in the headline over a hosting/TTFB issue, since this
 * tool exists to answer "is it Elementor, or something else". A visitor
 * with both gets the fuller picture in the signals list either way.
 * ------------------------------------------------------------------------- */

$elementorCauseSignal = null;
$hostingCauseSignal = null;
foreach ($signals as $signal) {
    if ($elementorCauseSignal === null && str_contains($signal['label'], 'add-on') && $signal['severity'] === 'strong') {
        $elementorCauseSignal = $signal;
    }
    if ($elementorCauseSignal === null && str_contains($signal['label'], 'stylesheets') && $signal['severity'] === 'strong') {
        $elementorCauseSignal = $signal;
    }
    if ($hostingCauseSignal === null && str_contains($signal['label'], 'response time') && $signal['severity'] === 'strong') {
        $hostingCauseSignal = $signal;
    }
}

$strongCount = count(array_filter($signals, static fn ($s) => $s['severity'] === 'strong'));
$weakCount = count(array_filter($signals, static fn ($s) => $s['severity'] === 'weak'));

if ($elementorCauseSignal !== null) {
    $verdict = 'bloated';
    $summary = $elementorCauseSignal['label'] . '.';
    $ctaHint = 'addon_bloat';
} elseif ($hostingCauseSignal !== null) {
    $verdict = 'slow_hosting';
    $summary = 'Elementor itself looks fine here — the slowdown points to server response time instead.';
    $ctaHint = 'hosting';
} elseif ($strongCount > 0) {
    $verdict = 'bloated';
    $summary = 'A likely cause of slowdown was found — see the details below.';
    $ctaHint = 'addon_bloat';
} elseif ($weakCount > 0) {
    $verdict = 'watch';
    $summary = 'Nothing major, but a few things below are worth keeping an eye on.';
    $ctaHint = 'watch';
} else {
    $verdict = 'clean';
    $summary = 'No obvious Elementor-specific bloat found on this page.';
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

    'elementor' => [
        'detected' => true,
        'confidence' => $elementorConfidence,
        'signals' => $elementorSignalsFound,
    ],

    'verdict' => $verdict,
    'summary' => $summary,
    'signals' => $signals,

    'metrics' => [
        'addons_detected' => $addonsDetected,
        'elementor_css_files' => $elementorCssFileCount,
        'total_stylesheets' => $totalStylesheets,
        'total_scripts' => $totalScripts,
        'response_time_ms' => $responseTimeMs,
        'html_weight_kb' => $htmlWeightKb,
        'global_kit_configured' => $globalKitConfigured,
        'truncated' => $main['truncated'] ?? false,
    ],

    'cta_hint' => $ctaHint,
];

echo json_encode($response, JSON_UNESCAPED_SLASHES);
