<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';
$payload = json_input();

try {
    switch ($action) {
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
