-- MEMOMO schema for MySQL 8.0
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  tag_path VARCHAR(255) NOT NULL DEFAULT 'inbox',
  content_json JSON NOT NULL,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notes_user_updated (user_id, updated_at),
  INDEX idx_notes_tag_path (tag_path),
  CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitoring (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  target_name VARCHAR(100) NOT NULL,
  target_type ENUM('ip', 'url') NOT NULL,
  target_value VARCHAR(255) NOT NULL,
  check_interval_sec INT UNSIGNED NOT NULL DEFAULT 60,
  timeout_ms INT UNSIGNED NOT NULL DEFAULT 3000,
  last_status ENUM('up', 'down', 'unknown') NOT NULL DEFAULT 'unknown',
  last_latency_ms INT UNSIGNED DEFAULT NULL,
  last_checked_at DATETIME DEFAULT NULL,
  last_error VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_monitoring_user (user_id),
  INDEX idx_monitoring_last_status (last_status),
  CONSTRAINT fk_monitoring_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitoring_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  monitoring_id BIGINT UNSIGNED NOT NULL,
  checked_at DATETIME NOT NULL,
  status ENUM('up', 'down') NOT NULL,
  latency_ms INT UNSIGNED DEFAULT NULL,
  error_message VARCHAR(255) DEFAULT NULL,
  INDEX idx_monitoring_logs_target_time (monitoring_id, checked_at),
  CONSTRAINT fk_monitoring_logs_monitoring FOREIGN KEY (monitoring_id) REFERENCES monitoring (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
