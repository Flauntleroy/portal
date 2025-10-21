// Register page renderer script

document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('register-form');
  const alertContainer = document.getElementById('alert-container');
  const browseSimrsPathBtn = document.getElementById('browse-simrs-path');
  
  // Load unit kerja data
  loadUnitKerjaData();
  
  // Handle register form submission
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form values
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const fullName = document.getElementById('full-name').value;
    const contact = document.getElementById('contact').value;
    const unitKerjaId = document.getElementById('unit-kerja').value;
    const simrsPath = document.getElementById('simrs-path').value;
    
    // Validate form
    if (password !== confirmPassword) {
      showAlert('danger', 'Password dan konfirmasi password tidak cocok.');
      return;
    }
    
    // Clear previous alerts
    alertContainer.innerHTML = '';
    
    try {
      // Show loading message
      showAlert('info', 'Memproses registrasi...');
      
      // Prepare user data
      const userData = {
        username,
        email,
        password,
        full_name: fullName,
        contact: contact || null,
        unit_kerja_id: unitKerjaId || null,
        simrs_path: simrsPath || null
      };
      
      // Call register API
      const result = await window.api.register(userData);
      
      if (result.success) {
        showAlert('success', result.message + ' Silakan login dengan akun baru Anda.');
        
        // Clear form
        registerForm.reset();
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
      } else {
        showAlert('danger', result.message || 'Registrasi gagal. Silakan coba lagi.');
      }
    } catch (error) {
      console.error('Registration error:', error);
      showAlert('danger', 'Terjadi kesalahan saat registrasi. Silakan coba lagi.');
    }
  });
  
  // Browse SIMRS path button
  browseSimrsPathBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.selectSimrsPath();
      if (result && result.success && result.filePath) {
        document.getElementById('simrs-path').value = result.filePath;
      }
    } catch (error) {
      console.error('Error browsing for SIMRS path:', error);
    }
  });
  
  // Function to display alerts
  function showAlert(type, message) {
    alertContainer.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }
  
  // Load unit kerja data
  async function loadUnitKerjaData() {
    try {
      const unitKerjaList = await window.api.getAllUnitKerja();
      const unitSelect = document.getElementById('unit-kerja');
      
      // Add unit kerja options
      unitKerjaList.forEach(unit => {
        const option = document.createElement('option');
        option.value = unit.id;
        option.textContent = unit.nama;
        unitSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading unit kerja data:', error);
    }
  }
});
