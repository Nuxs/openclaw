/**
 * Dashboard Advanced Features
 * Charts, Modals, Notifications
 */

// ==================== Toast Notification System ====================

class ToastManager {
  constructor() {
    this.container = this.createContainer();
    this.sounds = {
      p0: new Audio(
        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKfj8LNjHAdBkdjywHInBSh+zPDZjj0KFl621+ytWBQMR6Hh8bllHgYugdDy14o2CBlou+3mnEwMDlCn4/C0YxwHO5HX8sFyKAUpfszw3I4+CxZfttbsrVgUDEih4PG5ZR4GLoHQ8teKNggaaLvt5ptNDA5Qp+PwtGMcBzuR1/LBcigFK37M8NyOPgsWX7bW7K1YFAxIoeDxuWUeBi6B0PLXijYIGmi77eabTQwOUKfj8LRjHAc7kdfywXIoBSt+zPDcjj4LFl+21uytWBQMSKHg8bllHgYugdDy14o2CBlou+3mm0wMDlCn4/C0YxwHO5HX8sFyKAUrfszw3I4+CxZfttbsrVgUDEih4PG5ZR4GLoHQ8teKNggZaLvt5ptNDA5Qp+PwtGMcBzuR1/LBcigFK37M8NyOPgsWX7bW7K1YFAxIoeDxuWUeBi6B0PLXijYIGWi77eabTQwOUKfj8LRjHAc7kdfywXIoBSt+zPDcjj4LFl+21uytWBQMSKHg8bllHgYugdDy14o2CBlou+3mm0wMDlCn4/C0YxwHO5HX8sFyKAUrfszw3I4+CxZfttbsrVgUDEih4PG5ZR4GLoDQ8teKNggZaLvt5ptNDA5Qp+PwtGMcBzuR1/LBcigFK37M8NyOPgsWX7bW7K1YFAxIoeDxuWUeBi6B0PLXijYIGWi77eabTQwOUKfj8LRjHAc7kdfywXIoBSt+zPDcjj4LFl+21uytWBQMSKHg8bllHgYugdDy14o2CBlou+3mm0wMDlCn4/C0YxwHO5HX8sFyKAUrfszw3I4+CxZfttbsrVgUDEih4PG5ZR4GLoHQ8teKNggZaLvt5ptNDA5Qp+PwtGMcBzuR1/LBcigFK37M8NyOPgsWX7bW7K1YFAxIoeDxuWUeBi6B0PLXijYIGWi77eabTAwOUKfj8LRjHAc7kdfywXIoBSt+zPDcjj4LFl+21uytWBQMSKHg8bllHgYugdDy14o2CBlou+3mm0wMDlCn4/C0YxwHO5HX8sFyKAUrfszw3I4+CxZfttbsrVgUDEih4PG5ZR4GLoHQ8teKNggZaLvt5ptNDA5Qp+PwtGMcBzuR1/LBcigFK37M8NyOPgsWX7bW7K1YFAxIoeDxuWUeBi6B0PLXijYIGWi77eabTQwOUKfj8LRjHAc7kdfywXIoBSt+zPDcjj4LFl+21uytWBQMSKHg8bllHgYugdDy14o2CBlou+3mm00MDlCn4/C0YxwHO5HX8sFyKAUrfszw3I4+CxZfttbsrVgUDEih4PG5ZR4GLoHQ8teKNggZaLvt5ptNDA5Qp+PwtGMcBzuR1/LBcigFK37M8NyOPgsWX7bW7K1YFAxIoeDxuWUeBi==",
      ),
    };
  }

  createContainer() {
    const container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    `;
    document.body.appendChild(container);
    return container;
  }

  show(message, type = "info", duration = 5000) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const icons = {
      success: "✅",
      error: "❌",
      warning: "⚠️",
      info: "ℹ️",
      p0: "🚨",
    };

    const colors = {
      success: { bg: "#10b981", border: "#059669" },
      error: { bg: "#ef4444", border: "#dc2626" },
      warning: { bg: "#f59e0b", border: "#d97706" },
      info: { bg: "#3b82f6", border: "#2563eb" },
      p0: { bg: "#dc2626", border: "#991b1b" },
    };

    const color = colors[type] || colors.info;

    toast.style.cssText = `
      background: ${color.bg};
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      border-left: 4px solid ${color.border};
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease-out;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.2s;
    `;

    toast.innerHTML = `
      <span style="font-size: 20px;">${icons[type]}</span>
      <span style="flex: 1;">${message}</span>
      <span style="opacity: 0.7; cursor: pointer;">✕</span>
    `;

    // Play sound for P0 alerts
    if (type === "p0") {
      try {
        this.sounds.p0.play().catch(() => {});
      } catch (e) {}
    }

    // Click to dismiss
    toast.addEventListener("click", () => {
      this.dismiss(toast);
    });

    // Hover effect
    toast.addEventListener("mouseenter", () => {
      toast.style.transform = "scale(1.02)";
    });
    toast.addEventListener("mouseleave", () => {
      toast.style.transform = "scale(1)";
    });

    this.container.appendChild(toast);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast);
      }, duration);
    }

    return toast;
  }

  dismiss(toast) {
    toast.style.animation = "slideOut 0.3s ease-in";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  success(message, duration) {
    return this.show(message, "success", duration);
  }

  error(message, duration) {
    return this.show(message, "error", duration);
  }

  warning(message, duration) {
    return this.show(message, "warning", duration);
  }

  info(message, duration) {
    return this.show(message, "info", duration);
  }

  p0Alert(message, duration = 0) {
    return this.show(message, "p0", duration); // P0 alerts don't auto-dismiss
  }
}

// Add animations
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Global instance
window.toast = new ToastManager();

// ==================== Modal System ====================

class ModalManager {
  constructor() {
    this.modals = {};
  }

  create(id, title, content, options = {}) {
    const modal = document.createElement("div");
    modal.id = `modal-${id}`;
    modal.className = "modal";
    modal.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content";
    modalContent.style.cssText = `
      background: #1e1e1e;
      color: #d4d4d4;
      margin: 5% auto;
      padding: 0;
      border-radius: 8px;
      width: ${options.width || "600px"};
      max-width: 90%;
      max-height: 80vh;
      overflow: auto;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      animation: slideDown 0.3s ease-out;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const titleEl = document.createElement("h2");
    titleEl.textContent = title;
    titleEl.style.cssText = `
      margin: 0;
      font-size: 20px;
      color: #4ec9b0;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #888;
      font-size: 28px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s, color 0.2s;
    `;
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "#333";
      closeBtn.style.color = "#fff";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "none";
      closeBtn.style.color = "#888";
    });
    closeBtn.addEventListener("click", () => this.close(id));

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.style.cssText = `
      padding: 24px;
    `;
    body.innerHTML = content;

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.close(id);
      }
    });

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === "Escape") {
        this.close(id);
      }
    };
    document.addEventListener("keydown", escHandler);

    this.modals[id] = {
      element: modal,
      escHandler,
      onClose: options.onClose,
    };

    return modal;
  }

  open(id) {
    const modal = this.modals[id];
    if (modal) {
      modal.element.style.display = "block";
      // Focus first input if exists
      setTimeout(() => {
        const firstInput = modal.element.querySelector("input, textarea, select");
        if (firstInput) {
          firstInput.focus();
        }
      }, 100);
    }
  }

  close(id) {
    const modal = this.modals[id];
    if (modal) {
      modal.element.style.animation = "fadeOut 0.2s ease-in";
      setTimeout(() => {
        modal.element.style.display = "none";
        modal.element.style.animation = "fadeIn 0.2s ease-out";
      }, 200);

      if (modal.onClose) {
        modal.onClose();
      }
    }
  }

  destroy(id) {
    const modal = this.modals[id];
    if (modal) {
      document.removeEventListener("keydown", modal.escHandler);
      if (modal.element.parentNode) {
        modal.element.parentNode.removeChild(modal.element);
      }
      delete this.modals[id];
    }
  }
}

// Add modal animations
const modalStyle = document.createElement("style");
modalStyle.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes slideDown {
    from {
      transform: translateY(-50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal input,
  .modal textarea,
  .modal select {
    width: 100%;
    padding: 10px;
    margin: 8px 0;
    background: #2d2d2d;
    border: 1px solid #444;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 14px;
    font-family: inherit;
  }

  .modal input:focus,
  .modal textarea:focus,
  .modal select:focus {
    outline: none;
    border-color: #4ec9b0;
  }

  .modal label {
    display: block;
    margin: 16px 0 4px 0;
    color: #888;
    font-size: 13px;
    font-weight: 600;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #333;
  }

  .modal-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-btn-primary {
    background: #0e639c;
    color: white;
  }

  .modal-btn-primary:hover {
    background: #1177bb;
  }

  .modal-btn-secondary {
    background: #333;
    color: #d4d4d4;
  }

  .modal-btn-secondary:hover {
    background: #444;
  }
`;
document.head.appendChild(modalStyle);

// Global instance
window.modal = new ModalManager();

// ==================== Chart Manager (Chart.js) ====================

class ChartManager {
  constructor() {
    this.charts = {};
    this.loadChartJS();
  }

  loadChartJS() {
    if (window.Chart) {
      this.ready = true;
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    script.onload = () => {
      this.ready = true;
      console.log("✅ Chart.js loaded");
    };
    document.head.appendChild(script);
  }

  async waitForReady() {
    while (!this.ready) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async createLineChart(canvasId, data, options = {}) {
    await this.waitForReady();

    const ctx = document.getElementById(canvasId);
    if (!ctx) {
      console.error(`Canvas ${canvasId} not found`);
      return null;
    }

    // Destroy existing chart
    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#d4d4d4",
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: "#333",
          },
          ticks: {
            color: "#888",
          },
        },
        y: {
          grid: {
            color: "#333",
          },
          ticks: {
            color: "#888",
          },
        },
      },
    };

    this.charts[canvasId] = new Chart(ctx, {
      type: "line",
      data,
      options: { ...defaultOptions, ...options },
    });

    return this.charts[canvasId];
  }

  async createBarChart(canvasId, data, options = {}) {
    await this.waitForReady();

    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#d4d4d4",
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: "#333",
          },
          ticks: {
            color: "#888",
          },
        },
        y: {
          grid: {
            color: "#333",
          },
          ticks: {
            color: "#888",
          },
        },
      },
    };

    this.charts[canvasId] = new Chart(ctx, {
      type: "bar",
      data,
      options: { ...defaultOptions, ...options },
    });

    return this.charts[canvasId];
  }

  async createDoughnutChart(canvasId, data, options = {}) {
    await this.waitForReady();

    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#d4d4d4",
          },
        },
      },
    };

    this.charts[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data,
      options: { ...defaultOptions, ...options },
    });

    return this.charts[canvasId];
  }

  destroy(canvasId) {
    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
      delete this.charts[canvasId];
    }
  }

  destroyAll() {
    Object.keys(this.charts).forEach((id) => {
      this.destroy(id);
    });
  }
}

// Global instance
window.chartManager = new ChartManager();

// ==================== Export ====================

window.DashboardAdvanced = {
  toast: window.toast,
  modal: window.modal,
  chartManager: window.chartManager,
};

console.log("✅ Dashboard Advanced Features loaded");
