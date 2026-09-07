<?php
/* Free WordPress Theme & Page Builder Detector — reuses the shared
   SSRF-safe fetcher in inc/safe-fetch.php, then pattern-matches the fetched
   HTML against known builder/theme/plugin signatures. Receives
   {"url": "..."} as JSON, returns a structured JSON report. Same-origin
   only, so no CORS handling. See /tools/what-theme-is-this/ for the
   frontend that calls this. */

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

$doc = parseHtml($body);
$generator = metaContent($doc, 'name', 'generator');

/* ---------------------------------------------------------------------------
 * WordPress detection — shared with website-health-checker.php via
 * inc/safe-fetch.php.
 * ------------------------------------------------------------------------- */

$wordpress = detectWordPressSignals($body, $headers, $generator);
$isWordPress = $wordpress['is_wordpress'];

/* ---------------------------------------------------------------------------
 * Page builder detection
 * ------------------------------------------------------------------------- */

/** Each builder's signatures, roughly ordered strongest-signal-first. Every
    match adds one point; the highest-scoring builder with at least one point
    wins. Ties keep array order (Elementor/Divi first, as the two this site
    actually serves — a tie is vanishingly unlikely in practice anyway,
    since real builder markup rarely overlaps this cleanly). */
$builderSignatures = [
    'Elementor' => [
        'data-elementor-type' => 'A data-elementor-type attribute is present in the markup.',
        'elementor-frontend' => 'Elementor\'s frontend script/style handle is loaded.',
        '/wp-content/plugins/elementor/' => 'Elementor plugin assets are loaded from /wp-content/plugins/elementor/.',
        'elementor-kit-' => 'An Elementor Global Kit stylesheet is loaded.',
    ],
    'Divi' => [
        'et_pb_' => 'Divi Builder module classes (et_pb_*) appear in the markup.',
        '"et-boc"' => 'The Divi body-output-container class (et-boc) is present.',
        '/wp-content/themes/Divi/' => 'The Divi theme\'s own assets are loaded from /wp-content/themes/Divi/.',
        'et_bloom' => 'Divi\'s Bloom plugin is present.',
    ],
    'Beaver Builder' => [
        'fl-builder' => 'Beaver Builder\'s fl-builder markup/classes are present.',
        '/wp-content/plugins/bb-plugin/' => 'Beaver Builder plugin assets are loaded.',
    ],
    'Bricks' => [
        'data-bricks-' => 'Bricks builder data attributes are present.',
        '/wp-content/themes/bricks/' => 'The Bricks theme\'s own assets are loaded.',
    ],
    'WPBakery Page Builder' => [
        'js_composer' => 'WPBakery\'s js_composer handle/classes are present.',
        'wpb_row' => 'WPBakery row/column classes (wpb_*) appear in the markup.',
    ],
    'Oxygen Builder' => [
        '/wp-content/plugins/oxygen/' => 'Oxygen Builder plugin assets are loaded.',
        'ct-section' => 'Oxygen\'s ct-section/ct-div component classes are present.',
    ],
];

$builderScores = [];
$builderSignalsFound = [];
foreach ($builderSignatures as $name => $signatures) {
    $score = 0;
    $found = [];
    foreach ($signatures as $needle => $description) {
        if (stripos($body, $needle) !== false) {
            $score++;
            $found[] = $description;
        }
    }
    if ($score > 0) {
        $builderScores[$name] = $score;
        $builderSignalsFound[$name] = $found;
    }
}

$builderName = null;
$builderConfidence = 'none';
$builderSignals = [];
if ($builderScores !== []) {
    arsort($builderScores);
    $builderName = array_key_first($builderScores);
    $topScore = $builderScores[$builderName];
    $builderConfidence = $topScore >= 2 ? 'high' : 'medium';
    $builderSignals = $builderSignalsFound[$builderName];
} elseif ($isWordPress && (str_contains($body, 'wp-block-') || str_contains($body, 'is-layout-'))) {
    $builderName = 'Gutenberg (block editor)';
    $builderConfidence = 'medium';
    $builderSignals = ['Block-editor markup (wp-block-*/is-layout-*) is present with no third-party builder detected.'];
}

/* ---------------------------------------------------------------------------
 * Theme + plugin slug extraction — one combined pass over $body for both
 * /wp-content/themes/<slug>/ and /wp-content/plugins/<slug>/, rather than
 * two separate full-body regex scans. Extracting every occurrence (instead
 * of matching a fixed list) means an uncommon or custom theme/plugin still
 * gets identified by its actual slug instead of falling through to "unknown".
 * ------------------------------------------------------------------------- */

$knownThemeNames = [
    'divi' => 'Divi',
    'astra' => 'Astra',
    'generatepress' => 'GeneratePress',
    'hello-elementor' => 'Hello Elementor',
    'kadence' => 'Kadence',
    'oceanwp' => 'OceanWP',
    'avada' => 'Avada',
    'genesis' => 'Genesis (theme framework)',
    'bricks' => 'Bricks',
    'blocksy' => 'Blocksy',
    'neve' => 'Neve',
    'twentytwentyfour' => 'Twenty Twenty-Four (default WP theme)',
    'twentytwentythree' => 'Twenty Twenty-Three (default WP theme)',
    'twentytwentytwo' => 'Twenty Twenty-Two (default WP theme)',
];

$notablePluginSlugs = [
    'woocommerce' => 'WooCommerce',
    'elementor-pro' => 'Elementor Pro',
    'elementor' => 'Elementor',
    'wordpress-seo' => 'Yoast SEO',
    'seo-by-rank-math' => 'Rank Math',
    'sitepress-multilingual-cms' => 'WPML',
    'contact-form-7' => 'Contact Form 7',
    'wpforms-lite' => 'WPForms',
    'jetpack' => 'Jetpack',
    'wp-rocket' => 'WP Rocket',
    'litespeed-cache' => 'LiteSpeed Cache',
    'bb-plugin' => 'Beaver Builder',
];

$themeSlugCounts = [];
$pluginSlugs = [];
if (preg_match_all('#/wp-content/(themes|plugins)/([A-Za-z0-9_-]+)/#', $body, $matches, PREG_SET_ORDER)) {
    foreach ($matches as $match) {
        if ($match[1] === 'themes') {
            $themeSlugCounts[$match[2]] = ($themeSlugCounts[$match[2]] ?? 0) + 1;
        } else {
            $pluginSlugs[$match[2]] = true;
        }
    }
}
$pluginSlugs = array_keys($pluginSlugs);

$themeSlug = null;
$themeName = null;
if ($themeSlugCounts !== []) {
    arsort($themeSlugCounts);
    $themeSlug = array_key_first($themeSlugCounts);
    $themeName = $knownThemeNames[strtolower($themeSlug)] ?? $themeSlug;
}

$notablePlugins = [];
$otherPlugins = [];
foreach ($pluginSlugs as $slug) {
    $lower = strtolower($slug);
    if (isset($notablePluginSlugs[$lower])) {
        $notablePlugins[$lower] = $notablePluginSlugs[$lower];
    } else {
        $otherPlugins[] = $slug;
    }
}
sort($otherPlugins);
$otherPlugins = array_slice($otherPlugins, 0, 12);

/* ---------------------------------------------------------------------------
 * CTA hint — tells the frontend which service link to lead with. Priority:
 * an ecommerce store matters more than which builder it happens to use, a
 * detected builder matters more than generic "it's WordPress".
 * ------------------------------------------------------------------------- */

$ctaHint = 'wordpress';
if (isset($notablePlugins['woocommerce'])) {
    $ctaHint = 'woocommerce';
} elseif ($builderName === 'Elementor') {
    $ctaHint = 'elementor';
} elseif ($builderName === 'Divi' || strtolower((string) $themeSlug) === 'divi') {
    $ctaHint = 'divi';
} elseif (!$isWordPress) {
    $ctaHint = 'not_wordpress';
}

/* ---------------------------------------------------------------------------
 * Assemble response
 * ------------------------------------------------------------------------- */

$response = [
    'status' => 'ok',
    'requested_url' => $inputUrl,
    'final_url' => $finalUrl,
    'checked_at' => gmdate('c'),

    'wordpress' => [
        'is_wordpress' => $isWordPress,
        'verdict' => $wordpress['verdict'],
        'status' => $wordpress['status'],
        'signals' => $wordpress['signals'],
    ],

    'builder' => [
        'name' => $builderName,
        'confidence' => $builderConfidence,
        'signals' => $builderSignals,
    ],

    'theme' => [
        'slug' => $themeSlug,
        'name' => $themeName,
    ],

    'plugins' => [
        'notable' => array_values($notablePlugins),
        'other' => $otherPlugins,
    ],

    'cta_hint' => $ctaHint,
];

echo json_encode($response, JSON_UNESCAPED_SLASHES);
