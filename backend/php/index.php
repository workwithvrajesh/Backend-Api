<?php
// Work With Vrajesh — REST API on Cloudflare D1.
// Routes are relative to this file, e.g. https://yourdomain.com/api/cms/documents/home

require __DIR__ . '/db.php';

wwv_cors();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$base = rtrim(str_replace('/index.php', '', $_SERVER['SCRIPT_NAME'] ?? ''), '/');
if ($base !== '' && strpos($path, $base) === 0) {
    $path = substr($path, strlen($base));
}
$segments = array_values(array_filter(explode('/', trim($path, '/')), fn($s) => $s !== ''));

try {
    wwv_route($method, $segments);
} catch (Throwable $e) {
    error_log('[wwv-api] ' . $e->getMessage());
    wwv_fail('Server error', 500);
}

function wwv_route(string $method, array $s): void
{
    $head = $s[0] ?? '';

    // ---- health ----------------------------------------------------------
    if ($head === 'health') {
        wwv_query('SELECT 1');
        wwv_json(['ok' => true, 'time' => gmdate('c')]);
    }

    // ---- auth ------------------------------------------------------------
    if ($head === 'auth') {
        $action = $s[1] ?? '';
        if ($action === 'login' && $method === 'POST') {
            $body = wwv_body();
            $email = strtolower(trim((string) ($body['email'] ?? '')));
            $password = (string) ($body['password'] ?? '');
            $user = wwv_one('SELECT * FROM admin_users WHERE email = ? LIMIT 1', [$email]);
            if (!$user || !password_verify($password, $user['password_hash'])) {
                usleep(400000);
                wwv_fail('Invalid email or password', 401);
            }
            wwv_json([
                'token' => wwv_issue_token(['sub' => $user['id'], 'email' => $user['email'], 'role' => $user['role']]),
                'user' => ['id' => $user['id'], 'email' => $user['email'], 'role' => $user['role']],
            ]);
        }
        if ($action === 'me' && $method === 'GET') {
            $claims = wwv_require_admin();
            wwv_json(['user' => ['id' => $claims['sub'], 'email' => $claims['email'], 'role' => $claims['role']]]);
        }
        wwv_fail('Not found', 404);
    }

    // ---- CMS documents ---------------------------------------------------
    if ($head === 'cms' && ($s[1] ?? '') === 'documents') {
        $key = $s[2] ?? '';
        if ($method === 'GET' && $key !== '') {
            $onlyPublished = !wwv_verify_token(wwv_bearer());
            $sql = 'SELECT * FROM cms_documents WHERE "key" = ?' . ($onlyPublished ? " AND status = 'published'" : '') . ' LIMIT 1';
            $row = wwv_one($sql, [$key]);
            wwv_json($row ? wwv_doc_out($row) : null);
        }
        if ($method === 'POST') {
            $claims = wwv_require_admin();
            $body = wwv_body();
            $key = (string) ($body['key'] ?? $key);
            if ($key === '') {
                wwv_fail('key is required');
            }
            wwv_run(
                'INSERT INTO cms_documents ("key", data, status, updated_by, updated_at)
                 VALUES (?, ?, ?, ?, datetime(\'now\'))
                 ON CONFLICT("key") DO UPDATE SET
                   data = excluded.data,
                   status = excluded.status,
                   updated_by = excluded.updated_by,
                   updated_at = datetime(\'now\')',
                [
                    $key,
                    json_encode($body['data'] ?? new stdClass()),
                    (string) ($body['status'] ?? 'draft'),
                    $claims['sub'],
                ]
            );
            wwv_json(['ok' => true]);
        }
        wwv_fail('Not found', 404);
    }

    // ---- CMS collections -------------------------------------------------
    if ($head === 'cms' && ($s[1] ?? '') === 'collections') {
        $collection = $s[2] ?? '';
        $id = $s[3] ?? '';

        if ($method === 'GET' && $collection !== '') {
            $onlyPublished = !wwv_verify_token(wwv_bearer());
            $sql = 'SELECT * FROM cms_collections WHERE collection = ?'
                . ($onlyPublished ? " AND status = 'published'" : '')
                . ' ORDER BY sort ASC, created_at ASC';
            wwv_json(array_map('wwv_item_out', wwv_query($sql, [$collection])));
        }

        if ($method === 'POST') {
            $claims = wwv_require_admin();
            $body = wwv_body();
            $rows = isset($body['items']) && is_array($body['items']) ? $body['items'] : [$body];
            foreach ($rows as $row) {
                wwv_run(
                    'INSERT INTO cms_collections (id, collection, slug, sort, status, data, updated_by, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))
                     ON CONFLICT(collection, slug) DO UPDATE SET
                       sort = excluded.sort,
                       status = excluded.status,
                       data = excluded.data,
                       updated_by = excluded.updated_by,
                       updated_at = datetime(\'now\')',
                    [
                        (string) ($row['id'] ?? '') !== '' ? $row['id'] : wwv_uuid(),
                        (string) ($row['collection'] ?? $collection),
                        (string) ($row['slug'] ?? ''),
                        (int) ($row['sort'] ?? 0),
                        (string) ($row['status'] ?? 'draft'),
                        json_encode($row['data'] ?? new stdClass()),
                        $claims['sub'],
                    ]
                );
            }
            wwv_json(['ok' => true, 'count' => count($rows)]);
        }

        if ($method === 'PATCH' && $id !== '') {
            $claims = wwv_require_admin();
            $body = wwv_body();
            $sets = [];
            $args = [];
            foreach (['slug' => 'slug', 'sort' => 'sort', 'status' => 'status'] as $field => $column) {
                if (array_key_exists($field, $body)) {
                    $sets[] = "$column = ?";
                    $args[] = $field === 'sort' ? (int) $body[$field] : (string) $body[$field];
                }
            }
            if (array_key_exists('data', $body)) {
                $sets[] = 'data = ?';
                $args[] = json_encode($body['data']);
            }
            if (!$sets) {
                wwv_fail('Nothing to update');
            }
            $sets[] = 'updated_by = ?';
            $sets[] = "updated_at = datetime('now')";
            $args[] = $claims['sub'];
            $args[] = $id;
            wwv_run('UPDATE cms_collections SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
            wwv_json(['ok' => true]);
        }

        if ($method === 'DELETE' && $id !== '') {
            wwv_require_admin();
            wwv_run('DELETE FROM cms_collections WHERE id = ?', [$id]);
            wwv_json(['ok' => true]);
        }

        wwv_fail('Not found', 404);
    }

    // ---- media -----------------------------------------------------------
    if ($head === 'media') {
        $id = $s[1] ?? '';

        if ($method === 'GET' && $id === '') {
            wwv_require_admin();
            $rows = wwv_query('SELECT * FROM media_assets ORDER BY created_at DESC');
            wwv_json(array_map('wwv_media_out', $rows));
        }

        if ($method === 'POST' && $id === '') {
            $claims = wwv_require_admin();
            $c = wwv_config();
            if (!isset($_FILES['file'])) {
                wwv_fail('file is required');
            }
            $file = $_FILES['file'];
            if (($file['error'] ?? 1) !== UPLOAD_ERR_OK) {
                wwv_fail('Upload failed');
            }
            if ($file['size'] > 10 * 1024 * 1024) {
                wwv_fail('File is larger than 10MB');
            }
            $mime = mime_content_type($file['tmp_name']) ?: 'application/octet-stream';
            $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf'];
            if (!in_array($mime, $allowed, true)) {
                wwv_fail('Unsupported file type: ' . $mime);
            }
            $safe = preg_replace('/[^a-z0-9.]+/', '-', strtolower($file['name']));
            $rel = date('Y') . '/' . time() . '-' . bin2hex(random_bytes(3)) . '-' . $safe;
            $dest = rtrim($c['upload_dir'], '/') . '/' . $rel;
            if (!is_dir(dirname($dest)) && !mkdir(dirname($dest), 0755, true)) {
                wwv_fail('Could not create upload folder', 500);
            }
            if (!move_uploaded_file($file['tmp_name'], $dest)) {
                wwv_fail('Could not store file', 500);
            }
            $size = @getimagesize($dest);
            $url = rtrim($c['upload_url'], '/') . '/' . $rel;
            $row = [
                'id' => wwv_uuid(),
                'path' => $rel,
                'url' => $url,
                'alt' => '',
                'width' => $size ? $size[0] : null,
                'height' => $size ? $size[1] : null,
                'size_bytes' => filesize($dest) ?: null,
                'mime' => $mime,
            ];
            wwv_run(
                'INSERT INTO media_assets (id, path, url, alt, width, height, size_bytes, mime,
                    original_path, original_url, original_size_bytes, original_width, original_height)
                 VALUES (:id, :path, :url, :alt, :width, :height, :size_bytes, :mime,
                    :path, :url, :size_bytes, :width, :height)',
                $row
            );
            wwv_json(wwv_media_out($row + ['created_at' => gmdate('c')]));
        }

        if ($method === 'PATCH' && $id !== '') {
            wwv_require_admin();
            $body = wwv_body();
            wwv_run('UPDATE media_assets SET alt = ? WHERE id = ?', [(string) ($body['alt'] ?? ''), $id]);
            wwv_json(['ok' => true]);
        }

        if ($method === 'DELETE' && $id !== '') {
            wwv_require_admin();
            $c = wwv_config();
            $row = wwv_one('SELECT path, original_path FROM media_assets WHERE id = ? LIMIT 1', [$id]);
            foreach (array_unique(array_filter([$row['path'] ?? null, $row['original_path'] ?? null])) as $rel) {
                $abs = realpath(rtrim($c['upload_dir'], '/') . '/' . $rel);
                if ($abs && strpos($abs, realpath($c['upload_dir'])) === 0) {
                    @unlink($abs);
                }
            }
            wwv_run('DELETE FROM media_assets WHERE id = ?', [$id]);
            wwv_json(['ok' => true]);
        }

        wwv_fail('Not found', 404);
    }

    // ---- inquiries -------------------------------------------------------
    if ($head === 'inquiries') {
        $id = $s[1] ?? '';

        // Public submit: the site backend calls this with the shared service key.
        if ($method === 'POST' && $id === '') {
            if (!wwv_has_service_key() && !wwv_verify_token(wwv_bearer())) {
                wwv_fail('Unauthorized', 401);
            }
            $body = wwv_body();
            $row = [
                'id' => wwv_uuid(),
                'name' => trim((string) ($body['name'] ?? '')),
                'email' => trim((string) ($body['email'] ?? '')),
                'phone' => trim((string) ($body['phone'] ?? '')),
                'service' => trim((string) ($body['service'] ?? '')),
                'message' => (string) ($body['message'] ?? ''),
                'attachment_name' => $body['attachment_name'] ?? null,
                'attachments' => isset($body['attachments']) ? json_encode($body['attachments']) : null,
                'attribution' => isset($body['attribution']) ? json_encode($body['attribution']) : null,
                'source' => (string) ($body['source'] ?? 'website'),
                'status' => (string) ($body['status'] ?? 'new'),
            ];
            if ($row['name'] === '' || $row['email'] === '') {
                wwv_fail('name and email are required');
            }
            wwv_run(
                'INSERT INTO inquiries (id, name, email, phone, service, message, attachment_name,
                    attachments, attribution, source, status)
                 VALUES (:id, :name, :email, :phone, :service, :message, :attachment_name,
                    :attachments, :attribution, :source, :status)',
                $row
            );
            wwv_json(['ok' => true, 'id' => $row['id']], 201);
        }

        if ($method === 'GET' && $id === '') {
            wwv_require_admin();
            $rows = wwv_query('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 500');
            wwv_json(array_map('wwv_inquiry_out', $rows));
        }

        if ($method === 'PATCH' && $id !== '') {
            wwv_require_admin();
            $body = wwv_body();
            wwv_run('UPDATE inquiries SET status = ? WHERE id = ?', [(string) ($body['status'] ?? 'new'), $id]);
            wwv_json(['ok' => true]);
        }

        if ($method === 'DELETE' && $id !== '') {
            wwv_require_admin();
            wwv_run('DELETE FROM inquiries WHERE id = ?', [$id]);
            wwv_json(['ok' => true]);
        }

        wwv_fail('Not found', 404);
    }

    // ---- generic admin log tables ---------------------------------------
    $logTables = [
        'inquiry-audit' => 'inquiry_audit_log',
        'ga-events' => 'ga_event_log',
        'seo-audit-runs' => 'seo_audit_runs',
    ];
    if (isset($logTables[$head])) {
        $table = $logTables[$head];
        $id = $s[1] ?? '';

        if ($method === 'GET') {
            wwv_require_admin();
            $rows = wwv_query('SELECT * FROM ' . wwv_quote_ident($table) . ' ORDER BY created_at DESC LIMIT 500');
            wwv_json(array_map('wwv_generic_out', $rows));
        }
        if ($method === 'POST') {
            if (!wwv_has_service_key() && !wwv_verify_token(wwv_bearer())) {
                wwv_fail('Unauthorized', 401);
            }
            $body = wwv_body();
            $body['id'] = $body['id'] ?? wwv_uuid();
            $columns = wwv_columns($table);
            $insert = [];
            foreach ($body as $key => $value) {
                if (in_array($key, $columns, true)) {
                    $insert[$key] = is_array($value) ? json_encode($value) : (is_bool($value) ? (int) $value : $value);
                }
            }
            $names = array_map('wwv_quote_ident', array_keys($insert));
            $holders = array_map(fn($c) => ":$c", array_keys($insert));
            wwv_run(
                'INSERT INTO ' . wwv_quote_ident($table) . ' (' . implode(', ', $names) . ') VALUES (' . implode(', ', $holders) . ')',
                $insert
            );
            wwv_json(['ok' => true, 'id' => $insert['id']], 201);
        }
        if ($method === 'DELETE') {
            wwv_require_admin();
            if ($id !== '') {
                wwv_run('DELETE FROM ' . wwv_quote_ident($table) . ' WHERE id = ?', [$id]);
                wwv_json(['ok' => true]);
            }
            $before = $_GET['before'] ?? '';
            if ($before === '') {
                wwv_fail('before (ISO date) or an id is required');
            }
            $result = wwv_run(
                'DELETE FROM ' . wwv_quote_ident($table) . ' WHERE created_at < ?',
                [gmdate('Y-m-d H:i:s', strtotime($before))]
            );
            wwv_json(['ok' => true, 'deleted' => $result['changes']]);
        }
        wwv_fail('Not found', 404);
    }

    // ---- SMTP settings ---------------------------------------------------
    if ($head === 'smtp') {
        if ($method === 'GET') {
            if (!wwv_has_service_key()) {
                wwv_require_admin();
            }
            $row = wwv_one('SELECT * FROM smtp_settings WHERE id = 1 LIMIT 1');
            wwv_json($row ? wwv_generic_out($row) : null);
        }
        if ($method === 'POST') {
            $claims = wwv_require_admin();
            $body = wwv_body();
            $columns = array_values(array_filter(wwv_columns('smtp_settings'), fn($c) => !in_array($c, ['id', 'updated_at'], true)));
            $insert = ['id' => 1, 'updated_by' => $claims['sub']];
            foreach ($columns as $column) {
                if (array_key_exists($column, $body)) {
                    $value = $body[$column];
                    $insert[$column] = is_bool($value) ? (int) $value : (is_array($value) ? json_encode($value) : $value);
                }
            }
            $names = array_map('wwv_quote_ident', array_keys($insert));
            $holders = array_map(fn($c) => ":$c", array_keys($insert));
            $updates = [];
            foreach (array_keys($insert) as $column) {
                if ($column === 'id') {
                    continue;
                }
                $updates[] = wwv_quote_ident($column) . ' = excluded.' . wwv_quote_ident($column);
            }
            $updates[] = "updated_at = datetime('now')";
            wwv_run(
                'INSERT INTO smtp_settings (' . implode(', ', $names) . ', updated_at) VALUES (' . implode(', ', $holders) . ', datetime(\'now\'))'
                . ' ON CONFLICT(id) DO UPDATE SET ' . implode(', ', $updates),
                $insert
            );
            wwv_json(['ok' => true]);
        }
        wwv_fail('Not found', 404);
    }

    wwv_fail('Not found', 404);
}

// ---- output shaping -----------------------------------------------------

function wwv_columns(string $table): array
{
    static $cache = [];
    if (!isset($cache[$table])) {
        $rows = wwv_query('PRAGMA table_info(' . wwv_quote_ident($table) . ')');
        $cache[$table] = array_map(fn($r) => $r['name'], $rows);
    }
    return $cache[$table];
}

function wwv_doc_out(array $row): array
{
    $row['data'] = wwv_json_col($row['data'] ?? null) ?? [];
    return $row;
}

function wwv_item_out(array $row): array
{
    $row['data'] = wwv_json_col($row['data'] ?? null) ?? [];
    $row['sort'] = (int) $row['sort'];
    return $row;
}

function wwv_media_out(array $row): array
{
    foreach (['width', 'height', 'size_bytes', 'original_width', 'original_height', 'original_size_bytes'] as $key) {
        if (isset($row[$key])) {
            $row[$key] = $row[$key] === null ? null : (int) $row[$key];
        }
    }
    return $row;
}

function wwv_inquiry_out(array $row): array
{
    $row['attachments'] = wwv_json_col($row['attachments'] ?? null);
    $row['attribution'] = wwv_json_col($row['attribution'] ?? null);
    $row['email_delivery'] = wwv_json_col($row['email_delivery'] ?? null);
    $row['email_attempts'] = (int) ($row['email_attempts'] ?? 0);
    return $row;
}

function wwv_generic_out(array $row): array
{
    foreach ($row as $key => $value) {
        if (is_string($value) && $value !== '' && ($value[0] === '{' || $value[0] === '[')) {
            $decoded = wwv_json_col($value);
            if ($decoded !== null) {
                $row[$key] = $decoded;
            }
        }
    }
    foreach (['tracking_enabled', 'delivered', 'acknowledged', 'enabled', 'last_test_ok'] as $flag) {
        if (array_key_exists($flag, $row) && $row[$flag] !== null) {
            $row[$flag] = (bool) $row[$flag];
        }
    }
    return $row;
}
