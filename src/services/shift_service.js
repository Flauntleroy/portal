const { ShiftSchedule, UnitKerja, SimrsUsage, ShiftLog, User } = require('../models');
const log = require('electron-log');
const { spawn } = require('child_process');
const path = require('path');

class ShiftService {
  constructor() {
    this.shiftCheckInterval = null;
    this.isMonitoring = false;
  }

  /**
   * Memulai monitoring shift otomatis
   * @param {number} intervalMinutes - Interval pengecekan dalam menit (default: 1)
   */
  startShiftMonitoring(intervalMinutes = 1) {
    if (this.isMonitoring) {
      log.info('Shift monitoring sudah berjalan');
      return;
    }

    this.isMonitoring = true;
    const intervalMs = intervalMinutes * 60 * 1000;

    log.info(`Memulai shift monitoring dengan interval ${intervalMinutes} menit`);

    this.shiftCheckInterval = setInterval(async () => {
      try {
        await this.checkAndHandleShiftChanges();
      } catch (error) {
        log.error('Error dalam shift monitoring:', error);
      }
    }, intervalMs);

    // Jalankan pengecekan pertama kali
    this.checkAndHandleShiftChanges();
  }

  /**
   * Menghentikan monitoring shift
   */
  stopShiftMonitoring() {
    if (this.shiftCheckInterval) {
      clearInterval(this.shiftCheckInterval);
      this.shiftCheckInterval = null;
      this.isMonitoring = false;
      log.info('Shift monitoring dihentikan');
    }
  }

  /**
   * Mendapatkan shift saat ini berdasarkan waktu
   */
  async getCurrentShift() {
    try {
      return await ShiftSchedule.getCurrentShift();
    } catch (error) {
      log.error('Error mendapatkan shift saat ini:', error);
      return null;
    }
  }

  /**
   * Mengecek apakah sedang dalam periode pergantian shift
   */
  async isShiftChangeTime(toleranceMinutes = 5) {
    try {
      return await ShiftSchedule.isShiftChangeTime(toleranceMinutes);
    } catch (error) {
      log.error('Error mengecek waktu pergantian shift:', error);
      return { isChangeTime: false, newShift: null, timeUntilChange: null };
    }
  }

  /**
   * Mengecek dan menangani pergantian shift untuk semua unit
   */
  async checkAndHandleShiftChanges() {
    try {
      const currentShift = await this.getCurrentShift();
      if (!currentShift) {
        log.warn('Tidak dapat menentukan shift saat ini');
        return;
      }

      const shiftEnabledUnits = await UnitKerja.getShiftEnabledUnits();
      
      for (const unit of shiftEnabledUnits) {
        await this.handleUnitShiftChange(unit, currentShift);
      }
    } catch (error) {
      log.error('Error dalam checkAndHandleShiftChanges:', error);
    }
  }

  /**
   * Menangani pergantian shift untuk unit tertentu
   */
  async handleUnitShiftChange(unit, currentShift) {
    try {
      // Cek apakah ada sesi SIMRS aktif untuk unit ini
      const activeSession = await SimrsUsage.getActiveSessionByUnit(unit.id);
      
      if (!activeSession) {
        // Tidak ada sesi aktif, tidak perlu pergantian
        return;
      }

      // Cek apakah shift saat ini berbeda dengan shift sesi aktif
      if (activeSession.current_shift === currentShift.shift_name) {
        // Shift sama, tidak perlu pergantian
        return;
      }

      log.info(`Pergantian shift terdeteksi untuk unit ${unit.nama}: ${activeSession.current_shift} -> ${currentShift.shift_name}`);

      // Lakukan pergantian shift
      await this.performShiftChange(unit, activeSession, currentShift);

    } catch (error) {
      log.error(`Error menangani pergantian shift untuk unit ${unit.nama}:`, error);
    }
  }

  /**
   * Melakukan pergantian shift
   */
  async performShiftChange(unit, oldSession, newShift) {
    try {
      // 1. Tutup sesi SIMRS lama
      await oldSession.closeSession(`Otomatis ditutup karena pergantian shift ke ${newShift.shift_name}`);
      log.info(`Sesi SIMRS lama ditutup untuk unit ${unit.nama}`);

      // 2. Dapatkan path SIMRS untuk shift baru
      const newSimrsPath = unit.getSimrsPathForShift(newShift.shift_name);
      if (!newSimrsPath) {
        log.warn(`Path SIMRS tidak ditemukan untuk shift ${newShift.shift_name} di unit ${unit.nama}`);
        return;
      }

      // 3. Buat sesi SIMRS baru
      const newSession = await SimrsUsage.create({
        user_id: oldSession.user_id,
        unit_kerja_id: unit.id,
        ip_address: oldSession.ip_address,
        start_time: new Date(),
        status: 'active',
        current_shift: newShift.shift_name,
        shift_auto_started: true,
        notes: `Otomatis dimulai karena pergantian shift dari ${oldSession.current_shift}`
      });

      // 4. Catat log pergantian shift
      await ShiftLog.create({
        unit_kerja_id: unit.id,
        user_id: oldSession.user_id,
        old_shift: oldSession.current_shift,
        new_shift: newShift.shift_name,
        old_simrs_session_id: oldSession.id,
        new_simrs_session_id: newSession.id,
        shift_change_time: new Date(),
        auto_switched: true,
        notes: `Pergantian otomatis dari ${oldSession.current_shift} ke ${newShift.shift_name}`
      });

      // 5. Jalankan SIMRS baru
      await this.launchSimrs(newSimrsPath);
      
      log.info(`Pergantian shift berhasil untuk unit ${unit.nama}: ${oldSession.current_shift} -> ${newShift.shift_name}`);

    } catch (error) {
      log.error(`Error melakukan pergantian shift untuk unit ${unit.nama}:`, error);
      throw error;
    }
  }

  /**
   * Menjalankan aplikasi SIMRS
   */
  async launchSimrs(simrsPath) {
    return new Promise((resolve, reject) => {
      try {
        log.info(`Menjalankan SIMRS: ${simrsPath}`);

        const simrsDir = path.dirname(simrsPath);
        const ext = path.extname(simrsPath).toLowerCase();

        let simrsProcess;
        if (ext === '.bat' || ext === '.cmd') {
          // Gunakan cmd.exe untuk menjalankan skrip batch dan tetap membuka window
          simrsProcess = spawn('cmd.exe', ['/c', 'start', '""', '/D', simrsDir, 'cmd.exe', '/K', simrsPath], {
            detached: true,
            windowsHide: false
          });
        } else {
          // Jalankan executable langsung dalam window baru
          simrsProcess = spawn('cmd.exe', ['/c', 'start', '""', '/D', simrsDir, simrsPath], {
            detached: true,
            windowsHide: false
          });
        }

        simrsProcess.unref();

        simrsProcess.on('error', (error) => {
          log.error('Error menjalankan SIMRS:', error);
          reject(error);
        });

        // Tunggu sebentar untuk memastikan proses berjalan
        setTimeout(() => {
          resolve();
        }, 2000);

      } catch (error) {
        log.error('Error launching SIMRS:', error);
        reject(error);
      }
    });
  }

  /**
   * Mendapatkan status shift untuk unit tertentu
   */
  async getUnitShiftStatus(unitId) {
    try {
      const unit = await UnitKerja.findByPk(unitId);
      if (!unit || !unit.uses_shift_system) {
        return {
          usesShiftSystem: false,
          currentShift: null,
          nextShiftChange: null,
          activeSession: null
        };
      }

      const currentShift = await this.getCurrentShift();
      const activeSession = await SimrsUsage.getActiveSessionByUnit(unitId);
      const shiftChangeInfo = await this.isShiftChangeTime();

      return {
        usesShiftSystem: true,
        currentShift: currentShift ? currentShift.shift_name : null,
        currentShiftPath: unit.getSimrsPathForShift(currentShift?.shift_name),
        nextShiftChange: shiftChangeInfo.isChangeTime ? shiftChangeInfo.newShift : null,
        timeUntilChange: shiftChangeInfo.timeUntilChange,
        activeSession: activeSession ? {
          id: activeSession.id,
          shift: activeSession.current_shift,
          startTime: activeSession.start_time,
          autoStarted: activeSession.shift_auto_started
        } : null
      };
    } catch (error) {
      log.error('Error mendapatkan status shift unit:', error);
      return null;
    }
  }

  /**
   * Mendapatkan riwayat pergantian shift untuk unit
   */
  async getShiftHistory(unitId, startDate = null, endDate = null) {
    try {
      return await ShiftLog.getShiftHistory(unitId, startDate, endDate);
    } catch (error) {
      log.error('Error mendapatkan riwayat shift:', error);
      return [];
    }
  }

  /**
   * Manual shift change - untuk pergantian manual oleh user
   */
  async manualShiftChange(unitId, userId, newShiftName) {
    try {
      const unit = await UnitKerja.findByPk(unitId);
      if (!unit || !unit.uses_shift_system) {
        throw new Error('Unit tidak menggunakan sistem shift');
      }

      const newShift = await ShiftSchedule.findOne({
        where: { shift_name: newShiftName }
      });

      if (!newShift) {
        throw new Error('Shift tidak ditemukan');
      }

      const activeSession = await SimrsUsage.getActiveSessionByUnit(unitId);
      if (!activeSession) {
        throw new Error('Tidak ada sesi SIMRS aktif');
      }

      // Lakukan pergantian shift manual
      await this.performManualShiftChange(unit, activeSession, newShift, userId);
      
      return { success: true, message: 'Pergantian shift manual berhasil' };
    } catch (error) {
      log.error('Error pergantian shift manual:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Melakukan pergantian shift manual
   */
  async performManualShiftChange(unit, oldSession, newShift, userId) {
    // Sama seperti performShiftChange tapi dengan flag auto_switched = false
    await oldSession.closeSession(`Manual ditutup untuk pergantian shift ke ${newShift.shift_name}`);
    
    const newSimrsPath = unit.getSimrsPathForShift(newShift.shift_name);
    if (!newSimrsPath) {
      throw new Error(`Path SIMRS tidak ditemukan untuk shift ${newShift.shift_name}`);
    }

    const newSession = await SimrsUsage.create({
      user_id: userId,
      unit_kerja_id: unit.id,
      ip_address: oldSession.ip_address,
      start_time: new Date(),
      status: 'active',
      current_shift: newShift.shift_name,
      shift_auto_started: false,
      notes: `Manual dimulai untuk shift ${newShift.shift_name}`
    });

    await ShiftLog.create({
      unit_kerja_id: unit.id,
      user_id: userId,
      old_shift: oldSession.current_shift,
      new_shift: newShift.shift_name,
      old_simrs_session_id: oldSession.id,
      new_simrs_session_id: newSession.id,
      shift_change_time: new Date(),
      auto_switched: false,
      notes: `Pergantian manual dari ${oldSession.current_shift} ke ${newShift.shift_name}`
    });

    await this.launchSimrs(newSimrsPath);
  }
}

// Export singleton instance
module.exports = new ShiftService();