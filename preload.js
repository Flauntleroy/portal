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
});
