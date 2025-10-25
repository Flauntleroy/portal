// Login page renderer script

console.log('[login] script loaded');

document.addEventListener('DOMContentLoaded', () => {
  console.log('[login] DOMContentLoaded');
  const loginForm = document.getElementById('login-form');
  const alertContainer = document.getElementById('alert-container');

  console.log('[login] window.api exists?', !!window.api);

  // Apply theme based on current shift (siang = light, malam = dark)
  initThemeByShift();

  // Handle login form submission
  if (loginForm) {
    console.log('[login] form found');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      alertContainer.innerHTML = '';
      try {
        showAlert('info', 'Memproses login...');
        if (window.api?.login) {
          console.log('[login] invoking api.login');
          const result = await window.api.login({ username, password });
          console.log('[login] login result:', result);
          if (result.success) {
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            window.location.href = 'dashboard.html';
          } else {
            showAlert('danger', result.message || 'Login gagal. Silakan coba lagi.');
          }
        } else {
          // Fallback for non-Electron preview
          console.warn('[login] window.api.login not available');
          showAlert('info', 'Preview mode: simulasi login berhasil.');
        }
      } catch (error) {
        console.error('Login error:', error);
        showAlert('danger', 'Terjadi kesalahan saat login. Silakan coba lagi.');
      }
    });
  } else {
    console.warn('[login] form element not found');
  }

  function showAlert(type, message) {
    alertContainer.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }
});

async function initThemeByShift() {
  console.log('[login] initThemeByShift');
  try {
    let shift = 'siang';
    if (window.api?.getCurrentShift) {
      console.log('[login] invoking api.getCurrentShift');
      const res = await window.api.getCurrentShift();
      console.log('[login] getCurrentShift result:', res);
      // res is object like { shift_name: 'pagi' | 'malam' }
      shift = typeof res === 'string' ? res : (res?.shift_name || res?.shift || 'siang');
    }
    applyTheme(shift);
  } catch (err) {
    console.warn('Gagal mendapatkan shift, pakai light mode:', err);
    applyTheme('siang');
  }
}

function applyTheme(shift) {
  console.log('[login] applyTheme ->', shift);
  const body = document.body;
  body.classList.remove('theme-light', 'theme-dark');
  const useDark = ['malam', 'night', 'dark'].includes(String(shift).toLowerCase());
  body.classList.add(useDark ? 'theme-dark' : 'theme-light');
}
