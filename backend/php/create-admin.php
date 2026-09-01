<?php
// One-time admin creation. Open in the browser, then DELETE this file.
//   https://yourdomain.com/api/create-admin.php?email=workwithvrajesh@gmail.com&password=Admin@Vrajesh123

require __DIR__ . '/db.php';

$email = strtolower(trim((string) ($_GET['email'] ?? '')));
$password = (string) ($_GET['password'] ?? '');

if ($email === '' || strlen($password) < 8) {
    wwv_fail('Pass ?email=...&password=... (password must be at least 8 characters)');
}

$hash = password_hash($password, PASSWORD_DEFAULT);
wwv_run(
    'INSERT INTO admin_users (id, email, password_hash, role, created_at)
     VALUES (?, ?, ?, \'admin\', datetime(\'now\'))
     ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = \'admin\'',
    [wwv_uuid(), $email, $hash]
);

wwv_json(['ok' => true, 'email' => $email, 'note' => 'Delete create-admin.php now.']);
