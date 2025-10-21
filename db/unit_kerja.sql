/*
 Navicat Premium Data Transfer

 Source Server         : Master N
 Source Server Type    : MySQL
 Source Server Version : 50744 (5.7.44-log)
 Source Host           : 192.168.0.3:3939
 Source Schema         : signon_db

 Target Server Type    : MySQL
 Target Server Version : 50744 (5.7.44-log)
 File Encoding         : 65001

 Date: 21/10/2025 20:31:11
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for unit_kerja
-- ----------------------------
DROP TABLE IF EXISTS `unit_kerja`;
CREATE TABLE `unit_kerja`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `deskripsi` text CHARACTER SET utf8 COLLATE utf8_general_ci NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `uses_shift_system` tinyint(1) NULL DEFAULT 0 COMMENT 'Apakah unit ini menggunakan sistem shift',
  `shift_pagi_path` varchar(500) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT 'Path SIMRS untuk shift pagi (08:00-16:30)',
  `shift_malam_path` varchar(500) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT 'Path SIMRS untuk shift malam (16:30-08:00)',
  `shift_enabled` tinyint(1) NULL DEFAULT 0 COMMENT 'Status aktif sistem shift untuk unit ini',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `nama`(`nama`) USING BTREE,
  INDEX `idx_unit_kerja_shift`(`uses_shift_system`, `shift_enabled`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 47 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = COMPACT;

-- ----------------------------
-- Records of unit_kerja
-- ----------------------------
INSERT INTO `unit_kerja` VALUES (1, 'Dokter', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (2, 'Anggrek', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (3, 'Poli Paru', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (4, 'UTD', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (5, '-', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (6, 'Alamanda / Penyakit Dalam', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (7, 'Mawar', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (8, 'Perawat IGD', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (9, 'Poli Kandungan', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (10, 'Kasir', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (11, 'ICU', NULL, '2025-05-22 04:38:18', '2025-10-21 19:59:51', 1, 'C:\\SIMRS\\Pagi\\simrs_pagi.exe', 'C:\\SIMRS\\Malam\\simrs_malam.exe', 1);
INSERT INTO `unit_kerja` VALUES (12, 'Fisioterapi', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (13, 'Ruang OK', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (14, 'Kenanga / ZAAL', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (15, 'Poli THT', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (16, 'Teratai', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (17, 'Poli Penyakit Dalam', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (18, 'CSSD', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (19, 'Perawat Kesehatan', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (20, 'Radiologi', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (21, 'Poli Kulit & Kelamin', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (22, 'GIZI', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (23, 'Poli Geriatri', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (24, 'Depo Rawat Inap', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (25, 'Loket', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (26, 'Dahlia / Operasi Bedah', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (27, 'Rekam Medis', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (28, 'Dokter Radiologi', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (29, 'Poli Anak', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (30, 'Poli Tindakan', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (31, 'Poli Jiwa', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (32, 'Poli Gigi', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (33, 'Poli Bedah', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (34, 'Poli Mata', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (35, 'Laboratorium', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (36, 'Patologi Anatomi', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (37, 'POLI VAKSIN', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (38, 'Poli Orthopedi', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (39, 'Loket BPJS', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (40, 'Poli Umum', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (41, 'Gudang Obat', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (42, 'Poli Syaraf', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (43, 'Poli PDP HIV', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (44, 'Keuangan', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (45, 'Apotek', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);
INSERT INTO `unit_kerja` VALUES (46, 'Fisioterapis', NULL, '2025-05-22 04:38:18', '2025-05-22 04:38:18', 0, NULL, NULL, 0);

SET FOREIGN_KEY_CHECKS = 1;
