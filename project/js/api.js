// API通信模块
class API {
  constructor() {
    this.baseUrl = CONFIG.API_BASE;
    this.retryCount = 0;
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.RETRY_TIMEOUT);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      this.retryCount = 0;
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (this.retryCount < CONFIG.MAX_RETRIES) {
        this.retryCount++;
        await this.delay(1000 * this.retryCount);
        return this.request(endpoint, options);
      }
      
      throw error;
    }
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async getConfig() {
    return this.request('/config');
  }
  
  async saveConfig(config) {
    return this.request('/config', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }
  
  async verifyPassword(password) {
    return this.request('/verify-password', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }
  
  async changePassword(password) {
    return this.request('/change-password', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }
  
  async getFeedback() {
    return this.request('/feedback');
  }
  
  async submitFeedback(content) {
    return this.request('/feedback', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }
  
  async deleteFeedback(id) {
    return this.request(`/feedback/${id}`, {
      method: 'DELETE'
    });
  }
  
  async exportData() {
    return this.request('/export');
  }
  
  async resetData() {
    return this.request('/reset', {
      method: 'POST'
    });
  }
  
  async checkStatus() {
    return this.request('/status');
  }
}

// 创建全局API实例
const api = new API();