// ============================================
// SMTP Gmail Aggregator - Client-side JS
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  // Sidebar toggle for mobile
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', function () {
      sidebar.classList.toggle('show');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function (e) {
      if (window.innerWidth <= 768 && sidebar.classList.contains('show')) {
        if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
          sidebar.classList.remove('show');
        }
      }
    });
  }

  // Auto-dismiss alerts after 5 seconds
  const alerts = document.querySelectorAll('.alert-dismissible');
  alerts.forEach(function (alert) {
    setTimeout(function () {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
      bsAlert.close();
    }, 5000);
  });

  // Auto-refresh dashboard every 30 seconds
  if (window.location.pathname === '/') {
    setTimeout(function () {
      window.location.reload();
    }, 30000);
  }

  // Auto-refresh queue page every 10 seconds
  if (window.location.pathname === '/queue') {
    setTimeout(function () {
      window.location.reload();
    }, 10000);
  }
});
