<?php

declare(strict_types=1);

require_once __DIR__ . '/../../auth.php';

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

$targets = db()->query('SELECT id, target_type, target_value, timeout_ms FROM monitoring')->fetchAll();
$update = db()->prepare('UPDATE monitoring SET last_status = :status, last_latency_ms = :latency, last_checked_at = NOW(), last_error = :error WHERE id = :id');
$insert = db()->prepare('INSERT INTO monitoring_logs (monitoring_id, checked_at, status, latency_ms, error_message) VALUES (:id, NOW(), :status, :latency, :error)');

foreach ($targets as $target) {
    $result = check_target((string) $target['target_type'], (string) $target['target_value'], (int) $target['timeout_ms']);
    $update->execute([
        'status' => $result['status'],
        'latency' => $result['latency_ms'],
        'error' => $result['error'],
        'id' => $target['id'],
    ]);
    $insert->execute([
        'id' => $target['id'],
        'status' => $result['status'],
        'latency' => $result['latency_ms'],
        'error' => $result['error'],
    ]);
}

echo sprintf("checked=%d\n", count($targets));
