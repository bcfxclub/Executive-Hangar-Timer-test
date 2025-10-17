// script.js - 修改后的版本，增加令牌过期检测和自动续期功能，并完善用户管理权限控制，以及移动端二维码和推荐码自动收起功能

// API地址设置 - 使用固定默认值，不存储在localStorage中
let API_BASE = "/api";

// 初始化状态
let startTime = new Date();
let currentPhase = 'reset';
let currentLights = [];
let countdownInterval;
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let timerEnabled = true;
let donationEnabled = false;
let currentEditingUser = null;

//新增：全局变量用于存储调整后的开始时间
let adjustedStartTime = new Date();
// 新增： 标记是否已经显示过会话过期提示
let hasShownExpiredAlert = false;
// 新增：令牌检查定时器
let tokenCheckInterval = null;
// 新增：令牌续期间隔（30分钟检查一次）
const TOKEN_CHECK_INTERVAL = 30 * 60 * 1000; // 30分钟
// 新增：令牌续期阈值（过期前1小时）
const TOKEN_RENEW_THRESHOLD = 60 * 60 * 1000; // 1小时

// 获取认证头信息 - 修改为使用令牌
function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (currentUser && currentUser.token) {
        headers['Authorization'] = `Bearer ${currentUser.token}`;
    }
    
    return headers;
}

// 检查API响应是否需要重新登录
function checkAuthResponse(response) {
    if (response.status === 401) {
        // 未授权，清除用户信息
        handleTokenExpired();
        return false;
    }
    return true;
}

// 新增：处理令牌过期
function handleTokenExpired() {
    // 清除用户信息
    currentUser = null;
    localStorage.removeItem('currentUser');
    updateUserInterface();
    
    // 如果还没有显示过过期提示，则显示并标记
    if (!hasShownExpiredAlert) {
        hasShownExpiredAlert = true;
        alert('会话已过期，请重新登录');
    }
    
    // 停止令牌检查定时器
    if (tokenCheckInterval) {
        clearInterval(tokenCheckInterval);
        tokenCheckInterval = null;
    }
}

// 新增：检测令牌状态
async function checkTokenStatus() {
    if (!currentUser || !currentUser.token) {
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE}/verify-token`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // 如果令牌即将过期，自动续期
            if (result.expiresSoon && result.canRenew) {
                await renewToken();
            }
            
            return true;
        } else {
            if (response.status === 401) {
                handleTokenExpired();
                return false;
            }
            return true; // 其他错误不视为令牌过期
        }
    } catch (error) {
        console.error('Token status check error:', error);
        // 网络错误时不处理，避免因临时网络问题误判为过期
        return true;
    }
}

// 新增：续期令牌
async function renewToken() {
    if (!currentUser || !currentUser.token) {
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE}/renew-token`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.success && result.tokenData) {
                // 更新用户令牌信息
                currentUser.tokenData = result.tokenData;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                console.log('令牌已自动续期');
                return true;
            }
        }
    } catch (error) {
        console.error('Token renewal error:', error);
    }
    
    return false;
}

// 新增：初始化令牌检查
function initTokenCheck() {
    // 清除现有的定时器
    if (tokenCheckInterval) {
        clearInterval(tokenCheckInterval);
    }
    
    // 如果用户已登录，启动定期检查
    if (currentUser && currentUser.token) {
        tokenCheckInterval = setInterval(async () => {
            await checkTokenStatus();
        }, TOKEN_CHECK_INTERVAL);
        
        // 立即执行一次检查
        setTimeout(async () => {
            await checkTokenStatus();
        }, 1000);
    }
}

// 从API加载设置
async function loadSettings() {
    try {
        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${API_BASE}/config`, {
            signal: controller.signal,
            headers: getAuthHeaders()
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const config = await response.json();
            
            if (config.startTime) {
                startTime = new Date(config.startTime);
                document.getElementById('start-time').value = formatDateTime(startTime);
            }
            
            if (config.initialPhase) {
                document.getElementById('initial-phase').value = config.initialPhase;
            }
            
            if (config.timerEnabled !== undefined) {
                timerEnabled = config.timerEnabled;
                document.getElementById('timer-enabled').value = timerEnabled.toString();
            }
            
            // 新增：捐助用户预测显示设置
            if (config.hangarTimesVisible !== undefined) {
                document.getElementById('hangar-times-visible').value = config.hangarTimesVisible.toString();
                localStorage.setItem('hangarTimesVisible', config.hangarTimesVisible.toString());
            } else {
                // 默认值为true
                document.getElementById('hangar-times-visible').value = 'true';
                localStorage.setItem('hangarTimesVisible', 'true');
            }
            
            if (config.notification) {
                document.getElementById('notification-content').value = config.notification;
                updateNotificationDisplay(config.notification, config.notificationLink);
            }
            
            if (config.notificationColor) {
                document.getElementById('notification-color').value = config.notificationColor;
                document.getElementById('notification-color-preview').style.backgroundColor = config.notificationColor;
                document.documentElement.style.setProperty('--notification-color', config.notificationColor);
            }
            
            if (config.notificationLink) {
                document.getElementById('notification-link').value = config.notificationLink;
            }
            
            if (config.customTitle) {
                document.getElementById('custom-title').value = config.customTitle;
                document.getElementById('title').textContent = config.customTitle;
            }
            
            if (config.headerTextColor) {
                document.getElementById('header-text-color').value = config.headerTextColor;
                document.getElementById('header-text-color-preview').style.backgroundColor = config.headerTextColor;
                document.documentElement.style.setProperty('--header-text-color', config.headerTextColor);
            }
            
            if (config.headerFontSize) {
                document.getElementById('header-font-size').value = config.headerFontSize;
                document.getElementById('header-font-size-value').textContent = config.headerFontSize + 'rem';
                document.documentElement.style.setProperty('--header-font-size', config.headerFontSize + 'rem');
                // 新增：同时设置手机端的标题字体大小
                document.documentElement.style.setProperty('--header-font-size-mobile', config.headerFontSize + 'rem');
            }
            
            if (config.logoUrl) {
                document.getElementById('logo-url').value = config.logoUrl;
                updateLogoPreview(config.logoUrl);
            }
            
            if (config.logoSize) {
                document.getElementById('logo-size').value = config.logoSize;
                document.getElementById('logo-size-value').textContent = config.logoSize + 'px';
                document.documentElement.style.setProperty('--logo-size', config.logoSize + 'px');
            }
            
            if (config.qrcodeUrl) {
                document.getElementById('qrcode-url').value = config.qrcodeUrl;
                updateQrcodePreview(config.qrcodeUrl);
            }
            
            if (config.qrcodeCaption) {
                document.getElementById('qrcode-caption-input').value = config.qrcodeCaption;
                document.getElementById('qrcode-caption').textContent = config.qrcodeCaption;
            }
            
            if (config.qrcodeCaptionColor) {
                document.getElementById('qrcode-caption-color').value = config.qrcodeCaptionColor;
                document.getElementById('qrcode-caption-color-preview').style.backgroundColor = config.qrcodeCaptionColor;
                document.documentElement.style.setProperty('--qrcode-caption-color', config.qrcodeCaptionColor);
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
            
            if (config.bgType) {
                document.getElementById('bg-type').value = config.bgType;
                // 根据背景类型更新显示
                updateBackgroundDisplay(config.bgType, config.bgImage, config.videoUrl);
            }
            
            if (config.bgImage) {
                document.getElementById('bg-image').value = config.bgImage;
                updateBgPreview(config.bgImage, config.bgType);
            }
            
            if (config.videoUrl) {
                document.getElementById('video-url').value = config.videoUrl;
                updateVideoPreview(config.videoUrl);
            }
            
            if (config.bgOpacity) {
                document.getElementById('bg-opacity').value = config.bgOpacity;
                document.getElementById('opacity-value').textContent = config.bgOpacity;
                document.documentElement.style.setProperty('--bg-opacity', config.bgOpacity / 100);
            }
            
            if (config.windowTextColor) {
                document.getElementById('window-text-color').value = config.windowTextColor;
                document.getElementById('window-text-color-preview').style.backgroundColor = config.windowTextColor;
                document.documentElement.style.setProperty('--window-text-color', config.windowTextColor);
            }
            
            if (config.windowCommentColor) {
                document.getElementById('window-comment-color').value = config.windowCommentColor;
                document.getElementById('window-comment-color-preview').style.backgroundColor = config.windowCommentColor;
                document.documentElement.style.setProperty('--window-comment-color', config.windowCommentColor);
            }
            
            if (config.windowTitleColor) {
                document.getElementById('window-title-color').value = config.windowTitleColor;
                document.getElementById('window-title-color-preview').style.backgroundColor = config.windowTitleColor;
                document.documentElement.style.setProperty('--window-title-color', config.windowTitleColor);
            }
            
            if (config.calibrationTextColor) {
                document.getElementById('calibration-text-color').value = config.calibrationTextColor;
                document.getElementById('calibration-text-color-preview').style.backgroundColor = config.calibrationTextColor;
                document.documentElement.style.setProperty('--calibration-text-color', config.calibrationTextColor);
            }
            
            if (config.countdownTextColor) {
                document.getElementById('countdown-text-color').value = config.countdownTextColor;
                document.getElementById('countdown-text-color-preview').style.backgroundColor = config.countdownTextColor;
                document.documentElement.style.setProperty('--countdown-text-color', config.countdownTextColor);
            }
            
            if (config.hangarTimeTextColor) {
                document.getElementById('hangar-time-text-color').value = config.hangarTimeTextColor;
                document.getElementById('hangar-time-text-color-preview').style.backgroundColor = config.hangarTimeTextColor;
                document.documentElement.style.setProperty('--hangar-time-text-color', config.hangarTimeTextColor);
            }
            
            if (config.statusTextColor) {
                document.getElementById('status-text-color').value = config.statusTextColor;
                document.getElementById('status-text-color-preview').style.backgroundColor = config.statusTextColor;
                document.documentElement.style.setProperty('--status-text-color', config.statusTextColor);
            }
            
            if (config.calibrationTime) {
                document.getElementById('calibration-time').textContent = `校准时间: ${config.calibrationTime}`;
            }
            
            if (config.apiUrl) {
                // 仅更新当前会话的API_BASE，不保存到localStorage
                API_BASE = config.apiUrl;
                document.getElementById('api-url').value = config.apiUrl;
            }
            
            if (config.donationEnabled !== undefined) {
                donationEnabled = config.donationEnabled;
                document.getElementById('donation-enabled').value = donationEnabled.toString();
                updateDonationButtonDisplay();
            }
            
            // 新增：加载捐助注释
            if (config.donationNote) {
                document.getElementById('donation-note').value = config.donationNote;
                document.getElementById('donation-note-display').textContent = config.donationNote;
            }
            
            if (config.wechatQrcodeUrl) {
                document.getElementById('wechat-qrcode-url').value = config.wechatQrcodeUrl;
                document.getElementById('wechat-qrcode').src = config.wechatQrcodeUrl;
            }
            
            if (config.alipayQrcodeUrl) {
                document.getElementById('alipay-qrcode-url').value = config.alipayQrcodeUrl;
                document.getElementById('alipay-qrcode').src = config.alipayQrcodeUrl;
            }
            
            if (config.donationBtnColor) {
                document.getElementById('donation-btn-color').value = config.donationBtnColor;
                document.getElementById('donation-btn-color-preview').style.backgroundColor = config.donationBtnColor;
                document.documentElement.style.setProperty('--donation-btn-bg', config.donationBtnColor);
            }
            
            // 加载页脚信息
            if (config.footerNotice) {
                document.getElementById('footer-notice-input').value = config.footerNotice;
                updateFooterNoticeDisplay(config.footerNotice, config.footerNoticeLink);
            }
            
            if (config.footerNoticeLink) {
                document.getElementById('footer-notice-link').value = config.footerNoticeLink;
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
            
            // 新增：加载令牌自动清理间隔
            if (config.tokenAutoCleanDays) {
                document.getElementById('auto-clean-days').value = config.tokenAutoCleanDays;
            }
            
            // 新增：加载令牌过期时间
            if (config.tokenExpirationDays) {
                document.getElementById('token-expiration-days').value = config.tokenExpirationDays;
            }
            
            initializeTimer(config.initialPhase || '5-green');

            // 更新用户界面状态
            updateUserInterface();

            // 添加计时器状态实时保存功能
            document.getElementById('timer-enabled').addEventListener('change', async function() {
                timerEnabled = this.value === 'true';
                await saveSettings();
                initializeTimer(document.getElementById('initial-phase').value);
            });
        } else {
            console.error('Failed to load settings');
            initializeTimer('5-green');
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
        if (error.name === 'AbortError') {
            document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接超时</span>';
        } else {
            document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接失败</span>';
        }
        initializeTimer('5-green');
    }
}

// 更新用户界面状态
function updateUserInterface() {
    const userLoginBtn = document.getElementById('user-login-btn');
    const adminPanelBtn = document.getElementById('admin-panel-btn');
    const userCenterBtn = document.getElementById('user-center-btn');
    
    if (currentUser) {
        userLoginBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i><span>退出登录</span>';
        
        // 检查用户权限，动态显示管理面板
        const hasAnyPermission = currentUser.isSuperAdmin || currentUser.isAdmin || 
            (currentUser.permissions && Object.values(currentUser.permissions).some(p => p));
        
        if (hasAnyPermission) {
            adminPanelBtn.style.display = 'flex';
            userCenterBtn.style.display = 'flex';
            
            // 动态更新管理面板标签显示
            updateAdminPanelTabs();
        } else {
            adminPanelBtn.style.display = 'none';
            userCenterBtn.style.display = 'flex';
        }
        
        // 初始化令牌检查
        initTokenCheck();
    } else {
        userLoginBtn.innerHTML = '<i class="fas fa-user"></i><span>用户登录</span>';
        adminPanelBtn.style.display = 'none';
        userCenterBtn.style.display = 'none';
        
        // 停止令牌检查
        if (tokenCheckInterval) {
            clearInterval(tokenCheckInterval);
            tokenCheckInterval = null;
        }
    }
    
    // 新增：用户登录状态变化时刷新捐助用户预测显示
    calculateHangarOpenTimes(adjustedStartTime);
}

// 动态更新管理面板标签显示
function updateAdminPanelTabs() {
    if (!currentUser) return;
    
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
        const tabName = tab.getAttribute('data-tab');
        let shouldShow = false;
        
        // 超级管理员可以看到所有标签
        if (currentUser.isSuperAdmin) {
            shouldShow = true;
        } 
        // 管理员根据权限显示标签
        else if (currentUser.isAdmin && currentUser.permissions) {
            shouldShow = currentUser.permissions[tabName] || false;
        }
        // 普通用户根据权限显示标签
        else if (currentUser.permissions) {
            shouldShow = currentUser.permissions[tabName] || false;
        }
        
        tab.style.display = shouldShow ? 'block' : 'none';
    });
    
    // 如果没有显示的标签，隐藏管理面板按钮
    const visibleTabs = Array.from(tabs).filter(tab => tab.style.display !== 'none');
    if (visibleTabs.length === 0) {
        document.getElementById('admin-panel-btn').style.display = 'none';
    }
}

// 保存设置到API
async function saveSettings() {
    const config = {
        startTime: new Date(document.getElementById('start-time').value).toISOString(),
        initialPhase: document.getElementById('initial-phase').value,
        timerEnabled: document.getElementById('timer-enabled').value === 'true',
        hangarTimesVisible: document.getElementById('hangar-times-visible').value === 'true',
        notification: document.getElementById('notification-content').value,
        notificationLink: document.getElementById('notification-link').value,
        notificationColor: document.getElementById('notification-color').value,
        customTitle: document.getElementById('custom-title').value,
        headerTextColor: document.getElementById('header-text-color').value,
        headerFontSize: parseFloat(document.getElementById('header-font-size').value),
        logoUrl: document.getElementById('logo-url').value,
        logoSize: parseInt(document.getElementById('logo-size').value),
        qrcodeUrl: document.getElementById('qrcode-url').value,
        qrcodeCaption: document.getElementById('qrcode-caption-input').value,
        qrcodeCaptionColor: document.getElementById('qrcode-caption-color').value,
        inviteCode: document.getElementById('invite-code-input').value,
        inviteLink: document.getElementById('invite-link-input').value,
        bgType: document.getElementById('bg-type').value,
        bgImage: document.getElementById('bg-image').value,
        videoUrl: document.getElementById('video-url').value,
        bgOpacity: document.getElementById('bg-opacity').value,
        windowTextColor: document.getElementById('window-text-color').value,
        windowCommentColor: document.getElementById('window-comment-color').value,
        windowTitleColor: document.getElementById('window-title-color').value,
        calibrationTextColor: document.getElementById('calibration-text-color').value,
        countdownTextColor: document.getElementById('countdown-text-color').value,
        hangarTimeTextColor: document.getElementById('hangar-time-text-color').value,
        statusTextColor: document.getElementById('status-text-color').value,
        calibrationTime: document.getElementById('calibration-time').textContent.replace('校准时间: ', ''),
        apiUrl: document.getElementById('api-url').value,
        donationEnabled: document.getElementById('donation-enabled').value === 'true',
        donationNote: document.getElementById('donation-note').value,
        wechatQrcodeUrl: document.getElementById('wechat-qrcode-url').value,
        alipayQrcodeUrl: document.getElementById('alipay-qrcode-url').value,
        donationBtnColor: document.getElementById('donation-btn-color').value,
        footerNotice: document.getElementById('footer-notice-input').value,
        footerNoticeLink: document.getElementById('footer-notice-link').value,
        recordInfo: document.getElementById('record-info-input').value,
        organizationName: document.getElementById('organization-name-input').value,
        projectDescription: document.getElementById('project-description-input').value,
        version: document.getElementById('version-input').value,
        about: document.getElementById('about-input').value,
        tokenAutoCleanDays: parseInt(document.getElementById('auto-clean-days').value) || 30,
        tokenExpirationDays: parseInt(document.getElementById('token-expiration-days').value) || 30
    };
    
    try {
        const response = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        
        if (response.ok) {
            // 更新当前会话的API_BASE，不保存到localStorage
            API_BASE = config.apiUrl;
            // 更新邀请码显示
            updateInviteDisplay(config);
            // 更新页脚显示
            updateFooterDisplay(config);
            // 更新捐助按钮显示
            updateDonationButtonDisplay();
            // 更新背景显示
            updateBackgroundDisplay(config.bgType, config.bgImage, config.videoUrl);
            // 更新捐助用户预测显示设置
            localStorage.setItem('hangarTimesVisible', config.hangarTimesVisible.toString());
            return true;
        } else {
            if (!checkAuthResponse(response)) {
                return false;
            }
            alert('保存失败');
            return false;
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        alert('保存失败');
        return false;
    }
}

// 更新背景显示
function updateBackgroundDisplay(bgType, bgImage, videoUrl) {
    const videoBackground = document.getElementById('video-background');
    
    if (bgType === 'video') {
        // 视频背景
        if (videoUrl && videoUrl.trim() !== '') {
            videoBackground.innerHTML = `<source src="${videoUrl}" type="video/mp4">`;
            videoBackground.style.display = 'block';
            document.body.classList.add('video-bg');
            document.body.style.backgroundImage = 'none';
        } else {
            videoBackground.style.display = 'none';
            document.body.classList.remove('video-bg');
            if (bgImage && bgImage.trim() !== '') {
                document.body.style.backgroundImage = `url(${bgImage})`;
            } else {
                document.body.style.backgroundImage = 'none';
            }
        }
    } else {
        // 图片背景
        videoBackground.style.display = 'none';
        document.body.classList.remove('video-bg');
        if (bgImage && bgImage.trim() !== '') {
            document.body.style.backgroundImage = `url(${bgImage})`;
        } else {
            document.body.style.backgroundImage = 'none';
        }
    }
}

// 更新邀请码显示
function updateInviteDisplay(config) {
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

// 更新捐助按钮显示
function updateDonationButtonDisplay() {
    const donationBtn = document.getElementById('donation-btn');
    if (donationEnabled) {
        donationBtn.style.display = 'flex';
    } else {
        donationBtn.style.display = 'none';
    }
}

// 更新页脚显示
function updateFooterDisplay(config) {
    if (config.footerNotice) {
        updateFooterNoticeDisplay(config.footerNotice, config.footerNoticeLink);
    }
    
    if (config.recordInfo) {
        document.getElementById('record-info').textContent = config.recordInfo;
    }
    
    if (config.organizationName) {
        document.getElementById('organization-name').textContent = config.organizationName;
    }
}

// 更新通知显示
function updateNotificationDisplay(notification, link) {
    const notificationScroll = document.getElementById('notification-scroll');
    if (notification && notification.trim() !== '') {
        if (link && link.trim() !== '') {
            notificationScroll.innerHTML = `<a href="${link}" target="_blank">${notification}</a>`;
        } else {
            notificationScroll.textContent = notification;
        }
        document.getElementById('notification-bar').style.display = 'block';
    } else {
        document.getElementById('notification-bar').style.display = 'none';
    }
}

// 更新页脚公告显示
function updateFooterNoticeDisplay(notice, link) {
    const footerNoticeScroll = document.getElementById('footer-notice-scroll');
    if (notice && notice.trim() !== '') {
        if (link && link.trim() !== '') {
            footerNoticeScroll.innerHTML = `<a href="${link}" target="_blank">${notice}</a>`;
        } else {
            footerNoticeScroll.textContent = notice;
        }
    }
}

// 更新Logo预览
function updateLogoPreview(url) {
    const logoPreview = document.getElementById('logo-preview');
    const logo = document.getElementById('logo');
    
    if (url && url.trim() !== '') {
        // 修改：添加样式让Logo自适应容器宽度
        logoPreview.innerHTML = `<img src="${url}" alt="Logo Preview" style="max-width: 100%; height: auto;">`;
        logo.innerHTML = `<img src="${url}" alt="Logo" style="max-width: 100%; height: auto;">`;
    } else {
        logoPreview.innerHTML = '<span>无Logo</span>';
        logo.innerHTML = '';
    }
}

// 更新二维码预览
function updateQrcodePreview(url) {
    const qrcodePreview = document.getElementById('qrcode-preview');
    const qrcode = document.getElementById('qrcode');
    
    if (url && url.trim() !== '') {
        qrcodePreview.innerHTML = `<img src="${url}" alt="QR Code Preview">`;
        qrcode.innerHTML = `<img src="${url}" alt="QR Code">`;
        
        // 添加点击事件
        qrcodePreview.onclick = function() {
            showQrcodeModal(url, document.getElementById('qrcode-caption-input').value);
        };
        
        qrcode.onclick = function() {
            showQrcodeModal(url, document.getElementById('qrcode-caption-input').value);
        };
    } else {
        qrcodePreview.innerHTML = '<span>无二维码</span>';
        qrcode.innerHTML = '';
        qrcodePreview.onclick = null;
        qrcode.onclick = null;
    }
}

// 显示二维码模态框
function showQrcodeModal(url, caption) {
    document.getElementById('qrcode-modal-img').src = url;
    document.getElementById('qrcode-modal-caption').textContent = caption || '';
    document.getElementById('qrcode-modal').style.display = 'flex';
}

// 更新背景预览
function updateBgPreview(url, type) {
    const bgPreview = document.getElementById('bg-preview');
    
    if (url && url.trim() !== '') {
        if (type === 'video') {
            // 图片背景预览
            bgPreview.style.backgroundImage = `url(${url})`;
            bgPreview.innerHTML = '';
        } else {
            // 图片背景预览
            bgPreview.style.backgroundImage = `url(${url})`;
            bgPreview.innerHTML = '';
        }
    } else {
        bgPreview.style.backgroundImage = 'none';
        bgPreview.innerHTML = '<span>无背景</span>';
    }
}

// 更新视频预览
function updateVideoPreview(url) {
    const videoPreview = document.getElementById('video-preview');
    
    if (url && url.trim() !== '') {
        videoPreview.innerHTML = `
            <video style="width: 100%; height: 100%; object-fit: cover;" controls>
                <source src="${url}" type="video/mp4">
                您的浏览器不支持视频标签
            </video>
        `;
    } else {
        videoPreview.innerHTML = '<span>视频预览区域</span>';
    }
}

// 更新校准时间显示
function updateCalibrationTime() {
    const now = new Date();
    const calibrationTime = formatDateTimeFull(now);
    document.getElementById('calibration-time').textContent = `校准时间: ${calibrationTime}`;
}

// 阶段持续时间（分钟）
const PHASE_DURATIONS = {
    reset: 120,      // 2小时 = 120分钟
    card: 60,        // 1小时 = 60分钟
    poweroff: 5      // 5分钟
};

// 阶段配置
const PHASE_CONFIG = {
    '5-red': { phase: 'reset', lights: ['red', 'red', 'red', 'red', 'red'], offset: 0 },
    '1-green-4-red': { phase: 'reset', lights: ['green', 'red', 'red', 'red', 'red'], offset: 24 },
    '2-green-3-red': { phase: 'reset', lights: ['green', 'green', 'red', 'red', 'red'], offset: 48 },
    '3-green-2-red': { phase: 'reset', lights: ['green', 'green', 'green', 'red', 'red'], offset: 72 },
    '4-green-1-red': { phase: 'reset', lights: ['green', 'green', 'green', 'green', 'red'], offset: 96 },
    '5-green': { phase: 'card', lights: ['green', 'green', 'green', 'green', 'green'], offset: 0 },
    '1-gray-4-green': { phase: 'card', lights: ['gray', 'green', 'green', 'green', 'green'], offset: 12 },
    '2-gray-3-green': { phase: 'card', lights: ['gray', 'gray', 'green', 'green', 'green'], offset: 24 },
    '3-gray-2-green': { phase: 'card', lights: ['gray', 'gray', 'gray', 'green', 'green'], offset: 36 },
    '4-gray-1-green': { phase: 'card', lights: ['gray', 'gray', 'gray', 'gray', 'green'], offset: 48 },
    '5-gray': { phase: 'poweroff', lights: ['gray', 'gray', 'gray', 'gray', 'gray'], offset: 0 }
};

// 设置初始时间
document.getElementById('start-time').value = formatDateTime(startTime);

// 更新计时器
document.getElementById('update-timer').addEventListener('click', function() {
    const newStartTime = new Date(document.getElementById('start-time').value);
    const initialPhase = document.getElementById('initial-phase').value;
    
    if (isNaN(newStartTime.getTime())) {
        alert('请输入有效的时间');
        return;
    }
    
    startTime = newStartTime;
    updateCalibrationTime();
    
    initializeTimer(initialPhase);
    
    // 保存设置
    saveSettings();
});

// 添加时间开放控制的保存事件监听
document.getElementById('save-time-control').addEventListener('click', function() {
    saveSettings();
});

// 用户登录按钮
document.getElementById('user-login-btn').addEventListener('click', async function() {
    if (currentUser) {
        // 退出登录 - 调用登出API使令牌失效
        try {
            await fetch(`${API_BASE}/logout`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
        } catch (error) {
            console.error('Logout API error:', error);
            // 即使API调用失败，也要继续执行本地退出逻辑
        } finally {
            // 清除本地用户信息
            currentUser = null;
            localStorage.removeItem('currentUser');
            updateUserInterface();
            alert('已退出登录');
        }
    } else {
        document.getElementById('login-modal').style.display = 'flex';
        // 切换到登录标签
        switchLoginTab('login');
    }
});

// 反馈按钮
document.getElementById('feedback-btn').addEventListener('click', function() {
    document.getElementById('feedback-modal').style.display = 'flex';
});

// 后台管理按钮
document.getElementById('admin-panel-btn').addEventListener('click', function() {
    document.getElementById('admin-panel').style.display = 'block';
    initDraggablePanel('admin-panel');
    // 加载反馈和访问统计
    loadFeedback();
    loadVisits();
    loadUsers();
    // 新增：加载令牌统计
    loadTokenStats();
});

// 用户中心按钮
document.getElementById('user-center-btn').addEventListener('click', function() {
    document.getElementById('user-center').style.display = 'block';
    initDraggablePanel('user-center');
    // 加载用户信息
    loadUserInfo();
    // 注意：移除了加载用户管理数据的部分
});

// 捐助按钮
document.getElementById('donation-btn').addEventListener('click', function() {
    document.getElementById('donation-modal').style.display = 'flex';
});

// 关闭后台管理面板
document.getElementById('close-admin-panel').addEventListener('click', function() {
    document.getElementById('admin-panel').style.display = 'none';
});

document.getElementById('close-admin-panel-bottom').addEventListener('click', function() {
    document.getElementById('admin-panel').style.display = 'none';
});

// 关闭用户中心
document.getElementById('close-user-center').addEventListener('click', function() {
    document.getElementById('user-center').style.display = 'none';
});

document.getElementById('close-user-center-bottom').addEventListener('click', function() {
    document.getElementById('user-center').style.display = 'none';
});

// 关闭二维码模态框
document.getElementById('close-qrcode-modal').addEventListener('click', function() {
    document.getElementById('qrcode-modal').style.display = 'none';
});

// 关闭捐助模态框
document.getElementById('close-donation-modal').addEventListener('click', function() {
    document.getElementById('donation-modal').style.display = 'none';
});

// 关闭密码找回弹窗
document.getElementById('close-password-modal').addEventListener('click', function() {
    document.getElementById('password-modal').style.display = 'none';
});

// 取消登录
document.getElementById('cancel-login').addEventListener('click', function() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
});

// 取消注册
document.getElementById('cancel-register').addEventListener('click', function() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('register-username').value = '';
    document.getElementById('register-password').value = '';
    document.getElementById('register-email').value = '';
    document.getElementById('security-question').value = '';
    document.getElementById('security-answer').value = '';
});

// 取消找回密码
document.getElementById('cancel-reset').addEventListener('click', function() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('reset-username').value = '';
    document.getElementById('reset-email').value = '';
    document.getElementById('reset-security-question').value = '';
    document.getElementById('reset-security-answer').value = '';
});

// 取消反馈
document.getElementById('cancel-feedback').addEventListener('click', function() {
    document.getElementById('feedback-modal').style.display = 'none';
    document.getElementById('feedback-content').value = '';
    document.getElementById('feedback-contact').value = '';
});

// 登录标签切换
function switchLoginTab(tabName) {
    // 移除所有标签的active类
    document.querySelectorAll('.login-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 隐藏所有内容
    document.querySelectorAll('.login-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 激活选中的标签和内容
    document.querySelector(`.login-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// 用户中心标签切换
function switchUserCenterTab(tabName) {
    // 移除所有标签的active类
    document.querySelectorAll('.user-center-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 隐藏所有内容
    document.querySelectorAll('.user-center-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 激活选中的标签和内容
    document.querySelector(`.user-center-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// 登录标签点击事件
document.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');
        switchLoginTab(tabName);
    });
});

// 用户中心标签点击事件
document.querySelectorAll('.user-center-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');
        switchUserCenterTab(tabName);
    });
});

// 后台管理标签点击事件
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        // 移除所有标签的active类
        document.querySelectorAll('.admin-tab').forEach(t => {
            t.classList.remove('active');
        });
        
        // 隐藏所有内容
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // 激活选中的标签和内容
        this.classList.add('active');
        const tabName = this.getAttribute('data-tab');
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // 如果切换到数据管理标签，加载令牌统计
        if (tabName === 'data') {
            loadTokenStats();
        }
    });
});

// 登录
document.getElementById('login-btn').addEventListener('click', async function() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        alert('请输入用户名和密码');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/verify-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.valid) {
                // 保存用户信息和令牌
                currentUser = {
                    ...result.user,
                    token: result.token,
                    isAdmin: result.isAdmin,
                    isSuperAdmin: result.isSuperAdmin,
                    permissions: result.permissions
                };
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                
                document.getElementById('login-modal').style.display = 'none';
                document.getElementById('login-username').value = '';
                document.getElementById('login-password').value = '';
                updateUserInterface();
                // 新增： 重置过期提示标记
                hasShownExpiredAlert = false; 
                alert('登录成功');
                
                // 新增：登录成功后刷新捐助用户预测显示
                calculateHangarOpenTimes(adjustedStartTime);
            } else {
                alert(result.error || '用户名或密码错误');
            }
        } else {
            alert('登录失败');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('登录失败');
    }
});

// 注册
document.getElementById('register-btn').addEventListener('click', async function() {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const email = document.getElementById('register-email').value;
    const securityQuestion = document.getElementById('security-question').value;
    const securityAnswer = document.getElementById('security-answer').value;
    
    if (!username || !password || !email) {
        alert('请填写所有必填字段');
        return;
    }
    
    if (password.length < 4) {
        alert('密码长度至少4位');
        return;
    }
    
    if (!securityQuestion || !securityAnswer) {
        alert('请选择密保问题并填写答案');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                username, 
                password, 
                email,
                securityQuestion,
                securityAnswer
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                alert('注册成功，请扫码添加QQ群，直接联系管理员审核，请不要泄露个人信息。');
                document.getElementById('login-modal').style.display = 'none';
                document.getElementById('register-username').value = '';
                document.getElementById('register-password').value = '';
                document.getElementById('register-email').value = '';
                document.getElementById('security-question').value = '';
                document.getElementById('security-answer').value = '';
            } else {
                alert(result.error || '注册失败');
            }
        } else {
            alert('注册失败');
        }
    } catch (error) {
        console.error('Register error:', error);
        alert('注册失败');
    }
});

// 找回密码
document.getElementById('recover-password-btn').addEventListener('click', async function() {
    const username = document.getElementById('reset-username').value;
    const email = document.getElementById('reset-email').value;
    const securityQuestion = document.getElementById('reset-security-question').value;
    const securityAnswer = document.getElementById('reset-security-answer').value;
    
    if (!username || !email || !securityQuestion || !securityAnswer) {
        alert('请填写所有字段');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/recover-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                username, 
                email,
                securityQuestion,
                securityAnswer
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                // 显示密码弹窗
                document.getElementById('password-display').textContent = result.password;
                document.getElementById('password-modal').style.display = 'flex';
                document.getElementById('login-modal').style.display = 'none';
            } else {
                alert(result.error || '用户名、邮箱或密保问题错误');
            }
        } else {
            alert('找回密码失败');
        }
    } catch (error) {
        console.error('Recover password error:', error);
        alert('找回密码失败');
    }
});

// 复制密码
document.getElementById('copy-password-btn').addEventListener('click', function() {
    const password = document.getElementById('password-display').textContent;
    navigator.clipboard.writeText(password).then(function() {
        alert('密码已复制到剪贴板');
    }, function(err) {
        console.error('复制失败: ', err);
        alert('复制失败，请手动复制密码');
    });
});

// 提交反馈
document.getElementById('submit-feedback').addEventListener('click', async function() {
    const content = document.getElementById('feedback-content').value;
    const contact = document.getElementById('feedback-contact').value;
    const username = currentUser ? currentUser.username : null;
    
    if (!content.trim()) {
        alert('请输入反馈内容');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                content,
                contact,
                username
            })
        });
        
        if (response.ok) {
            alert('反馈提交成功');
            document.getElementById('feedback-modal').style.display = 'none';
            document.getElementById('feedback-content').value = '';
            document.getElementById('feedback-contact').value = '';
            
            // 如果是管理员，重新加载反馈列表
            if (currentUser && currentUser.isAdmin) {
                loadFeedback();
            }
        } else {
            alert('反馈提交失败');
        }
    } catch (error) {
        console.error('Feedback error:', error);
        alert('反馈提交失败');
    }
});

// 更新通知
document.getElementById('update-notification').addEventListener('click', function() {
    const notification = document.getElementById('notification-content').value;
    const link = document.getElementById('notification-link').value;
    updateNotificationDisplay(notification, link);
    saveSettings();
});

// 保存外观设置
document.getElementById('save-appearance').addEventListener('click', function() {
    const customTitle = document.getElementById('custom-title').value;
    const headerTextColor = document.getElementById('header-text-color').value;
    const headerFontSize = document.getElementById('header-font-size').value;
    const logoUrl = document.getElementById('logo-url').value;
    const logoSize = document.getElementById('logo-size').value;
    const qrcodeUrl = document.getElementById('qrcode-url').value;
    const qrcodeCaption = document.getElementById('qrcode-caption-input').value;
    const qrcodeCaptionColor = document.getElementById('qrcode-caption-color').value;
    const inviteCode = document.getElementById('invite-code-input').value;
    const inviteLink = document.getElementById('invite-link-input').value;
    const bgType = document.getElementById('bg-type').value;
    const bgImage = document.getElementById('bg-image').value;
    const videoUrl = document.getElementById('video-url').value;
    const bgOpacity = document.getElementById('bg-opacity').value;
    const windowTextColor = document.getElementById('window-text-color').value;
    const windowCommentColor = document.getElementById('window-comment-color').value;
    const windowTitleColor = document.getElementById('window-title-color').value;
    const calibrationTextColor = document.getElementById('calibration-text-color').value;
    const countdownTextColor = document.getElementById('countdown-text-color').value;
    const hangarTimeTextColor = document.getElementById('hangar-time-text-color').value;
    const statusTextColor = document.getElementById('status-text-color').value;
    
    if (customTitle) {
        document.getElementById('title').textContent = customTitle;
    }
    
    document.documentElement.style.setProperty('--header-text-color', headerTextColor);
    document.documentElement.style.setProperty('--header-font-size', headerFontSize + 'rem');
    // 新增：同时更新手机端的标题字体大小
    document.documentElement.style.setProperty('--header-font-size-mobile', headerFontSize + 'rem');
    
    updateLogoPreview(logoUrl);
    document.documentElement.style.setProperty('--logo-size', logoSize + 'px');
    
    updateQrcodePreview(qrcodeUrl);
    
    if (qrcodeCaption) {
        document.getElementById('qrcode-caption').textContent = qrcodeCaption;
    }
    
    document.documentElement.style.setProperty('--qrcode-caption-color', qrcodeCaptionColor);
    
    updateInviteDisplay({inviteCode, inviteLink});
    
    updateBgPreview(bgImage, bgType);
    updateVideoPreview(videoUrl);
    
    document.documentElement.style.setProperty('--bg-opacity', bgOpacity / 100);
    document.getElementById('opacity-value').textContent = bgOpacity;
    
    document.documentElement.style.setProperty('--window-text-color', windowTextColor);
    document.documentElement.style.setProperty('--window-comment-color', windowCommentColor);
    document.documentElement.style.setProperty('--window-title-color', windowTitleColor);
    document.documentElement.style.setProperty('--calibration-text-color', calibrationTextColor);
    document.documentElement.style.setProperty('--countdown-text-color', countdownTextColor);
    document.documentElement.style.setProperty('--hangar-time-text-color', hangarTimeTextColor);
    document.documentElement.style.setProperty('--status-text-color', statusTextColor);
    
    // 更新背景显示
    updateBackgroundDisplay(bgType, bgImage, videoUrl);
    
    saveSettings();
});

// 保存捐助设置
document.getElementById('save-donation-settings').addEventListener('click', function() {
    const donationEnabled = document.getElementById('donation-enabled').value === 'true';
    const donationNote = document.getElementById('donation-note').value;
    const wechatQrcodeUrl = document.getElementById('wechat-qrcode-url').value;
    const alipayQrcodeUrl = document.getElementById('alipay-qrcode-url').value;
    const donationBtnColor = document.getElementById('donation-btn-color').value;
    
    // 更新捐助注释显示
    document.getElementById('donation-note-display').textContent = donationNote;
    
    document.documentElement.style.setProperty('--donation-btn-bg', donationBtnColor);
    updateDonationButtonDisplay();
    
    saveSettings();
});

// 保存页脚信息
document.getElementById('save-footer-info').addEventListener('click', function() {
    saveSettings();
});

// 删除二维码
document.getElementById('delete-qrcode').addEventListener('click', function() {
    document.getElementById('qrcode-url').value = '';
    updateQrcodePreview('');
    document.getElementById('qrcode-caption-input').value = '';
    document.getElementById('qrcode-caption').textContent = '';
    saveSettings();
});

// 背景透明度调整
document.getElementById('bg-opacity').addEventListener('input', function() {
    document.documentElement.style.setProperty('--bg-opacity', this.value / 100);
    document.getElementById('opacity-value').textContent = this.value;
});

// 标题字体大小调整
document.getElementById('header-font-size').addEventListener('input', function() {
    document.getElementById('header-font-size-value').textContent = this.value + 'rem';
    document.documentElement.style.setProperty('--header-font-size', this.value + 'rem');
    // 新增：同时更新手机端的标题字体大小
    document.documentElement.style.setProperty('--header-font-size-mobile', this.value + 'rem');
});

// Logo大小调整
document.getElementById('logo-size').addEventListener('input', function() {
    document.getElementById('logo-size-value').textContent = this.value + 'px';
    document.documentElement.style.setProperty('--logo-size', this.value + 'px');
});

// 颜色选择器预览
const colorInputs = document.querySelectorAll('input[type="color"]');
colorInputs.forEach(input => {
    const previewId = input.id + '-preview';
    const preview = document.getElementById(previewId);
    if (preview) {
        preview.style.backgroundColor = input.value;
        input.addEventListener('input', function() {
            preview.style.backgroundColor = this.value;
            // 实时更新CSS变量
            const cssVarName = '--' + this.id.replace(/-/g, '-');
            document.documentElement.style.setProperty(cssVarName, this.value);
        });
    }
});

// 预览Logo
document.getElementById('logo-url').addEventListener('change', function() {
    updateLogoPreview(this.value);
});

// 预览二维码
document.getElementById('qrcode-url').addEventListener('change', function() {
    updateQrcodePreview(this.value);
});

// 预览背景
document.getElementById('bg-image').addEventListener('change', function() {
    const bgType = document.getElementById('bg-type').value;
    updateBgPreview(this.value, bgType);
});

// 预览视频
document.getElementById('video-url').addEventListener('change', function() {
    updateVideoPreview(this.value);
});

// 背景类型切换
document.getElementById('bg-type').addEventListener('change', function() {
    const bgImage = document.getElementById('bg-image').value;
    const videoUrl = document.getElementById('video-url').value;
    updateBgPreview(bgImage, this.value);
    if (this.value === 'video') {
        updateVideoPreview(videoUrl);
    } else {
        document.getElementById('video-background').style.display = 'none';
        document.body.classList.remove('video-bg');
        if (bgImage && bgImage.trim() !== '') {
            document.body.style.backgroundImage = `url(${bgImage})`;
        }
    }
});

// 测试API连接
document.getElementById('test-api').addEventListener('click', async function() {
    const apiUrl = document.getElementById('api-url').value;
    const resultDiv = document.getElementById('api-test-result');
    
    try {
        const response = await fetch(`${apiUrl}/status`);
        if (response.ok) {
            resultDiv.textContent = 'API连接成功！';
            resultDiv.className = 'api-test-result success';
            // 更新当前会话的API_BASE，不保存到localStorage
            API_BASE = apiUrl;
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
document.getElementById('export-data').addEventListener('click', async function() {
    try {
        const response = await fetch(`${API_BASE}/export`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            const dataStr = JSON.stringify(data, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            
            const a = document.createElement('a');
            a.href = URL.createObjectURL(dataBlob);
            a.download = 'hangar-timer-backup.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('导出失败');
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('导出失败');
    }
});

// 重置数据
document.getElementById('reset-data').addEventListener('click', async function() {
    if (confirm('确定要重置所有数据吗？此操作不可恢复！')) {
        try {
            const response = await fetch(`${API_BASE}/reset`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                alert('数据已重置');
                currentUser = null;
                localStorage.removeItem('currentUser');
                updateUserInterface();
                location.reload();
            } else {
                if (!checkAuthResponse(response)) {
                    return;
                }
                alert('重置失败');
            }
        } catch (error) {
            console.error('Reset error:', error);
            alert('重置失败');
        }
    }
});

// 图片上传功能
document.getElementById('upload-logo').addEventListener('click', function() {
    const fileInput = document.getElementById('logo-upload');
    if (fileInput.files.length === 0) {
        alert('请选择要上传的图片');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('logo-url').value = e.target.result;
        updateLogoPreview(e.target.result);
    };
    reader.readAsDataURL(file);
});

document.getElementById('upload-qrcode').addEventListener('click', function() {
    const fileInput = document.getElementById('qrcode-upload');
    if (fileInput.files.length === 0) {
        alert('请选择要上传的图片');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('qrcode-url').value = e.target.result;
        updateQrcodePreview(e.target.result);
    };
    reader.readAsDataURL(file);
});

document.getElementById('upload-bg').addEventListener('click', function() {
    const fileInput = document.getElementById('bg-upload');
    if (fileInput.files.length === 0) {
        alert('请选择要上传的文件');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('bg-image').value = e.target.result;
        const bgType = document.getElementById('bg-type').value;
        updateBgPreview(e.target.result, bgType);
    };
    reader.readAsDataURL(file);
});

document.getElementById('upload-video').addEventListener('click', function() {
    const fileInput = document.getElementById('video-upload');
    if (fileInput.files.length === 0) {
        alert('请选择要上传的视频');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('video-url').value = e.target.result;
        updateVideoPreview(e.target.result);
    };
    reader.readAsDataURL(file);
});

document.getElementById('upload-wechat-qrcode').addEventListener('click', function() {
    const fileInput = document.getElementById('wechat-qrcode-upload');
    if (fileInput.files.length === 0) {
        alert('请选择要上传的图片');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('wechat-qrcode-url').value = e.target.result;
        document.getElementById('wechat-qrcode').src = e.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('upload-alipay-qrcode').addEventListener('click', function() {
    const fileInput = document.getElementById('alipay-qrcode-upload');
    if (fileInput.files.length === 0) {
        alert('请选择要上传的图片');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('alipay-qrcode-url').value = e.target.result;
        document.getElementById('alipay-qrcode').src = e.target.result;
    };
    reader.readAsDataURL(file);
});

// 加载反馈
async function loadFeedback() {
    try {
        const response = await fetch(`${API_BASE}/feedback`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const feedback = await response.json();
            const feedbackList = document.getElementById('feedback-list');
            
            if (feedback.length === 0) {
                feedbackList.innerHTML = '<div class="feedback-item">暂无反馈</div>';
                return;
            }
            
            feedbackList.innerHTML = '';
            feedback.forEach(item => {
                const feedbackItem = document.createElement('div');
                feedbackItem.className = 'feedback-item';
                
                let contactHtml = '';
                if (item.contact) {
                    contactHtml = `<div class="feedback-contact">联系方式: ${item.contact}</div>`;
                }
                
                let usernameHtml = '';
                if (item.username) {
                    usernameHtml = `<div class="feedback-username">用户: ${item.username}</div>`;
                }
                
                feedbackItem.innerHTML = `
                    <div class="feedback-date">${new Date(item.timestamp).toLocaleString()}</div>
                    ${usernameHtml}
                    <div class="feedback-content">${item.content}</div>
                    ${contactHtml}
                    <button class="delete-feedback" data-id="${item.id}">删除</button>
                `;
                feedbackList.appendChild(feedbackItem);
            });
            
            // 添加删除事件监听
            document.querySelectorAll('.delete-feedback').forEach(button => {
                button.addEventListener('click', async function() {
                    const id = this.getAttribute('data-id');
                    if (confirm('确定要删除这条反馈吗？')) {
                        try {
                            const response = await fetch(`${API_BASE}/feedback/${id}`, {
                                method: 'DELETE',
                                headers: getAuthHeaders()
                            });
                            
                            if (response.ok) {
                                alert('反馈已删除');
                                loadFeedback();
                            } else {
                                if (!checkAuthResponse(response)) {
                                    return;
                                }
                                alert('删除失败');
                            }
                        } catch (error) {
                            console.error('Delete feedback error:', error);
                            alert('删除失败');
                        }
                    }
                });
            });
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
        }
    } catch (error) {
        console.error('Load feedback error:', error);
    }
}

// 加载访问统计
async function loadVisits() {
    try {
        const response = await fetch(`${API_BASE}/visits`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            const visits = data.visits;
            const totalVisits = data.totalVisits;
            const visitsList = document.getElementById('visits-list');
            const visitCount = document.getElementById('visit-count');
            
            // 修改：显示总IP数和总访问数
            visitCount.textContent = `总IP数: ${visits.length}, 总访问数: ${totalVisits}`;
            
            if (visits.length === 0) {
                visitsList.innerHTML = '<div class="visit-item">暂无访问记录</div>';
                return;
            }
            
            visitsList.innerHTML = '';
            // 按最后访问时间倒序排列
            visits.sort((a, b) => new Date(b.lastVisit) - new Date(a.firstVisit));
            
            visits.forEach(visit => {
                const visitItem = document.createElement('div');
                visitItem.className = 'visit-item';
                visitItem.innerHTML = `
                    <div><span class="visit-ip">${visit.ip}</span></div>
                    <div class="visit-date">最后访问: ${new Date(visit.lastVisit).toLocaleString()}</div>
                    <div class="visit-date">首次访问: ${new Date(visit.firstVisit).toLocaleString()}</div>
                    <div class="visit-count">访问次数: ${visit.visitCount}</div>
                `;
                visitsList.appendChild(visitItem);
            });
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
        }
    } catch (error) {
        console.error('Load visits error:', error);
        document.getElementById('visits-list').innerHTML = '加载访问统计失败';
    }
}

// 清除访问记录
document.getElementById('clear-visits').addEventListener('click', async function() {
    if (confirm('确定要清除所有访问记录吗？此操作不可恢复！')) {
        try {
            const response = await fetch(`${API_BASE}/visits`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                alert('访问记录已清除');
                loadVisits();
            } else {
                if (!checkAuthResponse(response)) {
                    return;
                }
                alert('清除失败');
            }
        } catch (error) {
            console.error('Clear visits error:', error);
            alert('清除失败');
        }
    }
});

// 刷新访问统计
document.getElementById('refresh-visits').addEventListener('click', function() {
    loadVisits();
});

// 加载用户列表
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const users = await response.json();
            const userList = document.getElementById('user-list');
            
            if (users.length === 0) {
                userList.innerHTML = '<div class="user-item">暂无用户</div>';
                return;
            }
            
            userList.innerHTML = '';
            users.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                
                let roleBadge = '';
                if (user.isSuperAdmin) {
                    roleBadge = '<span class="user-role-badge user-super-admin">超级管理员</span>';
                } else if (user.isAdmin) {
                    roleBadge = '<span class="user-role-badge user-admin">管理员</span>';
                } else if (user.approved) {
                    roleBadge = '<span class="user-role-badge user-normal">普通用户</span>';
                } else {
                    roleBadge = '<span class="user-role-badge user-pending">待审核</span>';
                }
                
                if (user.frozen) {
                    roleBadge += '<span class="user-role-badge user-frozen">已冻结</span>';
                }
                
                // 根据当前用户权限控制按钮显示
                let actionButtons = '';
                
                // 如果是当前用户自己，只显示编辑按钮
                if (user.username === currentUser.username) {
                    actionButtons = `<button class="user-action-btn edit-user" data-username="${user.username}">编辑</button>`;
                }
                // 如果是超级管理员，可以看到所有按钮
                else if (currentUser.isSuperAdmin) {
                    actionButtons = `
                        ${!user.approved ? `<button class="user-action-btn approve-user" data-username="${user.username}">审核通过</button>` : ''}
                        <button class="user-action-btn edit-user" data-username="${user.username}">编辑</button>
                        ${user.frozen ? 
                            `<button class="user-action-btn unfreeze-user" data-username="${user.username}">解冻</button>` : 
                            `<button class="user-action-btn freeze-user" data-username="${user.username}">冻结</button>`
                        }
                        ${!user.isSuperAdmin ? `<button class="user-action-btn delete-user" style="background: var(--reset-color);" data-username="${user.username}">删除</button>` : ''}
                    `;
                }
                // 如果是普通管理员，只能看到普通用户的按钮
                else if (currentUser.isAdmin) {
                    // 管理员不能操作其他管理员和超级管理员
                    if (!user.isAdmin && !user.isSuperAdmin) {
                        actionButtons = `
                            ${!user.approved ? `<button class="user-action-btn approve-user" data-username="${user.username}">审核通过</button>` : ''}
                            <button class="user-action-btn edit-user" data-username="${user.username}">编辑</button>
                            ${user.frozen ? 
                                `<button class="user-action-btn unfreeze-user" data-username="${user.username}">解冻</button>` : 
                                `<button class="user-action-btn freeze-user" data-username="${user.username}">冻结</button>`
                            }
                            <button class="user-action-btn delete-user" style="background: var(--reset-color);" data-username="${user.username}">删除</button>
                        `;
                    } else {
                        // 对其他管理员和超级管理员，只显示查看信息
                        actionButtons = '<span class="no-permission">无操作权限</span>';
                    }
                }
                // 普通用户没有用户管理权限
                else {
                    actionButtons = '<span class="no-permission">无操作权限</span>';
                }
                
                userItem.innerHTML = `
                    <div class="user-info">
                        <div><strong>${user.username}</strong> ${roleBadge}</div>
                        <div class="visit-date">邮箱: ${user.email}</div>
                        <div class="visit-date">注册时间: ${new Date(user.createdAt).toLocaleString()}</div>
                    </div>
                    <div class="user-actions">
                        ${actionButtons}
                    </div>
                `;
                userList.appendChild(userItem);
            });
            
            // 添加审核用户事件监听
            document.querySelectorAll('.approve-user').forEach(button => {
                button.addEventListener('click', async function() {
                    const username = this.getAttribute('data-username');
                    if (confirm(`确定要审核通过用户 ${username} 吗？`)) {
                        try {
                            const response = await fetch(`${API_BASE}/users/${username}`, {
                                method: 'PUT',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({ approved: true })
                            });
                            
                            if (response.ok) {
                                alert('用户审核通过');
                                loadUsers();
                            } else {
                                if (!checkAuthResponse(response)) {
                                    return;
                                }
                                alert('操作失败');
                            }
                        } catch (error) {
                            console.error('Approve user error:', error);
                            alert('操作失败');
                        }
                    }
                });
            });
            
            // 添加编辑用户事件监听
            document.querySelectorAll('.edit-user').forEach(button => {
                button.addEventListener('click', function() {
                    const username = this.getAttribute('data-username');
                    openUserEditModal(username);
                });
            });
            
            // 添加冻结用户事件监听
            document.querySelectorAll('.freeze-user').forEach(button => {
                button.addEventListener('click', async function() {
                    const username = this.getAttribute('data-username');
                    if (confirm(`确定要冻结用户 ${username} 吗？`)) {
                        try {
                            const response = await fetch(`${API_BASE}/users/${username}`, {
                                method: 'PUT',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({ frozen: true })
                            });
                            
                            if (response.ok) {
                                alert('用户已冻结');
                                loadUsers();
                            } else {
                                if (!checkAuthResponse(response)) {
                                    return;
                                }
                                alert('操作失败');
                            }
                        } catch (error) {
                            console.error('Freeze user error:', error);
                            alert('操作失败');
                        }
                    }
                });
            });
            
            // 添加解冻用户事件监听
            document.querySelectorAll('.unfreeze-user').forEach(button => {
                button.addEventListener('click', async function() {
                    const username = this.getAttribute('data-username');
                    if (confirm(`确定要解冻用户 ${username} 吗？`)) {
                        try {
                            const response = await fetch(`${API_BASE}/users/${username}`, {
                                method: 'PUT',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({ frozen: false })
                            });
                            
                            if (response.ok) {
                                alert('用户已解冻');
                                loadUsers();
                            } else {
                                if (!checkAuthResponse(response)) {
                                    return;
                                }
                                alert('操作失败');
                            }
                        } catch (error) {
                            console.error('Unfreeze user error:', error);
                            alert('操作失败');
                        }
                    }
                });
            });
            
            // 添加删除用户事件监听
            document.querySelectorAll('.delete-user').forEach(button => {
                button.addEventListener('click', async function() {
                    const username = this.getAttribute('data-username');
                    if (confirm(`确定要删除用户 ${username} 吗？此操作不可恢复！`)) {
                        try {
                            const response = await fetch(`${API_BASE}/users/${username}`, {
                                method: 'DELETE',
                                headers: getAuthHeaders()
                            });
                            
                            if (response.ok) {
                                alert('用户已删除');
                                loadUsers();
                            } else {
                                if (!checkAuthResponse(response)) {
                                    return;
                                }
                                alert('删除失败');
                            }
                        } catch (error) {
                            console.error('Delete user error:', error);
                            alert('删除失败');
                        }
                    }
                });
            });
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
        }
    } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('user-list').innerHTML = '加载用户列表失败';
    }
}

// 打开用户编辑模态框
async function openUserEditModal(username) {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const users = await response.json();
            const user = users.find(u => u.username === username);
            
            if (user) {
                currentEditingUser = user;
                
                document.getElementById('edit-username').value = user.username;
                document.getElementById('edit-email').value = user.email || '';
                
                // 设置用户角色
                const editRoleSelect = document.getElementById('edit-role');
                const superAdminOption = document.getElementById('super-admin-option');
                
                // 控制超级管理员选项显示
                if (currentUser && currentUser.isSuperAdmin) {
                    superAdminOption.style.display = 'block';
                } else {
                    superAdminOption.style.display = 'none';
                }
                
                if (user.isSuperAdmin) {
                    editRoleSelect.value = 'super-admin';
                } else if (user.isAdmin) {
                    editRoleSelect.value = 'admin';
                } else {
                    editRoleSelect.value = 'normal';
                }
                
                // 根据当前用户权限和编辑的用户设置表单字段的禁用状态
                const isEditingSelf = user.username === currentUser.username;
                const isSuperAdmin = currentUser.isSuperAdmin;
                const isAdmin = currentUser.isAdmin;
                
                // 设置权限显示
                updatePermissionsDisplay(user.isAdmin || user.isSuperAdmin, user.permissions || {});
                
                // 设置审核状态
                document.getElementById('edit-approved').value = user.approved ? 'true' : 'false';
                
                // 设置冻结状态
                document.getElementById('edit-frozen').value = user.frozen ? 'true' : 'false';
                
                // 清空密码字段
                document.getElementById('edit-password').value = '';
                
                // 根据权限控制表单字段的禁用状态
                if (isEditingSelf) {
                    // 编辑自己时：角色、审核状态、冻结状态、权限都不可编辑
                    editRoleSelect.disabled = true;
                    document.getElementById('edit-approved').disabled = true;
                    document.getElementById('edit-frozen').disabled = true;
                    
                    // 禁用所有权限复选框
                    document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
                        checkbox.disabled = true;
                    });
                    
                    // 超级管理员编辑自己时权限全选且不可更改
                    if (isSuperAdmin) {
                        document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
                            checkbox.checked = true;
                        });
                    }
                } else if (isSuperAdmin) {
                    // 超级管理员编辑其他用户：所有字段都可编辑
                    editRoleSelect.disabled = false;
                    document.getElementById('edit-approved').disabled = false;
                    document.getElementById('edit-frozen').disabled = false;
                    document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
                        checkbox.disabled = false;
                    });
                } else if (isAdmin) {
                    // 管理员编辑其他用户：角色不可编辑，审核状态和冻结状态可编辑，权限可编辑但不能提升为管理员
                    editRoleSelect.disabled = true;
                    
                    // 用户一旦通过审核就不能变更审核状态
                    if (user.approved) {
                        document.getElementById('edit-approved').disabled = true;
                    } else {
                        document.getElementById('edit-approved').disabled = false;
                    }
                    
                    document.getElementById('edit-frozen').disabled = false;
                    
                    // 管理员只能编辑普通用户的权限，不能编辑管理员权限
                    if (!user.isAdmin && !user.isSuperAdmin) {
                        document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
                            checkbox.disabled = false;
                        });
                    } else {
                        document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
                            checkbox.disabled = true;
                        });
                    }
                } else {
                    // 普通用户没有编辑权限
                    editRoleSelect.disabled = true;
                    document.getElementById('edit-approved').disabled = true;
                    document.getElementById('edit-frozen').disabled = true;
                    document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
                        checkbox.disabled = true;
                    });
                }
                
                document.getElementById('user-edit-modal').style.display = 'flex';
            } else {
                alert('用户不存在');
            }
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
        }
    } catch (error) {
        console.error('Open user edit modal error:', error);
        alert('加载用户信息失败');
    }
}

// 更新权限选项显示
function updatePermissionsDisplay(isAdmin, permissions) {
    const adminPermissions = document.querySelectorAll('.admin-permission');
    const viewHangarTimesPermission = document.getElementById('permission-view-hangar-times');
    
    if (isAdmin) {
        // 管理员：显示所有权限选项
        adminPermissions.forEach(permission => {
            permission.style.display = 'flex';
        });
        viewHangarTimesPermission.style.display = 'flex';
        
        // 设置权限选中状态
        document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = permissions[checkbox.value] || false;
        });
    } else {
        // 普通用户：只显示机库开启时间权限
        adminPermissions.forEach(permission => {
            permission.style.display = 'none';
        });
        viewHangarTimesPermission.style.display = 'flex';
        
        // 只设置机库开启时间权限，其他权限取消选中
        document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.value === 'viewHangarTimes') {
                checkbox.checked = permissions[checkbox.value] || false;
            } else {
                checkbox.checked = false;
            }
        });
    }
}

// 为角色下拉列表添加change事件
document.getElementById('edit-role').addEventListener('change', function() {
    if (currentEditingUser) {
        const isAdmin = this.value === 'admin' || this.value === 'super-admin';
        updatePermissionsDisplay(isAdmin, currentEditingUser.permissions || {});
    }
});

// 保存用户编辑
document.getElementById('save-user-edit').addEventListener('click', async function() {
    if (!currentEditingUser) return;
    
    const email = document.getElementById('edit-email').value;
    const role = document.getElementById('edit-role').value;
    const password = document.getElementById('edit-password').value;
    const approved = document.getElementById('edit-approved').value === 'true';
    const frozen = document.getElementById('edit-frozen').value === 'true';
    
    // 收集权限设置
    const permissions = {};
    document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
        permissions[checkbox.value] = checkbox.checked;
    });
    
    const updateData = {
        email,
        approved,
        frozen,
        permissions
    };
    
    // 设置角色
    if (role === 'super-admin') {
        updateData.isSuperAdmin = true;
        updateData.isAdmin = true;
    } else if (role === 'admin') {
        updateData.isSuperAdmin = false;
        updateData.isAdmin = true;
    } else {
        updateData.isSuperAdmin = false;
        updateData.isAdmin = false;
    }
    
    // 如果有新密码，添加密码字段
    if (password) {
        if (password.length < 4) {
            alert('密码长度至少4位');
            return;
        }
        updateData.password = password;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentEditingUser.username}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            alert('用户信息已更新');
            document.getElementById('user-edit-modal').style.display = 'none';
            currentEditingUser = null;
            
            // 重新加载用户列表
            loadUsers();
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('更新失败');
        }
    } catch (error) {
        console.error('Save user edit error:', error);
        alert('更新失败');
    }
});

// 取消用户编辑
document.getElementById('cancel-user-edit').addEventListener('click', function() {
    document.getElementById('user-edit-modal').style.display = 'none';
    currentEditingUser = null;
});

// 刷新用户列表
document.getElementById('refresh-users').addEventListener('click', function() {
    loadUsers();
});

// 加载用户信息
async function loadUserInfo() {
    if (currentUser) {
        document.getElementById('user-info-username').value = currentUser.username;
        document.getElementById('user-info-email').value = currentUser.email || '';
        
        let roleText = '';
        if (currentUser.isSuperAdmin) {
            roleText = '<span class="user-role-badge user-super-admin">超级管理员</span>';
        } else if (currentUser.isAdmin) {
            roleText = '<span class="user-role-badge user-admin">管理员</span>';
        } else {
            roleText = '<span class="user-role-badge user-normal">普通用户</span>';
        }
        document.getElementById('user-info-role').innerHTML = roleText;
        
        // 加载密保设置
        try {
            const response = await fetch(`${API_BASE}/users`, {
                headers: getAuthHeaders()
            });
            if (response.ok) {
                const users = await response.json();
                const user = users.find(u => u.username === currentUser.username);
                
                if (user) {
                    document.getElementById('user-security-question').value = user.securityQuestion || '';
                    // 注意：密保答案不显示，只允许修改
                }
            }
        } catch (error) {
            console.error('Load user security question error:', error);
        }
    }
}

// 更新用户信息
document.getElementById('update-user-info').addEventListener('click', async function() {
    const email = document.getElementById('user-info-email').value;
    
    if (!email) {
        alert('请输入邮箱');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.username}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ email })
        });
        
        if (response.ok) {
            alert('用户信息已更新');
            currentUser.email = email;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('更新失败');
        }
    } catch (error) {
        console.error('Update user info error:', error);
        alert('更新失败');
    }
});

// 更新密保设置
document.getElementById('update-security-question').addEventListener('click', async function() {
    const securityQuestion = document.getElementById('user-security-question').value;
    const securityAnswer = document.getElementById('user-security-answer').value;
    
    if (!securityQuestion || !securityAnswer) {
        alert('请选择密保问题并填写答案');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.username}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                securityQuestion,
                securityAnswer 
            })
        });
        
        if (response.ok) {
            alert('密保设置已更新');
            document.getElementById('user-security-answer').value = '';
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('更新失败');
        }
    } catch (error) {
        console.error('Update security question error:', error);
        alert('更新失败');
    }
});

// 修改密码
document.getElementById('change-password-btn').addEventListener('click', async function() {
    const oldPassword = document.getElementById('change-password-old').value;
    const newPassword = document.getElementById('change-password-new').value;
    const confirmPassword = document.getElementById('change-password-confirm').value;
    
    if (!oldPassword || !newPassword || !confirmPassword) {
        alert('请填写所有字段');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('新密码和确认密码不一致');
        return;
    }
    
    if (newPassword.length < 4) {
        alert('密码长度至少4位');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                username: currentUser.username, 
                oldPassword, 
                newPassword 
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                alert('密码修改成功');
                document.getElementById('change-password-old').value = '';
                document.getElementById('change-password-new').value = '';
                document.getElementById('change-password-confirm').value = '';
            } else {
                alert(result.error || '密码修改失败');
            }
        } else {
            alert('密码修改失败');
        }
    } catch (error) {
        console.error('Change password error:', error);
        alert('密码修改失败');
    }
});

// 初始化计时器
function initializeTimer(initialPhaseKey) {
    clearInterval(countdownInterval);
    
    // 检查计时器是否启用
    if (!timerEnabled) {
        document.getElementById('phase-indicator').innerHTML = '<i class="fas fa-tools"></i> <span>计时器维护中，稍后再来</span>';
        document.getElementById('phase-indicator').className = 'phase-indicator phase-disabled';
        document.getElementById('countdown').textContent = '00:00:00';
        document.getElementById('hangar-open-time').innerHTML = '<i class="fas fa-tools"></i> 维护中';
        
        // 将所有灯设置为灰色
        for (let i = 0; i < 5; i++) {
            const lightElement = document.getElementById(`light-${i}`);
            lightElement.className = 'light gray';
        }
        
        // 修复：计时器关闭时也要更新捐助用户预测显示
        calculateHangarOpenTimes(new Date());
        
        return;
    }
    
    const config = PHASE_CONFIG[initialPhaseKey];
    currentPhase = config.phase;
    currentLights = [...config.lights];
    
    // 计算偏移时间（分钟）
    let offsetMinutes = config.offset;
    
    // 根据阶段调整偏移
    if (config.phase === 'reset') {
        offsetMinutes = config.offset;
    } else if (config.phase === 'card') {
        offsetMinutes = PHASE_DURATIONS.reset + config.offset;
    } else if (config.phase === 'poweroff') {
        offsetMinutes = PHASE_DURATIONS.reset + PHASE_DURATIONS.card + config.offset;
    }
    
    // 调整开始时间 - 修改为赋值给全局变量
    adjustedStartTime = new Date(startTime.getTime() - offsetMinutes * 60 * 1000);
    
    // 更新显示
    updateDisplay(adjustedStartTime);
    
    // 计算并显示机库开启时间
    calculateHangarOpenTimes(adjustedStartTime);
    
    // 启动计时器
    countdownInterval = setInterval(function() {
        updateDisplay(adjustedStartTime);
    }, 1000);
}

// 更新显示
function updateDisplay(adjustedStartTime) {
    // 如果计时器已关闭，不更新显示
    if (!timerEnabled) return;
    
    const now = new Date();
    const elapsedMs = now.getTime() - adjustedStartTime.getTime();
    const totalCycleMs = (PHASE_DURATIONS.reset + PHASE_DURATIONS.card + PHASE_DURATIONS.poweroff) * 60 * 1000;
    
    // 计算当前周期内的经过时间
    const cycleElapsedMs = elapsedMs % totalCycleMs;
    
    // 确定当前阶段和剩余时间
    let phaseTimeRemaining;
    let phaseName;
    let phaseIcon;
    
    // 计算当前机库开启时间
    const currentCycleStart = new Date(now.getTime() - cycleElapsedMs);
    const currentHangarOpenTime = new Date(currentCycleStart.getTime() + PHASE_DURATIONS.reset * 60 * 1000);
    document.getElementById('hangar-open-time').innerHTML = `<i class="fas fa-door-open"></i> 当前机库开启时间: ${formatDateTimeFull(currentHangarOpenTime)}`;
    
    if (cycleElapsedMs < PHASE_DURATIONS.reset * 60 * 1000) {
        // 重置阶段 - 机库已关闭等待开启中
        currentPhase = 'reset';
        phaseName = '机库已关闭等待开启中';
        phaseIcon = 'fas fa-sync-alt';
        phaseTimeRemaining = PHASE_DURATIONS.reset * 60 * 1000 - cycleElapsedMs;
        
        // 计算灯的状态（每24分钟变化一次）
        const lightChangeInterval = 24 * 60 * 1000;
        const lightsChanged = Math.floor(cycleElapsedMs / lightChangeInterval);
        
        currentLights = Array(5).fill('red');
        for (let i = 0; i < Math.min(lightsChanged, 5); i++) {
            currentLights[i] = 'green';
        }
        
    } else if (cycleElapsedMs < (PHASE_DURATIONS.reset + PHASE_DURATIONS.card) * 60 * 1000) {
        // 插卡阶段 - 机库开启中可插卡
        currentPhase = 'card';
        phaseName = '机库开启中可插卡';
        phaseIcon = 'fas fa-credit-card';
        phaseTimeRemaining = (PHASE_DURATIONS.reset + PHASE_DURATIONS.card) * 60 * 1000 - cycleElapsedMs;
        
        // 计算灯的状态（每12分钟变化一次）
        const cardPhaseElapsed = cycleElapsedMs - PHASE_DURATIONS.reset * 60 * 1000;
        const lightChangeInterval = 12 * 60 * 1000;
        const lightsChanged = Math.floor(cardPhaseElapsed / lightChangeInterval);
        
        currentLights = Array(5).fill('green');
        for (let i = 0; i < Math.min(lightsChanged, 5); i++) {
            currentLights[i] = 'gray';
        }
        
    } else {
        // 断电阶段 - 机库关闭倒计时中
        currentPhase = 'poweroff';
        phaseName = '机库关闭倒计时中';
        phaseIcon = 'fas fa-power-off';
        phaseTimeRemaining = totalCycleMs - cycleElapsedMs;
        
        currentLights = Array(5).fill('gray');
    }
    
    // 更新阶段指示器
    const phaseIndicator = document.getElementById('phase-indicator');
    phaseIndicator.innerHTML = `<i class="${phaseIcon}"></i> <span>${phaseName}</span>`;
    phaseIndicator.className = 'phase-indicator';
    phaseIndicator.classList.add(`phase-${currentPhase}`);
    
    // 更新倒计时显示
    const countdownElement = document.getElementById('countdown');
    countdownElement.textContent = formatTimeRemaining(phaseTimeRemaining);
    
    // 更新灯的状态
    updateLightsDisplay();
}

// 更新灯的状态显示
function updateLightsDisplay() {
    for (let i = 0; i < 5; i++) {
        const lightElement = document.getElementById(`light-${i}`);
        lightElement.className = 'light';
        lightElement.classList.add(currentLights[i]);
        
        // 移除所有活动状态，然后为当前灯添加活动状态
        if (currentLights[i] !== 'gray') {
            lightElement.classList.add('active');
        }
    }
}

// 计算机库开启时间预测
function calculateHangarOpenTimes(adjustedStartTime) {
    const windowList = document.getElementById('window-list');
    windowList.innerHTML = '';
    
    const totalCycleMs = (PHASE_DURATIONS.reset + PHASE_DURATIONS.card + PHASE_DURATIONS.poweroff) * 60 * 1000;
    const firstGreenTime = new Date(adjustedStartTime.getTime() + PHASE_DURATIONS.reset * 60 * 1000);
    const now = new Date();
    
    // 检查计时器状态
    if (!timerEnabled) {
        // 计时器关闭状态：显示维护提示
        windowList.innerHTML = '';
        const maintenanceItem = document.createElement('li');
        maintenanceItem.innerHTML = `<i class="fas fa-tools"></i> 正在维护中，稍后再来！`;
        windowList.appendChild(maintenanceItem);
        return;
    }
    
    // 检查用户权限和显示设置
    const hangarTimesVisible = localStorage.getItem('hangarTimesVisible') !== 'false';
    const isLoggedIn = currentUser !== null;
    
    // 根据设置和登录状态决定是否显示时间
    if (!hangarTimesVisible && !isLoggedIn) {
        windowList.innerHTML = '';
        const loginPromptItem = document.createElement('li');
        loginPromptItem.innerHTML = `<i class="fas fa-user-lock"></i>捐助我们获得用户权限，登录后方可查看机库开启预测时间`;
        windowList.appendChild(loginPromptItem);
        return;
    }
    
    // 计算上一个开启时间
    let previousWindowTime = new Date(firstGreenTime.getTime());
    while (previousWindowTime.getTime() + totalCycleMs < now.getTime()) {
        previousWindowTime = new Date(previousWindowTime.getTime() + totalCycleMs);
    }
    
    // 如果当前时间已经超过了第一个开启时间，则显示上一个开启时间
    if (now.getTime() > firstGreenTime.getTime()) {
        const prevItem = document.createElement('li');
        prevItem.innerHTML = `<i class="fas fa-door-closed"></i> 上次开启时间: ${formatDateTimeFull(previousWindowTime)}`;
        windowList.appendChild(prevItem);
    }
    
    // 生成后续的8个机库开启时间预测节点
    for (let i = 0; i < 8; i++) {
        const windowTime = new Date(previousWindowTime.getTime() + (i + 1) * totalCycleMs);
        const listItem = document.createElement('li');
        
        if (i === 0) {
            listItem.innerHTML = `<i class="fas fa-door-open"></i> 下次开启时间: ${formatDateTimeFull(windowTime)}`;
        } else {
            listItem.innerHTML = `<i class="fas fa-door-open"></i> 开启时间 ${i+1}: ${formatDateTimeFull(windowTime)}`;
        }
        
        windowList.appendChild(listItem);
    }
}

// 格式化剩余时间
function formatTimeRemaining(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}

// 格式化日期时间（用于输入框）
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = padZero(date.getMonth() + 1);
    const day = padZero(date.getDate());
    const hours = padZero(date.getHours());
    const minutes = padZero(date.getMinutes());
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 格式化完整日期时间（用于显示）
function formatDateTimeFull(date) {
    const year = date.getFullYear();
    const month = padZero(date.getMonth() + 1);
    const day = padZero(date.getDate());
    const hours = padZero(date.getHours());
    const minutes = padZero(date.getMinutes());
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 补零函数
function padZero(num) {
    return num.toString().padStart(2, '0');
}

// 初始化可拖拽面板
function initDraggablePanel(panelId) {
    const panel = document.getElementById(panelId);
    const header = panel.querySelector('.admin-panel-header, .user-center-header');
    
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    header.addEventListener("mousedown", dragStart);
    document.addEventListener("mouseup", dragEnd);
    document.addEventListener("mousemove", drag);
    
    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        
        if (e.target === header || e.target.parentNode === header) {
            isDragging = true;
        }
    }
    
    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        
        isDragging = false;
    }
    
    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            xOffset = currentX;
            yOffset = currentY;
            
            setTranslate(currentX, currentY, panel);
        }
    }
    
    function setTranslate(xPos, yPos, el) {
        el.style.transform = "translate3d(" + xPos + "px, " + yPos + "px, 0)";
    }
}

// 检查数据库状态
async function checkDbStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${API_BASE}/status`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            document.getElementById('db-status').innerHTML = '<i class="fas fa-database"></i> <span>数据库状态: 正常</span>';
        } else {
            document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 服务器错误</span>';
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接超时</span>';
        } else {
            document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接失败</span>';
        }
    }
}

// 页脚信息点击事件
document.getElementById('project-description-btn').addEventListener('click', function() {
    const content = document.getElementById('project-description-input').value || '暂无项目介绍';
    document.getElementById('footer-modal-title').textContent = '项目介绍';
    document.getElementById('footer-modal-content').innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
    document.getElementById('footer-info-modal').style.display = 'flex';
});

document.getElementById('version-btn').addEventListener('click', function() {
    const content = document.getElementById('version-input').value || '暂无版本信息';
    document.getElementById('footer-modal-title').textContent = '版本更新';
    document.getElementById('footer-modal-content').innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
    document.getElementById('footer-info-modal').style.display = 'flex';
});

document.getElementById('about-btn').addEventListener('click', function() {
    const content = document.getElementById('about-input').value || '暂无关于信息';
    document.getElementById('footer-modal-title').textContent = '关于本网站';
    document.getElementById('footer-modal-content').innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
    document.getElementById('footer-info-modal').style.display = 'flex';
});

document.getElementById('close-footer-modal').addEventListener('click', function() {
    document.getElementById('footer-info-modal').style.display = 'none';
});

// 自动检测文本中的链接并使其可点击
function autoLinkify() {
    // 获取所有文本节点并检测URL
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    while (node = walker.nextNode()) {
        const text = node.nodeValue;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        
        if (urlRegex.test(text)) {
            const parent = node.parentNode;
            if (parent && parent.nodeName !== 'A' && parent.nodeName !== 'SCRIPT' && parent.nodeName !== 'STYLE') {
                const newHtml = text.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
                const newElement = document.createElement('span');
                newElement.innerHTML = newHtml;
                parent.replaceChild(newElement, node);
            }
        }
    }
}

// 记录访问
async function recordVisit() {
    try {
        await fetch(`${API_BASE}/visits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Failed to record visit:', error);
    }
}

// 令牌管理功能
async function loadTokenStats() {
    try {
        const response = await fetch(`${API_BASE}/tokens`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            const stats = data.stats;
            
            // 更新令牌统计显示
            document.getElementById('token-total').textContent = stats.total;
            document.getElementById('token-active').textContent = stats.active;
            document.getElementById('token-expired').textContent = stats.expired;
            document.getElementById('token-auto-clean').textContent = data.autoCleanInterval + ' 天';
            
            // 更新用户令牌列表
            const userList = document.getElementById('token-user-list');
            userList.innerHTML = '';
            
            if (Object.keys(stats.byUser).length === 0) {
                userList.innerHTML = '<div class="token-user-item">暂无用户令牌数据</div>';
            } else {
                Object.entries(stats.byUser).forEach(([username, count]) => {
                    const userItem = document.createElement('div');
                    userItem.className = 'token-user-item';
                    userItem.innerHTML = `
                        <span>${username}</span>
                        <span class="token-stat-value">${count} 个令牌</span>
                    `;
                    userList.appendChild(userItem);
                });
            }
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            console.error('Failed to load token stats');
        }
    } catch (error) {
        console.error('Load token stats error:', error);
    }
}

// 设置自动清理间隔
document.getElementById('set-auto-clean').addEventListener('click', async function() {
    const days = parseInt(document.getElementById('auto-clean-days').value);
    
    if (isNaN(days) || days < 1 || days > 365) {
        alert('请输入1-365之间的有效天数');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/tokens`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ autoCleanDays: days })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(result.message);
            // 重新加载令牌统计
            loadTokenStats();
            // 保存设置
            saveSettings();
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('设置失败');
        }
    } catch (error) {
        console.error('Set auto clean error:', error);
        alert('设置失败');
    }
});

// 清理过期令牌
document.getElementById('clean-expired-tokens').addEventListener('click', async function() {
    if (confirm('确定要清理所有过期令牌吗？')) {
        try {
            const response = await fetch(`${API_BASE}/tokens?action=clean-expired`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                alert(result.message);
                // 重新加载令牌统计
                loadTokenStats();
            } else {
                if (!checkAuthResponse(response)) {
                    return;
                }
                alert('清理失败');
            }
        } catch (error) {
            console.error('Clean expired tokens error:', error);
            alert('清理失败');
        }
    }
});

// 清理所有令牌
document.getElementById('clean-all-tokens').addEventListener('click', async function() {
    if (confirm('确定要清理所有令牌吗？这将导致所有用户需要重新登录！')) {
        try {
            const response = await fetch(`${API_BASE}/tokens?action=clean-all`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                alert(result.message);
                // 重新加载令牌统计
                loadTokenStats();
            } else {
                if (!checkAuthResponse(response)) {
                    return;
                }
                alert('清理失败');
            }
        } catch (error) {
            console.error('Clean all tokens error:', error);
            alert('清理失败');
        }
    }
});

// 设置令牌过期时间
document.getElementById('set-token-expiration').addEventListener('click', async function() {
    const days = parseInt(document.getElementById('token-expiration-days').value);
    
    if (isNaN(days) || days < 1 || days > 365) {
        alert('请输入1-365之间的有效天数');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/tokens/expiration`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ expirationDays: days })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(result.message);
            // 重新加载令牌统计以更新显示
            loadTokenStats();
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('设置失败');
        }
    } catch (error) {
        console.error('Set token expiration error:', error);
        alert('设置失败');
    }
});

// 新增：移动端二维码和推荐码自动收起功能
function initMobileCollapse() {
    // 检查是否为移动设备
    const isMobile = window.innerWidth <= 768;
    
    if (!isMobile) {
        return; // 非移动设备不执行
    }
    
    const qrcodeContainer = document.querySelector('.qrcode-container');
    const inviteContainer = document.querySelector('.invite-code-container');
    
    // 为容器添加移动端样式类
    qrcodeContainer.classList.add('mobile-collapsible');
    inviteContainer.classList.add('mobile-collapsible');
    
    // 创建切换按钮
    const qrcodeToggle = document.createElement('div');
    qrcodeToggle.className = 'mobile-toggle-btn qrcode-toggle';
    qrcodeToggle.innerHTML = '<i class="fas fa-qrcode"></i>';
    
    const inviteToggle = document.createElement('div');
    inviteToggle.className = 'mobile-toggle-btn invite-toggle';
    inviteToggle.innerHTML = '<i class="fas fa-gift"></i>';
    
    // 添加切换按钮到页面
    document.body.appendChild(qrcodeToggle);
    document.body.appendChild(inviteToggle);
    
    // 5秒后自动收起
    setTimeout(() => {
        qrcodeContainer.classList.add('collapsed');
        inviteContainer.classList.add('collapsed');
        qrcodeToggle.classList.add('visible');
        inviteToggle.classList.add('visible');
    }, 5000);
    
    // 二维码切换按钮点击事件
    qrcodeToggle.addEventListener('click', function() {
        qrcodeContainer.classList.toggle('collapsed');
        this.classList.toggle('active');
    });
    
    // 推荐码切换按钮点击事件
    inviteToggle.addEventListener('click', function() {
        inviteContainer.classList.toggle('collapsed');
        this.classList.toggle('active');
    });
    
    // 点击容器外部收起
    document.addEventListener('click', function(e) {
        if (!qrcodeContainer.contains(e.target) && !qrcodeToggle.contains(e.target)) {
            qrcodeContainer.classList.add('collapsed');
            qrcodeToggle.classList.remove('active');
        }
        if (!inviteContainer.contains(e.target) && !inviteToggle.contains(e.target)) {
            inviteContainer.classList.add('collapsed');
            inviteToggle.classList.remove('active');
        }
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查数据库状态
    checkDbStatus();
    
    // 加载设置
    loadSettings();
    
    // 记录访问
    recordVisit();
    
    // 自动检测文本中的链接
    autoLinkify();
    
    // 更新用户界面
    updateUserInterface();
    
    // 新增：页面加载时检查令牌状态
    setTimeout(async () => {
        if (currentUser && currentUser.token) {
            await checkTokenStatus();
        }
    }, 2000);
    
    // 新增：初始化移动端收起功能
    initMobileCollapse();
    
    // 添加点击外部关闭模态框的功能
    window.addEventListener('click', function(event) {
        // 关闭所有模态框
        const modals = document.querySelectorAll('.modal, .qrcode-modal, .password-modal, #admin-panel, #user-center, #user-edit-modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // 添加键盘事件监听
    document.addEventListener('keydown', function(event) {
        // ESC键关闭模态框
        if (event.key === 'Escape') {
            const modals = document.querySelectorAll('.modal, .qrcode-modal, .password-modal, #admin-panel, #user-center, #user-edit-modal');
            modals.forEach(modal => {
                modal.style.display = 'none';
            });
        }
    });
});
