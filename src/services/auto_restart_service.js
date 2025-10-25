const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const log = require('electron-log');
const path = require('path');
const fs = require('fs').promises;
const shiftService = require('./shift_service');
const { ShiftSchedule, SimrsUsage } = require('../models');

class AutoRestartService {
  constructor() {
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.restartWarningTimer = null;
    this.restartCountdownTimer = null;
    this.warningWindow = null;
    this.config = {
      warningMinutes: 5, // Peringatan 5 menit sebelum restart
      checkIntervalSeconds: 30, // Cek setiap 30 detik
      backupPath: path.join(app.getPath('userData'), 'backup'),
      enableAutoRestart: true,
      gracePeriodMinutes: 2 // Grace period untuk operasi yang sedang berjalan
    };
    this.pendingRestart = false;
    this.countdownSeconds = 0;
    // New: persist restart state to avoid relaunch loops
    this.stateFile = path.join(app.getPath('userData'), 'auto-restart-state.json');
    this.pendingShiftName = null;
    this.pendingShiftEndTime = null;
  }

  /**
   * Memulai monitoring auto-restart
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      log.info('Auto-restart monitoring sudah berjalan');
      return;
    }

    if (!this.config.enableAutoRestart) {
      log.info('Auto-restart dinonaktifkan dalam konfigurasi');
      return;
    }

    this.isMonitoring = true;
    log.info('Memulai auto-restart monitoring');

    // Mulai monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkShiftEndTime();
      } catch (error) {
        log.error('Error dalam auto-restart monitoring:', error);
      }
    }, this.config.checkIntervalSeconds * 1000);

    // Jalankan pengecekan pertama
    await this.checkShiftEndTime();
  }

  /**
   * Menghentikan monitoring auto-restart
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.restartWarningTimer) {
      clearTimeout(this.restartWarningTimer);
      this.restartWarningTimer = null;
    }

    if (this.restartCountdownTimer) {
      clearInterval(this.restartCountdownTimer);
      this.restartCountdownTimer = null;
    }

    if (this.warningWindow && !this.warningWindow.isDestroyed()) {
      this.warningWindow.close();
    }

    this.isMonitoring = false;
    this.pendingRestart = false;
    log.info('Auto-restart monitoring dihentikan');
  }

  /**
   * Setup IPC handlers untuk komunikasi dengan renderer
   */
  setupIpcHandlers() {
    ipcMain.handle('auto-restart:get-config', () => this.config);
    ipcMain.handle('auto-restart:set-config', (event, newConfig) => this.updateConfig(newConfig));
    ipcMain.handle('auto-restart:get-status', () => this.getStatus());
    ipcMain.handle('auto-restart:start-monitoring', () => this.startMonitoring());
    ipcMain.handle('auto-restart:stop-monitoring', () => this.stopMonitoring());
    ipcMain.handle('auto-restart:postpone-restart', (event, minutes) => this.postponeRestart(minutes));
    ipcMain.handle('auto-restart:cancel-restart', () => this.cancelRestart());
    ipcMain.handle('auto-restart:force-restart', () => this.performRestart());
  }

  /**
   * Mengecek waktu berakhirnya shift saat ini
   */
  async checkShiftEndTime() {
    try {
      const currentShift = await shiftService.getCurrentShift();
      if (!currentShift) {
        return;
      }

      // Hitung waktu berakhirnya shift saat ini
      const now = new Date();
      const shiftEndTime = this.calculateShiftEndTime(currentShift, now);
      const timeUntilEnd = shiftEndTime.getTime() - now.getTime();
      const minutesUntilEnd = Math.floor(timeUntilEnd / (1000 * 60));

      log.debug(`Shift ${currentShift.shift_name} berakhir dalam ${minutesUntilEnd} menit`);

      // If already restarted for this shift end, skip
      if (this.hasRestartedForShift(currentShift.shift_name, shiftEndTime)) {
        log.info('Restart untuk shift ini sudah dilakukan sebelumnya. Melewati.');
        return;
      }

      // Jika sudah melewati waktu berakhir shift, tampilkan warning dengan grace period
      if (timeUntilEnd <= 0 && !this.pendingRestart) {
        log.info('Waktu shift telah berakhir, menampilkan peringatan dengan grace period');
        await this.showRestartWarning(0, shiftEndTime);
        this.pendingShiftName = currentShift.shift_name;
        this.pendingShiftEndTime = shiftEndTime;
        return;
      }

      // Jika mendekati waktu berakhir shift dan belum ada peringatan
      if (minutesUntilEnd <= this.config.warningMinutes && !this.pendingRestart) {
        log.info(`Shift akan berakhir dalam ${minutesUntilEnd} menit, menampilkan peringatan`);
        await this.showRestartWarning(minutesUntilEnd, shiftEndTime);
        this.pendingShiftName = currentShift.shift_name;
        this.pendingShiftEndTime = shiftEndTime;
      }

    } catch (error) {
      log.error('Error mengecek waktu berakhir shift:', error);
    }
  }

  /**
   * Menghitung waktu berakhirnya shift
   */
  calculateShiftEndTime(shift, currentTime) {
    const today = new Date(currentTime);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    
    const shiftEndTime = new Date(today);
    shiftEndTime.setHours(endHour, endMinute, 0, 0);

    // Jika waktu berakhir lebih kecil dari waktu mulai, berarti shift berakhir besok
    const [startHour] = shift.start_time.split(':').map(Number);
    if (endHour < startHour) {
      shiftEndTime.setDate(shiftEndTime.getDate() + 1);
    }

    return shiftEndTime;
  }

  /**
   * Menampilkan peringatan restart
   */
  async showRestartWarning(minutesUntilEnd, shiftEndTime) {
    this.pendingRestart = true;
    // Clamp countdown with grace period minimum
    const minGrace = (this.config.gracePeriodMinutes || 2) * 60;
    this.countdownSeconds = Math.max((minutesUntilEnd || 0) * 60, minGrace);

    // Buat window peringatan
    await this.createWarningWindow();

    // Mulai countdown
    this.startCountdown(shiftEndTime);
  }

  /**
   * Membuat window peringatan restart
   */
  async createWarningWindow() {
    if (this.warningWindow && !this.warningWindow.isDestroyed()) {
      this.warningWindow.focus();
      return;
    }

    this.warningWindow = new BrowserWindow({
      width: 600,
      height: 400,
      resizable: false,
      alwaysOnTop: true,
      frame: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload.js')
      }
    });

    // Load HTML untuk warning window
    const warningHtml = this.generateWarningHtml();
    await this.warningWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(warningHtml)}`);

    this.warningWindow.on('closed', () => {
      this.warningWindow = null;
    });
  }

  /**
   * Generate HTML untuk warning window
   */
  generateWarningHtml() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Peringatan Restart Aplikasi</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 30px;
          background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
          color: white;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .container {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 15px;
          padding: 40px;
          backdrop-filter: blur(15px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-width: 500px;
          width: 100%;
        }
        .icon {
          font-size: 64px;
          margin-bottom: 25px;
        }
        h2 {
          font-size: 28px;
          margin-bottom: 15px;
          font-weight: 600;
        }
        p {
          font-size: 16px;
          line-height: 1.5;
          margin-bottom: 20px;
          opacity: 0.9;
        }
        .countdown {
          font-size: 48px;
          font-weight: bold;
          margin: 30px 0;
          color: #e74c3c;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .buttons {
          margin-top: 40px;
        }
        button {
          padding: 15px 30px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          background: #3498db;
          color: white;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
        }
        button:hover {
          background: #2980b9;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(52, 152, 219, 0.4);
        }
        button:disabled {
          background: #7f8c8d;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .countdown-text {
          font-size: 14px;
          opacity: 0.8;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">⚠️</div>
        <h2>Aplikasi Akan Restart</h2>
        <p>Shift kerja akan berakhir dan aplikasi perlu direstart untuk pergantian shift.</p>
        <div class="countdown" id="countdown">05:00</div>
        <p>Pastikan semua pekerjaan telah disimpan!</p>
        <div class="buttons">
          <button id="okButton" onclick="handleOkClick()" disabled>OK</button>
        </div>
        <div class="countdown-text" id="buttonCountdown">Tombol akan aktif dalam 3 detik...</div>
      </div>
      <script>
        let countdownSeconds = ${this.countdownSeconds};
        let buttonCountdown = 3;
        
        function updateCountdown() {
          const minutes = Math.floor(countdownSeconds / 60);
          const seconds = countdownSeconds % 60;
          document.getElementById('countdown').textContent = 
            minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
          
          if (countdownSeconds > 0) {
            countdownSeconds--;
          } else {
            // Auto restart when countdown reaches 0
            window.api.forceRestart();
          }
        }
        
        function updateButtonCountdown() {
          const buttonCountdownEl = document.getElementById('buttonCountdown');
          const okButton = document.getElementById('okButton');
          
          if (buttonCountdown > 0) {
            buttonCountdownEl.textContent = 'Tombol akan aktif dalam ' + buttonCountdown + ' detik...';
            buttonCountdown--;
          } else {
            buttonCountdownEl.textContent = '';
            okButton.disabled = false;
            okButton.textContent = 'OK';
          }
        }
        
        function handleOkClick() {
          // Tutup pop-up saja, restart tetap berjalan sesuai jadwal
          window.close();
        }
        
        // Update countdown every second
        setInterval(updateCountdown, 1000);
        updateCountdown(); // Initial update
        
        // Update button countdown every second
        setInterval(updateButtonCountdown, 1000);
        updateButtonCountdown(); // Initial update
      </script>
    </body>
    </html>`;
  }

  /**
   * Memulai countdown timer
   */
  startCountdown(shiftEndTime) {
    if (this.restartCountdownTimer) {
      clearInterval(this.restartCountdownTimer);
    }

    this.restartCountdownTimer = setInterval(async () => {
      if (!this.pendingRestart) {
        clearInterval(this.restartCountdownTimer);
        this.restartCountdownTimer = null;
        return;
      }
      this.countdownSeconds--;

      if (this.countdownSeconds <= 0) {
        clearInterval(this.restartCountdownTimer);
        await this.performRestart();
      }
    }, 1000);
  }

  /**
   * Menunda restart
   */
  async postponeRestart(minutes) {
    log.info(`Restart ditunda selama ${minutes} menit`);
    this.countdownSeconds += minutes * 60;
    if (this.warningWindow && !this.warningWindow.isDestroyed()) {
      this.warningWindow.close();
    }
    // Tampilkan notifikasi
    dialog.showMessageBox({
      type: 'info',
      title: 'Restart Ditunda',
      message: `Restart aplikasi ditunda selama ${minutes} menit.`,
      buttons: ['OK']
    });
  }

  /**
   * Membatalkan restart
   */
  async cancelRestart() {
    log.info('Restart dibatalkan oleh user');
    this.pendingRestart = false;
    this.countdownSeconds = 0;
    if (this.restartCountdownTimer) {
      clearInterval(this.restartCountdownTimer);
      this.restartCountdownTimer = null;
    }
    if (this.warningWindow && !this.warningWindow.isDestroyed()) {
      this.warningWindow.close();
    }
    dialog.showMessageBox({
      type: 'info',
      title: 'Restart Dibatalkan',
      message: 'Restart aplikasi telah dibatalkan. Monitoring akan dilanjutkan.',
      buttons: ['OK']
    });
  }

  /**
   * Memulai proses restart
   */
  async initiateRestart(reason) {
    log.info(`Memulai proses restart: ${reason}`);
    
    try {
      // Backup data aplikasi
      await this.backupApplicationData();
      
      // Tutup semua sesi SIMRS aktif dengan aman
      await this.closeSafely();
      
      // Perform restart
      await this.performRestart();
      
    } catch (error) {
      log.error('Error dalam proses restart:', error);
      
      dialog.showErrorBox(
        'Error Restart',
        `Gagal melakukan restart aplikasi: ${error.message}`
      );
    }
  }

  /**
   * Backup data aplikasi sebelum restart
   */
  async backupApplicationData() {
    try {
      log.info('Membackup data aplikasi...');
      
      // Pastikan folder backup ada
      await fs.mkdir(this.config.backupPath, { recursive: true });
      
      // Backup state aplikasi
      const appState = {
        timestamp: new Date().toISOString(),
        activeSessions: await SimrsUsage.findAll({ where: { status: 'active' } }),
        currentShift: await shiftService.getCurrentShift(),
        reason: 'auto-restart'
      };
      
      const backupFile = path.join(this.config.backupPath, `app-state-${Date.now()}.json`);
      await fs.writeFile(backupFile, JSON.stringify(appState, null, 2));
      
      log.info(`Data aplikasi dibackup ke: ${backupFile}`);
      
    } catch (error) {
      log.error('Error backup data aplikasi:', error);
      throw error;
    }
  }

  /**
   * Menutup aplikasi dengan aman
   */
  async closeSafely() {
    try {
      log.info('Menutup aplikasi dengan aman...');
      
      // Tutup semua sesi SIMRS aktif
      const activeSessions = await SimrsUsage.findAll({ where: { status: 'active' } });
      
      for (const session of activeSessions) {
        await session.closeSession('Ditutup karena restart aplikasi');
        log.info(`Sesi SIMRS ditutup: ${session.id}`);
      }
      
      // Hentikan monitoring shift
      shiftService.stopShiftMonitoring();
      
      log.info('Aplikasi ditutup dengan aman');
      
    } catch (error) {
      log.error('Error menutup aplikasi dengan aman:', error);
      throw error;
    }
  }

  /**
   * Melakukan restart aplikasi
   */
  async performRestart() {
    try {
      log.info('Melakukan restart aplikasi...');
      
      if (this.warningWindow && !this.warningWindow.isDestroyed()) {
        this.warningWindow.close();
      }
      // Mark state to avoid relaunch loop
      this.markShiftRestarted(this.pendingShiftName, this.pendingShiftEndTime);
      // Hentikan monitoring
      this.stopMonitoring();
      // Restart aplikasi
      app.relaunch();
      app.exit(0);
    } catch (error) {
      log.error('Error melakukan restart:', error);
      throw error;
    }
  }

  // New: persistent state helpers
  hasRestartedForShift(shiftName, shiftEndTime) {
    try {
      const raw = require('fs').existsSync(this.stateFile) ? require('fs').readFileSync(this.stateFile, 'utf-8') : null;
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.lastShiftName || !data.lastShiftEndUtc) return false;
      if (data.lastShiftName !== shiftName) return false;
      const lastEnd = new Date(data.lastShiftEndUtc).getTime();
      const currentEnd = shiftEndTime.getTime();
      const diffMinutes = Math.abs(currentEnd - lastEnd) / 60000;
      // Consider same shift end if within 10 minutes
      return diffMinutes < 10;
    } catch {
      return false;
    }
  }

  markShiftRestarted(shiftName, shiftEndTime) {
    try {
      const payload = {
        lastShiftName: shiftName || null,
        lastShiftEndUtc: shiftEndTime ? shiftEndTime.toISOString() : null,
        timestampUtc: new Date().toISOString()
      };
      require('fs').writeFileSync(this.stateFile, JSON.stringify(payload, null, 2));
      log.info('Menandai restart untuk shift:', payload);
    } catch (e) {
      log.warn('Gagal menulis state auto-restart:', e.message);
    }
  }

  /**
   * Update konfigurasi
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    log.info('Konfigurasi auto-restart diperbarui:', this.config);
    
    // Restart monitoring jika diperlukan
    if (this.isMonitoring) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Mendapatkan status monitoring
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      pendingRestart: this.pendingRestart,
      countdownSeconds: this.countdownSeconds,
      config: this.config
    };
  }
}

// Export singleton instance
module.exports = new AutoRestartService();