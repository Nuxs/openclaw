/**
 * Dashboard API Client
 * Connects the UI with Web3 Core Gateway APIs
 */

class DashboardAPI {
  constructor(baseUrl = "http://localhost:3000") {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic API call handler
   */
  async call(endpoint, method = "GET", body = null) {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API call failed: ${endpoint}`, error);
      throw error;
    }
  }

  // ==================== Resource Market APIs ====================

  /**
   * Get all resources
   */
  async getResources(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.call(`/api/web3/resources?${params}`);
  }

  /**
   * Get resource by ID
   */
  async getResource(resourceId) {
    return await this.call(`/api/web3/resources/${resourceId}`);
  }

  /**
   * Create new resource
   */
  async createResource(resourceData) {
    return await this.call("/api/web3/resources", "POST", resourceData);
  }

  /**
   * Update resource
   */
  async updateResource(resourceId, updates) {
    return await this.call(`/api/web3/resources/${resourceId}`, "PATCH", updates);
  }

  /**
   * Delete resource
   */
  async deleteResource(resourceId) {
    return await this.call(`/api/web3/resources/${resourceId}`, "DELETE");
  }

  /**
   * Get leases for a resource
   */
  async getResourceLeases(resourceId) {
    return await this.call(`/api/web3/resources/${resourceId}/leases`);
  }

  /**
   * Create new lease
   */
  async createLease(leaseData) {
    return await this.call("/api/web3/leases", "POST", leaseData);
  }

  /**
   * Get lease statistics
   */
  async getLeaseStats() {
    return await this.call("/api/web3/leases/stats");
  }

  // ==================== Dispute APIs ====================

  /**
   * Get all disputes
   */
  async getDisputes(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.call(`/api/web3/disputes?${params}`);
  }

  /**
   * Get dispute by ID
   */
  async getDispute(disputeId) {
    return await this.call(`/api/web3/disputes/${disputeId}`);
  }

  /**
   * Create new dispute
   */
  async createDispute(disputeData) {
    return await this.call("/api/web3/disputes", "POST", disputeData);
  }

  /**
   * Submit evidence for dispute
   */
  async submitEvidence(disputeId, evidence) {
    return await this.call(`/api/web3/disputes/${disputeId}/evidence`, "POST", {
      evidence,
    });
  }

  /**
   * Resolve dispute
   */
  async resolveDispute(disputeId, resolution) {
    return await this.call(`/api/web3/disputes/${disputeId}/resolve`, "POST", {
      resolution,
    });
  }

  /**
   * Get dispute statistics
   */
  async getDisputeStats() {
    return await this.call("/api/web3/disputes/stats");
  }

  // ==================== Alert APIs ====================

  /**
   * Get all alerts
   */
  async getAlerts(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.call(`/api/web3/alerts?${params}`);
  }

  /**
   * Get alert by ID
   */
  async getAlert(alertId) {
    return await this.call(`/api/web3/alerts/${alertId}`);
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId) {
    return await this.call(`/api/web3/alerts/${alertId}/acknowledge`, "POST");
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId) {
    return await this.call(`/api/web3/alerts/${alertId}/resolve`, "POST");
  }

  /**
   * Get alert statistics
   */
  async getAlertStats() {
    return await this.call("/api/web3/alerts/stats");
  }

  /**
   * Get alert history
   */
  async getAlertHistory(limit = 50) {
    return await this.call(`/api/web3/alerts/history?limit=${limit}`);
  }

  // ==================== System APIs ====================

  /**
   * Get system status
   */
  async getSystemStatus() {
    return await this.call("/api/web3/status/summary");
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics() {
    return await this.call("/api/web3/metrics");
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit = 10) {
    return await this.call(`/api/web3/activity?limit=${limit}`);
  }

  /**
   * Health check
   */
  async healthCheck() {
    return await this.call("/health");
  }
}

// ==================== Dashboard Data Manager ====================

class DashboardManager {
  constructor(apiClient) {
    this.api = apiClient;
    this.refreshInterval = null;
    this.autoRefreshEnabled = false;
  }

  /**
   * Initialize dashboard with real data
   */
  async initialize() {
    console.log("🚀 Initializing dashboard...");

    try {
      // Load all initial data in parallel
      await Promise.all([
        this.loadOverviewData(),
        this.loadResources(),
        this.loadDisputes(),
        this.loadAlerts(),
      ]);

      console.log("✅ Dashboard initialized successfully");
    } catch (error) {
      console.error("❌ Dashboard initialization failed:", error);
      this.showError("Failed to load dashboard data");
    }
  }

  /**
   * Load overview statistics
   */
  async loadOverviewData() {
    try {
      const [systemStatus, leaseStats, disputeStats, alertStats] = await Promise.all([
        this.api.getSystemStatus(),
        this.api.getLeaseStats(),
        this.api.getDisputeStats(),
        this.api.getAlertStats(),
      ]);

      // Update UI with real data
      this.updateOverviewStats({
        totalResources: systemStatus.resources?.total || 0,
        activeLeases: leaseStats.active || 0,
        openDisputes: disputeStats.open || 0,
        activeAlerts: alertStats.active || 0,
      });

      // Load recent activity
      const activity = await this.api.getRecentActivity(10);
      this.updateRecentActivity(activity);
    } catch (error) {
      console.error("Failed to load overview data:", error);
    }
  }

  /**
   * Load resources from API
   */
  async loadResources(filters = {}) {
    try {
      const resources = await this.api.getResources(filters);
      this.renderResourcesTable(resources);
      return resources;
    } catch (error) {
      console.error("Failed to load resources:", error);
      this.showError("Failed to load resources");
      return [];
    }
  }

  /**
   * Load disputes from API
   */
  async loadDisputes(filters = {}) {
    try {
      const disputes = await this.api.getDisputes(filters);
      this.renderDisputesTable(disputes);
      return disputes;
    } catch (error) {
      console.error("Failed to load disputes:", error);
      this.showError("Failed to load disputes");
      return [];
    }
  }

  /**
   * Load alerts from API
   */
  async loadAlerts(filters = {}) {
    try {
      const alerts = await this.api.getAlerts(filters);
      this.renderAlerts(alerts);
      return alerts;
    } catch (error) {
      console.error("Failed to load alerts:", error);
      this.showError("Failed to load alerts");
      return [];
    }
  }

  /**
   * Update overview statistics in UI
   */
  updateOverviewStats(stats) {
    document.getElementById("stat-total-resources").textContent = stats.totalResources;
    document.getElementById("stat-active-leases").textContent = stats.activeLeases;
    document.getElementById("stat-open-disputes").textContent = stats.openDisputes;
    document.getElementById("stat-active-alerts").textContent = stats.activeAlerts;
  }

  /**
   * Update recent activity timeline
   */
  updateRecentActivity(activities) {
    const container = document.getElementById("recent-activity");
    if (!container) return;

    container.innerHTML = activities
      .map(
        (activity) => `
      <div class="timeline-item">
        <div class="timeline-time">${this.formatTimeAgo(activity.timestamp)}</div>
        <div class="timeline-content">
          <div class="timeline-title">${activity.title}</div>
          <div>${activity.description}</div>
        </div>
      </div>
    `,
      )
      .join("");
  }

  /**
   * Render resources table
   */
  renderResourcesTable(resources) {
    const tbody = document.getElementById("resources-tbody");
    if (!tbody) return;

    if (resources.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 3rem; color: var(--gray-500)">
            No resources found
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = resources
      .map(
        (resource) => `
      <tr>
        <td><strong>${resource.id}</strong></td>
        <td>${resource.name}</td>
        <td><code style="font-size: 0.75rem">${this.truncateAddress(resource.provider)}</code></td>
        <td>$${resource.pricePerHour.toFixed(2)}</td>
        <td>
          <span class="badge badge-${this.getResourceStatusBadge(resource.status)}">
            ${resource.status}
          </span>
        </td>
        <td>${resource.leases || 0}</td>
        <td>
          <div class="action-buttons">
            <button class="button button-sm button-secondary" onclick="dashboard.viewResource('${resource.id}')">
              View
            </button>
            <button class="button button-sm button-primary" onclick="dashboard.editResource('${resource.id}')">
              Edit
            </button>
          </div>
        </td>
      </tr>
    `,
      )
      .join("");
  }

  /**
   * Render disputes table
   */
  renderDisputesTable(disputes) {
    const tbody = document.getElementById("disputes-tbody");
    if (!tbody) return;

    if (disputes.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 3rem; color: var(--gray-500)">
            No disputes found
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = disputes
      .map(
        (dispute) => `
      <tr>
        <td><strong>${dispute.id}</strong></td>
        <td>${dispute.leaseId}</td>
        <td><code style="font-size: 0.75rem">${this.truncateAddress(dispute.filedBy)}</code></td>
        <td>${dispute.reason}</td>
        <td>
          <span class="badge badge-${this.getDisputeStatusBadge(dispute.status)}">
            ${dispute.status}
          </span>
        </td>
        <td>${this.formatDate(dispute.filedAt)}</td>
        <td>
          <div class="action-buttons">
            <button class="button button-sm button-secondary" onclick="dashboard.viewDispute('${dispute.id}')">
              View
            </button>
            ${
              dispute.status !== "resolved"
                ? `
              <button class="button button-sm button-success" onclick="dashboard.resolveDispute('${dispute.id}')">
                Resolve
              </button>
            `
                : ""
            }
          </div>
        </td>
      </tr>
    `,
      )
      .join("");
  }

  /**
   * Render alerts
   */
  renderAlerts(alerts) {
    const container = document.getElementById("alerts-container");
    if (!container) return;

    if (alerts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem">
            No Active Alerts
          </div>
          <div>All systems are running smoothly</div>
        </div>
      `;
      return;
    }

    container.innerHTML = alerts
      .map(
        (alert) => `
      <div class="alert alert-${alert.priority.toLowerCase()}">
        <div class="alert-icon">${this.getAlertIcon(alert.priority)}</div>
        <div class="alert-content">
          <div class="alert-title">[${alert.priority}] ${alert.title}</div>
          <div class="alert-message">${alert.message}</div>
          <div style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.5rem">
            ${this.formatDate(alert.timestamp)}
          </div>
        </div>
        <div class="action-buttons" style="flex-direction: column">
          ${
            alert.status === "active"
              ? `
            <button class="button button-sm button-secondary" onclick="dashboard.acknowledgeAlert('${alert.id}')">
              Acknowledge
            </button>
          `
              : ""
          }
          <button class="button button-sm button-success" onclick="dashboard.resolveAlert('${alert.id}')">
            Resolve
          </button>
        </div>
      </div>
    `,
      )
      .join("");

    // Update alert statistics
    const p0Count = alerts.filter((a) => a.priority === "P0" && a.status === "active").length;
    const p1Count = alerts.filter((a) => a.priority === "P1" && a.status === "active").length;
    const p2Count = alerts.filter((a) => a.priority === "P2" && a.status === "active").length;

    document.getElementById("stat-p0-alerts").textContent = p0Count;
    document.getElementById("stat-p1-alerts").textContent = p1Count;
    document.getElementById("stat-p2-alerts").textContent = p2Count;
  }

  // ==================== Action Handlers ====================

  async viewResource(resourceId) {
    try {
      const resource = await this.api.getResource(resourceId);
      this.showModal("Resource Details", this.formatResourceDetails(resource));
    } catch (error) {
      this.showError("Failed to load resource details");
    }
  }

  async editResource(resourceId) {
    // TODO: Show edit modal
    alert(`Edit resource ${resourceId} - Modal not implemented yet`);
  }

  async viewDispute(disputeId) {
    try {
      const dispute = await this.api.getDispute(disputeId);
      this.showModal("Dispute Details", this.formatDisputeDetails(dispute));
    } catch (error) {
      this.showError("Failed to load dispute details");
    }
  }

  async resolveDispute(disputeId) {
    if (!confirm(`Are you sure you want to resolve dispute ${disputeId}?`)) {
      return;
    }

    try {
      await this.api.resolveDispute(disputeId, {
        resolution: "Resolved by admin",
        outcome: "provider_favor",
      });
      this.showSuccess("Dispute resolved successfully");
      await this.loadDisputes();
      await this.loadOverviewData();
    } catch (error) {
      this.showError("Failed to resolve dispute");
    }
  }

  async acknowledgeAlert(alertId) {
    try {
      await this.api.acknowledgeAlert(alertId);
      this.showSuccess("Alert acknowledged");
      await this.loadAlerts();
      await this.loadOverviewData();
    } catch (error) {
      this.showError("Failed to acknowledge alert");
    }
  }

  async resolveAlert(alertId) {
    if (!confirm(`Are you sure you want to resolve this alert?`)) {
      return;
    }

    try {
      await this.api.resolveAlert(alertId);
      this.showSuccess("Alert resolved successfully");
      await this.loadAlerts();
      await this.loadOverviewData();
    } catch (error) {
      this.showError("Failed to resolve alert");
    }
  }

  // ==================== Helper Functions ====================

  truncateAddress(address) {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  formatDate(timestamp) {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return "N/A";
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  }

  getResourceStatusBadge(status) {
    const badges = {
      available: "success",
      leased: "info",
      maintenance: "warning",
      offline: "danger",
    };
    return badges[status] || "gray";
  }

  getDisputeStatusBadge(status) {
    const badges = {
      open: "danger",
      investigating: "warning",
      resolved: "success",
    };
    return badges[status] || "gray";
  }

  getAlertIcon(priority) {
    const icons = {
      P0: "🔴",
      P1: "🟡",
      P2: "🔵",
    };
    return icons[priority] || "⚪";
  }

  formatResourceDetails(resource) {
    return `
      <div style="line-height: 1.8">
        <p><strong>ID:</strong> ${resource.id}</p>
        <p><strong>Name:</strong> ${resource.name}</p>
        <p><strong>Provider:</strong> <code>${resource.provider}</code></p>
        <p><strong>Price:</strong> $${resource.pricePerHour}/hour</p>
        <p><strong>Status:</strong> ${resource.status}</p>
        <p><strong>Active Leases:</strong> ${resource.leases || 0}</p>
        <p><strong>Created:</strong> ${this.formatDate(resource.createdAt)}</p>
      </div>
    `;
  }

  formatDisputeDetails(dispute) {
    return `
      <div style="line-height: 1.8">
        <p><strong>Dispute ID:</strong> ${dispute.id}</p>
        <p><strong>Lease ID:</strong> ${dispute.leaseId}</p>
        <p><strong>Filed By:</strong> <code>${dispute.filedBy}</code></p>
        <p><strong>Reason:</strong> ${dispute.reason}</p>
        <p><strong>Status:</strong> ${dispute.status}</p>
        <p><strong>Filed At:</strong> ${this.formatDate(dispute.filedAt)}</p>
        ${dispute.resolvedAt ? `<p><strong>Resolved At:</strong> ${this.formatDate(dispute.resolvedAt)}</p>` : ""}
        ${dispute.evidence ? `<p><strong>Evidence:</strong> ${dispute.evidence}</p>` : ""}
      </div>
    `;
  }

  showModal(title, content) {
    alert(`${title}\n\n${content}`);
    // TODO: Implement proper modal
  }

  showSuccess(message) {
    console.log("✅", message);
    // TODO: Implement toast notification
    alert(`✅ ${message}`);
  }

  showError(message) {
    console.error("❌", message);
    // TODO: Implement toast notification
    alert(`❌ ${message}`);
  }

  /**
   * Enable auto-refresh
   */
  enableAutoRefresh(intervalMs = 30000) {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.autoRefreshEnabled = true;
    this.refreshInterval = setInterval(() => {
      console.log("🔄 Auto-refreshing dashboard...");
      this.initialize();
    }, intervalMs);

    console.log(`✅ Auto-refresh enabled (every ${intervalMs / 1000}s)`);
  }

  /**
   * Disable auto-refresh
   */
  disableAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.autoRefreshEnabled = false;
    console.log("⏸️ Auto-refresh disabled");
  }
}

// ==================== Export for use in HTML ====================

// Initialize when script loads
let dashboard;

if (typeof window !== "undefined") {
  // Browser environment
  const apiClient = new DashboardAPI();
  dashboard = new DashboardManager(apiClient);

  // Expose to global scope for onclick handlers
  window.dashboard = dashboard;
  window.DashboardAPI = DashboardAPI;
  window.DashboardManager = DashboardManager;
}

// Export for Node.js if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DashboardAPI,
    DashboardManager,
  };
}
