const { app, dialog } = require('electron');
const log = require('electron-log');
const path = require('path');
const fs = require('fs').promises;
const { SimrsUsage, ShiftLog, User, UnitKerja } = require('../models');
const shiftService = require('./shift_service');

class RecoveryService {
  constructor() {
    this.backupPath = path.join(app.getPath('userData'), 'backup');
    this.recoveryInProgress = false;
  }

  /**
   * Inisialisasi recovery service saat aplikasi startup
   */
  async initialize() {
    try {
      log.info('Menginisialisasi recovery service...');
      
      // Cek apakah ada backup yang perlu di-recover
      const latestBackup = await this.findLatestBackup();
      
      if (latestBackup) {
        const shouldRecover = await this.shouldAutoRecover(latestBackup);
        
        if (shouldRecover) {
          await this.performRecovery(latestBackup);
        }
      }
      
      log.info('Recovery service berhasil diinisialisasi');
      
    } catch (error) {
      log.error('Error inisialisasi recovery service:', error);
    }
  }

  /**
   * Mencari backup terbaru
   */
  async findLatestBackup() {
    try {
      const backupFiles = await fs.readdir(this.backupPath);
      const appStateFiles = backupFiles
        .filter(file => file.startsWith('app-state-') && file.endsWith('.json'))
        .sort((a, b) => {
          const timeA = parseInt(a.match(/app-state-(\d+)\.json/)[1]);
          const timeB = parseInt(b.match(/app-state-(\d+)\.json/)[1]);
          return timeB - timeA; // Sort descending (newest first)
        });

      if (appStateFiles.length === 0) {
        return null;
      }

      const latestFile = path.join(this.backupPath, appStateFiles[0]);
      const backupData = JSON.parse(await fs.readFile(latestFile, 'utf8'));
      
      return {
        file: latestFile,
        data: backupData,
        timestamp: new Date(backupData.timestamp)
      };
      
    } catch (error) {
      log.error('Error mencari backup terbaru:', error);
      return null;
    }
  }

  /**
   * Menentukan apakah harus melakukan auto-recovery
   */
  async shouldAutoRecover(backup) {
    try {
      // Cek apakah backup dibuat dalam 10 menit terakhir
      const now = new Date();
      const backupAge = now.getTime() - backup.timestamp.getTime();
      const maxAge = 10 * 60 * 1000; // 10 menit

      if (backupAge > maxAge) {
        log.info('Backup terlalu lama, tidak melakukan auto-recovery');
        return false;
      }

      // Cek apakah backup dibuat karena auto-restart
      if (backup.data.reason !== 'auto-restart') {
        log.info('Backup bukan dari auto-restart, tidak melakukan auto-recovery');
        return false;
      }

      // Cek apakah ada sesi aktif yang perlu di-recover
      if (!backup.data.activeSessions || backup.data.activeSessions.length === 0) {
        log.info('Tidak ada sesi aktif untuk di-recover');
        return false;
      }

      return true;
      
    } catch (error) {
      log.error('Error menentukan auto-recovery:', error);
      return false;
    }
  }

  /**
   * Melakukan recovery dari backup
   */
  async performRecovery(backup) {
    if (this.recoveryInProgress) {
      log.warn('Recovery sudah dalam proses');
      return;
    }

    this.recoveryInProgress = true;
    
    try {
      log.info('Memulai proses recovery...');
      
      // Tampilkan dialog recovery jika dikonfigurasi
      const shouldProceed = await this.showRecoveryDialog(backup);
      
      if (!shouldProceed) {
        log.info('Recovery dibatalkan oleh user');
        return;
      }

      // Recovery sesi SIMRS aktif
      await this.recoverActiveSessions(backup.data.activeSessions);
      
      // Recovery state aplikasi lainnya
      await this.recoverApplicationState(backup.data);
      
      // Cleanup backup file setelah berhasil
      await this.cleanupBackupFile(backup.file);
      
      log.info('Recovery berhasil diselesaikan');
      
      // Tampilkan notifikasi sukses
      dialog.showMessageBox({
        type: 'info',
        title: 'Recovery Berhasil',
        message: 'Aplikasi berhasil dipulihkan dari backup terakhir.',
        detail: `${backup.data.activeSessions.length} sesi SIMRS telah dipulihkan.`,
        buttons: ['OK']
      });
      
    } catch (error) {
      log.error('Error dalam proses recovery:', error);
      
      dialog.showErrorBox(
        'Error Recovery',
        `Gagal melakukan recovery: ${error.message}`
      );
    } finally {
      this.recoveryInProgress = false;
    }
  }

  /**
   * Menampilkan dialog recovery
   */
  async showRecoveryDialog(backup) {
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Recovery Aplikasi',
      message: 'Aplikasi terdeteksi restart karena pergantian shift.',
      detail: `Ditemukan ${backup.data.activeSessions.length} sesi SIMRS yang dapat dipulihkan.\n\nApakah Anda ingin memulihkan sesi tersebut?`,
      buttons: ['Ya, Pulihkan', 'Tidak, Mulai Baru'],
      defaultId: 0,
      cancelId: 1
    });

    return result.response === 0;
  }

  /**
   * Recovery sesi SIMRS aktif
   */
  async recoverActiveSessions(activeSessions) {
    log.info(`Memulihkan ${activeSessions.length} sesi SIMRS aktif...`);
    
    for (const sessionData of activeSessions) {
      try {
        // Cek apakah user dan unit masih valid
        const user = await User.findByPk(sessionData.user_id);
        const unit = await UnitKerja.findByPk(sessionData.unit_kerja_id);
        
        if (!user || !unit) {
          log.warn(`User atau unit tidak ditemukan untuk sesi ${sessionData.id}, skip recovery`);
          continue;
        }

        // Dapatkan shift saat ini
        const currentShift = await shiftService.getCurrentShift();
        const shiftName = currentShift ? currentShift.shift_name : sessionData.current_shift;

        // Buat sesi baru dengan data recovery
        const newSession = await SimrsUsage.create({
          user_id: sessionData.user_id,
          unit_kerja_id: sessionData.unit_kerja_id,
          ip_address: sessionData.ip_address,
          start_time: new Date(),
          status: 'active',
          current_shift: shiftName,
          shift_auto_started: true,
          notes: `Dipulihkan dari backup setelah restart otomatis (sesi asli: ${sessionData.id})`
        });

        // Catat log recovery
        await ShiftLog.create({
          unit_kerja_id: sessionData.unit_kerja_id,
          user_id: sessionData.user_id,
          old_shift: sessionData.current_shift,
          new_shift: shiftName,
          old_simrs_session_id: sessionData.id,
          new_simrs_session_id: newSession.id,
          shift_change_time: new Date(),
          auto_switched: true,
          notes: `Recovery sesi setelah restart otomatis`
        });

        // Jalankan SIMRS jika path tersedia
        const simrsPath = unit.getSimrsPathForShift(shiftName);
        if (simrsPath) {
          await shiftService.launchSimrs(simrsPath);
          log.info(`SIMRS berhasil diluncurkan untuk unit ${unit.nama} shift ${shiftName}`);
        }

        log.info(`Sesi SIMRS berhasil dipulihkan: ${newSession.id} (unit: ${unit.nama})`);
        
      } catch (error) {
        log.error(`Error recovery sesi ${sessionData.id}:`, error);
      }
    }
  }

  /**
   * Recovery state aplikasi lainnya
   */
  async recoverApplicationState(backupData) {
    try {
      log.info('Memulihkan state aplikasi...');
      
      // Recovery preferences, window state, dll bisa ditambahkan di sini
      // Untuk saat ini, fokus pada sesi SIMRS
      
      log.info('State aplikasi berhasil dipulihkan');
      
    } catch (error) {
      log.error('Error recovery state aplikasi:', error);
    }
  }

  /**
   * Cleanup backup file setelah recovery berhasil
   */
  async cleanupBackupFile(backupFile) {
    try {
      await fs.unlink(backupFile);
      log.info(`Backup file dihapus: ${backupFile}`);
    } catch (error) {
      log.error('Error menghapus backup file:', error);
    }
  }

  /**
   * Cleanup backup lama
   */
  async cleanupOldBackups(retentionDays = 7) {
    try {
      const backupFiles = await fs.readdir(this.backupPath);
      const now = new Date();
      const maxAge = retentionDays * 24 * 60 * 60 * 1000;

      for (const file of backupFiles) {
        if (!file.startsWith('app-state-') || !file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.backupPath, file);
        const stats = await fs.stat(filePath);
        const fileAge = now.getTime() - stats.mtime.getTime();

        if (fileAge > maxAge) {
          await fs.unlink(filePath);
          log.info(`Backup lama dihapus: ${file}`);
        }
      }
      
    } catch (error) {
      log.error('Error cleanup backup lama:', error);
    }
  }

  /**
   * Manual recovery dari backup tertentu
   */
  async manualRecovery(backupFile) {
    try {
      const backupData = JSON.parse(await fs.readFile(backupFile, 'utf8'));
      const backup = {
        file: backupFile,
        data: backupData,
        timestamp: new Date(backupData.timestamp)
      };

      await this.performRecovery(backup);
      
    } catch (error) {
      log.error('Error manual recovery:', error);
      throw error;
    }
  }

  /**
   * Mendapatkan daftar backup yang tersedia
   */
  async getAvailableBackups() {
    try {
      const backupFiles = await fs.readdir(this.backupPath);
      const backups = [];

      for (const file of backupFiles) {
        if (!file.startsWith('app-state-') || !file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.backupPath, file);
        const backupData = JSON.parse(await fs.readFile(filePath, 'utf8'));
        
        backups.push({
          file: filePath,
          timestamp: new Date(backupData.timestamp),
          reason: backupData.reason,
          sessionCount: backupData.activeSessions ? backupData.activeSessions.length : 0,
          currentShift: backupData.currentShift ? backupData.currentShift.shift_name : 'Unknown'
        });
      }

      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
    } catch (error) {
      log.error('Error mendapatkan daftar backup:', error);
      return [];
    }
  }
}

// Export singleton instance
module.exports = new RecoveryService();