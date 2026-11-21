// Loading overlay with blur effect and Lumaris logo
// Shows during authentication and data loading

let overlay = null;

export function showLoadingOverlay() {
  if (overlay) return;
  
  overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-content">
      <img src="https://shared-assets.lumaris.fr.eu.org/logo/logo.png" alt="Lumaris" class="loading-logo">
      <div class="loading-spinner"></div>
    </div>
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    #loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(8, 9, 18, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    #loading-overlay.visible {
      opacity: 1;
    }
    .loading-content {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    .loading-logo {
      width: 80px;
      height: 80px;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  
  // Trigger animation
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });
}

export function hideLoadingOverlay() {
  if (!overlay) return;
  
  overlay.classList.remove('visible');
  
  setTimeout(() => {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      overlay = null;
    }
  }, 300);
}
