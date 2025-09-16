// 主应用逻辑
document.addEventListener('DOMContentLoaded', () => {
  // 设置API地址
  document.getElementById('api-url').value = CONFIG.API_BASE;
  
  // 加载设置
  adminPanel.loadSettings();
  
  // 检查数据库状态
  adminPanel.checkDbStatus();
  
  // 每5分钟检查一次数据库状态
  setInterval(() => {
    adminPanel.checkDbStatus();
  }, 5 * 60 * 1000);
});