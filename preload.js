const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Authentication
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    register: (userData) => ipcRenderer.invoke('register', userData),

    // User profile
    updateProfile: (userData) => ipcRenderer.invoke('update-profile', userData),

    // SIMRS operations
    runSimrs: (userId) => ipcRenderer.invoke('run-simrs', userId),
    closeSimrs: (logId) => ipcRenderer.invoke('close-simrs', logId),

    // Statistics
    getSimrsStatistics: () => ipcRenderer.invoke('get-simrs-statistics'),
    getSimrsHistory: (userId) => ipcRenderer.invoke('get-simrs-history', userId),

    // Unit Kerja
    getAllUnitKerja: () => ipcRenderer.invoke('get-all-unit-kerja'),

    // File operations
    selectSimrsPath: () => ipcRenderer.invoke('select-simrs-path'),
    browseFile: () => ipcRenderer.invoke('browse-file'),

    // Profile photo
    uploadProfilePhoto: (userId, photoData) => ipcRenderer.invoke('upload-profile-photo', userId, photoData),

    // Shift system operations
    getShiftStatus: (unitId) => ipcRenderer.invoke('get-shift-status', unitId),
    getCurrentShift: () => ipcRenderer.invoke('get-current-shift'),
    updateUnitShiftConfig: (config) => ipcRenderer.invoke('update-unit-shift-config', config),
    manualShiftChange: (data) => ipcRenderer.invoke('manual-shift-change', data),
    getShiftHistory: (params) => ipcRenderer.invoke('get-shift-history', params),
    // New: Shift schedule admin
    getAllShifts: () => ipcRenderer.invoke('get-all-shifts'),
    updateShiftSchedule: (schedule) => ipcRenderer.invoke('update-shift-schedule', schedule),

    // Admin operations
    getAllUnitsWithShiftConfig: () => ipcRenderer.invoke('get-all-units-with-shift-config'),
    updateUnitShiftConfigAdmin: (unitConfig) => ipcRenderer.invoke('update-unit-shift-config-admin', unitConfig),

    // Auto-restart operations
    getAutoRestartConfig: () => ipcRenderer.invoke('auto-restart:get-config'),
    setAutoRestartConfig: (config) => ipcRenderer.invoke('auto-restart:set-config', config),
    getAutoRestartStatus: () => ipcRenderer.invoke('auto-restart:get-status'),
    startAutoRestartMonitoring: () => ipcRenderer.invoke('auto-restart:start-monitoring'),
    stopAutoRestartMonitoring: () => ipcRenderer.invoke('auto-restart:stop-monitoring'),
    postponeRestart: (minutes) => ipcRenderer.invoke('auto-restart:postpone-restart', minutes),
    cancelRestart: () => ipcRenderer.invoke('auto-restart:cancel-restart'),
    forceRestart: () => ipcRenderer.invoke('auto-restart:force-restart'),

    // Recovery operations
    getAvailableBackups: () => ipcRenderer.invoke('recovery:get-available-backups'),
    manualRecovery: (backupFile) => ipcRenderer.invoke('recovery:manual-recovery', backupFile),
    cleanupOldBackups: () => ipcRenderer.invoke('recovery:cleanup-old-backups')
  }
);
