<?php
/* Free Website Health Checker — SEO/security/WordPress/crawlability report
   built on the shared SSRF-safe fetcher in inc/safe-fetch.php. Receives
   {"url": "..."} as JSON, returns a structured JSON report. Same-origin
   only, so no CORS handling. See /tools/wordpress-website-health-checker/
   for the frontend that calls this. */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
set_time_limit(25);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

/* Catches fatals/uncaught errors that would otherwise leak a raw PHP error
   page (with server paths) instead of JSON. Only fires if we haven't already
   sent a real JSON response. */
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

/* ---------------------------------------------------------------------------
 * Run the main fetch
 * ------------------------------------------------------------------------- */

$main = safeFetchWithRedirects($inputUrl, MAX_BODY_BYTES);
if (isset($main['error'])) {
    fail(friendlyError($main['error']));
}

$finalTarget = $main['final_target'];
$finalUrl = $finalTarget['origin'] . $finalTarget['path'];
$body = $main['body'];
$headers = $main['headers'];

/* ---------------------------------------------------------------------------
 * HTML parsing (best-effort — the body may be truncated at the cap). The
 * parseHtml/metaContent/linkHref helpers live in inc/safe-fetch.php now.
 * ------------------------------------------------------------------------- */

$doc = parseHtml($body);
$xpath = new DOMXPath($doc);

$titleNode = $xpath->query('//title');
$pageTitle = ($titleNode !== false && $titleNode->length > 0) ? trim($titleNode->item(0)->textContent) : null;

$metaDescription = metaContent($doc, 'name', 'description');
$canonicalUrl = linkHref($doc, 'canonical');
$robotsMeta = metaContent($doc, 'name', 'robots');
$viewportMeta = metaContent($doc, 'name', 'viewport');
$ogTitle = metaContent($doc, 'property', 'og:title');
$ogImage = metaContent($doc, 'property', 'og:image');
$generator = metaContent($doc, 'name', 'generator');

/* ---------------------------------------------------------------------------
 * WordPress detection — shared with theme-detector.php via inc/safe-fetch.php
 * ------------------------------------------------------------------------- */

$wordpress = detectWordPressSignals($body, $headers, $generator);

/* ---------------------------------------------------------------------------
 * Security headers (informational — never framed as a "vulnerability")
 * ------------------------------------------------------------------------- */

function headerCheck(array $headers, string $name): array
{
    $value = $headers[$name] ?? null;
    return [
        'present' => $value !== null,
        'value' => $value,
        'status' => $value !== null ? 'good' : 'warn',
    ];
}

$security = [
    'https' => [
        'present' => $finalTarget['scheme'] === 'https',
        'status' => $finalTarget['scheme'] === 'https' ? 'good' : 'warn',
    ],
    'strict_transport_security' => headerCheck($headers, 'strict-transport-security'),
    'x_content_type_options' => headerCheck($headers, 'x-content-type-options'),
    'content_security_policy' => headerCheck($headers, 'content-security-policy'),
    'referrer_policy' => headerCheck($headers, 'referrer-policy'),
];

/* ---------------------------------------------------------------------------
 * Crawlability — robots.txt, sitemap.xml, wp-sitemap.xml
 * ------------------------------------------------------------------------- */

function fetchAux(string $origin, string $path): array
{
    $result = safeFetchWithRedirects($origin . $path, MAX_AUX_BODY_BYTES);
    if (isset($result['error'])) {
        return ['found' => false, 'status' => 'not_found'];
    }
    if ($result['status'] !== 200) {
        return ['found' => false, 'status' => 'not_found'];
    }
    return ['found' => true, 'status' => 'good', 'body' => $result['body']];
}

$robots = fetchAux($finalTarget['origin'], '/robots.txt');
$sitemap = fetchAux($finalTarget['origin'], '/sitemap.xml');
$wpSitemap = fetchAux($finalTarget['origin'], '/wp-sitemap.xml');

$robotsMentionsSitemap = ($robots['found'] && isset($robots['body']) && stripos($robots['body'], 'sitemap:') !== false);

/* ---------------------------------------------------------------------------
 * Page basics
 * ------------------------------------------------------------------------- */

$imgNodes = $xpath->query('//img');
$imageCount = $imgNodes !== false ? $imgNodes->length : 0;
$missingAlt = 0;
if ($imgNodes !== false) {
    foreach ($imgNodes as $img) {
        /** @var DOMElement $img */
        if (!$img->hasAttribute('alt') || trim($img->getAttribute('alt')) === '') {
            $missingAlt++;
        }
    }
}

$h1Count = ($xpath->query('//h1') ?: new DOMNodeList())->length;
$h2Count = ($xpath->query('//h2') ?: new DOMNodeList())->length;

/* ---------------------------------------------------------------------------
 * Assemble response
 * ------------------------------------------------------------------------- */

function statusFor(?string $value, bool $expectPresent = true): string
{
    if ($value === null || $value === '') {
        return $expectPresent ? 'not_found' : 'good';
    }
    return 'good';
}

$response = [
    'status' => 'ok',
    'requested_url' => $inputUrl,
    'checked_at' => gmdate('c'),

    'website_status' => [
        'http_status' => $main['status'],
        'http_status_status' => ($main['status'] >= 200 && $main['status'] < 400) ? 'good' : 'warn',
        'https_enabled' => $finalTarget['scheme'] === 'https',
        'https_status' => $finalTarget['scheme'] === 'https' ? 'good' : 'warn',
        'final_url' => $finalUrl,
        'redirected' => $main['redirect_count'] > 0,
        'redirect_count' => $main['redirect_count'],
        'response_time_ms' => $main['time_ms'],
        'response_time_status' => $main['time_ms'] < 1500 ? 'good' : 'warn',
        'response_time_note' => 'Basic server response time for a single request from our server — not a substitute for Google PageSpeed / Core Web Vitals.',
    ],

    'seo_basics' => [
        'title' => $pageTitle,
        'title_status' => statusFor($pageTitle),
        'meta_description' => $metaDescription,
        'meta_description_status' => statusFor($metaDescription),
        'canonical_url' => $canonicalUrl,
        'canonical_status' => statusFor($canonicalUrl),
        'robots_meta' => $robotsMeta,
        'robots_meta_status' => $robotsMeta === null ? 'good' : (stripos($robotsMeta, 'noindex') !== false ? 'warn' : 'good'),
        'viewport_meta' => $viewportMeta,
        'viewport_status' => statusFor($viewportMeta),
        'og_title' => $ogTitle,
        'og_title_status' => statusFor($ogTitle, false),
        'og_image' => $ogImage,
        'og_image_status' => statusFor($ogImage, false),
    ],

    'wordpress_detection' => [
        'verdict' => $wordpress['verdict'],
        'status' => $wordpress['status'],
        'signals' => $wordpress['signals'],
    ],

    'security_basics' => $security,

    'crawlability' => [
        'robots_txt' => ['found' => $robots['found'], 'status' => $robots['status'], 'url' => $finalTarget['origin'] . '/robots.txt', 'references_sitemap' => $robotsMentionsSitemap],
        'sitemap_xml' => ['found' => $sitemap['found'], 'status' => $sitemap['status'], 'url' => $finalTarget['origin'] . '/sitemap.xml'],
        'wp_sitemap_xml' => ['found' => $wpSitemap['found'], 'status' => $wpSitemap['found'] ? 'good' : 'not_found', 'url' => $finalTarget['origin'] . '/wp-sitemap.xml', 'applicable' => $wordpress['is_wordpress']],
    ],

    'page_basics' => [
        'html_size_bytes' => strlen($body),
        'truncated' => $main['truncated'] ?? false,
        'image_count' => $imageCount,
        'images_missing_alt' => $missingAlt,
        'images_missing_alt_status' => $missingAlt === 0 ? 'good' : 'warn',
        'h1_count' => $h1Count,
        'h1_status' => $h1Count === 1 ? 'good' : 'warn',
        'h2_count' => $h2Count,
        'canonical_present' => $canonicalUrl !== null,
        'canonical_present_status' => $canonicalUrl !== null ? 'good' : 'warn',
    ],
];

echo json_encode($response, JSON_UNESCAPED_SLASHES);
