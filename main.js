const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
// Force-disable GPU compositing to avoid renderer crash on hover/focus
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
// Apply extra safety in packaged builds
if (app.isPackaged) {
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-features', 'CanvasOopRasterization,AcceleratedPaint');
}
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const log = require('electron-log');
const { Op } = require('sequelize');
const os = require('os');

// Configure logging
log.transports.file.level = 'info';
log.info('Application starting...');

// Resolve app root for production build (resources/app) or dev (__dirname)
const appRoot = fs.existsSync(path.join(process.resourcesPath || '', 'app'))
  ? path.join(process.resourcesPath, 'app')
  : __dirname;

// Database models
const db = require(path.join(appRoot, 'src', 'models'));

// Services
const shiftService = require(path.join(appRoot, 'src', 'services', 'shift_service'));
const autoRestartService = require(path.join(appRoot, 'src', 'services', 'auto_restart_service'));
const recoveryService = require(path.join(appRoot, 'src', 'services', 'recovery_service'));

// Keep a global reference of the window object to avoid garbage collection
let mainWindow;
let chatOverlayWindow = null;

// Create the main application window
function createWindow() {
  const preloadPath = path.join(appRoot, 'preload.js');
  const loginHtmlPath = path.join(appRoot, 'src', 'views', 'login.html');
  log.info(`Resolved preload path: ${preloadPath} exists=${fs.existsSync(preloadPath)}`);
  log.info(`Resolved login.html path: ${loginHtmlPath} exists=${fs.existsSync(loginHtmlPath)}`);

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    },
    icon: path.join(appRoot, 'assets', 'icons', 'win', 'icon.ico')
  });

  // Load the index.html file
  mainWindow.loadFile(loginHtmlPath);

  mainWindow.webContents.on('dom-ready', () => {
    log.info('DOM ready for main window');
  });

  // Diagnostics
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Main window finished load');
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log.error(`Main window failed to load: code=${errorCode} desc=${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`);
  });
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    try {
      log.info(`Renderer console [${level}]: ${message} (${sourceId}:${line})`);
    } catch (e) {}
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log.error('Renderer process gone:', details);
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when Electron has finished initialization
app.whenReady().then(async () => {
  try {
    // Initialize database connection
    await db.sequelize.sync();
    log.info('Database connected successfully');

    // Initialize recovery service first
    await recoveryService.initialize();
    log.info('Recovery service initialized');

    // Setup IPC handlers for auto-restart service
    autoRestartService.setupIpcHandlers();

    // Start shift monitoring service
    shiftService.startShiftMonitoring(1); // Check every 1 minute
    log.info('Shift monitoring service started');

    // Start auto-restart monitoring service
    await autoRestartService.startMonitoring();
    log.info('Auto-restart monitoring service started');

    createWindow();
  } catch (error) {
    log.error('Failed to connect to database:', error);
    dialog.showErrorBox(
      'Database Connection Error',
      'Failed to connect to the database. Please make sure MySQL is running.'
    );
  }
});

// Handle app before quit - we no longer close active SIMRS sessions automatically
// Sessions should only be closed when user explicitly logs out
app.on('before-quit', async () => {
  try {
    // Stop auto-restart monitoring service
    autoRestartService.stopMonitoring();
    log.info('Auto-restart monitoring service stopped');
    
    // Stop shift monitoring service
    shiftService.stopShiftMonitoring();
    log.info('Shift monitoring service stopped');
    
    // Log that the application is closing but don't change session status
    log.info('Application closing - active SIMRS sessions remain active');
  } catch (error) {
    log.error('Error during application quit:', error);
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Chat overlay IPC handlers
function createChatOverlay(data) {
  try {
    if (chatOverlayWindow && !chatOverlayWindow.isDestroyed()) {
      try { chatOverlayWindow.close(); } catch(e) {}
      chatOverlayWindow = null;
    }
    const preloadPath = path.join(appRoot, 'preload.js');
    const overlayHtmlPath = path.join(appRoot, 'src', 'views', 'chat_notify.html');
    chatOverlayWindow = new BrowserWindow({
      width: 360,
      height: 180,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath
      }
    });
    chatOverlayWindow.loadFile(overlayHtmlPath);
    try { chatOverlayWindow.setAlwaysOnTop(true, 'screen-saver'); } catch(e) {}
    try { chatOverlayWindow.setVisibleOnAllWorkspaces(true); } catch(e) {}
    try { chatOverlayWindow.setFocusable(true); } catch(e) {}

    chatOverlayWindow.once('ready-to-show', () => {
      try {
        const { workArea } = screen.getPrimaryDisplay();
        const b = chatOverlayWindow.getBounds();
        const x = workArea.x + workArea.width - b.width - 16;
        const y = workArea.y + workArea.height - b.height - 16;
        chatOverlayWindow.setPosition(x, y);
        chatOverlayWindow.show();
      } catch (e) { log.warn('position overlay error', e); }
    });

    chatOverlayWindow.webContents.on('did-finish-load', () => {
      try { chatOverlayWindow.webContents.send('chat:overlay-message', data); } catch(e) { log.warn('send overlay payload error', e); }
    });

    chatOverlayWindow.on('closed', () => { chatOverlayWindow = null; });
  } catch (err) {
    log.warn('createChatOverlay error', err);
  }
}

ipcMain.on('chat:notify', (_, data) => { createChatOverlay(data); });
ipcMain.on('chat:overlay-close', () => { try { if (chatOverlayWindow && !chatOverlayWindow.isDestroyed()) chatOverlayWindow.close(); } catch (e) {} });
ipcMain.on('chat:open-modal', (_, payload) => {
  try { if (mainWindow) mainWindow.webContents.send('chat:open-modal', payload); } catch (e) {}
  try { if (chatOverlayWindow && !chatOverlayWindow.isDestroyed()) chatOverlayWindow.close(); } catch (e) {}
});

// IPC handlers for authentication
// Helper: ambil IPv4 lokal non-internal
function getLocalIPv4() {
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (e) {}
  return null;
}
ipcMain.handle('login', async (_, credentials) => {
  try {
    const { username, password } = credentials;
    const user = await db.User.findOne({
      where: { username },
      include: [{ model: db.UnitKerja }]
    });

    if (!user) {
      return { success: false, message: 'Username atau password salah' };
    }

    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) {
      // Log failed login attempt
      await db.LoginAttempt.create({
        user_id: user.id,
        ip_address: '127.0.0.1', // Local app
        success: false
      });

      return { success: false, message: 'Username atau password salah' };
    }

    // Log successful login
    await db.LoginAttempt.create({
      user_id: user.id,
      ip_address: '127.0.0.1', // Local app
      success: true
    });

    // Enforce: user aktif per unit di portal harus yang baru login
    try {
      const unitId = user.unit_kerja_id;
      const ip = getLocalIPv4() || '127.0.0.1';
      const currentShift = await shiftService.getCurrentShift();

      // Tutup semua sesi aktif unit ini yang bukan milik user yang baru login
      const activeSessions = await db.SimrsUsage.findAll({
        where: { unit_kerja_id: unitId, status: 'active' }
      });
      for (const s of activeSessions) {
        if (s.user_id !== user.id) {
          await s.closeSession(
            `Automatically closed due to new user (${user.username || user.nama}) logging in from the same unit`
          );
        }
      }

      // Buat sesi aktif baru untuk user yang baru login
      await db.SimrsUsage.create({
        user_id: user.id,
        unit_kerja_id: unitId,
        ip_address: ip,
        start_time: new Date(),
        status: 'active',
        current_shift:
          user.UnitKerja && user.UnitKerja.uses_shift_system && user.UnitKerja.shift_enabled && currentShift
            ? currentShift.shift_name
            : null,
        shift_auto_started: false,
        notes: 'Session created at login to reflect active user per unit'
      });
      log.info(`Active user for unit ${unitId} set to user ${user.id} at login`);
    } catch (enforceErr) {
      log.warn('Failed to enforce active user per unit on login:', enforceErr);
    }

    // Return user data (excluding password)
    const userData = user.toJSON();
    delete userData.password;

    return {
      success: true,
      user: userData
    };
  } catch (error) {
    log.error('Login error:', error);
    return { success: false, message: 'Terjadi kesalahan saat login' };
  }
});

// IPC handler for running SIMRS
ipcMain.handle('run-simrs', async (_, userId) => {
  try {
    const user = await db.User.findByPk(userId, {
      include: [{
        model: db.UnitKerja,
        as: 'UnitKerja'
      }]
    });

    if (!user) {
      return { success: false, message: 'User tidak ditemukan' };
    }

    let simrsPath = user.simrs_path;
    let currentShift = null;
    let isShiftBased = false;

    // Check if user's unit uses shift system
    if (user.UnitKerja && user.UnitKerja.uses_shift_system && user.UnitKerja.shift_enabled) {
      isShiftBased = true;
      currentShift = await shiftService.getCurrentShift();
      
      log.info(`Unit ${user.UnitKerja.nama} menggunakan sistem shift`);
      log.info(`Current shift detected: ${currentShift ? currentShift.shift_name : 'none'}`);
      
      if (currentShift) {
        const shiftPath = user.UnitKerja.getSimrsPathForShift(currentShift.shift_name);
        log.info(`Shift path for ${currentShift.shift_name}: ${shiftPath}`);
        
        if (shiftPath) {
          simrsPath = shiftPath;
          log.info(`Using shift-based path for ${currentShift.shift_name}: ${simrsPath}`);
        } else {
          log.warn(`Shift path not configured for ${currentShift.shift_name}, falling back to user path: ${user.simrs_path}`);
        }
      } else {
        log.warn('No current shift detected, falling back to user path');
      }
    } else {
      log.info(`Unit ${user.UnitKerja ? user.UnitKerja.nama : 'unknown'} tidak menggunakan sistem shift`);
    }

    // Validate SIMRS path
    if (!simrsPath) {
      log.error('No SIMRS path available');
      return {
        success: false,
        message: 'Path SIMRS tidak ditemukan. Silakan update profil Anda dengan path SIMRS yang benar.'
      };
    }

    log.info(`Final SIMRS path to execute: ${simrsPath}`);

    // We no longer close active sessions when starting a new one
    // This ensures sessions remain active until explicit logout
    log.info(`Starting new SIMRS session for user ${userId} without closing existing sessions`);

    // Log new SIMRS usage with shift information
    const logEntry = await db.SimrsUsage.create({
      user_id: userId,
      unit_kerja_id: user.unit_kerja_id,
      ip_address: '127.0.0.1',
      start_time: new Date(),
      status: 'active',
      current_shift: currentShift ? currentShift.shift_name : null,
      shift_auto_started: false,
      notes: isShiftBased ? `Started with shift system (${currentShift?.shift_name})` : 'Started without shift system'
    });

    // Check if file exists
    if (!fs.existsSync(simrsPath)) {
      log.error(`SIMRS file not found: ${simrsPath}`);
      
      // Update the log entry to closed since SIMRS couldn't be launched
      await logEntry.update({
        status: 'closed',
        end_time: new Date(),
        notes: `File tidak ditemukan: ${simrsPath}`
      });

      return {
        success: false,
        message: `File SIMRS tidak ditemukan di lokasi: ${simrsPath}. Pastikan path sudah dikonfigurasi dengan benar di halaman admin.`
      };
    }

    log.info(`SIMRS file exists, proceeding to execute: ${simrsPath}`);

    // Get directory and filename
    const simrsDir = path.dirname(simrsPath);
    const simrsFile = path.basename(simrsPath);

    log.info(`SIMRS directory: ${simrsDir}`);
    log.info(`SIMRS filename: ${simrsFile}`);

    // Create command to run SIMRS with proper quoting and working directory
    const ext = path.extname(simrsFile).toLowerCase();
    let command;
    if (ext === '.bat' || ext === '.cmd') {
      // Open a new CMD window, stay open after script, and run from SIMRS directory
      command = 'cmd.exe /c start "" /D "' + simrsDir + '" cmd.exe /K "' + simrsFile + '"';
    } else {
      // Launch executables or other files directly in a new window from SIMRS directory
      command = 'cmd.exe /c start "" /D "' + simrsDir + '" "' + simrsFile + '"';
    }
    log.info(`Executing command: ${command}`);

    // Execute command
    exec(command, (error, stdout, stderr) => {
      if (error) {
        log.error('Error executing SIMRS command:', error);
        if (stdout) log.error('Command stdout:', stdout);
        if (stderr) log.error('Command stderr:', stderr);
        
        // Update the log entry to closed since there was an error
        logEntry.update({
          status: 'closed',
          end_time: new Date(),
          notes: `Error: ${error.message}`
        });

        return { success: false, message: `Error running SIMRS: ${error.message}` };
      } else {
        log.info('SIMRS command executed successfully');
        if (stdout) log.info('Command stdout:', stdout);
        if (stderr) log.info('Command stderr:', stderr);
      }
    });

    return {
      success: true,
      message: isShiftBased 
        ? `SIMRS berhasil dijalankan untuk shift ${currentShift?.shift_name}` 
        : 'SIMRS berhasil dijalankan',
      log_id: logEntry.id,
      shift_info: isShiftBased ? {
        current_shift: currentShift?.shift_name,
        shift_path: simrsPath
      } : null
    };
  } catch (error) {
    log.error('Error running SIMRS:', error);
    return { success: false, message: 'Terjadi kesalahan saat menjalankan SIMRS: ' + error.message };
  }
});

// IPC handler for closing SIMRS session
ipcMain.handle('close-simrs', async (_, logId) => {
  try {
    const usage = await db.SimrsUsage.findByPk(logId);
    if (!usage) {
      return {
        success: false,
        message: 'Sesi SIMRS tidak ditemukan'
      };
    }

    if (usage.status === 'closed') {
      return {
        success: true,
        message: 'Sesi SIMRS sudah ditutup sebelumnya'
      };
    }

    usage.end_time = new Date();
    usage.status = 'closed';
    await usage.save();

    return {
      success: true,
      message: 'Sesi SIMRS berhasil ditutup',
      usage: {
        id: usage.id,
        status: usage.status,
        end_time: usage.end_time
      }
    };
  } catch (error) {
    log.error('Error closing SIMRS session:', error);
    return { success: false, message: 'Terjadi kesalahan saat menutup sesi SIMRS' };
  }
});

// Tambahan: handler untuk menutup semua sesi aktif milik user saat logout
ipcMain.handle('close-all-simrs-for-user', async (_, userId) => {
  try {
    const activeSessions = await db.SimrsUsage.findAll({
      where: { user_id: userId, status: 'active' }
    });

    for (const session of activeSessions) {
      session.end_time = new Date();
      session.status = 'closed';
      session.notes = (session.notes ? session.notes + ' | ' : '') + 'Ditutup karena logout user';
      await session.save();
    }

    return {
      success: true,
      closed_count: activeSessions.length
    };
  } catch (error) {
    log.error('Error closing all SIMRS sessions for user:', error);
    return { success: false, message: 'Terjadi kesalahan saat menutup semua sesi SIMRS user' };
  }
});

// IPC handler for updating user profile
ipcMain.handle('update-profile', async (_, userData) => {
  try {
    const user = await db.User.findByPk(userData.id);
    if (!user) {
      return { success: false, message: 'User tidak ditemukan' };
    }

    await user.update(userData);

    // Return updated user data (excluding password)
    const updatedUser = user.toJSON();
    delete updatedUser.password;

    return {
      success: true,
      message: 'Profil berhasil diperbarui',
      user: updatedUser
    };
  } catch (error) {
    log.error('Error updating profile:', error);
    return { success: false, message: 'Terjadi kesalahan saat memperbarui profil' };
  }
});

// IPC handler for registering new user
ipcMain.handle('register', async (_, userData) => {
  try {
    // Check if username already exists
    const existingUsername = await db.User.findOne({ where: { username: userData.username } });
    if (existingUsername) {
      return { success: false, message: 'Username sudah digunakan' };
    }

    // Check if email already exists
    const existingEmail = await db.User.findOne({ where: { email: userData.email } });
    if (existingEmail) {
      return { success: false, message: 'Email sudah digunakan' };
    }

    // Create new user
    const newUser = await db.User.create(userData);

    // Return user data (excluding password)
    const createdUser = newUser.toJSON();
    delete createdUser.password;

    return {
      success: true,
      message: 'Registrasi berhasil',
      user: createdUser
    };
  } catch (error) {
    log.error('Registration error:', error);
    return { success: false, message: 'Terjadi kesalahan saat registrasi' };
  }
});

// IPC handler for getting all unit kerja
ipcMain.handle('get-all-unit-kerja', async () => {
  try {
    const unitKerjaList = await db.UnitKerja.findAll({
      order: [['nama', 'ASC']]
    });
    return unitKerjaList;
  } catch (error) {
    log.error('Error getting unit kerja:', error);
    return [];
  }
});

// IPC handler for getting SIMRS statistics
ipcMain.handle('get-simrs-statistics', async () => {
  try {
    // Total usage
    const totalUsage = await db.SimrsUsage.count();

    // Today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayUsage = await db.SimrsUsage.count({
      where: {
        start_time: {
          [Op.gte]: today
        }
      }
    });

    // Active usage
    const activeUsage = await db.SimrsUsage.count({
      where: {
        status: 'active'
      }
    });

    return {
      total: totalUsage,
      today: todayUsage,
      active: activeUsage
    };
  } catch (error) {
    log.error('Error getting SIMRS statistics:', error);
    return {
      total: 0,
      today: 0,
      active: 0
    };
  }
});

// IPC handler for getting SIMRS usage history
ipcMain.handle('get-simrs-history', async (_, userId) => {
  try {
    const history = await db.SimrsUsage.findAll({
      where: { user_id: userId },
      include: [{ model: db.UnitKerja }],
      order: [['start_time', 'DESC']],
      limit: 10
    });

    // Return plain JSON objects to avoid cloning errors
    return history.map(h => h.get({ plain: true }));
  } catch (error) {
    log.error('Error getting SIMRS history:', error);
    return [];
  }
});

// IPC handler for selecting SIMRS path
ipcMain.handle('select-simrs-path', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Executable Files', extensions: ['exe', 'bat', 'cmd', 'jar'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Pilih Aplikasi SIMRS'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return {
        success: true,
        filePath: result.filePaths[0]
      };
    }

    return { success: false };
  } catch (error) {
    log.error('Error selecting SIMRS path:', error);
    return { success: false, message: 'Terjadi kesalahan saat memilih file' };
  }
});

// IPC handler for browsing files (for shift configuration)
ipcMain.handle('browse-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Executable Files', extensions: ['exe', 'bat', 'cmd', 'jar'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Pilih File Aplikasi'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return {
        success: true,
        filePath: result.filePaths[0]
      };
    }

    return { success: false };
  } catch (error) {
    log.error('Error browsing file:', error);
    return { success: false, message: 'Terjadi kesalahan saat memilih file' };
  }
});

// Import axios for HTTP requests
const axios = require('axios');
const FormData = require('form-data');

// Helper function to check server connectivity
async function checkServerConnectivity(url = 'https://portal.rsudhabdulazizmarabahan.com/') {
  try {
    // Anggap server reachable jika domain merespons 2xx/3xx pada root
    const resp = await axios.get(url, {
      timeout: 5000,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });
    return !!resp;
  } catch (error) {
    log.warn(`Server connectivity check failed: ${error.message}`);
    return false;
  }
}

// IPC handler for uploading profile photo
ipcMain.handle('upload-profile-photo', async (_, userId, photoData) => {
  try {
    const user = await db.User.findByPk(userId);
    if (!user) {
      return { success: false, message: 'User tidak ditemukan' };
    }

    // Tentukan mime type dan ekstensi dari data URL
    const metaMatch = photoData && photoData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = metaMatch ? metaMatch[1] : 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/gif' ? 'gif' : 'jpg';

    const uploadsDir = path.join(__dirname, 'src', 'assets', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      log.info(`Created uploads directory: ${uploadsDir}`);
    }

    const fileNameLocal = `user_${userId}_${Date.now()}.${ext}`;
    const filePathLocal = path.join(uploadsDir, fileNameLocal);

    const base64Payload = photoData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Payload, 'base64');
    fs.writeFileSync(filePathLocal, imageBuffer);
    log.info(`Saved profile photo locally: ${fileNameLocal}`);

    let serverFilename = fileNameLocal;
    let serverUrl = null;
    let uploadedToServer = false;
    let serverVerified = false;

    // Coba upload ke server jika reachable
    const isServerReachable = await checkServerConnectivity();
    if (isServerReachable) {
      try {
        const formData = new FormData();
        formData.append('photo', imageBuffer, { filename: serverFilename, contentType: mimeType });
        formData.append('file', imageBuffer, { filename: serverFilename, contentType: mimeType });
        formData.append('user_id', String(userId));
        formData.append('filename', serverFilename);

        const reqOptions = {
          headers: formData.getHeaders(),
          timeout: 20000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          validateStatus: (s) => s >= 200 && s < 300
        };

        const base = 'https://portal.rsudhabdulazizmarabahan.com';

        // Legacy upload: direct POST to /uploads/upload.php using file stream
        try {
          const legacyUrl = `${base}/uploads/upload.php`;
          log.info(`Trying legacy upload endpoint: ${legacyUrl}`);
          const legacyForm = new FormData();
          legacyForm.append('file', fs.createReadStream(filePathLocal), {
            filename: serverFilename,
            contentType: mimeType,
          });
          const legacyResp = await axios.post(legacyUrl, legacyForm, {
            headers: legacyForm.getHeaders(),
            timeout: 30000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: (s) => s >= 200 && s < 300
          });
          const legacyData = legacyResp?.data || {};
          if (legacyData && (legacyData.success === true || legacyData.status === 'ok')) {
            uploadedToServer = true;
            if (legacyData.filename || legacyData.fileName || legacyData.name) {
              serverFilename = legacyData.filename || legacyData.fileName || legacyData.name;
            }
            serverUrl =
              legacyData.photo_url ||
              legacyData.file_url ||
              legacyData.url ||
              legacyData.path ||
              `${base}/uploads/photos/${serverFilename}`;
            log.info(`Legacy upload succeeded: ${serverFilename}`);
          } else {
            log.warn(`Legacy upload responded without success: ${JSON.stringify(legacyData)}`);
          }
        } catch (legacyErr) {
          log.warn(`Legacy upload failed: ${legacyErr.message}`);
        }

        // Fallback: direct PUT to /uploads/photos/<filename> if legacy failed
        if (!uploadedToServer) {
          try {
            const putUrl = `${base}/uploads/photos/${serverFilename}`;
            log.info(`Trying direct PUT to: ${putUrl}`);
            const putResp = await axios.put(putUrl, imageBuffer, {
              headers: { 'Content-Type': mimeType },
              timeout: 30000,
              validateStatus: (s) => s >= 200 && s < 300
            });
            if (putResp && putResp.status >= 200 && putResp.status < 300) {
              uploadedToServer = true;
              serverUrl = putUrl;
              log.info(`Direct PUT upload succeeded: ${serverFilename}`);
            } else {
              log.warn(`Direct PUT failed with status: ${putResp?.status}`);
            }
          } catch (putErr) {
            log.warn(`Direct PUT error: ${putErr.message}`);
          }
        }

        // Modern endpoints: try API/root handlers if still not uploaded
        let response;
        let lastErr;
        if (!uploadedToServer) {
          const endpoints = [
            `${base}/api/upload_photo`,
            `${base}/api/upload_photo.php`,
            `${base}/upload_photo`,
            `${base}/upload_photo.php`
          ];
          for (const url of endpoints) {
            try {
              log.info(`Trying upload endpoint: ${url}`);
              response = await axios.post(url, formData, reqOptions);
              log.info(`Upload succeeded at: ${url}`);
              break;
            } catch (err) {
              const status = err?.response?.status;
              log.warn(`Upload endpoint failed (${status || 'no-status'}): ${url} -> ${err.message}`);
              lastErr = err;
            }
          }
          if (!response) {
            throw lastErr || new Error('All upload endpoints failed');
          }

          const data = response?.data || {};
          uploadedToServer = true;

          if (data.filename || data.fileName || data.name) {
            serverFilename = data.filename || data.fileName || data.name;
          }
          serverUrl =
            data.photo_url ||
            data.file_url ||
            data.url ||
            data.path ||
            `${base}/uploads/photos/${serverFilename}`;
        }

        // Jika server mengganti nama file, duplikasi lokal untuk konsistensi fallback
        if (serverFilename !== fileNameLocal) {
          const serverLocalPath = path.join(uploadsDir, serverFilename);
          try {
            fs.copyFileSync(filePathLocal, serverLocalPath);
            log.info(`Duplicated local photo as server filename: ${serverFilename}`);
          } catch (copyErr) {
            log.warn(`Failed duplicating local photo to server filename: ${copyErr.message}`);
          }
        }

        // Verifikasi URL (optional, tidak menggugurkan keberhasilan upload jika HEAD tidak didukung)
        if (uploadedToServer && serverUrl) {
          try {
            const headResp = await axios.head(serverUrl, { timeout: 7000 });
            serverVerified = headResp.status >= 200 && headResp.status < 400;
            if (serverVerified) {
              log.info(`Server photo verified at: ${serverUrl}`);
            } else {
              log.warn(`Server photo URL not OK (${headResp.status}).`);
            }
          } catch (verErr) {
            log.warn(`Cannot verify server photo URL via HEAD: ${verErr.message}`);
          }
        }
      } catch (uploadErr) {
        log.warn(`Upload to server failed: ${uploadErr.message}`);
      }
    } else {
      log.warn('Server is not reachable; using local photo.');
    }

    // Simpan nama file (prioritaskan nama dari server) di database user
    await user.update({ photo: serverFilename });
    log.info(`Updated user ${userId} with photo filename: ${serverFilename}`);

    const photoUrl = uploadedToServer ? serverUrl : `../assets/uploads/${serverFilename}`;

    return {
      success: true,
      uploaded_to_server: uploadedToServer,
      server_verified: serverVerified,
      message: uploadedToServer
        ? (serverVerified ? 'Foto profil diupload & diverifikasi di server' : 'Foto profil diupload ke server')
        : 'Foto profil disimpan lokal (server tidak tersedia)',
      photoPath: photoUrl,
      fileName: serverFilename
    };
  } catch (error) {
    log.error('Error uploading profile photo:', error);
    return { success: false, message: 'Terjadi kesalahan saat mengupload foto profil' };
  }
});

// IPC handlers for shift system
ipcMain.handle('get-shift-status', async (_, unitId) => {
  try {
    return await shiftService.getUnitShiftStatus(unitId);
  } catch (error) {
    log.error('Error getting shift status:', error);
    return null;
  }
});

// IPC handler: get-current-shift
ipcMain.handle('get-current-shift', async () => {
  try {
    const shift = await shiftService.getCurrentShift();
    // Ensure we return a cloneable plain object to the renderer
    return shift ? shift.get({ plain: true }) : null;
  } catch (error) {
    console.error('Error in get-current-shift:', error);
    return null;
  }
});

ipcMain.handle('manual-shift-change', async (_, { unitId, userId, newShiftName }) => {
  try {
    return await shiftService.manualShiftChange(unitId, userId, newShiftName);
  } catch (error) {
    log.error('Error manual shift change:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-shift-history', async (_, { unitId, startDate, endDate }) => {
  try {
    return await shiftService.getShiftHistory(unitId, startDate, endDate);
  } catch (error) {
    log.error('Error getting shift history:', error);
    return [];
  }
});

ipcMain.handle('update-unit-shift-config', async (_, config) => {
  try {
    const unit = await db.UnitKerja.findByPk(config.unitKerjaId);
    if (!unit) {
      return { success: false, message: 'Unit kerja tidak ditemukan' };
    }

    await unit.update({
      uses_shift_system: config.usesShiftSystem,
      shift_pagi_path: config.shiftPagiPath,
      shift_malam_path: config.shiftMalamPath,
      shift_enabled: config.shiftEnabled
    });

    return { success: true, message: 'Konfigurasi shift berhasil diperbarui' };
  } catch (error) {
    log.error('Error updating unit shift config:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-all-shifts', async () => {
  try {
    return await db.ShiftSchedule.findAll({
      order: [['start_time', 'ASC']]
    });
  } catch (error) {
    log.error('Error getting all shifts:', error);
    return [];
  }
});

// New: Update shift schedule (admin)
ipcMain.handle('update-shift-schedule', async (_, schedule) => {
  try {
    const { shift_name, start_time, end_time, is_overnight } = schedule || {};
    if (!shift_name || !start_time || !end_time) {
      return { success: false, message: 'Data jadwal tidak lengkap' };
    }

    const shift = await db.ShiftSchedule.findOne({ where: { shift_name } });
    if (!shift) {
      return { success: false, message: 'Shift tidak ditemukan' };
    }

    const start = start_time.length === 8 ? start_time : `${start_time}:00`;
    const end = end_time.length === 8 ? end_time : `${end_time}:00`;

    await shift.update({
      start_time: start,
      end_time: end,
      is_overnight: !!is_overnight
    });

    log.info(`Shift ${shift_name} diubah: ${start} - ${end}, overnight=${!!is_overnight}`);
    return { success: true };
  } catch (error) {
    log.error('Error updating shift schedule:', error);
    return { success: false, message: error.message };
  }
});

// IPC handler for getting all units with shift configuration (for admin page)
ipcMain.handle('get-all-units-with-shift-config', async () => {
  try {
    const units = await db.UnitKerja.findAll({
      order: [['nama', 'ASC']]
    });
    return units;
  } catch (error) {
    log.error('Error getting units with shift config:', error);
    return [];
  }
});

// IPC handler for updating unit shift configuration (for admin page)
ipcMain.handle('update-unit-shift-config-admin', async (_, unitConfig) => {
  try {
    const unit = await db.UnitKerja.findByPk(unitConfig.id);
    if (!unit) {
      return { success: false, message: 'Unit kerja tidak ditemukan' };
    }

    await unit.update({
      uses_shift_system: unitConfig.uses_shift_system,
      shift_enabled: unitConfig.shift_enabled,
      shift_pagi_path: unitConfig.shift_pagi_path,
      shift_malam_path: unitConfig.shift_malam_path
    });

    log.info(`Updated shift config for unit ${unit.nama}: uses_shift=${unitConfig.uses_shift_system}, enabled=${unitConfig.shift_enabled}`);

    return { success: true, message: 'Konfigurasi shift berhasil diperbarui' };
  } catch (error) {
    log.error('Error updating unit shift config:', error);
    return { success: false, message: error.message };
  }
});

// IPC handlers for recovery service
ipcMain.handle('recovery:get-available-backups', async () => {
  try {
    return await recoveryService.getAvailableBackups();
  } catch (error) {
    log.error('Error getting available backups:', error);
    return [];
  }
});

ipcMain.handle('recovery:manual-recovery', async (_, backupFile) => {
  try {
    await recoveryService.manualRecovery(backupFile);
    return { success: true, message: 'Recovery berhasil dilakukan' };
  } catch (error) {
    log.error('Error manual recovery:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('recovery:cleanup-old-backups', async () => {
  try {
    await recoveryService.cleanupOldBackups();
    return { success: true, message: 'Backup lama berhasil dibersihkan' };
  } catch (error) {
    log.error('Error cleanup old backups:', error);
    return { success: false, message: error.message };
  }
});
