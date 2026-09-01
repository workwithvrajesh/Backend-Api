<?php
// Cloudflare D1 connection for the Work With Vrajesh PHP API.
// Copy .env.example to .env, or set these as real environment variables.

function wwv_load_env(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    $path = __DIR__ . '/.env';
    if (!is_file($path)) {
        return;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        if (!str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ($value !== '' && ($value[0] === '"' || $value[0] === "'") && substr($value, -1) === $value[0]) {
            $value = substr($value, 1, -1);
        }
        if ($key !== '' && getenv($key) === false) {
            putenv("$key=$value");
            $_ENV[$key] = $value;
        }
    }
}

wwv_load_env();

return [
    'cf_account_id' => getenv('CLOUDFLARE_ACCOUNT_ID') ?: '7712e75c497be262dad6a07f2378e10d',
    'cf_database_id' => getenv('CLOUDFLARE_D1_DATABASE_ID') ?: '3d54fc00-0b85-4b29-a63c-a3527785ba92',
    'cf_database_name' => getenv('CLOUDFLARE_D1_DATABASE_NAME') ?: 'workwithvrajesh-db',
    'cf_api_token' => getenv('CLOUDFLARE_API_TOKEN') ?: '',

    'api_key' => getenv('WWV_API_KEY') ?: 'change-me-to-a-long-random-string',
    'jwt_secret' => getenv('WWV_JWT_SECRET') ?: 'change-me-too-a-different-random-string',
    'allowed_origins' => ['*'],
    'upload_dir' => __DIR__ . '/uploads',
    'upload_url' => getenv('WWV_UPLOAD_URL') ?: '/api/uploads',
];
