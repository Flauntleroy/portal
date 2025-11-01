const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const log = require('electron-log');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
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
      warningMinutes: 5,
      checkIntervalSeconds: 30,
      backupPath: path.join(app.getPath('userData'), 'backup'),
      enableAutoRestart: true,
      gracePeriodMinutes: 1,
      restartDelaySeconds: 60,
      finalWarningSeconds: 30,
      maxPostponeMinutes: 15,
      backupRetentionDays: 7,
      notifications: {
        showWarningDialog: true,
        allowPostpone: false,
        countdownDisplay: true
      }
    };
    // Load konfigurasi dari file JSON jika tersedia
    this.loadConfig();
    this.pendingRestart = false;
    this.countdownSeconds = 0;
    // New: persist restart state to avoid relaunch loops
    this.stateFile = path.join(app.getPath('userData'), 'auto-restart-state.json');
    this.pendingShiftName = null;
    this.pendingShiftEndTime = null;
    // New: two-phase warning flags
    this.shownEarlyWarning = false; // ditampilkan saat sisa <= warningMinutes
    this.shownFinalWarning = false; // ditampilkan saat sisa <= 0:30
    // Diagnostics
    this.lastCheck = null;
    this.nextCheck = null;
    this.currentShift = null;
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
    ipcMain.handle('auto-restart:get-diagnostics', () => this.getDiagnostics());
  }

  /**
   * Mengecek waktu berakhirnya shift saat ini
   */
  async checkShiftEndTime() {
    try {
      this.lastCheck = new Date();
      this.nextCheck = new Date(this.lastCheck.getTime() + this.config.checkIntervalSeconds * 1000);
      const currentShift = await shiftService.getCurrentShift();
      this.currentShift = currentShift || null;
      if (!currentShift) {
        return;
      }

      // Hitung waktu berakhirnya shift saat ini
      const now = new Date();
      const shiftEndTime = this.calculateShiftEndTime(currentShift, now);
      const timeUntilEndMs = shiftEndTime.getTime() - now.getTime();
      const secondsUntilEnd = Math.ceil(timeUntilEndMs / 1000);
      const minutesUntilEnd = Math.floor(timeUntilEndMs / (1000 * 60));

      log.debug(`Shift ${currentShift.shift_name} berakhir dalam ${minutesUntilEnd} menit (${secondsUntilEnd} detik)`);

      // Reset phase flags saat masih jauh dari threshold (di atas warningMinutes)
      if (secondsUntilEnd > (this.config.warningMinutes * 60)) {
        this.shownEarlyWarning = false;
        this.shownFinalWarning = false;
      }

      // Skip jika restart sudah dilakukan untuk akhir shift ini
      if (this.hasRestartedForShift(currentShift.shift_name, shiftEndTime)) {
        log.info('Restart untuk shift ini sudah dilakukan sebelumnya. Melewati.');
        return;
      }

      // Setelah lewat end_time: tampilkan warning dengan delay 1 menit jika belum pending
      if (secondsUntilEnd <= 0 && !this.pendingRestart) {
        log.info('Waktu shift telah berakhir, menampilkan peringatan dengan delay 1 menit');
        this.pendingShiftName = currentShift.shift_name;
        this.pendingShiftEndTime = shiftEndTime;
        await this.showRestartWarning(0, shiftEndTime);
        return;
      }

      // Fase final: detik tersisa sesuai konfigurasi
      if (secondsUntilEnd <= (this.config.finalWarningSeconds || 30) && !this.shownFinalWarning) {
        // Jika window sudah ditutup sebelumnya, tampilkan kembali; jika masih terbuka, biarkan
        if (!this.warningWindow || this.warningWindow.isDestroyed()) {
          log.info('Sisa 30 detik, menampilkan peringatan final');
          this.pendingShiftName = currentShift.shift_name;
          this.pendingShiftEndTime = shiftEndTime;
          await this.showRestartWarning(Math.ceil(secondsUntilEnd / 60), shiftEndTime);
        } else {
          log.info('Sisa 30 detik, window peringatan sudah aktif');
        }
        this.shownFinalWarning = true;
        return;
      }

      // Fase awal: pada sisa waktu <= warningMinutes
      if (secondsUntilEnd <= (this.config.warningMinutes * 60) && !this.shownEarlyWarning && !this.pendingRestart) {
        log.info(`Sisa ${minutesUntilEnd} menit (${secondsUntilEnd} detik), menampilkan peringatan awal`);
        this.pendingShiftName = currentShift.shift_name;
        this.pendingShiftEndTime = shiftEndTime;
        await this.showRestartWarning(minutesUntilEnd, shiftEndTime);
        this.shownEarlyWarning = true;
        return;
      }

      // Fallback lama: jika mendekati warningMinutes dan belum ada peringatan
      if (minutesUntilEnd <= this.config.warningMinutes && !this.pendingRestart && !this.shownEarlyWarning) {
        log.info(`Shift akan berakhir dalam ${minutesUntilEnd} menit, menampilkan peringatan`);
        this.pendingShiftName = currentShift.shift_name;
        this.pendingShiftEndTime = shiftEndTime;
        await this.showRestartWarning(minutesUntilEnd, shiftEndTime);
        this.shownEarlyWarning = true;
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
    const now = new Date();
    const delaySec = this.config.restartDelaySeconds || 60;
    const targetRestartTime = new Date(shiftEndTime.getTime() + delaySec * 1000);
    const secondsUntilTarget = Math.max(Math.ceil((targetRestartTime.getTime() - now.getTime()) / 1000), 0);
    // Countdown diarahkan ke (end_time + delay)
    this.countdownSeconds = secondsUntilTarget;

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

    // Resolve preload path consistently with main.js
    const appRoot = fsSync.existsSync(path.join(process.resourcesPath || '', 'app'))
      ? path.join(process.resourcesPath, 'app')
      : path.join(__dirname, '..', '..');

    this.warningWindow = new BrowserWindow({
      width: 860,
      height: 360,
      resizable: false,
      alwaysOnTop: true,
      frame: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(appRoot, 'preload.js')
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
        :root {
          --bg: #0f172a; /* slate-900 */
          --panel: #111827; /* gray-900 */
          --text: #e5e7eb; /* text-gray-200 */
          --muted: #94a3b8; /* slate-400 */
          --border: rgba(255, 255, 255, 0.12);
          --accent: #1a8e83; /* portal teal */
          --accent-hover: #0e6b62;
          --danger: #ef4444; /* red-500 */
          --warning: #38bdf8; /* sky-300 */
        }
        html, body { height: 100%; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 0;
          background: var(--bg);
          color: var(--text);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .wrapper {
          width: 90vw;
          max-width: 900px;
          min-width: 700px;
        }
        .panel {
          background: var(--panel);
          border-radius: 12px;
          padding: 24px 28px;
          border: 1px solid var(--border);
          box-shadow: 0 12px 30px rgba(0,0,0,0.35);
        }
        .header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 10px;
        }
        .icon { font-size: 42px; color: var(--danger); }
        .title { font-size: 22px; font-weight: 700; }
        .message { color: var(--muted); margin-bottom: 16px; }
        .countdown {
          font-size: 56px;
          font-weight: 800;
          color: var(--warning);
          letter-spacing: 1px;
        }
        .hint { font-size: 13px; color: var(--muted); }
        .actions { margin-top: 20px; display: flex; justify-content: center; }
        #okButton {
          padding: 14px 40px;
          font-size: 18px;
          font-weight: 700;
          border: none;
          border-radius: 10px;
          background: var(--accent);
          color: #fff;
          cursor: pointer;
        }
        #okButton:disabled { opacity: 0.6; cursor: not-allowed; }
        #okButton:hover:not(:disabled) { background: var(--accent-hover); }
        .button-countdown { text-align: center; margin-top: 8px; color: var(--warning); font-weight: 600; }
        @media (max-width: 760px) {
          .wrapper { min-width: auto; width: 96vw; }
          .countdown { font-size: 44px; }
          #okButton { padding: 12px 28px; font-size: 16px; }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="panel">
          <div class="header">
            <div class="icon">⚠️</div>
            <div class="title">SIMRS Akan Restart</div>
          </div>
          <div class="message">Portal SIMRS akan restart dalam <span id="warnText"></span>. Pastikan semua data SIMRS sudah disimpan.</div>
          <div class="countdown" id="countdown">--:--</div>
          <div class="hint">Pastikan inputan SIMRS sudah disimpan.</div>
          <div class="actions">
            <button id="okButton" onclick="handleOkClick()" disabled>OK</button>
          </div>
          <div class="button-countdown" id="buttonCountdown">Tombol akan aktif dalam 3 detik...</div>
        </div>
      </div>
      <script>
        let countdownSeconds = ${this.countdownSeconds};
        let buttonCountdown = 3;
        function formatWarnText() {
          const m = Math.floor(countdownSeconds / 60);
          const s = countdownSeconds % 60;
          if (m > 0 && s >= 30) return m + ' menit';
          if (m > 0 && s < 30) return m + ' menit kurang';
          if (m === 0 && s > 30) return 'kurang dari 1 menit';
          if (m === 0 && s > 0) return s + ' detik';
          return 'segera';
        }
        function updateCountdown() {
          const minutes = Math.floor(countdownSeconds / 60);
          const seconds = countdownSeconds % 60;
          document.getElementById('countdown').textContent = 
            minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
          const wt = document.getElementById('warnText');
          if (wt) wt.textContent = formatWarnText();
          if (countdownSeconds > 0) {
            countdownSeconds--;
          } else {
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
          window.close();
        }
        setInterval(updateCountdown, 1000);
        updateCountdown();
        setInterval(updateButtonCountdown, 1000);
        updateButtonCountdown();
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
      const delaySec = this.config.restartDelaySeconds || 60;
      const baseEndTime = this.pendingShiftEndTime || shiftEndTime;
      const targetRestartTime = new Date(baseEndTime.getTime() + delaySec * 1000);
      const now = new Date();
      const secondsUntilTarget = Math.ceil((targetRestartTime.getTime() - now.getTime()) / 1000);
      this.countdownSeconds = Math.max(secondsUntilTarget, 0);

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
   * Muat konfigurasi dari file JSON dan gabungkan dengan default
   */
  loadConfig() {
    try {
      const configPath = path.join(app.getAppPath(), 'src', 'config', 'auto_restart_config.json');
      if (fsSync.existsSync(configPath)) {
        const raw = fsSync.readFileSync(configPath, 'utf-8');
        const json = JSON.parse(raw);
        const ar = json.autoRestart || {};
        const notif = json.notifications || {};
        this.config = {
          ...this.config,
          enableAutoRestart: ar.enabled ?? this.config.enableAutoRestart,
          warningMinutes: ar.warningMinutes ?? this.config.warningMinutes,
          checkIntervalSeconds: ar.checkIntervalSeconds ?? this.config.checkIntervalSeconds,
          gracePeriodMinutes: ar.gracePeriodMinutes ?? this.config.gracePeriodMinutes,
          maxPostponeMinutes: ar.maxPostponeMinutes ?? this.config.maxPostponeMinutes,
          backupRetentionDays: ar.backupRetentionDays ?? this.config.backupRetentionDays,
          notifications: {
            ...this.config.notifications,
            ...notif
          }
        };
        log.info('Konfigurasi auto-restart dimuat dari JSON');
      } else {
        log.warn('File konfigurasi auto-restart tidak ditemukan, menggunakan default');
      }
    } catch (e) {
      log.error('Gagal memuat konfigurasi auto-restart:', e);
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

  /**
   * Diagnostik detail untuk troubleshooting
   */
  getDiagnostics() {
    const now = new Date();
    const shift = this.currentShift;
    const end = shift ? this.calculateShiftEndTime(shift, now) : null;
    const diffMs = end ? (end.getTime() - now.getTime()) : null;
    return {
      isMonitoring: this.isMonitoring,
      lastCheck: this.lastCheck ? this.lastCheck.toISOString() : null,
      nextCheck: this.nextCheck ? this.nextCheck.toISOString() : null,
      pendingRestart: this.pendingRestart,
      countdownSeconds: this.countdownSeconds,
      currentShift: shift ? shift.shift_name : null,
      shiftEndTime: end ? end.toISOString() : null,
      timeUntilEnd: diffMs !== null ? {
        minutes: Math.floor(diffMs / 60000),
        seconds: Math.floor((diffMs % 60000) / 1000)
      } : null,
      shownEarlyWarning: this.shownEarlyWarning,
      shownFinalWarning: this.shownFinalWarning,
      warningWindowOpen: !!(this.warningWindow && !this.warningWindow.isDestroyed()),
      timers: {
        monitoringInterval: !!this.monitoringInterval,
        warningTimer: !!this.restartWarningTimer,
        countdownTimer: !!this.restartCountdownTimer
      }
    };
  }
}

// Export singleton instance
module.exports = new AutoRestartService();