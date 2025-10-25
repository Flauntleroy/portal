-- Presence schema update: stabilize online lists and reduce flicker
-- Adds status indexes and enforces unique socket_id; includes optional timestamp defaults

START TRANSACTION;

-- 1) Indexes to speed up presence queries
ALTER TABLE `online_users`
  ADD INDEX `idx_online_users_status` (`status`),
  ADD INDEX `idx_online_users_status_user` (`status`, `user_id`);

-- 2) Deduplicate socket_id so unique constraint can be applied
--    Keeps the newest row per socket_id (highest id)
DELETE ou1 FROM `online_users` ou1
INNER JOIN `online_users` ou2
  ON ou1.`socket_id` = ou2.`socket_id`
 AND ou1.`id` < ou2.`id`;

-- 3) Enforce uniqueness of socket_id to prevent duplicate online entries
ALTER TABLE `online_users`
  ADD UNIQUE KEY `uk_online_users_socket_id` (`socket_id`);

-- 4) Optional: default timestamps for presence events
--    Adjust types if needed depending on MySQL/MariaDB version compatibility
ALTER TABLE `online_users`
  MODIFY `connected_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY `last_active` DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

COMMIT;

-- Optional cleanup: remove stale offline rows older than 30 days
-- DELETE FROM `online_users`
--   WHERE `status` = 'offline' AND `disconnected_at` IS NOT NULL
--     AND `disconnected_at` < NOW() - INTERVAL 30 DAY;