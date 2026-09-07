<?php
/* Free WooCommerce Store Health Checker — reuses the shared SSRF-safe fetcher
   in inc/safe-fetch.php, confirms WooCommerce is actually in use on the
   homepage (a small, self-contained signature set — see
   elementor-speed-checker.php for why this isn't pulled into the shared
   file), then probes /checkout/ as the primary signal for the most common,
   most expensive WooCommerce failure mode: a checkout that's cached, not on
   HTTPS, or missing a working payment method entirely.

   /cart/ is deliberately never fetched. Cart and checkout share the same
   caching-exclusion requirement (documented in
   blog/woocommerce-site-broken-common-fixes/ and
   wordpress-fixes/woocommerce-checkout-not-working/), so checkout alone is
   an honest, sufficient proxy for both — a second request would add latency
   and outbound load without changing the verdict this tool can give.

   Checkout is treated as a soft-fail, not a hard-fail: if it can't be
   reached or confirmed, every checkout-dependent metric is reported as
   "unknown", never as "healthy" or folded into a false "clean" verdict. A
   store this tool can't verify is reported as inconclusive, not clean — see
   the verdict priority below.

   A product/shop-page fetch is opportunistic on top of that: only attempted
   if the homepage + checkout fetches together left meaningful budget in the
   request. If it's skipped or fails, the page-weight comparison is reported
   as not_applicable and never affects the verdict — it exists purely as
   extra context when it's cheap to get.

   Receives {"url": "..."} as JSON, returns a structured JSON report.
   Same-origin only, so no CORS handling. See
   /tools/woocommerce-store-checker/ for the frontend that calls this. */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
set_time_limit(45);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

register_shutdown_function(static function (): void {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['status' => 'error', 'message' => 'Something went wrong while checking this store. Please try again.']);
    }
});

require __DIR__ . '/inc/safe-fetch.php';

$scriptStart = microtime(true);

$inputUrl = readRequestedUrl();

/* ---------------------------------------------------------------------------
 * Homepage fetch — mandatory. Everything else in this report depends on it,
 * so a failure here is a hard fail, same as every other tool on this site.
 * ------------------------------------------------------------------------- */

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
 * WooCommerce detection — confirms WooCommerce is actually in use before
 * doing any store-specific analysis. Non-WooCommerce sites (including
 * plain WordPress ones) short-circuit here with a clean, honest response.
 * ------------------------------------------------------------------------- */

$woocommerceSignatures = [
    '/wp-content/plugins/woocommerce/' => 'WooCommerce plugin assets are loaded from /wp-content/plugins/woocommerce/.',
    'woocommerce-page' => 'A woocommerce-page body class is present in the markup.',
    'wc-ajax' => "A wc-ajax reference (WooCommerce's own AJAX endpoint) appears in the page source.",
    'wc_add_to_cart_params' => "WooCommerce's add-to-cart JavaScript configuration is loaded.",
    'add_to_cart_button' => 'An add-to-cart button class is present in the markup.',
];
$woocommerceSignalsFound = [];
foreach ($woocommerceSignatures as $needle => $description) {
    if (stripos($body, $needle) !== false) {
        $woocommerceSignalsFound[] = $description;
    }
}
$woocommerceScore = count($woocommerceSignalsFound);
$isWooCommerce = $woocommerceScore > 0;
$woocommerceConfidence = $woocommerceScore >= 2 ? 'high' : ($woocommerceScore === 1 ? 'medium' : 'none');

if (!$isWooCommerce) {
    if ($wordpress['is_wordpress']) {
        $notWooSummary = 'This site is running WordPress, but no WooCommerce signal was found on the homepage — it may not sell anything online, or it uses a different ecommerce platform.';
    } else {
        $notWooSummary = 'No WordPress or WooCommerce signal was found on the homepage.';
    }

    echo json_encode([
        'status' => 'ok',
        'requested_url' => $inputUrl,
        'final_url' => $finalUrl,
        'checked_at' => gmdate('c'),
        'woocommerce' => ['detected' => false, 'confidence' => 'none', 'signals' => []],
        'verdict' => 'not_woocommerce',
        'summary' => $notWooSummary,
        'signals' => [],
        'checkout' => null,
        'metrics' => null,
        'cta_hint' => 'not_woocommerce',
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---------------------------------------------------------------------------
 * Checkout probe — the primary, soft-fail signal for both cart and checkout.
 * A response is only trusted as an actual checkout page if it contains real
 * WooCommerce checkout markup; a soft-404 or a redirect to the homepage that
 * still returns HTTP 200 is common enough on WordPress that skipping this
 * check would silently turn "checkout couldn't be found" into a false
 * "no payment gateway detected" signal.
 * ------------------------------------------------------------------------- */

function looksLikeCheckoutPage(string $body): bool
{
    $markers = ['woocommerce-checkout', 'wc_checkout_params', 'order_review', 'checkout-review-order', 'name="payment_method"', 'wc-checkout', 'id="place_order"'];
    foreach ($markers as $marker) {
        if (stripos($body, $marker) !== false) {
            return true;
        }
    }
    return false;
}

/**
 * Evidence that a page is being served from a cache — a header-level signal
 * (Cache-Control, Age, a CDN/cache-plugin HIT header) or a cache plugin's own
 * "this page was cached" comment left in the HTML. Cart and checkout must
 * never show any of this; every store's own docs say so, and it's the most
 * common silent cause of a lost order documented in
 * blog/woocommerce-site-broken-common-fixes/.
 */
function detectCheckoutCaching(array $headers, string $body): array
{
    $evidence = [];

    $cacheControl = strtolower($headers['cache-control'] ?? '');
    if ($cacheControl !== '' && !str_contains($cacheControl, 'no-store') && !str_contains($cacheControl, 'no-cache') && !str_contains($cacheControl, 'private')) {
        if (preg_match('/max-age=(\d+)/', $cacheControl, $m) && (int) $m[1] > 0) {
            $evidence[] = 'Cache-Control allows caching for ' . $m[1] . ' seconds (' . $cacheControl . ').';
        } elseif (str_contains($cacheControl, 'public')) {
            $evidence[] = 'Cache-Control is set to public (' . $cacheControl . ').';
        }
    }

    if (isset($headers['age']) && ctype_digit((string) $headers['age']) && (int) $headers['age'] > 0) {
        $evidence[] = 'An Age header (' . $headers['age'] . ') shows this response came from a cache, not a fresh page load.';
    }

    foreach (['x-cache', 'cf-cache-status', 'x-litespeed-cache', 'x-proxy-cache', 'x-nginx-cache', 'x-cache-status'] as $cacheHeader) {
        if (isset($headers[$cacheHeader]) && stripos($headers[$cacheHeader], 'hit') !== false) {
            $evidence[] = 'The ' . $cacheHeader . ' response header reports a cache HIT (' . $headers[$cacheHeader] . ').';
        }
    }

    $cachePluginSignatures = [
        'Performance optimized by W3 Total Cache' => 'W3 Total Cache',
        'Served from cache by WP Super Cache' => 'WP Super Cache',
        'Cached by LiteSpeed Cache' => 'LiteSpeed Cache',
        'Page cached by WP Rocket' => 'WP Rocket',
        'served by WP Fastest Cache' => 'WP Fastest Cache',
    ];
    foreach ($cachePluginSignatures as $needle => $label) {
        if (stripos($body, $needle) !== false) {
            $evidence[] = 'A cache signature from ' . $label . ' was found directly in the checkout page HTML.';
        }
    }

    return $evidence;
}

/** Known payment gateway scripts/handles visible in a checkout page's own HTML. */
function detectPaymentGateways(string $body): array
{
    $gatewaySignatures = [
        'Stripe' => ['wc-stripe', 'stripe.com/v3', 'wc_stripe_params'],
        'PayPal' => ['paypal.com/sdk', 'ppc-button', 'wc-ppcp', 'woocommerce-gateway-paypal'],
        'Square' => ['woocommerce-square', 'squareup.com'],
        'Braintree' => ['braintree'],
        'Authorize.Net' => ['authorize.net', 'authnet'],
        'Razorpay' => ['razorpay'],
        'Mollie' => ['mollie'],
        'SSLCommerz' => ['sslcommerz'],
        'Klarna' => ['klarna'],
    ];
    $found = [];
    foreach ($gatewaySignatures as $name => $needles) {
        foreach ($needles as $needle) {
            if (stripos($body, $needle) !== false) {
                $found[] = $name;
                break;
            }
        }
    }
    return array_values(array_unique($found));
}

$checkoutUrl = $finalTarget['origin'] . '/checkout/';
$checkoutFetch = safeFetchWithRedirects($checkoutUrl, MAX_BODY_BYTES);

$checkoutChecked = false;
$checkoutUnavailableReason = null;
$checkoutHttpsEnabled = null;
$checkoutCached = null;
$cacheEvidence = [];
$gatewayDetected = null;
$gatewaysFound = [];
$checkoutHtmlWeightKb = null;
$checkoutBody = null;

if (isset($checkoutFetch['error'])) {
    $checkoutUnavailableReason = friendlyError($checkoutFetch['error']);
} elseif ($checkoutFetch['status'] < 200 || $checkoutFetch['status'] >= 400) {
    $checkoutUnavailableReason = 'The checkout page returned HTTP ' . $checkoutFetch['status'] . '.';
} elseif (!looksLikeCheckoutPage($checkoutFetch['body'])) {
    $checkoutUnavailableReason = "The response at /checkout/ didn't look like an actual WooCommerce checkout page, so it can't be verified — this store may use a different checkout URL.";
} else {
    $checkoutChecked = true;
    $checkoutBody = $checkoutFetch['body'];
    $checkoutHeaders = $checkoutFetch['headers'];
    $checkoutFinalTarget = $checkoutFetch['final_target'];

    $checkoutHttpsEnabled = $checkoutFinalTarget['scheme'] === 'https';
    $cacheEvidence = detectCheckoutCaching($checkoutHeaders, $checkoutBody);
    $checkoutCached = $cacheEvidence !== [];
    $gatewaysFound = detectPaymentGateways($checkoutBody);
    $genericPaymentMethodPresent = (bool) preg_match('/name=["\']payment_method["\']/i', $checkoutBody) || str_contains($checkoutBody, 'woocommerce-checkout-payment');
    $gatewayDetected = $gatewaysFound !== [] || $genericPaymentMethodPresent;
    $checkoutHtmlWeightKb = (int) round(strlen($checkoutBody) / 1024);
}

/* ---------------------------------------------------------------------------
 * Plugin-count bloat signal — a lower-bound proxy from what actually shows
 * up in the public markup already fetched (homepage plus checkout, if
 * reachable), not a real plugin-list read. Honest about that limitation in
 * its own copy, same as elementor-speed-checker.php is about page weight.
 * ------------------------------------------------------------------------- */

function extractPluginSlugs(string $body): array
{
    $slugs = [];
    if (preg_match_all('#/wp-content/plugins/([A-Za-z0-9_-]+)/#', $body, $m)) {
        foreach ($m[1] as $slug) {
            $slugs[strtolower($slug)] = true;
        }
    }
    return array_keys($slugs);
}

$pluginSlugs = extractPluginSlugs($body);
if ($checkoutBody !== null) {
    $pluginSlugs = array_values(array_unique(array_merge($pluginSlugs, extractPluginSlugs($checkoutBody))));
}
$pluginCount = count($pluginSlugs);
$htmlWeightKb = (int) round(strlen($body) / 1024);

/* ---------------------------------------------------------------------------
 * Optional shop-page fetch — opportunistic only, gated by how much of the
 * request's own time budget the homepage + checkout fetches already used.
 * A missed or failed fetch here only ever produces "not_applicable"; it
 * never becomes a signal on its own and never touches the verdict.
 * ------------------------------------------------------------------------- */

$shopFetchAttempted = false;
$shopHtmlWeightKb = null;

if ((microtime(true) - $scriptStart) < 8.0) {
    $shopFetchAttempted = true;
    $shop = safeFetchWithRedirects($finalTarget['origin'] . '/shop/', MAX_BODY_BYTES);
    if (!isset($shop['error']) && $shop['status'] >= 200 && $shop['status'] < 400) {
        $shopHtmlWeightKb = (int) round(strlen($shop['body']) / 1024);
    }
}

if ($shopHtmlWeightKb !== null && $checkoutHtmlWeightKb !== null) {
    $weightDiff = $checkoutHtmlWeightKb - $shopHtmlWeightKb;
    $pageWeightComparison = [
        'available' => true,
        'shop_html_weight_kb' => $shopHtmlWeightKb,
        'checkout_html_weight_kb' => $checkoutHtmlWeightKb,
        'note' => $weightDiff > 50
            ? "Checkout's HTML is " . $weightDiff . ' KB heavier than the shop page — worth checking for scripts that don\'t need to load at checkout.'
            : 'No notable difference between the shop and checkout page weight.',
    ];
} else {
    $pageWeightComparison = [
        'available' => false,
        'reason' => !$shopFetchAttempted ? 'skipped_time_budget' : ($checkoutHtmlWeightKb === null ? 'checkout_not_verified' : 'shop_page_unreachable'),
    ];
}

/* ---------------------------------------------------------------------------
 * Cause-first signals, ranked. Mirrors elementor-speed-checker.php: 'strong'
 * alone is enough to name a likely cause, 'weak' is worth a look but not a
 * verdict on its own.
 * ------------------------------------------------------------------------- */

$signals = [];

if ($checkoutChecked) {
    if (!$checkoutHttpsEnabled) {
        $signals[] = [
            'severity' => 'strong',
            'label' => 'Checkout is not served over HTTPS',
            'detail' => "Most payment gateways refuse to process a transaction over a connection they can't verify as secure, and browsers actively warn shoppers away from an insecure checkout page.",
        ];
    }
    if ($checkoutCached) {
        $signals[] = [
            'severity' => 'strong',
            'label' => 'The checkout page appears to be cached',
            'detail' => 'Cart and checkout must never be served from a page cache — a cached checkout can show a stale total or a stale session to every visitor who lands on it. Evidence: ' . implode(' ', $cacheEvidence),
        ];
    }
    if (!$gatewayDetected) {
        $signals[] = [
            'severity' => 'strong',
            'label' => 'No payment method or gateway was detected on checkout',
            'detail' => 'Nothing that looks like a payment gateway script or a payment method option was found on the checkout page. If every payment method is disabled or misconfigured, no order can complete.',
        ];
    }
}

if ($pluginCount >= 20) {
    $signals[] = [
        'severity' => 'strong',
        'label' => $pluginCount . ' plugins detected loading public-facing assets',
        'detail' => 'This is a lower-bound count from what actually loads on the pages checked, so the real number is likely higher. A store this size is worth a proper plugin audit — every extra plugin is another thing that can conflict at checkout or slow the store down.',
    ];
} elseif ($pluginCount >= 12) {
    $signals[] = [
        'severity' => 'weak',
        'label' => $pluginCount . ' plugins detected loading public-facing assets',
        'detail' => 'Not extreme, but worth keeping an eye on as the store grows — each one is a small piece of surface area for a future conflict.',
    ];
}

if ($pageWeightComparison['available'] && ($pageWeightComparison['checkout_html_weight_kb'] - $pageWeightComparison['shop_html_weight_kb']) > 50) {
    $signals[] = [
        'severity' => 'weak',
        'label' => 'Checkout page is heavier than the shop page',
        'detail' => $pageWeightComparison['note'],
    ];
}

/* ---------------------------------------------------------------------------
 * Verdict — priority order, cause-first: not_woocommerce (handled above) >
 * checkout_risk > inconclusive > store_issues > watch > clean. Checkout
 * being unverifiable always outranks a store-wide issue found elsewhere —
 * this tool never calls a store "clean" or lets a plugin-count signal alone
 * outrank not being able to confirm checkout is actually safe to use.
 * ------------------------------------------------------------------------- */

$hasCheckoutRisk = $checkoutChecked && (!$checkoutHttpsEnabled || $checkoutCached || !$gatewayDetected);

if ($hasCheckoutRisk) {
    $reasons = [];
    if (!$checkoutHttpsEnabled) $reasons[] = 'checkout is not served over HTTPS';
    if ($checkoutCached) $reasons[] = 'the checkout page appears to be cached';
    if (!$gatewayDetected) $reasons[] = 'no payment method was detected on checkout';

    $verdict = 'checkout_risk';
    $summary = 'Checkout has a real risk: ' . implode('; ', $reasons) . '.';
    $ctaHint = 'checkout_risk';
} elseif (!$checkoutChecked) {
    $verdict = 'inconclusive';
    $summary = 'Checkout could not be verified. ' . $checkoutUnavailableReason . " That can't be called clean — the most important checks on a WooCommerce store are the ones on checkout itself.";
    $ctaHint = 'inconclusive';
} else {
    $strongOther = count(array_filter($signals, static fn ($s) => $s['severity'] === 'strong')) > 0;
    $weakOther = count(array_filter($signals, static fn ($s) => $s['severity'] === 'weak')) > 0;

    if ($strongOther) {
        $verdict = 'store_issues';
        $summary = 'Checkout looks fine, but a store-wide issue was found — see the details below.';
        $ctaHint = 'store_issues';
    } elseif ($weakOther) {
        $verdict = 'watch';
        $summary = 'Checkout looks fine and nothing major turned up — a couple of smaller things below are worth keeping an eye on.';
        $ctaHint = 'watch';
    } else {
        $verdict = 'clean';
        $summary = 'Checkout is reachable, served over HTTPS, not cached, and a payment method was detected. No obvious store-wide issues found either.';
        $ctaHint = 'clean';
    }
}

/* ---------------------------------------------------------------------------
 * Assemble response
 * ------------------------------------------------------------------------- */

$response = [
    'status' => 'ok',
    'requested_url' => $inputUrl,
    'final_url' => $finalUrl,
    'checked_at' => gmdate('c'),

    'woocommerce' => [
        'detected' => true,
        'confidence' => $woocommerceConfidence,
        'signals' => $woocommerceSignalsFound,
    ],

    'verdict' => $verdict,
    'summary' => $summary,
    'signals' => $signals,

    'checkout' => [
        'checked_url' => $checkoutUrl,
        'verified' => $checkoutChecked,
        'unavailable_reason' => $checkoutChecked ? null : $checkoutUnavailableReason,
        'https' => [
            'enabled' => $checkoutHttpsEnabled,
            'status' => !$checkoutChecked ? 'unknown' : ($checkoutHttpsEnabled ? 'good' : 'warn'),
        ],
        'caching' => [
            'cached' => $checkoutCached,
            'status' => !$checkoutChecked ? 'unknown' : ($checkoutCached ? 'warn' : 'good'),
            'evidence' => $cacheEvidence,
        ],
        'payment_gateway' => [
            'detected' => $gatewayDetected,
            'status' => !$checkoutChecked ? 'unknown' : ($gatewayDetected ? 'good' : 'warn'),
            'gateways_found' => $gatewaysFound,
        ],
        'html_weight_kb' => $checkoutHtmlWeightKb,
    ],

    'metrics' => [
        'plugin_count' => $pluginCount,
        'plugin_count_status' => $pluginCount >= 12 ? 'warn' : 'good',
        'homepage_html_weight_kb' => $htmlWeightKb,
        'response_time_ms' => $responseTimeMs,
        'page_weight_comparison' => $pageWeightComparison,
        'truncated' => $main['truncated'] ?? false,
    ],

    'cta_hint' => $ctaHint,
];

echo json_encode($response, JSON_UNESCAPED_SLASHES);
