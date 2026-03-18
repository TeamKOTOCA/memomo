<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$action = $_GET['action'] ?? '';
if ($action === 'auth.social.callback') {
    handle_social_callback();
}

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$payload = json_input();

try {
    switch ($action) {
        case 'setup.status':
            respond([
                'ok' => true,
                'setup_completed' => is_setup_completed(),
                'settings' => app_settings(),
                'providers' => list_social_providers(false),
            ]);
            break;

        case 'setup.initialize':
            only_method($method, ['POST']);
            if (is_setup_completed()) {
                bad_request('Setup already completed.');
            }
            initialize_setup($payload);
            respond(['ok' => true]);
            break;

        case 'setup.update':
            only_method($method, ['POST']);
            require_admin();
            update_setup_settings($payload);
            respond(['ok' => true]);
            break;

        case 'auth.providers':
            respond(['ok' => true, 'providers' => list_social_providers(true)]);
            break;

        case 'auth.social.start':
            $provider = trim((string) ($_GET['provider'] ?? ''));
            if ($provider === '') {
                bad_request('provider is required.');
            }
            $url = create_social_auth_url($provider);
            respond(['ok' => true, 'url' => $url]);
            break;

        case 'auth.login':
            only_method($method, ['POST']);
            $email = trim((string) ($payload['email'] ?? ''));
            $password = (string) ($payload['password'] ?? '');

            if ($email === '' || $password === '') {
                bad_request('Email and password are required.');
            }

            if (!login($email, $password)) {
                respond(['ok' => false, 'error' => 'Invalid credentials'], 401);
            }

            respond(['ok' => true, 'user' => current_user()]);
            break;

        case 'auth.logout':
            only_method($method, ['POST']);
            logout();
            respond(['ok' => true]);
            break;

        case 'auth.me':
            $user = require_login();
            respond(['ok' => true, 'user' => $user]);
            break;

        case 'memo.list':
            $user = require_login();
            $stmt = db()->prepare('SELECT id, title, tag_path, updated_at FROM notes WHERE user_id = :uid AND is_archived = 0 ORDER BY updated_at DESC LIMIT 100');
            $stmt->execute(['uid' => $user['id']]);
            respond(['ok' => true, 'notes' => $stmt->fetchAll()]);
            break;

        case 'memo.load':
            $user = require_login();
            $id = (int) ($_GET['id'] ?? $payload['id'] ?? 0);
            if ($id <= 0) {
                bad_request('id is required.');
            }

            $stmt = db()->prepare('SELECT id, title, tag_path, content_json, updated_at FROM notes WHERE id = :id AND user_id = :uid LIMIT 1');
            $stmt->execute(['id' => $id, 'uid' => $user['id']]);
            $note = $stmt->fetch();
            if (!$note) {
                respond(['ok' => false, 'error' => 'Not found'], 404);
            }
            $note['content_json'] = json_decode((string) $note['content_json'], true);
            respond(['ok' => true, 'note' => $note]);
            break;

        case 'memo.save':
            only_method($method, ['POST']);
            $user = require_login();
            $id = (int) ($payload['id'] ?? 0);
            $title = trim((string) ($payload['title'] ?? '無題メモ'));
            $tagPath = trim((string) ($payload['tag_path'] ?? 'inbox'));
            $contentJson = $payload['content_json'] ?? null;

            if (!is_array($contentJson)) {
                bad_request('content_json must be object.');
            }

            $json = json_encode($contentJson, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) {
                bad_request('Invalid content_json.');
            }

            if ($id > 0) {
                $stmt = db()->prepare('UPDATE notes SET title = :title, tag_path = :tag, content_json = :json WHERE id = :id AND user_id = :uid');
                $stmt->execute([
                    'title' => mb_substr($title, 0, 255),
                    'tag' => mb_substr($tagPath !== '' ? $tagPath : 'inbox', 0, 255),
                    'json' => $json,
                    'id' => $id,
                    'uid' => $user['id'],
                ]);
                respond(['ok' => true, 'id' => $id, 'updated' => $stmt->rowCount() > 0]);
            }

            $stmt = db()->prepare('INSERT INTO notes (user_id, title, tag_path, content_json) VALUES (:uid, :title, :tag, :json)');
            $stmt->execute([
                'uid' => $user['id'],
                'title' => mb_substr($title, 0, 255),
                'tag' => mb_substr($tagPath !== '' ? $tagPath : 'inbox', 0, 255),
                'json' => $json,
            ]);
            respond(['ok' => true, 'id' => (int) db()->lastInsertId(), 'created' => true], 201);
            break;

        case 'monitor.list':
            $user = require_login();
            $stmt = db()->prepare('SELECT id, target_name, target_type, target_value, last_status, last_latency_ms, last_checked_at, last_error FROM monitoring WHERE user_id = :uid ORDER BY id DESC LIMIT 100');
            $stmt->execute(['uid' => $user['id']]);
            respond(['ok' => true, 'targets' => $stmt->fetchAll()]);
            break;

        case 'monitor.save':
            only_method($method, ['POST']);
            $user = require_login();
            $name = trim((string) ($payload['target_name'] ?? ''));
            $type = (string) ($payload['target_type'] ?? 'url');
            $value = trim((string) ($payload['target_value'] ?? ''));

            if ($name === '' || $value === '' || !in_array($type, ['ip', 'url'], true)) {
                bad_request('target_name, target_type(ip|url), target_value are required.');
            }

            $stmt = db()->prepare('INSERT INTO monitoring (user_id, target_name, target_type, target_value) VALUES (:uid, :name, :type, :value)');
            $stmt->execute([
                'uid' => $user['id'],
                'name' => mb_substr($name, 0, 100),
                'type' => $type,
                'value' => mb_substr($value, 0, 255),
            ]);
            respond(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
            break;

        case 'monitor.run':
            only_method($method, ['POST']);
            $user = require_login();
            $id = (int) ($payload['id'] ?? 0);
            if ($id <= 0) {
                bad_request('id is required.');
            }

            $stmt = db()->prepare('SELECT id, target_type, target_value, timeout_ms FROM monitoring WHERE id = :id AND user_id = :uid LIMIT 1');
            $stmt->execute(['id' => $id, 'uid' => $user['id']]);
            $target = $stmt->fetch();
            if (!$target) {
                respond(['ok' => false, 'error' => 'Not found'], 404);
            }

            $result = check_target($target['target_type'], $target['target_value'], (int) $target['timeout_ms']);

            $update = db()->prepare('UPDATE monitoring SET last_status = :status, last_latency_ms = :latency, last_checked_at = NOW(), last_error = :error WHERE id = :id');
            $update->execute([
                'status' => $result['status'],
                'latency' => $result['latency_ms'],
                'error' => $result['error'],
                'id' => $id,
            ]);

            $log = db()->prepare('INSERT INTO monitoring_logs (monitoring_id, checked_at, status, latency_ms, error_message) VALUES (:mid, NOW(), :status, :latency, :error)');
            $log->execute([
                'mid' => $id,
                'status' => $result['status'],
                'latency' => $result['latency_ms'],
                'error' => $result['error'],
            ]);

            respond(['ok' => true, 'result' => $result]);
            break;

        default:
            respond(['ok' => false, 'error' => 'Unknown action'], 404);
    }
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => 'Server error', 'detail' => $e->getMessage()], 500);
}

function initialize_setup(array $payload): void
{
    $siteName = trim((string) ($payload['site_name'] ?? 'MEMOMO'));
    $defaultTag = trim((string) ($payload['default_tag'] ?? 'inbox'));
    $email = mb_strtolower(trim((string) ($payload['admin_email'] ?? '')));
    $password = (string) ($payload['admin_password'] ?? '');

    if ($email === '' || $password === '') {
        bad_request('admin_email and admin_password are required.');
    }

    $pdo = db();
    $pdo->beginTransaction();

    $stmt = $pdo->prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (:email, :hash, 1)');
    $stmt->execute([
        'email' => $email,
        'hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);

    set_app_setting('site_name', mb_substr($siteName, 0, 100));
    set_app_setting('default_tag', mb_substr($defaultTag !== '' ? $defaultTag : 'inbox', 0, 255));

    upsert_providers($payload['providers'] ?? []);

    $pdo->commit();
}

function update_setup_settings(array $payload): void
{
    if (isset($payload['site_name'])) {
        set_app_setting('site_name', mb_substr(trim((string) $payload['site_name']), 0, 100));
    }
    if (isset($payload['default_tag'])) {
        $tag = trim((string) $payload['default_tag']);
        set_app_setting('default_tag', mb_substr($tag !== '' ? $tag : 'inbox', 0, 255));
    }

    if (isset($payload['providers']) && is_array($payload['providers'])) {
        upsert_providers($payload['providers']);
    }
}

function upsert_providers(array $providers): void
{
    foreach (['google', 'github'] as $providerName) {
        $row = $providers[$providerName] ?? null;
        if (!is_array($row)) {
            continue;
        }

        $stmt = db()->prepare('INSERT INTO oauth_providers (provider, enabled, client_id, client_secret, redirect_uri) VALUES (:provider, :enabled, :client_id, :client_secret, :redirect_uri) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), client_id = VALUES(client_id), client_secret = VALUES(client_secret), redirect_uri = VALUES(redirect_uri)');
        $stmt->execute([
            'provider' => $providerName,
            'enabled' => !empty($row['enabled']) ? 1 : 0,
            'client_id' => trim((string) ($row['client_id'] ?? '')),
            'client_secret' => trim((string) ($row['client_secret'] ?? '')),
            'redirect_uri' => trim((string) ($row['redirect_uri'] ?? '')),
        ]);
    }
}

function create_social_auth_url(string $provider): string
{
    $providerConfig = get_social_provider($provider);
    if (!$providerConfig || (int) $providerConfig['enabled'] !== 1) {
        bad_request('provider is not available.');
    }

    $clientId = (string) $providerConfig['client_id'];
    $redirectUri = (string) $providerConfig['redirect_uri'];

    if ($clientId === '' || $redirectUri === '') {
        bad_request('provider configuration is incomplete.');
    }

    $state = bin2hex(random_bytes(24));
    $_SESSION['oauth_state_' . $provider] = $state;

    if ($provider === 'google') {
        $params = [
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'access_type' => 'online',
            'prompt' => 'select_account',
        ];
        return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
    }

    if ($provider === 'github') {
        $params = [
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'scope' => 'read:user user:email',
            'state' => $state,
        ];
        return 'https://github.com/login/oauth/authorize?' . http_build_query($params);
    }

    bad_request('unsupported provider.');
}

function handle_social_callback(): void
{
    $provider = trim((string) ($_GET['provider'] ?? ''));
    $code = trim((string) ($_GET['code'] ?? ''));
    $state = trim((string) ($_GET['state'] ?? ''));

    if ($provider === '' || $code === '' || $state === '') {
        social_redirect('/?social_error=invalid_callback');
    }

    $expectedState = (string) ($_SESSION['oauth_state_' . $provider] ?? '');
    unset($_SESSION['oauth_state_' . $provider]);

    if ($expectedState === '' || !hash_equals($expectedState, $state)) {
        social_redirect('/?social_error=invalid_state');
    }

    $providerConfig = get_social_provider($provider);
    if (!$providerConfig || (int) $providerConfig['enabled'] !== 1) {
        social_redirect('/?social_error=provider_disabled');
    }

    $profile = oauth_profile($provider, (string) $providerConfig['client_id'], (string) $providerConfig['client_secret'], (string) $providerConfig['redirect_uri'], $code);
    $providerUid = trim((string) ($profile['provider_uid'] ?? ''));
    $email = mb_strtolower(trim((string) ($profile['email'] ?? '')));

    if ($providerUid === '' || $email === '') {
        social_redirect('/?social_error=profile_failed');
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT u.id, u.email, u.is_admin FROM social_accounts s INNER JOIN users u ON u.id = s.user_id WHERE s.provider = :p AND s.provider_user_id = :uid LIMIT 1');
    $stmt->execute(['p' => $provider, 'uid' => $providerUid]);
    $user = $stmt->fetch();

    if (!$user) {
        $stmt = $pdo->prepare('SELECT id, email, is_admin FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if (!$user) {
            $create = $pdo->prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (:email, :hash, 0)');
            $create->execute([
                'email' => $email,
                'hash' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
            ]);
            $user = [
                'id' => (int) $pdo->lastInsertId(),
                'email' => $email,
                'is_admin' => 0,
            ];
        }

        $link = $pdo->prepare('INSERT INTO social_accounts (user_id, provider, provider_user_id, provider_email) VALUES (:user_id, :provider, :provider_uid, :provider_email) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), provider_email = VALUES(provider_email)');
        $link->execute([
            'user_id' => $user['id'],
            'provider' => $provider,
            'provider_uid' => $providerUid,
            'provider_email' => $email,
        ]);
    }

    do_login_session($user);
    social_redirect('/');
}

function oauth_profile(string $provider, string $clientId, string $clientSecret, string $redirectUri, string $code): array
{
    if ($provider === 'google') {
        $token = http_form('https://oauth2.googleapis.com/token', [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'code' => $code,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ]);
        $accessToken = (string) ($token['access_token'] ?? '');
        $idToken = (string) ($token['id_token'] ?? '');

        if ($accessToken === '' && $idToken === '') {
            return [];
        }

        $userinfo = http_get_json('https://openidconnect.googleapis.com/v1/userinfo', ['Authorization: Bearer ' . $accessToken]);
        return [
            'provider_uid' => $userinfo['sub'] ?? '',
            'email' => $userinfo['email'] ?? '',
        ];
    }

    if ($provider === 'github') {
        $token = http_form('https://github.com/login/oauth/access_token', [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'code' => $code,
            'redirect_uri' => $redirectUri,
        ], ['Accept: application/json']);
        $accessToken = (string) ($token['access_token'] ?? '');

        if ($accessToken === '') {
            return [];
        }

        $user = http_get_json('https://api.github.com/user', [
            'Authorization: Bearer ' . $accessToken,
            'User-Agent: memomo-app',
            'Accept: application/vnd.github+json',
        ]);
        $emails = http_get_json('https://api.github.com/user/emails', [
            'Authorization: Bearer ' . $accessToken,
            'User-Agent: memomo-app',
            'Accept: application/vnd.github+json',
        ]);

        $primaryEmail = '';
        if (is_array($emails)) {
            foreach ($emails as $row) {
                if (!empty($row['primary']) && !empty($row['verified']) && !empty($row['email'])) {
                    $primaryEmail = (string) $row['email'];
                    break;
                }
            }
        }

        return [
            'provider_uid' => (string) ($user['id'] ?? ''),
            'email' => $primaryEmail,
        ];
    }

    return [];
}

function http_form(string $url, array $params, array $headers = []): array
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/x-www-form-urlencoded'], $headers),
        CURLOPT_POSTFIELDS => http_build_query($params),
    ]);
    $response = curl_exec($ch);
    $errno = curl_errno($ch);
    curl_close($ch);

    if ($errno || !is_string($response)) {
        return [];
    }

    $json = json_decode($response, true);
    return is_array($json) ? $json : [];
}

function http_get_json(string $url, array $headers = []): array
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    $response = curl_exec($ch);
    $errno = curl_errno($ch);
    curl_close($ch);

    if ($errno || !is_string($response)) {
        return [];
    }

    $json = json_decode($response, true);
    return is_array($json) ? $json : [];
}

function social_redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

function check_target(string $targetType, string $targetValue, int $timeoutMs): array
{
    $start = microtime(true);
    $timeoutSec = max(1, (int) ceil($timeoutMs / 1000));

    if ($targetType === 'ip') {
        $conn = @fsockopen($targetValue, 80, $errno, $errstr, $timeoutSec);
        $latency = (int) round((microtime(true) - $start) * 1000);

        if ($conn) {
            fclose($conn);
            return ['status' => 'up', 'latency_ms' => $latency, 'error' => null];
        }

        return ['status' => 'down', 'latency_ms' => $latency, 'error' => sprintf('%s (%d)', $errstr, $errno)];
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $targetValue,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT_MS => $timeoutMs,
        CURLOPT_TIMEOUT_MS => $timeoutMs,
        CURLOPT_NOBODY => true,
    ]);
    curl_exec($ch);
    $errno = curl_errno($ch);
    $error = $errno ? curl_error($ch) : null;
    $httpCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $latency = (int) round((microtime(true) - $start) * 1000);
    curl_close($ch);

    $isUp = !$errno && $httpCode >= 200 && $httpCode < 500;

    return [
        'status' => $isUp ? 'up' : 'down',
        'latency_ms' => $latency,
        'error' => $isUp ? null : ($error ?: 'HTTP ' . $httpCode),
    ];
}

function only_method(string $method, array $allowed): void
{
    if (in_array($method, $allowed, true)) {
        return;
    }

    http_response_code(405);
    header('Allow: ' . implode(', ', $allowed));
    echo json_encode(['ok' => false, 'error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

function bad_request(string $message): void
{
    respond(['ok' => false, 'error' => $message], 400);
}

function respond(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
