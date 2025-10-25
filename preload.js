const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Authentication
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  register: (userData) => ipcRenderer.invoke('register', userData),

  // User profile
  updateProfile: (userData) => ipcRenderer.invoke('update-profile', userData),

  // SIMRS operations
  runSimrs: (userId) => ipcRenderer.invoke('run-simrs', userId),
  closeSimrs: (logId) => ipcRenderer.invoke('close-simrs', logId),
  getSimrsStatistics: () => ipcRenderer.invoke('get-simrs-statistics'),
  getSimrsHistory: (userId) => ipcRenderer.invoke('get-simrs-history', userId),

  // Shift APIs
  getCurrentShift: () => ipcRenderer.invoke('get-current-shift'),

  // Tambahan: menutup semua sesi aktif milik user
  closeAllSimrsForUser: (userId) => ipcRenderer.invoke('close-all-simrs-for-user', userId)
});
