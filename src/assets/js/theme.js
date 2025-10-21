(function () {
  function syncNavbarVariant(mode) {
    var nav = document.querySelector('.navbar');
    if (!nav) return;
    // Toggle Bootstrap variant classes to ensure proper link/toggler colors
    nav.classList.remove('navbar-dark', 'navbar-light');
    nav.classList.add(mode === 'dark' ? 'navbar-dark' : 'navbar-light');
  }

  function applyTheme(mode) {
    var body = document.body;
    if (!body) return;
    body.classList.remove('theme-light', 'theme-dark');
    body.classList.add(mode === 'dark' ? 'theme-dark' : 'theme-light');
    syncNavbarVariant(mode);
  }

  async function initThemeByShift() {
    var desired = 'light';
    try {
      if (window && window.api && typeof window.api.getCurrentShift === 'function') {
        var res = await window.api.getCurrentShift();
        var name = (res && (res.shift_name || res.shift)) ? (res.shift_name || res.shift) : '';
        var lower = String(name).toLowerCase();
        if (lower.includes('malam') || lower.includes('night')) {
          desired = 'dark';
        } else if (lower.includes('pagi') || lower.includes('siang') || lower.includes('day')) {
          desired = 'light';
        } else {
          // Fallback ke waktu
          var h = new Date().getHours();
          desired = (h >= 19 || h < 7) ? 'dark' : 'light';
        }
      } else {
        // Non-Electron preview fallback: berdasarkan jam lokal
        var hour = new Date().getHours();
        desired = (hour >= 19 || hour < 7) ? 'dark' : 'light';
      }
    } catch (e) {
      var h2 = new Date().getHours();
      desired = (h2 >= 19 || h2 < 7) ? 'dark' : 'light';
    }
    applyTheme(desired);
  }

  function applyThemeByShiftName(name) {
    var lower = String(name || '').toLowerCase();
    if (lower.includes('malam') || lower.includes('night')) {
      applyTheme('dark');
    } else if (lower.includes('pagi') || lower.includes('siang') || lower.includes('day')) {
      applyTheme('light');
    } else {
      var h = new Date().getHours();
      applyTheme((h >= 19 || h < 7) ? 'dark' : 'light');
    }
  }

  // Expose to window for manual updates (mis. setelah ganti shift manual)
  window.theme = {
    applyTheme: applyTheme,
    initThemeByShift: initThemeByShift,
    applyThemeByShiftName: applyThemeByShiftName
  };

  document.addEventListener('DOMContentLoaded', initThemeByShift);
})();