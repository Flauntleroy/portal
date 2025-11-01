const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Authentication
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  register: (userData) => ipcRenderer.invoke('register', userData),

  // User profile
  updateProfile: (userData) => ipcRenderer.invoke('update-profile', userData),
  uploadProfilePhoto: (userId, photoData) => ipcRenderer.invoke('upload-profile-photo', userId, photoData),

  // Unit kerja
  getAllUnitKerja: () => ipcRenderer.invoke('get-all-unit-kerja'),

  // File browse/select
  selectSimrsPath: () => ipcRenderer.invoke('select-simrs-path'),
  browseFile: () => ipcRenderer.invoke('browse-file'),

  // SIMRS operations
  runSimrs: (userId) => ipcRenderer.invoke('run-simrs', userId),
  closeSimrs: (logId) => ipcRenderer.invoke('close-simrs', logId),
  getSimrsStatistics: () => ipcRenderer.invoke('get-simrs-statistics'),
  getSimrsHistory: (userId) => ipcRenderer.invoke('get-simrs-history', userId),
  closeAllSimrsForUser: (userId) => ipcRenderer.invoke('close-all-simrs-for-user', userId),

  // Shift APIs
  getCurrentShift: () => ipcRenderer.invoke('get-current-shift'),
  getShiftStatus: (unitId) => ipcRenderer.invoke('get-shift-status', unitId),
  manualShiftChange: (payload) => ipcRenderer.invoke('manual-shift-change', payload),
  updateUnitShiftConfig: (config) => ipcRenderer.invoke('update-unit-shift-config', config),

  // Auto-restart APIs
  getAutoRestartConfig: () => ipcRenderer.invoke('auto-restart:get-config'),
  setAutoRestartConfig: (config) => ipcRenderer.invoke('auto-restart:set-config', config),
  getAutoRestartStatus: () => ipcRenderer.invoke('auto-restart:get-status'),
  getAutoRestartDiagnostics: () => ipcRenderer.invoke('auto-restart:get-diagnostics'),
  startAutoRestartMonitoring: () => ipcRenderer.invoke('auto-restart:start-monitoring'),
  stopAutoRestartMonitoring: () => ipcRenderer.invoke('auto-restart:stop-monitoring'),
  postponeRestart: (minutes) => ipcRenderer.invoke('auto-restart:postpone-restart', minutes),
  cancelRestart: () => ipcRenderer.invoke('auto-restart:cancel-restart'),
  forceRestart: () => ipcRenderer.invoke('auto-restart:force-restart'),

  // Recovery & backups
  getAvailableBackups: () => ipcRenderer.invoke('recovery:get-available-backups'),
  manualRecovery: (backupFile) => ipcRenderer.invoke('recovery:manual-recovery', backupFile),
  cleanupOldBackups: () => ipcRenderer.invoke('recovery:cleanup-old-backups'),

  // Shifts list (for settings page)
  getAllShifts: () => ipcRenderer.invoke('get-all-shifts'),

  // Chat overlay notifications
  notifyChat: (payload) => ipcRenderer.send('chat:notify', payload),
  onChatOpenModal: (handler) => ipcRenderer.on('chat:open-modal', (_, data) => { try { if (typeof handler === 'function') handler(data); } catch (e) {} }),
  onChatOverlayMessage: (handler) => ipcRenderer.on('chat:overlay-message', (_, data) => { try { if (typeof handler === 'function') handler(data); } catch (e) {} }),
  openChatFromOverlay: (payload) => ipcRenderer.send('chat:open-modal', payload),
  closeChatOverlay: () => ipcRenderer.send('chat:overlay-close'),

  // Chat config
  getChatBaseUrl: () => ipcRenderer.invoke('chat:get-base-url'),
});
