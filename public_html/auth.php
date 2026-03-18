<?php

declare(strict_types=1);

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? null) === '443');

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Lax',
]);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        getenv('DB_HOST') ?: '127.0.0.1',
        getenv('DB_PORT') ?: '3306',
        getenv('DB_NAME') ?: 'memomo'
    );

    $pdo = new PDO(
        $dsn,
        getenv('DB_USER') ?: 'root',
        getenv('DB_PASS') ?: '',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    return $pdo;
}

function json_input(): array
{
    $raw = file_get_contents('php://input');

    if ($raw === '' || $raw === false) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function is_setup_completed(): bool
{
    $stmt = db()->query('SELECT COUNT(*) AS c FROM users');
    return ((int) $stmt->fetch()['c']) > 0;
}

function app_settings(): array
{
    $stmt = db()->query('SELECT setting_key, setting_value FROM app_settings');
    $settings = [];

    foreach ($stmt->fetchAll() as $row) {
        $settings[(string) $row['setting_key']] = (string) $row['setting_value'];
    }

    return $settings;
}

function app_setting(string $key, ?string $default = null): ?string
{
    $stmt = db()->prepare('SELECT setting_value FROM app_settings WHERE setting_key = :k LIMIT 1');
    $stmt->execute(['k' => $key]);
    $value = $stmt->fetchColumn();

    if ($value === false) {
        return $default;
    }

    return (string) $value;
}

function set_app_setting(string $key, string $value): void
{
    $stmt = db()->prepare('INSERT INTO app_settings (setting_key, setting_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)');
    $stmt->execute(['k' => $key, 'v' => $value]);
}

function get_social_provider(string $provider): ?array
{
    $stmt = db()->prepare('SELECT provider, enabled, client_id, client_secret, redirect_uri FROM oauth_providers WHERE provider = :p LIMIT 1');
    $stmt->execute(['p' => $provider]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function list_social_providers(bool $onlyEnabled = false): array
{
    $sql = 'SELECT provider, enabled, client_id, redirect_uri FROM oauth_providers';
    if ($onlyEnabled) {
        $sql .= ' WHERE enabled = 1';
    }
    $sql .= ' ORDER BY provider';

    return db()->query($sql)->fetchAll();
}

function login(string $email, string $password): bool
{
    $stmt = db()->prepare('SELECT id, email, password_hash, is_admin FROM users WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => mb_strtolower(trim($email))]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, (string) $user['password_hash'])) {
        return false;
    }

    do_login_session($user);
    return true;
}

function do_login_session(array $user): void
{
    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id' => (int) $user['id'],
        'email' => (string) $user['email'],
        'is_admin' => (int) ($user['is_admin'] ?? 0) === 1,
    ];
}

function logout(): void
{
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => (bool) $params['secure'],
                'httponly' => (bool) $params['httponly'],
                'samesite' => $params['samesite'] ?? 'Lax',
            ]
        );
    }

    session_destroy();
}

function require_login(): array
{
    $user = current_user();

    if ($user !== null) {
        return $user;
    }

    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode([
        'ok' => false,
        'error' => 'Unauthorized',
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

function require_admin(): array
{
    $user = require_login();
    if (!($user['is_admin'] ?? false)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Admin only'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    return $user;
}
