<?php
/* Free Divi 5 Migration Readiness Checker — reuses the shared SSRF-safe
   fetcher in inc/safe-fetch.php, confirms Divi is in use on the homepage
   (the same et_pb_, et-boc, themes/Divi signature set theme-detector.php
   already uses — kept local here rather than shared, same reasoning as
   elementor-speed-checker.php and woocommerce-store-checker.php), then
   works out whether that site is confirmed on Divi 5, confirmed still on
   Divi 4, or can't be told apart from the outside.

   This is deliberately a checklist, not a deep scan — a single homepage
   fetch, no secondary page probe. Three independent signals are checked:

   1. Divi-5-exclusive module classes (Timeline, Breadcrumbs, SVG, Table of
      Contents, Instagram Feed, Tooltip, Post Filter, Charts, Gravity Forms,
      Imagely Gallery, Payment Button) never existed in Divi 4 — finding one
      is unambiguous proof of Divi 5, regardless of version string.
   2. WordPress appends the theme/plugin's own version as ?ver=X.Y.Z on its
      enqueued assets by default. A major version >=5 found this way is
      equally solid; 4.x confirms the site is still on Divi 4.
   3. Neither signal survives everywhere — a caching/optimization plugin
      commonly strips query strings, and a homepage rarely happens to use a
      Divi-5-only module. When that happens, this reports "can't determine
      version" honestly rather than guessing either way.

   There is no reliable way to tell a specific page apart from Divi 5's
   backward-compatibility mode from the outside — the only badge for that is
   admin-bar-only, invisible to a logged-out fetch — so this tool never
   claims that distinction.

   Receives {"url": "..."} as JSON, returns a structured JSON report.
   Same-origin only, so no CORS handling. See
   /tools/divi-5-migration-checker/ for the frontend that calls this. */

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
$wordpress = detectWordPressSignals($body, $headers, $generator);

/* ---------------------------------------------------------------------------
 * Divi detection — confirms Divi is actually in use before doing any
 * version analysis. Non-Divi sites (including plain WordPress ones) short-
 * circuit here with a clean, honest response, same pattern as
 * woocommerce-store-checker.php's not_woocommerce short-circuit.
 * ------------------------------------------------------------------------- */

$diviSignatures = [
    'et_pb_' => 'Divi Builder module classes (et_pb_*) appear in the markup.',
    '"et-boc"' => 'The Divi body-output-container class (et-boc) is present.',
    '/wp-content/themes/Divi/' => "The Divi theme's own assets are loaded from /wp-content/themes/Divi/.",
    '/wp-content/plugins/divi-builder/' => 'The standalone Divi Builder plugin is loaded (Divi used on a non-Divi theme).',
    'et_bloom' => "Divi's Bloom plugin is present.",
];
$diviSignalsFound = [];
foreach ($diviSignatures as $needle => $description) {
    if (stripos($body, $needle) !== false) {
        $diviSignalsFound[] = $description;
    }
}
$diviScore = count($diviSignalsFound);
$isDivi = $diviScore > 0;
$diviConfidence = $diviScore >= 2 ? 'high' : ($diviScore === 1 ? 'medium' : 'none');

if (!$isDivi) {
    if ($wordpress['is_wordpress']) {
        $notDiviSummary = "This site is running WordPress, but no Divi signal was found on the homepage — it's likely using a different theme or page builder.";
    } else {
        $notDiviSummary = 'No WordPress or Divi signal was found on the homepage.';
    }

    echo json_encode([
        'status' => 'ok',
        'requested_url' => $inputUrl,
        'final_url' => $finalUrl,
        'checked_at' => gmdate('c'),
        'divi' => ['detected' => false, 'confidence' => 'none', 'signals' => []],
        'verdict' => 'not_divi',
        'summary' => $notDiviSummary,
        'version' => null,
        'divi5_modules' => [],
        'layout' => null,
        'cta_hint' => 'not_divi',
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---------------------------------------------------------------------------
 * Divi-5-exclusive module detection — every one of these module types was
 * introduced in Divi 5 and never existed in Divi 4, so a single match is
 * unambiguous proof of Divi 5. This is a bonus signal, not the primary one:
 * a homepage rarely happens to use Timeline, Charts or Gravity Forms, so
 * finding none of these proves nothing on its own.
 * ------------------------------------------------------------------------- */

$divi5ModuleSignatures = [
    'et_pb_timeline' => 'Timeline module',
    'et_pb_breadcrumbs' => 'Breadcrumbs module',
    'et_pb_svg' => 'SVG module',
    'et_pb_table_of_contents' => 'Table of Contents module',
    'et_pb_instagram_feed' => 'Instagram Feed module',
    'et_pb_tooltip' => 'Tooltip module',
    'et_pb_post_filter' => 'Post Filter module',
    'et_pb_charts' => 'Charts module',
    'et_pb_gravity_form' => 'Gravity Forms module',
    'et_pb_imagely' => 'Imagely Gallery module',
    'et_pb_payment_button' => 'Payment Button module',
];
$divi5ModulesFound = [];
foreach ($divi5ModuleSignatures as $needle => $label) {
    if (stripos($body, $needle) !== false) {
        $divi5ModulesFound[] = $label;
    }
}

/* ---------------------------------------------------------------------------
 * Version detection — WordPress appends the theme/plugin's own version as
 * ?ver=X.Y.Z on its enqueued assets by default. Looks at both the Divi
 * theme's asset path and the standalone Divi Builder plugin's, since either
 * can carry the version. A caching/optimization plugin that strips query
 * strings is the main reason this can come back empty on an otherwise
 * confirmed Divi site — see detectedVersion === null handling below.
 *
 * A homepage can enqueue more than one Divi asset with different ?ver=
 * values (seen live: a bundled CSS file lagging the core JS by a point
 * release). Every match is collected and the highest version wins — the
 * same "any solid evidence of a newer version is conclusive" precedence
 * already used for the Divi-5-only module check below, applied consistently
 * here instead of leaving it to accidental HTML source order.
 * ------------------------------------------------------------------------- */

$detectedVersion = null;
$versionMajor = null;
$versionRank = -1;
if (preg_match_all('#/wp-content/(?:themes/Divi|plugins/divi-builder)/[^"\'\s]*\?ver=(\d+)\.(\d+)(?:\.(\d+))?#i', $body, $allVersionMatches, PREG_SET_ORDER)) {
    foreach ($allVersionMatches as $vm) {
        $major = (int) $vm[1];
        $minor = (int) $vm[2];
        $patch = isset($vm[3]) ? (int) $vm[3] : 0;
        $rank = ($major * 1_000_000) + ($minor * 1_000) + $patch;
        if ($rank > $versionRank) {
            $versionRank = $rank;
            $versionMajor = $major;
            $detectedVersion = $major . '.' . $minor . (isset($vm[3]) ? '.' . $vm[3] : '');
        }
    }
}

/* ---------------------------------------------------------------------------
 * Layout complexity — count of et_pb_module occurrences, Divi's real,
 * confirmed generic per-module wrapper class. A lower-bound proxy for "how
 * big is this build," shown regardless of verdict, same honesty framing as
 * elementor-speed-checker.php and woocommerce-store-checker.php's counts.
 * ------------------------------------------------------------------------- */

$moduleCount = substr_count($body, 'et_pb_module');
if ($moduleCount >= 25) {
    $layoutLabel = 'Large — a lot of modules on this one page alone';
} elseif ($moduleCount >= 8) {
    $layoutLabel = 'Medium — a moderate amount of module content';
} else {
    $layoutLabel = 'Small — a light homepage, by module count';
}

/* ---------------------------------------------------------------------------
 * Verdict — confirmed_divi5 (a Divi-5-only module or a >=5 version string)
 * > confirmed_divi4 (a 4.x version string) > unknown_version (Divi
 * confirmed, but neither signal survived — never guessed either way).
 * ------------------------------------------------------------------------- */

$divi5Confirmed = $divi5ModulesFound !== [] || ($versionMajor !== null && $versionMajor >= 5);

if ($divi5Confirmed) {
    $verdict = 'confirmed_divi5';
    $evidence = $divi5ModulesFound !== []
        ? 'a Divi-5-only module (' . implode(', ', $divi5ModulesFound) . ') was found on the homepage'
        : 'the theme/plugin version string reads ' . $detectedVersion;
    $summary = "This site is confirmed on Divi 5 — {$evidence}.";
    $ctaHint = 'divi5';
} elseif ($versionMajor === 4) {
    $verdict = 'confirmed_divi4';
    $summary = "This site is confirmed still on Divi 4 (version {$detectedVersion} was found in the page source) — a good candidate for a planned move to Divi 5.";
    $ctaHint = 'divi4';
} else {
    $verdict = 'unknown_version';
    $summary = "Divi is confirmed on this site, but neither a version number nor a Divi-5-only module survived on the homepage — often because a caching or optimization plugin strips version query strings. This can't be called Divi 4 or Divi 5 from the outside.";
    if ($main['truncated'] ?? false) {
        $summary .= ' This homepage was also larger than this tool reads in full, which may be part of why neither signal was found.';
    }
    $ctaHint = 'unknown_version';
}

/* ---------------------------------------------------------------------------
 * Assemble response
 * ------------------------------------------------------------------------- */

$response = [
    'status' => 'ok',
    'requested_url' => $inputUrl,
    'final_url' => $finalUrl,
    'checked_at' => gmdate('c'),

    'divi' => [
        'detected' => true,
        'confidence' => $diviConfidence,
        'signals' => $diviSignalsFound,
    ],

    'verdict' => $verdict,
    'summary' => $summary,

    'version' => [
        'string' => $detectedVersion,
        'major' => $versionMajor,
    ],

    'divi5_modules' => $divi5ModulesFound,

    'layout' => [
        'module_count' => $moduleCount,
        'label' => $layoutLabel,
        'truncated' => $main['truncated'] ?? false,
    ],

    'cta_hint' => $ctaHint,
];

echo json_encode($response, JSON_UNESCAPED_SLASHES);
