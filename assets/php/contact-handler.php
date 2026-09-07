<?php
/* Receives the contact form as JSON, emails it to the site owner, and
   replies with JSON. Same-origin, so no CORS handling is needed. */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid request body']);
    exit;
}

/* Honeypot: a bot fills this hidden field. Pretend success without sending
   mail, same behaviour the old Apps Script client expected.
   Field name deliberately avoids "website"/"company" -- those matched a browser
   autofill category, which was silently filling this and dropping real
   submissions (diagnosed 2026-09-01). */
if (!empty($data['hp_confirm'])) {
    echo json_encode(['status' => 'ok']);
    exit;
}

$name = trim((string) ($data['name'] ?? ''));
$email = trim((string) ($data['email'] ?? ''));
$message = trim((string) ($data['message'] ?? ''));

/* Present on the full project-inquiry form, absent from the shorter homepage
   form -- all optional server-side so both keep working against one endpoint. */
$projectType = trim((string) ($data['project_type'] ?? ''));
$timeline = trim((string) ($data['timeline'] ?? ''));
$budget = trim((string) ($data['budget'] ?? ''));

if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Missing or invalid fields']);
    exit;
}

/* mail() builds raw headers from these strings -- strip line breaks so a
   crafted name/email can't inject extra headers (e.g. Bcc:). */
$stripCrlf = static fn (string $value): string => str_replace(["\r", "\n"], '', $value);
$name = $stripCrlf($name);
$email = $stripCrlf($email);
$projectType = $stripCrlf($projectType);
$timeline = $stripCrlf($timeline);
$budget = $stripCrlf($budget);

$to = 'hello@ashekur.com';
$subject = 'New enquiry from ' . $name;
$details = "Name: {$name}\nEmail: {$email}\n";
if ($projectType !== '') {
    $details .= "Project type: {$projectType}\n";
}
if ($timeline !== '') {
    $details .= "Timeline: {$timeline}\n";
}
if ($budget !== '') {
    $details .= "Budget: {$budget}\n";
}
$body = $details . "\n{$message}\n";
$headers = [
    'From: Ashekur Website <no-reply@ashekur.com>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Content-Type: text/plain; charset=utf-8',
];

$sent = mail($to, $subject, $body, implode("\r\n", $headers));

if (!$sent) {
    http_response_code(502);
    echo json_encode(['status' => 'error', 'message' => 'Mail send failed']);
    exit;
}

echo json_encode(['status' => 'ok']);
