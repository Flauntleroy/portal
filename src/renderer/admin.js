let unitsData = [];
let hasUnsavedChanges = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Check if user has admin access
    await checkAdminAccess();
    await loadUnitsData();
    await loadShiftSchedules();
    setupEventListeners();
    setupShiftScheduleListeners();
});

async function checkAdminAccess() {
    try {
        const userDataString = localStorage.getItem('currentUser');
        if (!userDataString) {
            showAccessDenied('Data pengguna tidak ditemukan');
            return;
        }

        const currentUser = JSON.parse(userDataString);
        if (currentUser.unit_kerja_id !== 5) {
            showAccessDenied('Akses ditolak. Hanya unit kerja dengan ID 5 yang dapat mengakses halaman admin.');
            return;
        }
    } catch (error) {
        console.error('Error checking admin access:', error);
        showAccessDenied('Terjadi kesalahan saat memeriksa akses admin');
    }
}

function showAccessDenied(message) {
    document.body.innerHTML = `
        <div class="container-fluid d-flex justify-content-center align-items-center" style="height: 100vh;">
            <div class="text-center">
                <div class="mb-4">
                    <i class="fas fa-ban text-danger" style="font-size: 4rem;"></i>
                </div>
                <h2 class="text-danger mb-3">Akses Ditolak</h2>
                <p class="text-muted mb-4">${message}</p>
                <button class="btn btn-primary" onclick="window.location.href='dashboard.html'">
                    <i class="fas fa-arrow-left me-2"></i>Kembali ke Dashboard
                </button>
            </div>
        </div>
    `;
}

function setupEventListeners() {
    // Search functionality
    document.getElementById('search-unit').addEventListener('input', filterUnits);
    
    // Filter functionality
    document.getElementById('filter-status').addEventListener('change', filterUnits);
    
    // Prevent accidental navigation with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

async function loadUnitsData() {
    try {
        const units = await window.api.getAllUnitsWithShiftConfig();
        console.log('Raw units data:', units);
        console.log('First unit:', units[0]);
        
        // Convert Sequelize instances to plain objects
        unitsData = units.map(unit => {
            const plainUnit = unit.dataValues || unit;
            console.log('Plain unit:', plainUnit);
            return plainUnit;
        });
        
        renderUnits(unitsData);
        updateStatistics(unitsData);
    } catch (error) {
        console.error('Error loading units data:', error);
        showAlert('danger', 'Gagal memuat data unit kerja');
    }
}

function renderUnits(units) {
    const container = document.getElementById('units-container');
    container.innerHTML = '';

    units.forEach(unit => {
        const unitCard = createUnitCard(unit);
        container.appendChild(unitCard);
    });
}

function createUnitCard(unit) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4 mb-4';

    const cardClass = unit.uses_shift_system && unit.shift_enabled ? 'shift-enabled' : 'shift-disabled';
    
    col.innerHTML = `
        <div class="card unit-card ${cardClass}" data-unit-id="${unit.id}">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h6 class="mb-0">${unit.nama}</h6>
                <div>
                    ${unit.uses_shift_system ? 
                        `<span class="badge bg-info status-badge">Menggunakan Shift</span>` : 
                        `<span class="badge bg-secondary status-badge">Tanpa Shift</span>`
                    }
                    ${unit.shift_enabled ? 
                        `<span class="badge bg-success status-badge ms-1">Aktif</span>` : 
                        `<span class="badge bg-warning status-badge ms-1">Nonaktif</span>`
                    }
                </div>
            </div>
            <div class="card-body">
                <!-- Toggle Menggunakan Sistem Shift -->
                <div class="form-check form-switch mb-3">
                    <input class="form-check-input" type="checkbox" id="uses-shift-${unit.id}" 
                           ${unit.uses_shift_system ? 'checked' : ''} 
                           onchange="toggleUsesShift(${unit.id}, this.checked)">
                    <label class="form-check-label" for="uses-shift-${unit.id}">
                        Menggunakan Sistem Shift
                    </label>
                </div>

                <!-- Shift Configuration (only show if uses shift system) -->
                <div id="shift-config-${unit.id}" style="display: ${unit.uses_shift_system ? 'block' : 'none'}">
                    <!-- Toggle Aktifkan Shift -->
                    <div class="form-check form-switch mb-3">
                        <input class="form-check-input" type="checkbox" id="shift-enabled-${unit.id}" 
                               ${unit.shift_enabled ? 'checked' : ''} 
                               onchange="toggleShiftEnabled(${unit.id}, this.checked)">
                        <label class="form-check-label" for="shift-enabled-${unit.id}">
                            Aktifkan Sistem Shift
                        </label>
                    </div>

                    <!-- Path Configuration (only show if shift is enabled) -->
                    <div id="path-config-${unit.id}" style="display: ${unit.shift_enabled ? 'block' : 'none'}">
                        <div class="mb-3">
                            <label class="form-label">
                                <i class="bi bi-sun me-1"></i>
                                Path SIMRS Shift Pagi (08:00-16:30)
                            </label>
                            <div class="input-group">
                                <input type="text" class="form-control path-input" 
                                       id="shift-pagi-${unit.id}" 
                                       value="${unit.shift_pagi_path || ''}"
                                       placeholder="Pilih file executable SIMRS untuk shift pagi"
                                       onchange="updatePath(${unit.id}, 'pagi', this.value)">
                                <button class="btn btn-outline-secondary" type="button" 
                                        onclick="browsePath(${unit.id}, 'pagi')">
                                    <i class="bi bi-folder2-open"></i>
                                </button>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">
                                <i class="bi bi-moon me-1"></i>
                                Path SIMRS Shift Malam (16:30-08:00)
                            </label>
                            <div class="input-group">
                                <input type="text" class="form-control path-input" 
                                       id="shift-malam-${unit.id}" 
                                       value="${unit.shift_malam_path || ''}"
                                       placeholder="Pilih file executable SIMRS untuk shift malam"
                                       onchange="updatePath(${unit.id}, 'malam', this.value)">
                                <button class="btn btn-outline-secondary" type="button" 
                                        onclick="browsePath(${unit.id}, 'malam')">
                                    <i class="bi bi-folder2-open"></i>
                                </button>
                            </div>
                        </div>

                        <div class="alert alert-info py-2">
                            <small>
                                <i class="bi bi-info-circle me-1"></i>
                                Pastikan path mengarah ke file executable (.exe) yang valid
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    return col;
}

function toggleUsesShift(unitId, usesShift) {
    const unit = unitsData.find(u => u.id === unitId);
    if (unit) {
        unit.uses_shift_system = usesShift;
        unit.has_changes = true;
        hasUnsavedChanges = true;
        
        // Show/hide shift configuration
        const shiftConfig = document.getElementById(`shift-config-${unitId}`);
        shiftConfig.style.display = usesShift ? 'block' : 'none';
        
        // If disabling shift system, also disable shift_enabled
        if (!usesShift) {
            unit.shift_enabled = false;
            document.getElementById(`shift-enabled-${unitId}`).checked = false;
            document.getElementById(`path-config-${unitId}`).style.display = 'none';
        }
        
        updateCardAppearance(unitId);
        updateStatistics(unitsData);
    }
}

function toggleShiftEnabled(unitId, shiftEnabled) {
    const unit = unitsData.find(u => u.id === unitId);
    if (unit) {
        unit.shift_enabled = shiftEnabled;
        unit.has_changes = true;
        hasUnsavedChanges = true;
        
        // Show/hide path configuration
        const pathConfig = document.getElementById(`path-config-${unitId}`);
        pathConfig.style.display = shiftEnabled ? 'block' : 'none';
        
        updateCardAppearance(unitId);
        updateStatistics(unitsData);
    }
}

function updatePath(unitId, shiftType, path) {
    const unit = unitsData.find(u => u.id === unitId);
    if (unit) {
        if (shiftType === 'pagi') {
            unit.shift_pagi_path = path;
        } else {
            unit.shift_malam_path = path;
        }
        unit.has_changes = true;
        hasUnsavedChanges = true;
    }
}

async function browsePath(unitId, shiftType) {
    try {
        const result = await window.api.browseFile();
        console.log('Browse file result:', result);
        
        // Handle different response formats
        if (result && result.success && result.filePath) {
            // New format from main.js
            const path = result.filePath;
            document.getElementById(`shift-${shiftType}-${unitId}`).value = path;
            updatePath(unitId, shiftType, path);
        } else if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
            // Old format (direct dialog result)
            const path = result.filePaths[0];
            document.getElementById(`shift-${shiftType}-${unitId}`).value = path;
            updatePath(unitId, shiftType, path);
        } else {
            console.log('File selection was canceled or no file selected');
        }
    } catch (error) {
        console.error('Error browsing file:', error);
        showAlert('danger', 'Gagal membuka dialog file: ' + error.message);
    }
}

function updateCardAppearance(unitId) {
    const card = document.querySelector(`[data-unit-id="${unitId}"] .unit-card`);
    const unit = unitsData.find(u => u.id === unitId);
    
    if (card && unit) {
        // Update card class
        card.className = `card unit-card ${unit.uses_shift_system && unit.shift_enabled ? 'shift-enabled' : 'shift-disabled'}`;
        
        // Update badges
        const header = card.querySelector('.card-header');
        const badgeContainer = header.querySelector('div');
        badgeContainer.innerHTML = `
            ${unit.uses_shift_system ? 
                `<span class="badge bg-info status-badge">Menggunakan Shift</span>` : 
                `<span class="badge bg-secondary status-badge">Tanpa Shift</span>`
            }
            ${unit.shift_enabled ? 
                `<span class="badge bg-success status-badge ms-1">Aktif</span>` : 
                `<span class="badge bg-warning status-badge ms-1">Nonaktif</span>`
            }
        `;
    }
}

function updateStatistics(units) {
    const totalUnits = units.length;
    const activeShifts = units.filter(u => u.uses_shift_system && u.shift_enabled).length;
    const usesShift = units.filter(u => u.uses_shift_system).length;
    const noShift = units.filter(u => !u.uses_shift_system).length;

    document.getElementById('total-units').textContent = totalUnits;
    document.getElementById('active-shifts').textContent = activeShifts;
    document.getElementById('uses-shift').textContent = usesShift;
    document.getElementById('no-shift').textContent = noShift;
}

function filterUnits() {
    const searchTerm = document.getElementById('search-unit').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    
    let filteredUnits = unitsData.filter(unit => {
        const matchesSearch = unit.nama.toLowerCase().includes(searchTerm);
        
        let matchesStatus = true;
        if (statusFilter === 'enabled') {
            matchesStatus = unit.uses_shift_system && unit.shift_enabled;
        } else if (statusFilter === 'disabled') {
            matchesStatus = !unit.shift_enabled;
        } else if (statusFilter === 'uses-shift') {
            matchesStatus = unit.uses_shift_system;
        }
        
        return matchesSearch && matchesStatus;
    });
    
    renderUnits(filteredUnits);
}

async function saveAllChanges() {
    const changedUnits = unitsData.filter(unit => unit.has_changes);
    
    if (changedUnits.length === 0) {
        showAlert('info', 'Tidak ada perubahan untuk disimpan.');
        return;
    }

    try {
        showAlert('info', `Menyimpan perubahan untuk ${changedUnits.length} unit kerja...`);
        
        for (const unit of changedUnits) {
            await window.api.updateUnitShiftConfigAdmin({
                id: unit.id,
                uses_shift_system: unit.uses_shift_system,
                shift_enabled: unit.shift_enabled,
                shift_pagi_path: unit.shift_pagi_path,
                shift_malam_path: unit.shift_malam_path
            });
            unit.has_changes = false;
        }
        
        hasUnsavedChanges = false;
        showAlert('success', `Berhasil menyimpan perubahan untuk ${changedUnits.length} unit kerja.`);
        
    } catch (error) {
        console.error('Error saving changes:', error);
        showAlert('danger', 'Gagal menyimpan perubahan: ' + error.message);
    }
}

function showAlert(type, message) {
    const alert = document.getElementById('admin-alert');
    const messageElement = document.getElementById('admin-alert-message');
    
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    messageElement.textContent = message;
    alert.style.display = 'block';
    
    // Auto-hide success and info alerts after 5 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }
}

function goBack() {
    if (hasUnsavedChanges) {
        if (confirm('Ada perubahan yang belum disimpan. Yakin ingin kembali?')) {
            window.history.back();
        }
    } else {
        window.history.back();
    }
}

async function loadShiftSchedules() {
    try {
        const schedules = await window.api.getAllShifts();
        // Expect array of schedules: { id, shift_name, start_time, end_time, is_overnight }
        const pagi = schedules.find(s => (s.shift_name || s.name) === 'pagi');
        const malam = schedules.find(s => (s.shift_name || s.name) === 'malam');

        if (pagi) {
            document.getElementById('shift-pagi-start').value = (pagi.start_time || '').slice(0,5);
            document.getElementById('shift-pagi-end').value = (pagi.end_time || '').slice(0,5);
        }
        if (malam) {
            document.getElementById('shift-malam-start').value = (malam.start_time || '').slice(0,5);
            document.getElementById('shift-malam-end').value = (malam.end_time || '').slice(0,5);
            const overnight = malam.is_overnight ?? malam.overnight ?? false;
            document.getElementById('shift-malam-overnight').checked = !!overnight;
        }
    } catch (error) {
        console.error('Error loading shift schedules:', error);
        showAlert('danger', 'Gagal memuat jadwal shift');
    }
}

function setupShiftScheduleListeners() {
    const btn = document.getElementById('save-shift-schedule-btn');
    if (!btn) return;
    btn.addEventListener('click', saveShiftSchedules);
}

async function saveShiftSchedules() {
    try {
        const pagiStart = document.getElementById('shift-pagi-start').value;
        const pagiEnd = document.getElementById('shift-pagi-end').value;
        const malamStart = document.getElementById('shift-malam-start').value;
        const malamEnd = document.getElementById('shift-malam-end').value;
        const malamOvernight = document.getElementById('shift-malam-overnight').checked;

        if (!pagiStart || !pagiEnd || !malamStart || !malamEnd) {
            showAlert('warning', 'Lengkapi semua jam shift sebelum menyimpan.');
            return;
        }

        showAlert('info', 'Menyimpan jadwal shift...');

        const pagiRes = await window.api.updateShiftSchedule({
            shift_name: 'pagi',
            start_time: pagiStart,
            end_time: pagiEnd,
            is_overnight: false
        });

        const malamRes = await window.api.updateShiftSchedule({
            shift_name: 'malam',
            start_time: malamStart,
            end_time: malamEnd,
            is_overnight: malamOvernight
        });

        if ((pagiRes && pagiRes.success) && (malamRes && malamRes.success)) {
            showAlert('success', 'Jadwal shift berhasil disimpan.');
        } else {
            const msg = (pagiRes && pagiRes.message) || (malamRes && malamRes.message) || 'Tidak diketahui';
            showAlert('danger', 'Gagal menyimpan jadwal shift: ' + msg);
        }
    } catch (error) {
        console.error('Error saving shift schedules:', error);
        showAlert('danger', 'Terjadi kesalahan saat menyimpan jadwal shift: ' + error.message);
    }
}