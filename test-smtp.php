<?php
/**
 * Test SMTP Gmail Aggregator
 * 
 * Kirim email via SMTP server aggregator di localhost:587
 * Jalankan: php test-smtp.php
 */

// SMTP Config
$smtpHost = '192.168.222.5';
$smtpPort = 587;
$smtpUser = 'medot';
$smtpPass = '50223044';

// Email Config
$to      = 'monalisa.medot26@gmail.com';
$subject = 'Test SMTP Gmail Aggregator';
$htmlBody = '<html><body>
<h2>Hello dari SMTP Gmail Aggregator!</h2>
<p>Ini adalah email test yang dikirim melalui <strong>SMTP server aggregator</strong> di <code>localhost:587</code>.</p>
<p>Jika kamu menerima email ini, berarti SMTP relay berjalan dengan baik.</p>
<hr>
<p style="color: #888; font-size: 12px;">Sent at: ' . date('Y-m-d H:i:s') . '</p>
</body></html>';

echo "===========================================\n";
echo "  Test SMTP Gmail Aggregator\n";
echo "===========================================\n";
echo "SMTP: $smtpHost:$smtpPort\n";
echo "To:   $to\n";
echo "Subj: $subject\n";
echo "-------------------------------------------\n";

// Connect to SMTP server
echo "[1] Connecting to $smtpHost:$smtpPort...\n";
$socket = @fsockopen($smtpHost, $smtpPort, $errno, $errstr, 10);

if (!$socket) {
    die("FAILED: Could not connect - $errstr ($errno)\n");
}

// Helper function: send command and get response
function smtp_cmd($socket, $cmd = null) {
    if ($cmd !== null) {
        fwrite($socket, $cmd . "\r\n");
    }
    $response = '';
    while ($line = fgets($socket, 512)) {
        $response .= $line;
        // Check if this is the last line (format: "XXX " not "XXX-")
        if (isset($line[3]) && $line[3] === ' ') {
            break;
        }
    }
    return trim($response);
}

// Read server greeting
$greeting = smtp_cmd($socket);
echo "    Server: $greeting\n";

// EHLO
echo "[2] Sending EHLO...\n";
$resp = smtp_cmd($socket, "EHLO localhost");
echo "    OK\n";

// AUTH LOGIN
echo "[3] Authenticating...\n";
$resp = smtp_cmd($socket, "AUTH LOGIN");
if (strpos($resp, '334') === false) {
    die("FAILED: AUTH LOGIN not accepted - $resp\n");
}

// Send username (base64)
$resp = smtp_cmd($socket, base64_encode($smtpUser));
if (strpos($resp, '334') === false) {
    die("FAILED: Username not accepted - $resp\n");
}

// Send password (base64)
$resp = smtp_cmd($socket, base64_encode($smtpPass));
if (strpos($resp, '235') === false) {
    die("FAILED: Authentication failed - $resp\n");
}
echo "    Authenticated!\n";

// MAIL FROM
echo "[4] Setting sender...\n";
$resp = smtp_cmd($socket, "MAIL FROM:<test@aggregator.local>");
if (strpos($resp, '250') === false) {
    die("FAILED: MAIL FROM rejected - $resp\n");
}
echo "    OK\n";

// RCPT TO
echo "[5] Setting recipient...\n";
$resp = smtp_cmd($socket, "RCPT TO:<$to>");
if (strpos($resp, '250') === false) {
    die("FAILED: RCPT TO rejected - $resp\n");
}
echo "    OK\n";

// DATA
echo "[6] Sending email data...\n";
$resp = smtp_cmd($socket, "DATA");
if (strpos($resp, '354') === false) {
    die("FAILED: DATA not accepted - $resp\n");
}

// Build email headers + body
$boundary = md5(uniqid(time()));
$headers  = "From: Test <test@aggregator.local>\r\n";
$headers .= "To: $to\r\n";
$headers .= "Subject: $subject\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/html; charset=UTF-8\r\n";
$headers .= "Date: " . date('r') . "\r\n";
$headers .= "\r\n";
$headers .= $htmlBody;
$headers .= "\r\n.\r\n"; // End of data

fwrite($socket, $headers);
$resp = smtp_cmd($socket);

if (strpos($resp, '250') === false) {
    die("FAILED: Email not accepted - $resp\n");
}
echo "    Email sent!\n";

// QUIT
smtp_cmd($socket, "QUIT");
fclose($socket);

echo "-------------------------------------------\n";
echo "SUCCESS! Email sent to $to\n";
echo "Check inbox (or spam folder).\n";
echo "===========================================\n";
