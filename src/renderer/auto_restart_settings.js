// Auto-Restart Settings JavaScript

let currentConfig = {};
let statusUpdateInterval = null;
let diagnosticsUpdateInterval = null;

// Preview stub: when running outside Electron, provide window.api mocks
if (typeof window !== 'undefined' && typeof window.api === 'undefined') {
    window.api = {
        getAutoRestartConfig: async () => ({
            enableAutoRestart: true,
            warningMinutes: 5,
            checkIntervalSeconds: 30,
            gracePeriodMinutes: 2,
            maxPostponeMinutes: 30,
            backupRetentionDays: 7,
            notifications: { showWarningDialog: true, allowPostpone: true, countdownDisplay: true }
        }),
        getAutoRestartStatus: async () => ({
            isMonitoring: true,
            pendingRestart: false,
            countdownSeconds: 0,
            config: {}
        }),
        startAutoRestartMonitoring: async () => {},
        stopAutoRestartMonitoring: async () => {},
        postponeRestart: async () => {},
        cancelRestart: async () => {},
        forceRestart: async () => {},
        getAvailableBackups: async () => ([
            { timestamp: Date.now(), sessionCount: 3, currentShift: 'pagi', reason: 'auto-restart', file: 'app-state-123.json' }
        ]),
        manualRecovery: async () => {},
        cleanupOldBackups: async () => {},
        getAllShifts: async () => ([
            { shift_name: 'pagi', start_time: '08:00', end_time: '16:30' },
            { shift_name: 'malam', start_time: '00:00', end_time: '08:00', is_overnight: false }
        ]),
        getAutoRestartDiagnostics: async () => ({
            isMonitoring: true,
            lastCheck: new Date().toISOString(),
            nextCheck: new Date(Date.now() + 5000).toISOString(),
            pendingRestart: false,
            countdownSeconds: 390,
            currentShift: 'pagi',
            shiftEndTime: new Date(Date.now() + 390000).toISOString(),
            timeUntilEnd: { minutes: 6, seconds: 30 },
            shownEarlyWarning: true,
            shownFinalWarning: false,
            warningWindowOpen: false,
            timers: { monitoringInterval: true, warningTimer: false, countdownTimer: true }
        })
    };
    console.log('Preview mode: window.api stubbed for static preview.');
}

/**
 * Load konfigurasi auto-restart
 */
async function loadConfig() {
    try {
        const config = await window.api.getAutoRestartConfig();
        currentConfig = config;
        
        // Update form fields
        document.getElementById('enableAutoRestart').checked = config.enableAutoRestart;
        document.getElementById('warningMinutes').value = config.warningMinutes;
        document.getElementById('checkInterval').value = config.checkIntervalSeconds;
        document.getElementById('gracePeriod').value = config.gracePeriodMinutes;
        document.getElementById('maxPostpone').value = config.maxPostponeMinutes;
        document.getElementById('backupRetention').value = config.backupRetentionDays;
        
        // Update notification settings
        document.getElementById('showWarningDialog').checked = config.notifications?.showWarningDialog ?? true;
        document.getElementById('allowPostpone').checked = config.notifications?.allowPostpone ?? true;
        document.getElementById('countdownDisplay').checked = config.notifications?.countdownDisplay ?? true;
        
        console.log('Konfigurasi dimuat:', config);
        
    } catch (error) {
        console.error('Error loading config:', error);
        showAlert('Error memuat konfigurasi: ' + error.message, 'danger');
    }
}

/**
 * Load status monitoring
 */
async function loadStatus() {
    try {
        const status = await window.api.getAutoRestartStatus();
        
        // Update monitoring status
        const monitoringStatus = document.getElementById('monitoring-status');
        if (status.isMonitoring) {
            monitoringStatus.innerHTML = '<span class="status-indicator status-active"></span>Aktif';
        } else {
            monitoringStatus.innerHTML = '<span class="status-indicator status-inactive"></span>Tidak Aktif';
        }
        
        // Update pending restart status
        const pendingRestart = document.getElementById('pending-restart');
        const countdownContainer = document.getElementById('countdown-container');
        
        if (status.pendingRestart && status.countdownSeconds > 0) {
            pendingRestart.innerHTML = '<span class="status-indicator status-warning"></span>Ya';
            countdownContainer.style.display = 'block';
            
            // Update countdown display
            const minutes = Math.floor(status.countdownSeconds / 60);
            const seconds = status.countdownSeconds % 60;
            document.getElementById('countdown-display').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            pendingRestart.innerHTML = '<span class="status-indicator status-inactive"></span>Tidak Ada';
            countdownContainer.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error loading status:', error);
    }
}

/**
 * Load diagnostics
 */
async function loadDiagnostics() {
    try {
        const diag = await window.api.getAutoRestartDiagnostics();
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
        setText('diag-last-check', diag.lastCheck || '—');
        setText('diag-next-check', diag.nextCheck || '—');
        setText('diag-countdown', (diag.countdownSeconds ?? 0).toString());
        setText('diag-current-shift', diag.currentShift || '—');
        setText('diag-shift-end', diag.shiftEndTime || '—');
        const tu = diag.timeUntilEnd ? `${diag.timeUntilEnd.minutes}m ${diag.timeUntilEnd.seconds}s` : '—';
        setText('diag-time-until-end', tu);
        const earlyEl = document.getElementById('diag-flag-early');
        const finalEl = document.getElementById('diag-flag-final');
        const warnEl = document.getElementById('diag-warning-open');
        if (earlyEl) { earlyEl.textContent = diag.shownEarlyWarning ? 'true' : 'false'; earlyEl.className = `badge ${diag.shownEarlyWarning ? 'bg-warning' : 'bg-secondary'}`; }
        if (finalEl) { finalEl.textContent = diag.shownFinalWarning ? 'true' : 'false'; finalEl.className = `badge ${diag.shownFinalWarning ? 'bg-danger' : 'bg-secondary'}`; }
        if (warnEl) { warnEl.textContent = diag.warningWindowOpen ? 'open' : 'closed'; warnEl.className = `badge ${diag.warningWindowOpen ? 'bg-info' : 'bg-secondary'}`; }
    } catch (error) {
        console.error('Error loading diagnostics:', error);
    }
}
/**
 * Save konfigurasi
 */
async function saveConfig() {
    try {
        const newConfig = {
            enableAutoRestart: document.getElementById('enableAutoRestart').checked,
            warningMinutes: parseInt(document.getElementById('warningMinutes').value),
            checkIntervalSeconds: parseInt(document.getElementById('checkInterval').value),
            gracePeriodMinutes: parseInt(document.getElementById('gracePeriod').value),
            maxPostponeMinutes: parseInt(document.getElementById('maxPostpone').value),
            backupRetentionDays: parseInt(document.getElementById('backupRetention').value),
            notifications: {
                showWarningDialog: document.getElementById('showWarningDialog').checked,
                allowPostpone: document.getElementById('allowPostpone').checked,
                countdownDisplay: document.getElementById('countdownDisplay').checked
            }
        };
        
        await window.api.setAutoRestartConfig(newConfig);
        showAlert('Konfigurasi berhasil disimpan', 'success');
        
        // Reload config to reflect changes
        await loadConfig();
        
    } catch (error) {
        console.error('Error saving config:', error);
        showAlert('Error menyimpan konfigurasi: ' + error.message, 'danger');
    }
}

/**
 * Start monitoring
 */
async function startMonitoring() {
    try {
        await window.api.startAutoRestartMonitoring();
        showAlert('Monitoring auto-restart dimulai', 'success');
        await loadStatus();
    } catch (error) {
        console.error('Error starting monitoring:', error);
        showAlert('Error memulai monitoring: ' + error.message, 'danger');
    }
}

/**
 * Stop monitoring
 */
async function stopMonitoring() {
    try {
        await window.api.stopAutoRestartMonitoring();
        showAlert('Monitoring auto-restart dihentikan', 'warning');
        await loadStatus();
    } catch (error) {
        console.error('Error stopping monitoring:', error);
        showAlert('Error menghentikan monitoring: ' + error.message, 'danger');
    }
}

/**
 * Postpone restart
 */
async function postponeRestart() {
    try {
        const minutes = 10; // Default 10 minutes
        await window.api.postponeRestart(minutes);
        showAlert(`Restart ditunda selama ${minutes} menit`, 'info');
        await loadStatus();
    } catch (error) {
        console.error('Error postponing restart:', error);
        showAlert('Error menunda restart: ' + error.message, 'danger');
    }
}

/**
 * Cancel restart
 */
async function cancelRestart() {
    try {
        if (confirm('Apakah Anda yakin ingin membatalkan restart?')) {
            await window.api.cancelRestart();
            showAlert('Restart dibatalkan', 'info');
            await loadStatus();
        }
    } catch (error) {
        console.error('Error canceling restart:', error);
        showAlert('Error membatalkan restart: ' + error.message, 'danger');
    }
}

/**
 * Force restart
 */
async function forceRestart() {
    try {
        if (confirm('Apakah Anda yakin ingin restart aplikasi sekarang?\\n\\nSemua sesi SIMRS aktif akan ditutup.')) {
            await window.api.forceRestart();
            // App will restart, so this won't execute
        }
    } catch (error) {
        console.error('Error forcing restart:', error);
        showAlert('Error melakukan restart: ' + error.message, 'danger');
    }
}

/**
 * Load backup list
 */
async function loadBackupList() {
    try {
        const backups = await window.api.getAvailableBackups();
        const backupList = document.getElementById('backup-list');
        
        if (backups.length === 0) {
            backupList.innerHTML = `
                <div class="text-center text-muted">
                    <i class="bi bi-inbox"></i>
                    <p>Tidak ada backup tersedia</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        backups.forEach(backup => {
            const date = new Date(backup.timestamp).toLocaleString('id-ID');
            html += `
                <div class="backup-item">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <strong>${date}</strong><br>
                            <small class="text-muted">
                                ${backup.sessionCount} sesi | ${backup.currentShift} | ${backup.reason}
                            </small>
                        </div>
                        <button class="btn btn-sm btn-outline-primary" onclick="recoverFromBackup('${backup.file}')">
                            <i class="bi bi-arrow-clockwise"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        backupList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading backup list:', error);
        showAlert('Error memuat daftar backup: ' + error.message, 'danger');
    }
}

/**
 * Recover from backup
 */
async function recoverFromBackup(backupFile) {
    try {
        if (confirm('Apakah Anda yakin ingin memulihkan dari backup ini?\\n\\nSesi SIMRS aktif saat ini akan ditutup.')) {
            await window.api.manualRecovery(backupFile);
            showAlert('Recovery berhasil dilakukan', 'success');
            await loadBackupList();
        }
    } catch (error) {
        console.error('Error recovering from backup:', error);
        showAlert('Error melakukan recovery: ' + error.message, 'danger');
    }
}

/**
 * Cleanup old backups
 */
async function cleanupOldBackups() {
    try {
        if (confirm('Apakah Anda yakin ingin menghapus backup lama?')) {
            await window.api.cleanupOldBackups();
            showAlert('Backup lama berhasil dibersihkan', 'success');
            await loadBackupList();
        }
    } catch (error) {
        console.error('Error cleaning up backups:', error);
        showAlert('Error membersihkan backup: ' + error.message, 'danger');
    }
}

/**
 * Show alert message
 */
function showAlert(message, type = 'info') {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    // Create new alert
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // Insert at top of container
    const container = document.querySelector('.container-fluid');
    container.insertBefore(alertDiv, container.firstChild);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

/**
 * Load and render saved shift times from DB
 */
async function loadShiftTimes() {
    try {
        const schedules = await window.api.getAllShifts();
        const pagi = schedules.find(s => (s.shift_name || s.name) === 'pagi');
        const malam = schedules.find(s => (s.shift_name || s.name) === 'malam');

        const pagiEl = document.getElementById('saved-shift-pagi');
        const malamEl = document.getElementById('saved-shift-malam');

        if (pagi && pagiEl) {
            const start = (pagi.start_time || '').slice(0,5);
            const end = (pagi.end_time || '').slice(0,5);
            pagiEl.textContent = start && end ? `${start} — ${end}` : 'Belum diatur';
        }
        if (malam && malamEl) {
            const start = (malam.start_time || '').slice(0,5);
            const end = (malam.end_time || '').slice(0,5);
            const overnight = malam.is_overnight ?? malam.overnight ?? false;
            malamEl.textContent = start && end ? `${start} — ${end}${overnight ? ' (Overnight)' : ''}` : 'Belum diatur';
        }
    } catch (error) {
        console.error('Error loading shift times:', error);
        const pagiEl = document.getElementById('saved-shift-pagi');
        const malamEl = document.getElementById('saved-shift-malam');
        if (pagiEl) pagiEl.textContent = 'Error memuat';
        if (malamEl) malamEl.textContent = 'Error memuat';
    }
}

// Form submit handler
document.getElementById('config-form').addEventListener('submit', function(e) {
    e.preventDefault();
    saveConfig();
});

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    await loadConfig();
    await loadStatus();
    await loadDiagnostics();
    await loadBackupList();
    await loadShiftTimes();
    
    // Start status update interval
    statusUpdateInterval = setInterval(async () => {
        await loadStatus();
    }, 5000); // Update every 5 seconds

    diagnosticsUpdateInterval = setInterval(async () => {
        await loadDiagnostics();
    }, 5000);
});

// Cleanup interval when page unloads
window.addEventListener('beforeunload', function() {
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
    }
    if (diagnosticsUpdateInterval) {
        clearInterval(diagnosticsUpdateInterval);
    }
});