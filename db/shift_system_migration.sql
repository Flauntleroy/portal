-- Migration SQL untuk Sistem Shift SIMRS
-- Menambahkan tabel dan kolom yang diperlukan untuk sistem shift

-- 1. Menambahkan kolom shift configuration ke tabel unit_kerja
ALTER TABLE unit_kerja 
ADD COLUMN uses_shift_system BOOLEAN DEFAULT FALSE COMMENT 'Apakah unit ini menggunakan sistem shift',
ADD COLUMN shift_pagi_path VARCHAR(500) NULL COMMENT 'Path SIMRS untuk shift pagi (08:00-16:30)',
ADD COLUMN shift_malam_path VARCHAR(500) NULL COMMENT 'Path SIMRS untuk shift malam (16:30-08:00)',
ADD COLUMN shift_enabled BOOLEAN DEFAULT FALSE COMMENT 'Status aktif sistem shift untuk unit ini';

-- 2. Membuat tabel shift_schedules untuk konfigurasi jadwal shift
CREATE TABLE shift_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shift_name VARCHAR(50) NOT NULL COMMENT 'Nama shift (pagi/malam)',
  start_time TIME NOT NULL COMMENT 'Waktu mulai shift',
  end_time TIME NOT NULL COMMENT 'Waktu selesai shift',
  is_overnight BOOLEAN DEFAULT FALSE COMMENT 'Apakah shift melewati tengah malam',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Membuat tabel shift_logs untuk tracking pergantian shift
CREATE TABLE shift_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unit_kerja_id INT NOT NULL,
  user_id INT NOT NULL,
  old_shift VARCHAR(50) NULL COMMENT 'Shift sebelumnya',
  new_shift VARCHAR(50) NOT NULL COMMENT 'Shift baru',
  old_simrs_session_id INT NULL COMMENT 'ID sesi SIMRS yang ditutup',
  new_simrs_session_id INT NULL COMMENT 'ID sesi SIMRS yang dibuka',
  shift_change_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  auto_switched BOOLEAN DEFAULT TRUE COMMENT 'Apakah pergantian otomatis atau manual',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (unit_kerja_id) REFERENCES unit_kerja(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (old_simrs_session_id) REFERENCES simrs_usage(id) ON DELETE SET NULL,
  FOREIGN KEY (new_simrs_session_id) REFERENCES simrs_usage(id) ON DELETE SET NULL
);

-- 4. Menambahkan kolom current_shift ke tabel simrs_usage
ALTER TABLE simrs_usage 
ADD COLUMN current_shift VARCHAR(50) NULL COMMENT 'Shift saat sesi SIMRS dimulai',
ADD COLUMN shift_auto_started BOOLEAN DEFAULT FALSE COMMENT 'Apakah sesi dimulai otomatis karena pergantian shift';

-- 5. Insert data default untuk shift schedules
INSERT INTO shift_schedules (shift_name, start_time, end_time, is_overnight) VALUES
('pagi', '08:00:00', '16:30:00', FALSE),
('malam', '16:30:00', '08:00:00', TRUE);

-- 6. Membuat index untuk performa yang lebih baik
CREATE INDEX idx_unit_kerja_shift ON unit_kerja(uses_shift_system, shift_enabled);
CREATE INDEX idx_shift_logs_unit_time ON shift_logs(unit_kerja_id, shift_change_time);
CREATE INDEX idx_simrs_usage_shift ON simrs_usage(current_shift, status);

-- 7. Update beberapa unit kerja sebagai contoh yang menggunakan sistem shift
-- (Anda bisa menyesuaikan unit mana saja yang perlu menggunakan sistem shift)
UPDATE unit_kerja 
SET uses_shift_system = TRUE, 
    shift_enabled = TRUE,
    shift_pagi_path = 'C:\\SIMRS\\Pagi\\simrs_pagi.exe',
    shift_malam_path = 'C:\\SIMRS\\Malam\\simrs_malam.exe'
WHERE nama IN ('IGD', 'ICU', 'NICU', 'Ruang Bersalin', 'OK');

-- 8. Menambahkan trigger untuk auto-update timestamp
DELIMITER $$
CREATE TRIGGER shift_schedules_updated_at 
BEFORE UPDATE ON shift_schedules 
FOR EACH ROW 
BEGIN 
    SET NEW.updated_at = CURRENT_TIMESTAMP; 
END$$
DELIMITER ;

-- 9. Membuat view untuk mempermudah query shift aktif
CREATE VIEW active_shifts AS
SELECT 
    uk.id as unit_kerja_id,
    uk.nama as unit_nama,
    uk.uses_shift_system,
    uk.shift_enabled,
    uk.shift_pagi_path,
    uk.shift_malam_path,
    CASE 
        WHEN uk.uses_shift_system = TRUE AND uk.shift_enabled = TRUE THEN
            CASE 
                WHEN TIME(NOW()) >= '08:00:00' AND TIME(NOW()) < '16:30:00' THEN 'pagi'
                ELSE 'malam'
            END
        ELSE NULL
    END as current_shift,
    CASE 
        WHEN uk.uses_shift_system = TRUE AND uk.shift_enabled = TRUE THEN
            CASE 
                WHEN TIME(NOW()) >= '08:00:00' AND TIME(NOW()) < '16:30:00' THEN uk.shift_pagi_path
                ELSE uk.shift_malam_path
            END
        ELSE NULL
    END as current_shift_path
FROM unit_kerja uk
WHERE uk.uses_shift_system = TRUE AND uk.shift_enabled = TRUE;