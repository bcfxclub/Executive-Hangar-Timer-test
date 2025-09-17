// 管理员功能模块
class AdminPanel {
  constructor() {
    this.isDragging = false;
    this.currentX = 0;
    this.currentY = 0;
    this.initialX = 0;
    this.initialY = 0;
    this.xOffset = 0;
    this.yOffset = 0;
    
    this.initEventListeners();
  }
  
  initEventListeners() {
    // 管理员登录按钮
    document.getElementById('admin-login-btn').addEventListener('click', () => {
      if (STATE.isAdmin) {
        this.logout();
      } else {
        this.showLoginModal();
      }
    });
    
    // 反馈按钮
    document.getElementById('feedback-btn').addEventListener('click', () => {
      document.getElementById('feedback-modal').style.display = 'flex';
    });
    
    // 后台管理按钮
    document.getElementById('admin-panel-btn').addEventListener('click', () => {
      document.getElementById('admin-panel').style.display = 'block';
      this.initDraggablePanel();
    });
    
    // 关闭后台管理面板
    document.getElementById('close-admin-panel').addEventListener('click', () => {
      document.getElementById('admin-panel').style.display = 'none';
    });
    
    // 取消登录
    document.getElementById('cancel-login').addEventListener('click', () => {
      document.getElementById('login-modal').style.display = 'none';
      document.getElementById('login-password').value = '';
    });
    
    // 取消反馈
    document.getElementById('cancel-feedback').addEventListener('click', () => {
      document.getElementById('feedback-modal').style.display = 'none';
      document.getElementById('feedback-content').value = '';
    });
    
    // 登录
    document.getElementById('login-btn').addEventListener('click', async () => {
      const password = document.getElementById('login-password').value;
      
      try {
        const result = await api.verifyPassword(password);
        if (result.valid) {
          this.login();
        } else {
          alert('密码错误');
        }
      } catch (error) {
        console.error('Login error:', error);
        alert('登录失败');
      }
    });
    
    // 提交反馈
    document.getElementById('submit-feedback').addEventListener('click', async () => {
      const content = document.getElementById('feedback-content').value;
      
      if (!content.trim()) {
        alert('请输入反馈内容');
        return;
      }
      
      try {
        await api.submitFeedback(content);
        alert('反馈提交成功');
        document.getElementById('feedback-modal').style.display = 'none';
        document.getElementById('feedback-content').value = '';
        
        if (STATE.isAdmin) {
          this.loadFeedback();
        }
      } catch (error) {
        console.error('Feedback error:', error);
        alert('反馈提交失败');
      }
    });
    
    // 更新通知
    document.getElementById('update-notification').addEventListener('click', () => {
      const notification = document.getElementById('notification-content').value;
      this.updateNotificationDisplay(notification);
      this.saveSettings();
    });
    
    // 保存外观设置
    document.getElementById('save-appearance').addEventListener('click', () => {
      this.saveAppearanceSettings();
    });
    
    // 保存页脚信息
    document.getElementById('save-footer-info').addEventListener('click', () => {
      this.saveSettings();
    });
    
    // 删除二维码
    document.getElementById('delete-qrcode').addEventListener('click', () => {
      document.getElementById('qrcode-url').value = '';
      this.updateQrcodePreview('');
      document.getElementById('qrcode-caption-input').value = '';
      document.getElementById('qrcode-caption').textContent = '';
      this.saveSettings();
    });
    
    // 背景透明度调整
    document.getElementById('bg-opacity').addEventListener('input', function() {
      document.documentElement.style.setProperty('--bg-opacity', this.value / 100);
      document.getElementById('opacity-value').textContent = this.value;
    });
    
    // 预览Logo
    document.getElementById('logo-url').addEventListener('change', function() {
      this.updateLogoPreview(this.value);
    }.bind(this));
    
    // 预览二维码
    document.getElementById('qrcode-url').addEventListener('change', function() {
      this.updateQrcodePreview(this.value);
    }.bind(this));
    
    // 预览背景
    document.getElementById('bg-image').addEventListener('change', function() {
      this.updateBgPreview(this.value);
    }.bind(this));
// 在initEventListeners方法中添加
document.getElementById('upload-bg-video').addEventListener('click', () => {
    this.handleVideoUpload('bg-video-upload', 'bg-video-url');
});

document.getElementById('play-video-preview').addEventListener('click', () => {
    this.playVideoPreview();
});

document.getElementById('pause-video-preview').addEventListener('click', () => {
    this.pauseVideoPreview();
});

document.getElementById('delete-bg-video').addEventListener('click', () => {
    this.deleteBackgroundVideo();
});

// 添加视频背景相关方法
updateVideoPreview(url) {
    const videoPreview = document.getElementById('bg-video-preview');
    const bgVideo = document.getElementById('bg-video');
    
    if (url && url.trim() !== '') {
        videoPreview.innerHTML = `
            <video controls style="max-width: 100%; max-height: 100%;">
                <source src="${url}" type="video/mp4">
                您的浏览器不支持视频播放
            </video>
        `;
        bgVideo.innerHTML = `<source src="${url}" type="video/mp4">`;
        bgVideo.style.display = 'block';
        // 隐藏图片背景
        document.body.style.backgroundImage = 'none';
    } else {
        videoPreview.innerHTML = '<div class="video-preview-placeholder">无背景视频</div>';
        bgVideo.innerHTML = '';
        bgVideo.style.display = 'none';
    }
}

playVideoPreview() {
    const video = document.querySelector('#bg-video-preview video');
    if (video) {
        video.play().catch(e => console.log('Video play failed:', e));
    }
}

pauseVideoPreview() {
    const video = document.querySelector('#bg-video-preview video');
    if (video) {
        video.pause();
    }
}

handleVideoUpload(fileInputId, urlInputId) {
    const fileInput = document.getElementById(fileInputId);
    if (fileInput.files.length === 0) {
        alert('请选择要上传的视频文件');
        return;
    }
    
    const file = fileInput.files[0];
    
    // 检查文件类型
    if (!file.type.startsWith('video/')) {
        alert('请选择视频文件');
        return;
    }
    
    // 检查文件大小（限制为20MB）
    if (file.size > 20 * 1024 * 1024) {
        alert('视频文件大小不能超过20MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById(urlInputId).value = e.target.result;
        this.updateVideoPreview(e.target.result);
    }.bind(this);
    reader.readAsDataURL(file);
}

deleteBackgroundVideo() {
    document.getElementById('bg-video-url').value = '';
    this.updateVideoPreview('');
    this.saveSettings();
}    
    // 测试API连接
    document.getElementById('test-api').addEventListener('click', async () => {
      const apiUrl = document.getElementById('api-url').value;
      const resultDiv = document.getElementById('api-test-result');
      
      try {
        const response = await fetch(`${apiUrl}/status`);
        if (response.ok) {
          resultDiv.textContent = 'API连接成功！';
          resultDiv.className = 'api-test-result success';
          CONFIG.API_BASE = apiUrl;
          localStorage.setItem('apiBase', apiUrl);
        } else {
          resultDiv.textContent = 'API连接失败：服务器返回错误';
          resultDiv.className = 'api-test-result error';
        }
      } catch (error) {
        resultDiv.textContent = `API连接失败：${error.message}`;
        resultDiv.className = 'api-test-result error';
      }
    });
    
    // 导出数据
    document.getElementById('export-data').addEventListener('click', async () => {
      try {
        const data = await api.exportData();
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(dataBlob);
        a.download = 'hangar-timer-backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (error) {
        console.error('Export error:', error);
        alert('导出失败');
      }
    });
    
    // 重置数据
    document.getElementById('reset-data').addEventListener('click', async () => {
      if (confirm('确定要重置所有数据吗？此操作不可恢复！')) {
        try {
          await api.resetData();
          alert('数据已重置');
          localStorage.setItem('isAdmin', 'false');
          location.reload();
        } catch (error) {
          console.error('Reset error:', error);
          alert('重置失败');
        }
      }
    });
    
    // 修改密码
    document.getElementById('admin-password').addEventListener('change', async function() {
      const newPassword = this.value;
      
      if (newPassword) {
        try {
          await api.changePassword(newPassword);
          alert('密码已更新');
          this.value = '';
        } catch (error) {
          console.error('Change password error:', error);
          alert('密码更新失败');
        }
      }
    });
    
    // 图片上传功能
    document.getElementById('upload-logo').addEventListener('click', () => {
      this.handleImageUpload('logo-upload', 'logo-url');
    });
    
    document.getElementById('upload-qrcode').addEventListener('click', () => {
      this.handleImageUpload('qrcode-upload', 'qrcode-url');
    });
    
    document.getElementById('upload-bg').addEventListener('click', () => {
      this.handleImageUpload('bg-upload', 'bg-image');
    });
    
    // 页脚信息点击事件
    document.getElementById('project-description-btn').addEventListener('click', () => {
      this.showFooterModal('project-description-input', '项目介绍');
    });
    
    document.getElementById('version-btn').addEventListener('click', () => {
      this.showFooterModal('version-input', '版本更新');
    });
    
    document.getElementById('about-btn').addEventListener('click', () => {
      this.showFooterModal('about-input', '关于本网站');
    });
    
    document.getElementById('close-footer-modal').addEventListener('click', () => {
      document.getElementById('footer-info-modal').style.display = 'none';
    });
    
    // 更新计时器
    document.getElementById('update-timer').addEventListener('click', () => {
      const newStartTime = new Date(document.getElementById('start-time').value);
      const initialPhase = document.getElementById('initial-phase').value;
      
      if (isNaN(newStartTime.getTime())) {
        alert('请输入有效的时间');
        return;
      }
      
      STATE.startTime = newStartTime;
      this.updateCalibrationTime();
      
      timer.initialize(initialPhase);
      
      this.saveSettings();
    });
  }
  
  login() {
    STATE.isAdmin = true;
    localStorage.setItem('isAdmin', 'true');
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('admin-panel-btn').style.display = 'flex';
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('login-password').value = '';
    document.getElementById('admin-login-btn').innerHTML = '<i class="fas fa-sign-out-alt"></i><span>退出管理员</span>';
    alert('管理员登录成功');
    
    this.loadFeedback();
  }
  
  logout() {
    STATE.isAdmin = false;
    localStorage.setItem('isAdmin', 'false');
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('admin-panel-btn').style.display = 'none';
    document.getElementById('admin-login-btn').innerHTML = '<i class="fas fa-user-lock"></i><span>管理员登录</span>';
    alert('已退出管理员模式');
  }
  
  showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
  }
  
  async loadSettings() {
    try {
      const config = await api.getConfig();
      
      if (config.startTime) {
        STATE.startTime = new Date(config.startTime);
        document.getElementById('start-time').value = timer.formatDateTime(STATE.startTime);
      }
      
      if (config.initialPhase) {
        document.getElementById('initial-phase').value = config.initialPhase;
      }
      
      if (config.timerEnabled !== undefined) {
        STATE.timerEnabled = config.timerEnabled;
        document.getElementById('timer-enabled').value = STATE.timerEnabled.toString();
      }
      
      if (config.notification) {
        document.getElementById('notification-content').value = config.notification;
        this.updateNotificationDisplay(config.notification);
      }
      
      if (config.customTitle) {
        document.getElementById('custom-title').value = config.customTitle;
        document.getElementById('title').textContent = config.customTitle;
      }
      
      if (config.logoUrl) {
        document.getElementById('logo-url').value = config.logoUrl;
        this.updateLogoPreview(config.logoUrl);
      }
      
      if (config.qrcodeUrl) {
        document.getElementById('qrcode-url').value = config.qrcodeUrl;
        this.updateQrcodePreview(config.qrcodeUrl);
      }
      
      if (config.qrcodeCaption) {
        document.getElementById('qrcode-caption-input').value = config.qrcodeCaption;
        document.getElementById('qrcode-caption').textContent = config.qrcodeCaption;
      }
      
      if (config.inviteCode) {
        document.getElementById('invite-code-input').value = config.inviteCode;
        document.getElementById('invite-code').textContent = config.inviteCode;
        document.getElementById('invite-code-container').style.display = 'block';
      }
      
      if (config.inviteLink) {
        document.getElementById('invite-link-input').value = config.inviteLink;
        document.getElementById('invite-link').href = config.inviteLink;
      }
      
      if (config.bgImage) {
        document.getElementById('bg-image').value = config.bgImage;
        this.updateBgPreview(config.bgImage);
      }
      
      if (config.bgOpacity) {
        document.getElementById('bg-opacity').value = config.bgOpacity;
        document.getElementById('opacity-value').textContent = config.bgOpacity;
        document.documentElement.style.setProperty('--bg-opacity', config.bgOpacity / 100);
      }
      
      if (config.calibrationTime) {
        document.getElementById('calibration-time').textContent = `校准时间: ${config.calibrationTime}`;
      }
      
      if (config.apiUrl) {
        CONFIG.API_BASE = config.apiUrl;
        localStorage.setItem('apiBase', CONFIG.API_BASE);
        document.getElementById('api-url').value = config.apiUrl;
      }
      
      // 加载页脚信息
      if (config.footerNotice) {
        document.getElementById('footer-notice-input').value = config.footerNotice;
        document.getElementById('footer-notice-scroll').textContent = config.footerNotice;
      }
      
      if (config.recordInfo) {
        document.getElementById('record-info-input').value = config.recordInfo;
        document.getElementById('record-info').textContent = config.recordInfo;
      }
      
      if (config.organizationName) {
        document.getElementById('organization-name-input').value = config.organizationName;
        document.getElementById('organization-name').textContent = config.organizationName;
      }
      
      if (config.projectDescription) {
        document.getElementById('project-description-input').value = config.projectDescription;
      }
      
      if (config.version) {
        document.getElementById('version-input').value = config.version;
      }
      
      if (config.about) {
        document.getElementById('about-input').value = config.about;
      }
      
      timer.initialize(config.initialPhase || '5-green');
      
      if (STATE.isAdmin) {
        document.getElementById('admin-panel-btn').style.display = 'flex';
        document.getElementById('admin-login-btn').innerHTML = '<i class="fas fa-sign-out-alt"></i><span>退出管理员</span>';
      }
      
      document.getElementById('timer-enabled').addEventListener('change', async function() {
        STATE.timerEnabled = this.value === 'true';
        await this.saveSettings();
        timer.initialize(document.getElementById('initial-phase').value);
      }.bind(this));
    } catch (error) {
      console.error('Failed to load settings:', error);
      if (error.name === 'AbortError') {
        document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接超时</span>';
      } else {
        document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接失败</span>';
      }
      timer.initialize('5-green');
    }
  }
  
  async saveSettings() {
    const config = {
      startTime: new Date(document.getElementById('start-time').value).toISOString(),
      initialPhase: document.getElementById('initial-phase').value,
      timerEnabled: document.getElementById('timer-enabled').value === 'true',
      notification: document.getElementById('notification-content').value,
      customTitle: document.getElementById('custom-title').value,
      logoUrl: document.getElementById('logo-url').value,
      qrcodeUrl: document.getElementById('qrcode-url').value,
      qrcodeCaption: document.getElementById('qrcode-caption-input').value,
      inviteCode: document.getElementById('invite-code-input').value,
      inviteLink: document.getElementById('invite-link-input').value,
      bgImage: document.getElementById('bg-image').value,
      bgOpacity: document.getElementById('bg-opacity').value,
      calibrationTime: document.getElementById('calibration-time').textContent.replace('校准时间: ', ''),
      apiUrl: document.getElementById('api-url').value,
      footerNotice: document.getElementById('footer-notice-input').value,
      recordInfo: document.getElementById('record-info-input').value,
      organizationName: document.getElementById('organization-name-input').value,
      projectDescription: document.getElementById('project-description-input').value,
      version: document.getElementById('version-input').value,
      about: document.getElementById('about-input').value
    };
    
    try {
      await api.saveConfig(config);
      
      CONFIG.API_BASE = config.apiUrl;
      localStorage.setItem('apiBase', CONFIG.API_BASE);
      
      this.updateInviteDisplay(config);
      this.updateFooterDisplay(config);
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('保存失败');
      return false;
    }
  }
  
  async saveAppearanceSettings() {
    const customTitle = document.getElementById('custom-title').value;
    const logoUrl = document.getElementById('logo-url').value;
    const qrcodeUrl = document.getElementById('qrcode-url').value;
    const qrcodeCaption = document.getElementById('qrcode-caption-input').value;
    const inviteCode = document.getElementById('invite-code-input').value;
    const inviteLink = document.getElementById('invite-link-input').value;
    const bgImage = document.getElementById('bg-image').value;
    const bgOpacity = document.getElementById('bg-opacity').value;
    
    if (customTitle) {
      document.getElementById('title').textContent = customTitle;
    }
    
    this.updateLogoPreview(logoUrl);
    this.updateQrcodePreview(qrcodeUrl);
    
    if (qrcodeCaption) {
      document.getElementById('qrcode-caption').textContent = qrcodeCaption;
    }
    
    this.updateInviteDisplay({inviteCode, inviteLink});
    
    if (bgImage) {
      document.body.style.backgroundImage = `url(${bgImage})`;
    }
    
    document.documentElement.style.setProperty('--bg-opacity', bgOpacity / 100);
    document.getElementById('opacity-value').textContent = bgOpacity;
    
    this.saveSettings();
  }
  
  updateInviteDisplay(config) {
    const inviteContainer = document.getElementById('invite-code-container');
    const inviteCode = document.getElementById('invite-code');
    const inviteLink = document.getElementById('invite-link');
    
    if (config.inviteCode && config.inviteCode.trim() !== '') {
      inviteCode.textContent = config.inviteCode;
      inviteContainer.style.display = 'block';
      
      if (config.inviteLink && config.inviteLink.trim() !== '') {
        inviteLink.href = config.inviteLink;
      } else {
        inviteLink.href = '#';
      }
    } else {
      inviteContainer.style.display = 'none';
    }
  }
  
  updateFooterDisplay(config) {
    if (config.footerNotice) {
      document.getElementById('footer-notice-scroll').textContent = config.footerNotice;
    }
    
    if (config.recordInfo) {
      document.getElementById('record-info').textContent = config.recordInfo;
    }
    
    if (config.organizationName) {
      document.getElementById('organization-name').textContent = config.organizationName;
    }
  }
  
  updateNotificationDisplay(notification) {
    const notificationScroll = document.getElementById('notification-scroll');
    if (notification && notification.trim() !== '') {
      notificationScroll.textContent = notification;
      document.getElementById('notification-bar').style.display = 'block';
    } else {
      document.getElementById('notification-bar').style.display = 'none';
    }
  }
  
  updateLogoPreview(url) {
    const logoPreview = document.getElementById('logo-preview');
    const logo = document.getElementById('logo');
    
    if (url && url.trim() !== '') {
      logoPreview.innerHTML = `<img src="${url}" alt="Logo Preview">`;
      logo.innerHTML = `<img src="${url}" alt="Logo">`;
    } else {
      logoPreview.innerHTML = '<span>无Logo</span>';
      logo.innerHTML = '';
    }
  }
  
  updateQrcodePreview(url) {
    const qrcodePreview = document.getElementById('qrcode-preview');
    const qrcode = document.getElementById('qrcode');
    
    if (url && url.trim() !== '') {
      qrcodePreview.innerHTML = `<img src="${url}" alt="QR Code Preview">`;
      qrcode.innerHTML = `<img src="${url}" alt="QR Code">`;
    } else {
      qrcodePreview.innerHTML = '<span>无二维码</span>';
      qrcode.innerHTML = '';
    }
  }
  
  updateBgPreview(url) {
    const bgPreview = document.getElementById('bg-preview');
    
    if (url && url.trim() !== '') {
      bgPreview.style.backgroundImage = `url(${url})`;
      document.body.style.backgroundImage = `url(${url})`;
    } else {
      bgPreview.style.backgroundImage = 'none';
      bgPreview.innerHTML = '<span>无背景图片</span>';
      document.body.style.backgroundImage = 'none';
    }
  }
  
  updateCalibrationTime() {
    const now = new Date();
    const calibrationTime = timer.formatDateTimeFull(now);
    document.getElementById('calibration-time').textContent = `校准时间: ${calibrationTime}`;
  }
  
  async loadFeedback() {
    try {
      const feedback = await api.getFeedback();
      const feedbackList = document.getElementById('feedback-list');
      
      if (feedback.length === 0) {
        feedbackList.innerHTML = '<div class="feedback-item">暂无反馈</div>';
        return;
      }
      
      feedbackList.innerHTML = '';
      feedback.forEach(item => {
        const feedbackItem = document.createElement('div');
        feedbackItem.className = 'feedback-item';
        feedbackItem.innerHTML = `
          <div class="feedback-date">${new Date(item.timestamp).toLocaleString()}</div>
          <div class="feedback-content">${item.content}</div>
          <button class="delete-feedback" data-id="${item.id}">删除</button>
        `;
        feedbackList.appendChild(feedbackItem);
      });
      
      document.querySelectorAll('.delete-feedback').forEach(button => {
        button.addEventListener('click', async function() {
          const id = this.getAttribute('data-id');
          if (confirm('确定要删除这条反馈吗？')) {
            try {
              await api.deleteFeedback(id);
              alert('反馈已删除');
              this.loadFeedback();
            } catch (error) {
              console.error('Delete feedback error:', error);
              alert('删除失败');
            }
          }
        }.bind(this));
      });
    } catch (error) {
      console.error('Load feedback error:', error);
    }
  }
  
  handleImageUpload(fileInputId, urlInputId) {
    const fileInput = document.getElementById(fileInputId);
    if (fileInput.files.length === 0) {
      alert('请选择要上传的图片');
      return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById(urlInputId).value = e.target.result;
      
      if (fileInputId === 'logo-upload') {
        this.updateLogoPreview(e.target.result);
      } else if (fileInputId === 'qrcode-upload') {
        this.updateQrcodePreview(e.target.result);
      } else if (fileInputId === 'bg-upload') {
        this.updateBgPreview(e.target.result);
      }
    }.bind(this);
    reader.readAsDataURL(file);
  }
  
  showFooterModal(inputId, title) {
    const content = document.getElementById(inputId).value || `暂无${title}`;
    document.getElementById('footer-modal-title').textContent = title;
    document.getElementById('footer-modal-content').innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
    document.getElementById('footer-info-modal').style.display = 'flex';
  }
  
  initDraggablePanel() {
    const panel = document.getElementById('admin-panel');
    const header = document.getElementById('admin-panel-header');
    
    header.addEventListener("mousedown", this.dragStart.bind(this));
    document.addEventListener("mouseup", this.dragEnd.bind(this));
    document.addEventListener("mousemove", this.drag.bind(this));
  }
  
  dragStart(e) {
    this.initialX = e.clientX - this.xOffset;
    this.initialY = e.clientY - this.yOffset;
    
    if (e.target === document.getElementById('admin-panel-header') || e.target.parentNode === document.getElementById('admin-panel-header')) {
      this.isDragging = true;
    }
  }
  
  dragEnd(e) {
    this.initialX = this.currentX;
    this.initialY = this.currentY;
    
    this.isDragging = false;
  }
  
  drag(e) {
    if (this.isDragging) {
      e.preventDefault();
      this.currentX = e.clientX - this.initialX;
      this.currentY = e.clientY - this.initialY;
      
      this.xOffset = this.currentX;
      this.yOffset = this.currentY;
      
      this.setTranslate(this.currentX, this.currentY, document.getElementById('admin-panel'));
    }
  }
  
  setTranslate(xPos, yPos, el) {
    el.style.transform = "translate3d(" + xPos + "px, " + yPos + "px, 0)";
  }
  
  async checkDbStatus() {
    try {
      await api.checkStatus();
      document.getElementById('db-status').innerHTML = '<i class="fas fa-database"></i> <span>数据库状态: 正常</span>';
    } catch (error) {
      if (error.name === 'AbortError') {
        document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接超时</span>';
      } else {
        document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接失败</span>';
      }
    }
  }
}

// 创建全局管理员面板实例
const adminPanel = new AdminPanel();

