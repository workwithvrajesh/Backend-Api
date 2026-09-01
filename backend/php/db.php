<?php
// Shared helpers: Cloudflare D1 queries, JSON responses, auth checks.

function wwv_config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function wwv_quote_ident(string $name): string
{
    if (!preg_match('/^[a-z_][a-z0-9_]*$/i', $name)) {
        throw new InvalidArgumentException("Invalid SQL identifier: $name");
    }
    return '"' . $name . '"';
}

function wwv_is_list(array $params): bool
{
    if (function_exists('array_is_list')) {
        return array_is_list($params);
    }
    return $params === [] || array_keys($params) === range(0, count($params) - 1);
}

function wwv_bind(string $sql, array $params): array
{
    if ($params === [] || wwv_is_list($params)) {
        $out = [];
        foreach ($params as $value) {
            $out[] = is_bool($value) ? (int) $value : $value;
        }
        return [$sql, $out];
    }
    $values = [];
    $bound = preg_replace_callback('/:([a-zA-Z_][a-zA-Z0-9_]*)/', function ($match) use ($params, &$values) {
        $name = $match[1];
        if (!array_key_exists($name, $params)) {
            throw new InvalidArgumentException("Missing query param :$name");
        }
        $value = $params[$name];
        $values[] = is_bool($value) ? (int) $value : $value;
        return '?';
    }, $sql);
    return [$bound, $values];
}

function wwv_d1(string $sql, array $params = []): array
{
    $c = wwv_config();
    if ($c['cf_account_id'] === '' || $c['cf_database_id'] === '' || $c['cf_api_token'] === '') {
        throw new RuntimeException('Cloudflare D1 is not configured');
    }
    [$sql, $params] = wwv_bind($sql, $params);
    $url = 'https://api.cloudflare.com/client/v4/accounts/'
        . rawurlencode($c['cf_account_id'])
        . '/d1/database/'
        . rawurlencode($c['cf_database_id'])
        . '/query';
    $payload = json_encode(['sql' => $sql, 'params' => array_values($params)], JSON_UNESCAPED_SLASHES);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $c['cf_api_token'],
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        throw new RuntimeException('D1 request failed: ' . $error);
    }
    $decoded = json_decode($raw, true);
    if ($status < 200 || $status >= 300 || empty($decoded['success'])) {
        $messages = [];
        foreach ($decoded['errors'] ?? [] as $item) {
            $messages[] = $item['message'] ?? json_encode($item);
        }
        throw new RuntimeException('D1 query failed: ' . ($messages ? implode('; ', $messages) : "HTTP $status"));
    }
    $result = $decoded['result'][0] ?? [];
    if (($result['success'] ?? true) === false) {
        throw new RuntimeException($result['error'] ?? 'D1 statement failed');
    }
    return [
        'rows' => $result['results'] ?? [],
        'changes' => (int) ($result['meta']['changes'] ?? 0),
    ];
}

function wwv_query(string $sql, array $params = []): array
{
    return wwv_d1($sql, $params)['rows'];
}

function wwv_one(string $sql, array $params = []): ?array
{
    $rows = wwv_query($sql, $params);
    return $rows[0] ?? null;
}

function wwv_run(string $sql, array $params = []): array
{
    return wwv_d1($sql, $params);
}

function wwv_cors(): void
{
    $c = wwv_config();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = $c['allowed_origins'];
    if (in_array('*', $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . ($origin !== '' ? $origin : '*'));
    } elseif ($origin !== '' && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-WWV-Key');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
    header('Access-Control-Max-Age: 86400');
}

function wwv_json($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function wwv_fail(string $message, int $status = 400): void
{
    wwv_json(['error' => $message], $status);
}

function wwv_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

function wwv_b64(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function wwv_b64_decode(string $value): string
{
    $pad = strlen($value) % 4;
    if ($pad) {
        $value .= str_repeat('=', 4 - $pad);
    }
    return base64_decode(strtr($value, '-_', '+/')) ?: '';
}

function wwv_issue_token(array $claims, int $ttlSeconds = 60 * 60 * 12): string
{
    $c = wwv_config();
    $payload = $claims + ['exp' => time() + $ttlSeconds];
    $body = wwv_b64(json_encode($payload));
    $sig = wwv_b64(hash_hmac('sha256', $body, $c['jwt_secret'], true));
    return $body . '.' . $sig;
}

function wwv_verify_token(?string $token): ?array
{
    if (!$token || strpos($token, '.') === false) {
        return null;
    }
    $c = wwv_config();
    [$body, $sig] = explode('.', $token, 2);
    $expected = wwv_b64(hash_hmac('sha256', $body, $c['jwt_secret'], true));
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $claims = json_decode(wwv_b64_decode($body), true);
    if (!is_array($claims) || ($claims['exp'] ?? 0) < time()) {
        return null;
    }
    return $claims;
}

function wwv_bearer(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (stripos($header, 'Bearer ') === 0) {
        return trim(substr($header, 7));
    }
    return null;
}

/** Returns the signed-in admin claims, or ends the request with 401/403. */
function wwv_require_admin(): array
{
    $claims = wwv_verify_token(wwv_bearer());
    if (!$claims) {
        wwv_fail('Unauthorized', 401);
    }
    if (($claims['role'] ?? '') !== 'admin') {
        wwv_fail('Admin access required', 403);
    }
    return $claims;
}

/** Server-to-server calls (site backend) authenticate with the shared key. */
function wwv_has_service_key(): bool
{
    $c = wwv_config();
    $key = $_SERVER['HTTP_X_WWV_KEY'] ?? '';
    return $key !== '' && hash_equals($c['api_key'], $key);
}

function wwv_uuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function wwv_json_col($value)
{
    if ($value === null || $value === '') {
        return null;
    }
    if (is_array($value) || is_object($value)) {
        return (array) $value;
    }
    $decoded = json_decode($value, true);
    return $decoded === null ? null : $decoded;
}
