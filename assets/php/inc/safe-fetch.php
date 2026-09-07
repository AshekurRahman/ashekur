<?php
/* Shared SSRF-safe outbound fetcher + basic HTML parsing helpers, used by
   every free tool under /tools/ that needs to read a visitor-submitted URL
   server-side (website-health-checker.php, theme-detector.php, and any
   future scanner-type tool from FREE-TOOLS-SEO-ROADMAP.md).

   This file was extracted unchanged from website-health-checker.php — same
   constants, same functions, same behaviour — so the already-live health
   checker keeps working exactly as before. Nothing here is tool-specific;
   a tool's own endpoint file still owns its own request parsing, its own
   analysis of the fetched body, and its own JSON response shape. */

declare(strict_types=1);

const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT = 4;
const REQUEST_TIMEOUT = 8;
const MAX_BODY_BYTES = 2 * 1024 * 1024;      // 2 MB cap on the main page
const MAX_AUX_BODY_BYTES = 1 * 1024 * 1024;  // 1 MB cap on robots.txt/sitemaps
const OVERALL_BUDGET_SECONDS = 20;
const USER_AGENT = 'AshekurFreeTools/1.0 (+https://ashekur.com/tools/)';

/** IPv4/IPv6 CIDR blocks that must never be connected to. */
const BLOCKED_CIDRS = [
    // IPv4 — private, loopback, link-local, CGNAT, docs/test, multicast, reserved
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
    '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16',
    '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
    '255.255.255.255/32',
    // IPv6 — loopback, unspecified, unique-local, link-local, multicast, docs, NAT64
    '::1/128', '::/128', 'fc00::/7', 'fe80::/10', 'ff00::/8', '2001:db8::/32', '64:ff9b::/96',
];

const BLOCKED_HOSTNAMES = [
    'localhost', 'localhost.localdomain', 'metadata.google.internal', 'metadata.azure.com',
];

function fail(string $message, int $httpCode = 200): never
{
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'error', 'message' => $message]);
    exit;
}

/**
 * Reads {"url": "..."} from the JSON POST body, validates and normalises it
 * (defaults a bare "example.com" to https://, same as a browser address bar
 * would), and calls fail() directly on any invalid input. Every tool's
 * endpoint that takes a single URL field should start with this.
 */
function readRequestedUrl(): string
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail('Method not allowed', 405);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        fail('Invalid request body.', 400);
    }

    $inputUrl = trim((string) ($data['url'] ?? ''));
    if ($inputUrl === '') {
        fail('Please enter a website address.');
    }
    if (mb_strlen($inputUrl) > 2048) {
        fail('That address is too long to check.');
    }
    if (!preg_match('#^[a-zA-Z][a-zA-Z0-9+.\-]*://#', $inputUrl)) {
        $inputUrl = 'https://' . $inputUrl;
    }

    return $inputUrl;
}

function ipInCidr(string $ip, string $cidr): bool
{
    [$subnet, $maskLen] = explode('/', $cidr);
    $maskLen = (int) $maskLen;

    $ipBin = @inet_pton($ip);
    $subnetBin = @inet_pton($subnet);
    if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) {
        return false;
    }

    $bytes = intdiv($maskLen, 8);
    $bits = $maskLen % 8;

    if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($subnetBin, 0, $bytes)) {
        return false;
    }
    if ($bits === 0) {
        return true;
    }
    $mask = chr((0xFF << (8 - $bits)) & 0xFF);
    return (substr($ipBin, $bytes, 1) & $mask) === (substr($subnetBin, $bytes, 1) & $mask);
}

/** True only for a genuinely public, routable IP address. */
function isPublicIp(string $ip): bool
{
    if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
        return false;
    }

    // Unwrap an IPv4-mapped IPv6 address (::ffff:0:0/96) and check the
    // embedded IPv4 address too — the outer form alone can slip past checks.
    // Decode to raw bytes rather than string-matching "::ffff:" so this also
    // catches expanded (0:0:0:0:0:ffff:127.0.0.1) and compressed-hex
    // (::ffff:7f00:1) notations of the same address, not just the
    // dotted-decimal form.
    $ipBin = @inet_pton($ip);
    if ($ipBin !== false && strlen($ipBin) === 16 && substr($ipBin, 0, 10) === str_repeat("\x00", 10) && substr($ipBin, 10, 2) === "\xff\xff") {
        $embeddedIp = inet_ntop(substr($ipBin, 12, 4));
        if ($embeddedIp !== false && !isPublicIp($embeddedIp)) {
            return false;
        }
    }

    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        return false;
    }

    foreach (BLOCKED_CIDRS as $cidr) {
        if (str_contains($cidr, ':') === str_contains($ip, ':') && ipInCidr($ip, $cidr)) {
            return false;
        }
    }

    // AWS/GCP/Azure/DigitalOcean instance-metadata endpoint — always block outright.
    if ($ip === '169.254.169.254' || $ip === 'fd00:ec2::254') {
        return false;
    }

    return true;
}

/**
 * Resolves a hostname to every A/AAAA record, rejecting the whole host if
 * any record resolves to a non-public address (defends against a domain
 * that intentionally mixes a public and an internal answer).
 *
 * Returns ['ip' => string] on success, or ['error' => 'dns_failed'|'blocked']
 * so callers can tell "this domain doesn't resolve" apart from "this domain
 * resolves to a private/internal address" — those need very different
 * messages for a legitimate user who just mistyped something.
 */
function resolvePublicIp(string $host): array
{
    if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
        return isPublicIp($host) ? ['ip' => $host] : ['error' => 'blocked'];
    }

    $records = @dns_get_record($host, DNS_A + DNS_AAAA);
    if ($records === false || $records === []) {
        return ['error' => 'dns_failed'];
    }

    $ips = [];
    foreach ($records as $r) {
        $ip = $r['type'] === 'AAAA' ? ($r['ipv6'] ?? null) : ($r['ip'] ?? null);
        if ($ip !== null) {
            $ips[] = $ip;
        }
    }
    if ($ips === []) {
        return ['error' => 'dns_failed'];
    }
    foreach ($ips as $ip) {
        if (!isPublicIp($ip)) {
            return ['error' => 'blocked']; // any private/reserved answer disqualifies the whole host
        }
    }
    return ['ip' => $ips[0]];
}

/**
 * Validates a candidate URL for SSRF safety. Returns the resolved target
 * array on success, or ['error' => 'blocked'|'dns_failed'] on rejection —
 * the error code lets callers give a legitimate typo a different message
 * than an actual SSRF attempt.
 */
function validateTarget(string $url): array
{
    $parts = parse_url($url);
    if ($parts === false || empty($parts['scheme']) || empty($parts['host'])) {
        return ['error' => 'blocked'];
    }

    $scheme = strtolower($parts['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) {
        return ['error' => 'blocked'];
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        return ['error' => 'blocked']; // no embedded credentials
    }

    // parse_url() keeps the brackets on an IPv6 literal host ("[::1]") rather
    // than stripping them, so the IP-literal fast path below would never
    // match without this — it would fall through to DNS resolution instead,
    // which fails closed (safe) but wrongly rejects a real public IPv6 host too.
    $host = strtolower(trim($parts['host'], '[]'));

    // A non-ASCII hostname (e.g. "例え.jp") can't be DNS-resolved as-is; DNS
    // only ever sees the punycode form. Without this, every IDN domain would
    // wrongly report as "could not resolve" rather than actually being checked.
    if (function_exists('idn_to_ascii') && preg_match('/[^\x00-\x7F]/', $host)) {
        $ascii = idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);
        if ($ascii !== false) {
            $host = $ascii;
        }
    }

    if (in_array($host, BLOCKED_HOSTNAMES, true) || str_ends_with($host, '.localhost')) {
        return ['error' => 'blocked'];
    }

    $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);
    if (!in_array($port, [80, 443], true)) {
        return ['error' => 'blocked']; // no arbitrary-port scanning of otherwise-public hosts
    }

    $resolved = resolvePublicIp($host);
    if (isset($resolved['error'])) {
        return $resolved;
    }

    $pathAndQuery = ($parts['path'] ?? '/') . (isset($parts['query']) ? '?' . $parts['query'] : '');
    if ($pathAndQuery === '') {
        $pathAndQuery = '/';
    }

    return [
        'scheme' => $scheme,
        'host' => $host,
        'port' => $port,
        'path' => $pathAndQuery,
        'ip' => $resolved['ip'],
        'origin' => $scheme . '://' . $host . ($port === ($scheme === 'https' ? 443 : 80) ? '' : ':' . $port),
    ];
}

/**
 * One SSRF-safe HTTP GET, pinned to a pre-validated IP via CURLOPT_RESOLVE so
 * curl's own DNS lookup (a DNS-rebinding window) is never used. Does not
 * follow redirects itself — callers that need to follow one do so by
 * re-validating the target and calling this again.
 */
function safeFetchOnce(array $target, int $maxBodyBytes, float $deadline): array
{
    $ch = curl_init();
    $url = $target['scheme'] . '://' . $target['host'] . ($target['port'] === ($target['scheme'] === 'https' ? 443 : 80) ? '' : ':' . $target['port']) . $target['path'];

    $remaining = $deadline - microtime(true);
    if ($remaining <= 0.5) {
        return ['error' => 'timeout'];
    }

    $bodyBuf = '';
    $truncated = false;
    $headerLines = [];

    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RESOLVE => [$target['host'] . ':' . $target['port'] . ':' . $target['ip']],
        CURLOPT_HTTPGET => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS => 0,
        CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT => (int) min(REQUEST_TIMEOUT, max(1, $remaining)),
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => USER_AGENT,
        CURLOPT_ENCODING => '', // accept gzip/deflate, decode automatically
        CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml,*/*;q=0.8'],
        CURLOPT_HEADERFUNCTION => static function ($ch, $line) use (&$headerLines): int {
            $headerLines[] = $line;
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => static function ($ch, $chunk) use (&$bodyBuf, &$truncated, $maxBodyBytes): int {
            $len = strlen($chunk);
            if (!$truncated) {
                $room = $maxBodyBytes - strlen($bodyBuf);
                if ($room <= 0) {
                    $truncated = true;
                    return 0; // aborts the transfer
                }
                $bodyBuf .= substr($chunk, 0, $room);
                if (strlen($chunk) > $room) {
                    $truncated = true;
                }
            }
            return $len;
        },
    ]);

    $ok = curl_exec($ch);
    $errno = curl_errno($ch);
    $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $totalTime = (float) curl_getinfo($ch, CURLINFO_TOTAL_TIME);
    curl_close($ch);

    // errno 23/CURLE_WRITE_ERROR is expected when we deliberately abort for size.
    if ($ok === false && $errno !== 23) {
        return ['error' => curlErrorCategory($errno)];
    }

    $headers = [];
    foreach ($headerLines as $line) {
        $line = trim($line);
        if ($line === '' || !str_contains($line, ':')) {
            continue;
        }
        [$name, $value] = explode(':', $line, 2);
        $headers[strtolower(trim($name))] = trim($value);
    }

    return [
        'status' => $httpStatus,
        'headers' => $headers,
        'body' => $bodyBuf,
        'truncated' => $truncated,
        'time_ms' => (int) round($totalTime * 1000),
        'final_target' => $target,
    ];
}

function curlErrorCategory(int $errno): string
{
    return match ($errno) {
        CURLE_OPERATION_TIMEDOUT => 'timeout',
        CURLE_COULDNT_CONNECT => 'connection_failed',
        CURLE_COULDNT_RESOLVE_HOST => 'dns_failed',
        CURLE_SSL_CONNECT_ERROR, CURLE_SSL_CERTPROBLEM, CURLE_SSL_CACERT => 'ssl_error',
        default => 'fetch_failed',
    };
}

/**
 * Fetches a URL, safely following up to MAX_REDIRECTS same-scheme-or-not
 * redirects, re-validating (and re-resolving) every hop for SSRF safety.
 */
function safeFetchWithRedirects(string $startUrl, int $maxBodyBytes): array
{
    $deadline = microtime(true) + OVERALL_BUDGET_SECONDS;
    $url = $startUrl;
    $redirectCount = 0;
    $chain = [];

    while (true) {
        $target = validateTarget($url);
        if (isset($target['error'])) {
            return ['error' => $target['error'], 'chain' => $chain];
        }
        $chain[] = $target['origin'] . $target['path'];

        $result = safeFetchOnce($target, $maxBodyBytes, $deadline);
        if (isset($result['error'])) {
            return ['error' => $result['error'], 'chain' => $chain];
        }

        if (in_array($result['status'], [301, 302, 303, 307, 308], true) && isset($result['headers']['location'])) {
            if ($redirectCount >= MAX_REDIRECTS) {
                return ['error' => 'too_many_redirects', 'chain' => $chain];
            }
            if (microtime(true) >= $deadline) {
                return ['error' => 'timeout', 'chain' => $chain];
            }
            $location = $result['headers']['location'];
            $next = resolveUrl($target['origin'] . $target['path'], $location);
            if ($next === null) {
                return ['error' => 'blocked', 'chain' => $chain];
            }
            $url = $next;
            $redirectCount++;
            continue;
        }

        $result['redirect_count'] = $redirectCount;
        $result['chain'] = $chain;
        return $result;
    }
}

function resolveUrl(string $base, string $ref): ?string
{
    if (preg_match('#^[a-zA-Z][a-zA-Z0-9+.\-]*://#', $ref)) {
        return $ref;
    }
    $baseParts = parse_url($base);
    if ($baseParts === false || empty($baseParts['scheme']) || empty($baseParts['host'])) {
        return null;
    }
    $origin = $baseParts['scheme'] . '://' . $baseParts['host'] . (isset($baseParts['port']) ? ':' . $baseParts['port'] : '');
    if (str_starts_with($ref, '//')) {
        return $baseParts['scheme'] . ':' . $ref;
    }
    if (str_starts_with($ref, '/')) {
        return $origin . $ref;
    }
    $basePath = $baseParts['path'] ?? '/';
    $dir = substr($basePath, 0, strrpos($basePath, '/') + 1) ?: '/';
    return $origin . $dir . $ref;
}

function friendlyError(string $code): string
{
    return match ($code) {
        'blocked' => "This address can't be checked — it points to a private, internal, or otherwise restricted network location.",
        'dns_failed' => 'Could not resolve this domain. Please check the address and try again.',
        'connection_failed' => 'Could not connect to this website. It may be down or refusing connections.',
        'timeout' => 'This website took too long to respond.',
        'ssl_error' => 'Could not establish a secure (HTTPS) connection to this website.',
        'too_many_redirects' => 'This website redirected too many times to follow safely.',
        default => 'Could not reach this website. It may be blocking automated requests.',
    };
}

function parseHtml(string $html): DOMDocument
{
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_use_internal_errors($prev);
    return $doc;
}

function metaContent(DOMDocument $doc, string $attr, string $value): ?string
{
    $xpath = new DOMXPath($doc);
    $nodes = $xpath->query("//meta[translate(@{$attr}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='{$value}']");
    if ($nodes === false || $nodes->length === 0) {
        return null;
    }
    $content = $nodes->item(0)->getAttribute('content');
    return $content !== '' ? trim($content) : null;
}

function linkHref(DOMDocument $doc, string $rel): ?string
{
    $xpath = new DOMXPath($doc);
    $nodes = $xpath->query("//link[translate(@rel, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='{$rel}']");
    if ($nodes === false || $nodes->length === 0) {
        return null;
    }
    $href = $nodes->item(0)->getAttribute('href');
    return $href !== '' ? trim($href) : null;
}

/**
 * Public-signal WordPress detection, shared by every tool that needs an
 * "is this WordPress" precondition (website-health-checker.php,
 * theme-detector.php, and any future scanner from FREE-TOOLS-SEO-ROADMAP.md
 * — Tools 4/5/6 all need this same check first). Kept here instead of
 * hand-duplicated per file so the signal set and verdict thresholds can
 * only drift in one place.
 *
 * $headers must be the lower-cased header map safeFetchOnce()/
 * safeFetchWithRedirects() already return. $generator is the page's
 * <meta name="generator"> content, if any (callers already have a
 * DOMDocument in hand and metaContent() is cheap, so this takes the value
 * rather than re-parsing).
 */
function detectWordPressSignals(string $body, array $headers, ?string $generator): array
{
    $signals = [];
    if (str_contains($body, '/wp-content/')) {
        $signals[] = 'A /wp-content/ path appears in the page source.';
    }
    if (str_contains($body, '/wp-includes/')) {
        $signals[] = 'A /wp-includes/ path appears in the page source.';
    }
    if ($generator !== null && stripos($generator, 'wordpress') !== false) {
        $signals[] = 'The page declares a WordPress generator meta tag.';
    }
    if (str_contains($headers['link'] ?? '', 'api.w.org')) {
        $signals[] = 'The response advertises the WordPress REST API (wp-json) in its Link header.';
    }
    if (stripos($body, 'wp-json') !== false) {
        $signals[] = 'A reference to wp-json appears in the page source.';
    }

    $signalCount = count($signals);
    $verdict = $signalCount >= 2 ? 'WordPress detected' : ($signalCount === 1 ? 'WordPress likely' : 'WordPress not detected');
    $status = $signalCount >= 2 ? 'good' : ($signalCount === 1 ? 'warn' : 'danger');

    return [
        'is_wordpress' => $signalCount >= 1,
        'verdict' => $verdict,
        'status' => $status,
        'signals' => $signals,
    ];
}
