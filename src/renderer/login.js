// Login page renderer script

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const alertContainer = document.getElementById('alert-container');

  // Handle login form submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    // Clear previous alerts
    alertContainer.innerHTML = '';
    
    try {
      // Show loading message
      showAlert('info', 'Memproses login...');
      
      // Call login API
      const result = await window.api.login({ username, password });
      
      if (result.success) {
        // Store user data in localStorage
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
      } else {
        // Show error message
        showAlert('danger', result.message || 'Login gagal. Silakan coba lagi.');
      }
    } catch (error) {
      console.error('Login error:', error);
      showAlert('danger', 'Terjadi kesalahan saat login. Silakan coba lagi.');
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
});
