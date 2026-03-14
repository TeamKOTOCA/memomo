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

function login(string $email, string $password): bool
{
    $stmt = db()->prepare('SELECT id, email, password_hash FROM users WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => mb_strtolower(trim($email))]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        return false;
    }

    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id' => (int) $user['id'],
        'email' => $user['email'],
    ];

    return true;
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
