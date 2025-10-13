// API地址设置 - 使用固定默认值，不存储在localStorage中
let API_BASE = "https://bcfxclub.dpdns.org/api";

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
// 新增：令牌自动续期相关变量
let tokenRefreshInterval;
let lastUserActivity = Date.now();
const TOKEN_REFRESH_THRESHOLD = 15 * 60 * 1000; // 15分钟
const TOKEN_EXPIRY_WARNING = 5 * 60 * 1000; // 5分钟警告
const ACTIVITY_CHECK_INTERVAL = 60000; // 1分钟检查一次活动

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

// 新增：检查令牌是否即将过期
function isTokenNearExpiry() {
    if (!currentUser || !currentUser.tokenExpiry) return false;
    
    const now = Date.now();
    const expiryTime = currentUser.tokenExpiry;
    const timeUntilExpiry = expiryTime - now;
    
    return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD;
}

// 新增：自动续期令牌
async function refreshToken() {
    if (!currentUser || !currentUser.token) return false;
    
    try {
        const response = await fetch(`${API_BASE}/refresh-token`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                // 更新令牌和过期时间
                currentUser.token = result.token;
                currentUser.tokenExpiry = result.expiresAt;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                
                console.log('令牌已自动续期');
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('令牌续期失败:', error);
        return false;
    }
}

// 新增：检查并刷新令牌
async function checkAndRefreshToken() {
    if (!currentUser) return;
    
    // 检查用户最近是否有活动
    const timeSinceLastActivity = Date.now() - lastUserActivity;
    if (timeSinceLastActivity > 30 * 60 * 1000) { // 30分钟无活动不续期
        return;
    }
    
    if (isTokenNearExpiry()) {
        const refreshed = await refreshToken();
        if (!refreshed) {
            // 续期失败，检查令牌是否已过期
            await checkTokenValidity();
        }
    }
}

// 新增：检查令牌有效性
async function checkTokenValidity() {
    if (!currentUser || !currentUser.token) return;
    
    try {
        const response = await fetch(`${API_BASE}/verify-token`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                handleTokenExpired();
            }
        }
    } catch (error) {
        console.error('令牌验证失败:', error);
        // 网络错误时不立即认为令牌过期
    }
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
    
    // 清除令牌检查间隔
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
    }
}

// 新增：记录用户活动
function recordUserActivity() {
    lastUserActivity = Date.now();
}

// 检查API响应是否需要重新登录
function checkAuthResponse(response) {
    if (response.status === 401) {
        handleTokenExpired();
        return false;
    }
    return true;
}

// 初始化令牌自动检查
function initTokenAutoRefresh() {
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
    }
    
    if (currentUser && currentUser.token) {
        // 每分钟检查一次令牌状态
        tokenRefreshInterval = setInterval(async () => {
            await checkAndRefreshToken();
        }, ACTIVITY_CHECK_INTERVAL);
        
        // 监听用户活动
        ['click', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, recordUserActivity, { passive: true });
        });
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
        
        // 初始化令牌自动刷新
        initTokenAutoRefresh();
        
        // 立即检查一次令牌状态
        setTimeout(() => {
            checkTokenValidity();
        }, 1000);
    } else {
        userLoginBtn.innerHTML = '<i class="fas fa-user"></i><span>用户登录</span>';
        adminPanelBtn.style.display = 'none';
        userCenterBtn.style.display = 'none';
        
        // 清除令牌检查间隔
        if (tokenRefreshInterval) {
            clearInterval(tokenRefreshInterval);
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
        logoPreview.innerHTML = `<img src="${url}" alt="Logo Preview">`;
        logo.innerHTML = `<img src="${url}" alt="Logo">`;
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
                    tokenExpiry: result.expiresAt,
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
            feedbackList.innerHTML = '';
            
            if (feedback.length === 0) {
                feedbackList.innerHTML = '<div class="feedback-item">暂无反馈</div>';
                return;
            }
            
            feedback.forEach(item => {
                const feedbackItem = document.createElement('div');
                feedbackItem.className = 'feedback-item';
                
                const date = new Date(item.date).toLocaleString();
                const username = item.username || '匿名用户';
                
                feedbackItem.innerHTML = `
                    <div class="feedback-date">${date}</div>
                    <div class="feedback-username">用户: ${username}</div>
                    <div class="feedback-content">${escapeHtml(item.content)}</div>
                    ${item.contact ? `<div class="feedback-contact">联系方式: ${escapeHtml(item.contact)}</div>` : ''}
                    <button class="delete-feedback" data-id="${item.id}">删除</button>
                `;
                
                feedbackList.appendChild(feedbackItem);
            });
            
            // 添加删除事件
            document.querySelectorAll('.delete-feedback').forEach(button => {
                button.addEventListener('click', async function() {
                    const id = this.getAttribute('data-id');
                    if (confirm('确定删除这条反馈吗？')) {
                        await deleteFeedback(id);
                    }
                });
            });
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            console.error('Failed to load feedback');
        }
    } catch (error) {
        console.error('Failed to load feedback:', error);
    }
}

// 删除反馈
async function deleteFeedback(id) {
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

// 加载访问统计
async function loadVisits() {
    try {
        const response = await fetch(`${API_BASE}/visits`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const visits = await response.json();
            const visitsList = document.getElementById('visits-list');
            const visitCount = document.getElementById('visit-count');
            
            visitCount.textContent = `总IP数: ${visits.total}`;
            
            visitsList.innerHTML = '';
            
            if (visits.ips.length === 0) {
                visitsList.innerHTML = '<div class="visit-item">暂无访问记录</div>';
                return;
            }
            
            visits.ips.forEach(ip => {
                const visitItem = document.createElement('div');
                visitItem.className = 'visit-item';
                
                const date = new Date(ip.lastVisit).toLocaleString();
                visitItem.innerHTML = `
                    <div class="visit-ip">${ip.ip}</div>
                    <div class="visit-date">最后访问: ${date}</div>
                `;
                
                visitsList.appendChild(visitItem);
            });
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            console.error('Failed to load visits');
        }
    } catch (error) {
        console.error('Failed to load visits:', error);
    }
}

// 刷新访问统计
document.getElementById('refresh-visits').addEventListener('click', function() {
    loadVisits();
});

// 清除访问记录
document.getElementById('clear-visits').addEventListener('click', async function() {
    if (confirm('确定要清除所有访问记录吗？')) {
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

// 加载用户列表
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const users = await response.json();
            const userList = document.getElementById('user-list');
            userList.innerHTML = '';
            
            if (users.length === 0) {
                userList.innerHTML = '<div class="user-item">暂无用户</div>';
                return;
            }
            
            users.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                
                let roleBadge = '';
                if (user.isSuperAdmin) {
                    roleBadge = '<span class="user-role-badge user-super-admin">超级管理员</span>';
                } else if (user.isAdmin) {
                    roleBadge = '<span class="user-role-badge user-admin">管理员</span>';
                } else {
                    roleBadge = '<span class="user-role-badge user-normal">普通用户</span>';
                }
                
                if (user.frozen) {
                    roleBadge += '<span class="user-role-badge user-frozen">已冻结</span>';
                }
                
                if (!user.approved) {
                    roleBadge += '<span class="user-role-badge user-pending">待审核</span>';
                }
                
                userItem.innerHTML = `
                    <div class="user-info">
                        <strong>${escapeHtml(user.username)}</strong> - ${escapeHtml(user.email)}
                        ${roleBadge}
                    </div>
                    <div class="user-actions">
                        <button class="user-action-btn edit-user" data-id="${user.id}">编辑</button>
                        <button class="user-action-btn delete-user" data-id="${user.id}">删除</button>
                    </div>
                `;
                
                userList.appendChild(userItem);
            });
            
            // 添加编辑和删除事件
            document.querySelectorAll('.edit-user').forEach(button => {
                button.addEventListener('click', function() {
                    const userId = this.getAttribute('data-id');
                    editUser(userId);
                });
            });
            
            document.querySelectorAll('.delete-user').forEach(button => {
                button.addEventListener('click', function() {
                    const userId = this.getAttribute('data-id');
                    deleteUser(userId);
                });
            });
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            console.error('Failed to load users');
        }
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

// 刷新用户列表
document.getElementById('refresh-users').addEventListener('click', function() {
    loadUsers();
});

// 编辑用户
async function editUser(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const user = await response.json();
            currentEditingUser = user;
            
            // 填充编辑表单
            document.getElementById('edit-username').value = user.username;
            document.getElementById('edit-email').value = user.email || '';
            
            // 设置用户角色
            if (user.isSuperAdmin) {
                document.getElementById('edit-role').value = 'super-admin';
            } else if (user.isAdmin) {
                document.getElementById('edit-role').value = 'admin';
            } else {
                document.getElementById('edit-role').value = 'normal';
            }
            
            // 设置权限
            const permissions = user.permissions || {};
            document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
                const permission = checkbox.value;
                checkbox.checked = permissions[permission] || false;
            });
            
            // 设置审核状态
            document.getElementById('edit-approved').value = user.approved ? 'true' : 'false';
            
            // 设置冻结状态
            document.getElementById('edit-frozen').value = user.frozen ? 'true' : 'false';
            
            // 显示编辑模态框
            document.getElementById('user-edit-modal').style.display = 'flex';
            
            // 动态控制超级管理员选项的显示
            const superAdminOption = document.getElementById('super-admin-option');
            if (currentUser && currentUser.isSuperAdmin) {
                superAdminOption.style.display = 'block';
            } else {
                superAdminOption.style.display = 'none';
            }
            
            // 动态显示管理员权限
            const adminPermissions = document.querySelectorAll('.admin-permission');
            adminPermissions.forEach(perm => {
                if (user.isAdmin || user.isSuperAdmin) {
                    perm.style.display = 'block';
                } else {
                    perm.style.display = 'none';
                }
            });
            
            // 角色变化时更新权限显示
            document.getElementById('edit-role').addEventListener('change', function() {
                const isAdmin = this.value === 'admin' || this.value === 'super-admin';
                adminPermissions.forEach(perm => {
                    perm.style.display = isAdmin ? 'block' : 'none';
                });
            });
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('获取用户信息失败');
        }
    } catch (error) {
        console.error('Edit user error:', error);
        alert('获取用户信息失败');
    }
}

// 保存用户编辑
document.getElementById('save-user-edit').addEventListener('click', async function() {
    if (!currentEditingUser) return;
    
    const updatedUser = {
        email: document.getElementById('edit-email').value,
        role: document.getElementById('edit-role').value,
        approved: document.getElementById('edit-approved').value === 'true',
        frozen: document.getElementById('edit-frozen').value === 'true',
        password: document.getElementById('edit-password').value || null
    };
    
    // 收集权限设置
    const permissions = {};
    document.querySelectorAll('#edit-permissions input[type="checkbox"]').forEach(checkbox => {
        permissions[checkbox.value] = checkbox.checked;
    });
    updatedUser.permissions = permissions;
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentEditingUser.id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updatedUser)
        });
        
        if (response.ok) {
            alert('用户信息已更新');
            document.getElementById('user-edit-modal').style.display = 'none';
            document.getElementById('edit-password').value = '';
            loadUsers();
            
            // 如果更新的是当前用户，重新加载用户信息
            if (currentUser && currentUser.id === currentEditingUser.id) {
                const userResponse = await fetch(`${API_BASE}/users/${currentUser.id}`, {
                    headers: getAuthHeaders()
                });
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    currentUser = {
                        ...currentUser,
                        ...userData,
                        permissions: userData.permissions
                    };
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    updateUserInterface();
                }
            }
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('更新用户信息失败');
        }
    } catch (error) {
        console.error('Update user error:', error);
        alert('更新用户信息失败');
    }
});

// 取消用户编辑
document.getElementById('cancel-user-edit').addEventListener('click', function() {
    document.getElementById('user-edit-modal').style.display = 'none';
    document.getElementById('edit-password').value = '';
    currentEditingUser = null;
});

// 删除用户
async function deleteUser(userId) {
    if (confirm('确定要删除这个用户吗？此操作不可恢复！')) {
        try {
            const response = await fetch(`${API_BASE}/users/${userId}`, {
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
                alert('删除用户失败');
            }
        } catch (error) {
            console.error('Delete user error:', error);
            alert('删除用户失败');
        }
    }
}

// 加载用户信息
async function loadUserInfo() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.id}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const user = await response.json();
            
            document.getElementById('user-info-username').value = user.username;
            document.getElementById('user-info-email').value = user.email || '';
            
            let roleText = '普通用户';
            if (user.isSuperAdmin) {
                roleText = '超级管理员';
            } else if (user.isAdmin) {
                roleText = '管理员';
            }
            
            document.getElementById('user-info-role').textContent = roleText;
            
            // 设置密保问题
            if (user.securityQuestion) {
                document.getElementById('user-security-question').value = user.securityQuestion;
            }
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            console.error('Failed to load user info');
        }
    } catch (error) {
        console.error('Failed to load user info:', error);
    }
}

// 更新用户信息
document.getElementById('update-user-info').addEventListener('click', async function() {
    if (!currentUser) return;
    
    const email = document.getElementById('user-info-email').value;
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.id}`, {
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
            alert('更新用户信息失败');
        }
    } catch (error) {
        console.error('Update user info error:', error);
        alert('更新用户信息失败');
    }
});

// 修改密码
document.getElementById('change-password-btn').addEventListener('click', async function() {
    if (!currentUser) return;
    
    const oldPassword = document.getElementById('change-password-old').value;
    const newPassword = document.getElementById('change-password-new').value;
    const confirmPassword = document.getElementById('change-password-confirm').value;
    
    if (!oldPassword || !newPassword || !confirmPassword) {
        alert('请填写所有密码字段');
        return;
    }
    
    if (newPassword.length < 4) {
        alert('新密码长度至少4位');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('新密码和确认密码不一致');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({
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
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('密码修改失败');
        }
    } catch (error) {
        console.error('Change password error:', error);
        alert('密码修改失败');
    }
});

// 更新密保设置
document.getElementById('update-security-question').addEventListener('click', async function() {
    if (!currentUser) return;
    
    const securityQuestion = document.getElementById('user-security-question').value;
    const securityAnswer = document.getElementById('user-security-answer').value;
    
    if (!securityQuestion || !securityAnswer) {
        alert('请选择密保问题并填写答案');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.id}`, {
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
            alert('更新密保设置失败');
        }
    } catch (error) {
        console.error('Update security question error:', error);
        alert('更新密保设置失败');
    }
});

// 页脚信息按钮点击事件
document.getElementById('project-description-btn').addEventListener('click', function() {
    document.getElementById('footer-modal-title').textContent = '项目介绍';
    document.getElementById('footer-modal-content').textContent = document.getElementById('project-description-input').value;
    document.getElementById('footer-info-modal').style.display = 'flex';
});

document.getElementById('version-btn').addEventListener('click', function() {
    document.getElementById('footer-modal-title').textContent = '版本更新';
    document.getElementById('footer-modal-content').textContent = document.getElementById('version-input').value;
    document.getElementById('footer-info-modal').style.display = 'flex';
});

document.getElementById('about-btn').addEventListener('click', function() {
    document.getElementById('footer-modal-title').textContent = '关于我们';
    document.getElementById('footer-modal-content').textContent = document.getElementById('about-input').value;
    document.getElementById('footer-info-modal').style.display = 'flex';
});

// 关闭页脚信息模态框
document.getElementById('close-footer-modal').addEventListener('click', function() {
    document.getElementById('footer-info-modal').style.display = 'none';
});

// HTML转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 初始化拖拽面板
function initDraggablePanel(panelId) {
    const panel = document.getElementById(panelId);
    const header = document.getElementById(`${panelId}-header`);
    let isDragging = false;
    let dragOffsetX, dragOffsetY;
    
    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    function startDrag(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') {
            return;
        }
        
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        panel.style.cursor = 'grabbing';
    }
    
    function drag(e) {
        if (!isDragging) return;
        
        const x = e.clientX - dragOffsetX;
        const y = e.clientY - dragOffsetY;
        
        // 限制在窗口范围内
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;
        
        panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
        panel.style.transform = 'none';
    }
    
    function stopDrag() {
        isDragging = false;
        panel.style.cursor = 'grab';
    }
}

// 新增：加载令牌统计
async function loadTokenStats() {
    try {
        const response = await fetch(`${API_BASE}/tokens/stats`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('token-total').textContent = stats.total;
            document.getElementById('token-active').textContent = stats.active;
            document.getElementById('token-expired').textContent = stats.expired;
            document.getElementById('token-auto-clean').textContent = `${stats.autoCleanDays}天`;
            
            // 加载用户令牌统计
            const userStatsResponse = await fetch(`${API_BASE}/tokens/user-stats`, {
                headers: getAuthHeaders()
            });
            
            if (userStatsResponse.ok) {
                const userStats = await userStatsResponse.json();
                const userList = document.getElementById('token-user-list');
                userList.innerHTML = '';
                
                if (userStats.length === 0) {
                    userList.innerHTML = '<div class="token-user-item">暂无用户令牌数据</div>';
                    return;
                }
                
                userStats.forEach(user => {
                    const userItem = document.createElement('div');
                    userItem.className = 'token-user-item';
                    userItem.innerHTML = `
                        <span>${escapeHtml(user.username)}</span>
                        <span>令牌数: ${user.tokenCount}</span>
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
        console.error('Failed to load token stats:', error);
    }
}

// 新增：清理过期令牌
document.getElementById('clean-expired-tokens').addEventListener('click', async function() {
    if (confirm('确定要清理所有过期令牌吗？')) {
        try {
            const response = await fetch(`${API_BASE}/tokens/clean-expired`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                alert('过期令牌已清理');
                loadTokenStats();
            } else {
                if (!checkAuthResponse(response)) {
                    return;
                }
                alert('清理过期令牌失败');
            }
        } catch (error) {
            console.error('Clean expired tokens error:', error);
            alert('清理过期令牌失败');
        }
    }
});

// 新增：清理所有令牌
document.getElementById('clean-all-tokens').addEventListener('click', async function() {
    if (confirm('确定要清理所有令牌吗？所有用户都将需要重新登录！')) {
        try {
            const response = await fetch(`${API_BASE}/tokens/clean-all`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                alert('所有令牌已清理');
                loadTokenStats();
            } else {
                if (!checkAuthResponse(response)) {
                    return;
                }
                alert('清理所有令牌失败');
            }
        } catch (error) {
            console.error('Clean all tokens error:', error);
            alert('清理所有令牌失败');
        }
    }
});

// 新增：设置自动清理间隔
document.getElementById('set-auto-clean').addEventListener('click', async function() {
    const days = parseInt(document.getElementById('auto-clean-days').value);
    
    if (isNaN(days) || days < 1 || days > 365) {
        alert('请输入1-365之间的有效天数');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/tokens/auto-clean`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ days })
        });
        
        if (response.ok) {
            alert(`自动清理间隔已设置为${days}天`);
            loadTokenStats();
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('设置自动清理间隔失败');
        }
    } catch (error) {
        console.error('Set auto clean error:', error);
        alert('设置自动清理间隔失败');
    }
});

// 新增：设置令牌过期时间
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
            body: JSON.stringify({ days })
        });
        
        if (response.ok) {
            alert(`令牌过期时间已设置为${days}天`);
            loadTokenStats();
        } else {
            if (!checkAuthResponse(response)) {
                return;
            }
            alert('设置令牌过期时间失败');
        }
    } catch (error) {
        console.error('Set token expiration error:', error);
        alert('设置令牌过期时间失败');
    }
});

// 时间格式化函数
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTimeFull(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
}

// 初始化计时器
function initializeTimer(initialPhase) {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    const config = PHASE_CONFIG[initialPhase];
    if (!config) {
        console.error('Invalid initial phase:', initialPhase);
        return;
    }
    
    currentPhase = config.phase;
    currentLights = [...config.lights];
    
    // 计算调整后的开始时间
    adjustedStartTime = new Date(startTime.getTime() - config.offset * 60000);
    
    // 计算当前时间与调整后开始时间的差值（分钟）
    const now = new Date();
    const diffMinutes = Math.floor((now - adjustedStartTime) / 60000);
    
    // 计算当前周期和剩余时间
    calculateCurrentState(diffMinutes);
    
    // 开始计时器
    countdownInterval = setInterval(() => {
        const now = new Date();
        const diffMinutes = Math.floor((now - adjustedStartTime) / 60000);
        calculateCurrentState(diffMinutes);
    }, 1000);
    
    // 更新界面显示
    updateTimerDisplay();
    calculateHangarOpenTimes(adjustedStartTime);
    updateCalibrationTime();
}

// 计算当前状态
function calculateCurrentState(totalMinutes) {
    if (!timerEnabled) {
        currentPhase = 'disabled';
        return;
    }
    
    // 计算当前在完整周期中的位置
    const cycleDuration = PHASE_DURATIONS.reset + PHASE_DURATIONS.card + PHASE_DURATIONS.poweroff;
    const cyclePosition = totalMinutes % cycleDuration;
    
    if (cyclePosition < PHASE_DURATIONS.reset) {
        // 重置阶段
        currentPhase = 'reset';
        const phasePosition = cyclePosition;
        
        // 根据在重置阶段的位置计算灯的状态
        const segmentDuration = PHASE_DURATIONS.reset / 5;
        const activeLights = Math.floor(phasePosition / segmentDuration);
        
        currentLights = Array(5).fill('red');
        for (let i = 0; i < activeLights; i++) {
            currentLights[i] = 'green';
        }
    } else if (cyclePosition < PHASE_DURATIONS.reset + PHASE_DURATIONS.card) {
        // 插卡阶段
        currentPhase = 'card';
        const phasePosition = cyclePosition - PHASE_DURATIONS.reset;
        
        // 根据在插卡阶段的位置计算灯的状态
        const segmentDuration = PHASE_DURATIONS.card / 5;
        const inactiveLights = Math.floor(phasePosition / segmentDuration);
        
        currentLights = Array(5).fill('green');
        for (let i = 0; i < inactiveLights; i++) {
            currentLights[i] = 'gray';
        }
    } else {
        // 关闭阶段
        currentPhase = 'poweroff';
        currentLights = Array(5).fill('gray');
    }
}

// 更新计时器显示
function updateTimerDisplay() {
    if (!timerEnabled) {
        document.getElementById('phase-indicator').className = 'phase-indicator phase-disabled';
        document.getElementById('phase-indicator').innerHTML = '<i class="fas fa-power-off"></i> <span>计时器维护中</span>';
        document.getElementById('countdown').textContent = '--:--:--';
        updateLightsDisplay(['gray', 'gray', 'gray', 'gray', 'gray']);
        document.getElementById('hangar-open-time').innerHTML = '<i class="fas fa-play-circle"></i> 当前机库开启时间: 维护中...';
        return;
    }
    
    const now = new Date();
    const diffMinutes = Math.floor((now - adjustedStartTime) / 60000);
    const cycleDuration = PHASE_DURATIONS.reset + PHASE_DURATIONS.card + PHASE_DURATIONS.poweroff;
    const cyclePosition = diffMinutes % cycleDuration;
    
    let remainingMinutes;
    let phaseName;
    let phaseIcon;
    
    if (cyclePosition < PHASE_DURATIONS.reset) {
        // 重置阶段
        phaseName = '机库已关闭等待开启中';
        phaseIcon = 'fas fa-sync-alt';
        remainingMinutes = PHASE_DURATIONS.reset - cyclePosition;
    } else if (cyclePosition < PHASE_DURATIONS.reset + PHASE_DURATIONS.card) {
        // 插卡阶段
        phaseName = '机库开启中';
        phaseIcon = 'fas fa-door-open';
        remainingMinutes = PHASE_DURATIONS.reset + PHASE_DURATIONS.card - cyclePosition;
    } else {
        // 关闭阶段
        phaseName = '机库关闭中';
        phaseIcon = 'fas fa-door-closed';
        remainingMinutes = cycleDuration - cyclePosition;
    }
    
    // 更新阶段指示器
    const phaseIndicator = document.getElementById('phase-indicator');
    phaseIndicator.className = `phase-indicator phase-${currentPhase}`;
    phaseIndicator.innerHTML = `<i class="${phaseIcon}"></i> <span>${phaseName}</span>`;
    
    // 更新倒计时
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    const seconds = 59 - now.getSeconds(); // 秒级倒计时
    
    document.getElementById('countdown').textContent = 
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // 更新指示灯
    updateLightsDisplay(currentLights);
    
    // 更新当前机库开启时间
    updateCurrentHangarOpenTime(cyclePosition);
}

// 更新指示灯显示
function updateLightsDisplay(lights) {
    const lightsContainer = document.getElementById('lights-container');
    
    for (let i = 0; i < 5; i++) {
        const light = document.getElementById(`light-${i}`);
        light.className = `light ${lights[i]} ${lights[i] !== 'gray' ? 'active' : ''}`;
    }
}

// 更新当前机库开启时间
function updateCurrentHangarOpenTime(cyclePosition) {
    const now = new Date();
    
    if (cyclePosition < PHASE_DURATIONS.reset) {
        // 在重置阶段，显示下一次开启时间
        const minutesUntilOpen = PHASE_DURATIONS.reset - cyclePosition;
        const openTime = new Date(now.getTime() + minutesUntilOpen * 60000);
        document.getElementById('hangar-open-time').innerHTML = 
            `<i class="fas fa-play-circle"></i> 当前机库开启时间: ${formatDateTimeFull(openTime)}`;
    } else if (cyclePosition < PHASE_DURATIONS.reset + PHASE_DURATIONS.card) {
        // 在插卡阶段，显示当前开启时间
        const minutesSinceOpen = cyclePosition - PHASE_DURATIONS.reset;
        const openTime = new Date(now.getTime() - minutesSinceOpen * 60000);
        document.getElementById('hangar-open-time').innerHTML = 
            `<i class="fas fa-play-circle"></i> 当前机库开启时间: ${formatDateTimeFull(openTime)}`;
    } else {
        // 在关闭阶段，显示下一次开启时间
        const minutesUntilOpen = PHASE_DURATIONS.reset + PHASE_DURATIONS.card + PHASE_DURATIONS.poweroff - cyclePosition;
        const openTime = new Date(now.getTime() + minutesUntilOpen * 60000);
        document.getElementById('hangar-open-time').innerHTML = 
            `<i class="fas fa-play-circle"></i> 当前机库开启时间: ${formatDateTimeFull(openTime)}`;
    }
}

// 计算机库开启时间预测
function calculateHangarOpenTimes(adjustedStartTime) {
    const now = new Date();
    const cycleDuration = PHASE_DURATIONS.reset + PHASE_DURATIONS.card + PHASE_DURATIONS.poweroff;
    
    // 计算当前周期位置
    const diffMinutes = Math.floor((now - adjustedStartTime) / 60000);
    const currentCycle = Math.floor(diffMinutes / cycleDuration);
    const cyclePosition = diffMinutes % cycleDuration;
    
    // 获取当前用户是否可以看到机库开启时间预测
    const hangarTimesVisible = localStorage.getItem('hangarTimesVisible') !== 'false' && 
        (currentUser || localStorage.getItem('hangarTimesVisible') === 'true');
    
    // 计算上次开启时间
    let lastOpenTime = null;
    if (cyclePosition >= PHASE_DURATIONS.reset && cyclePosition < PHASE_DURATIONS.reset + PHASE_DURATIONS.card) {
        // 当前正在开启中
        const minutesSinceOpen = cyclePosition - PHASE_DURATIONS.reset;
        lastOpenTime = new Date(now.getTime() - minutesSinceOpen * 60000);
    } else if (currentCycle > 0) {
        // 上一个周期的开启时间
        const lastCycleEnd = new Date(adjustedStartTime.getTime() + (currentCycle * cycleDuration + PHASE_DURATIONS.reset) * 60000);
        lastOpenTime = lastCycleEnd;
    }
    
    // 计算下次开启时间
    let nextOpenTime = null;
    if (cyclePosition < PHASE_DURATIONS.reset) {
        // 在重置阶段，下一次开启就是当前周期的结束
        const minutesUntilOpen = PHASE_DURATIONS.reset - cyclePosition;
        nextOpenTime = new Date(now.getTime() + minutesUntilOpen * 60000);
    } else if (cyclePosition >= PHASE_DURATIONS.reset + PHASE_DURATIONS.card) {
        // 在关闭阶段，下一次开启是下一个周期的开始
        const minutesUntilOpen = cycleDuration - cyclePosition + PHASE_DURATIONS.reset;
        nextOpenTime = new Date(now.getTime() + minutesUntilOpen * 60000);
    } else {
        // 在插卡阶段，下一次开启是下一个周期的开始
        const minutesUntilOpen = cycleDuration - cyclePosition + PHASE_DURATIONS.reset;
        nextOpenTime = new Date(now.getTime() + minutesUntilOpen * 60000);
    }
    
    // 更新显示
    const windowList = document.getElementById('window-list');
    const windowStatus = document.querySelector('.window-status');
    
    if (!hangarTimesVisible) {
        // 对未登录用户隐藏具体时间
        windowStatus.textContent = '该功能仅对注册授权用户开放';
        windowList.innerHTML = `
            <li><i class="fas fa-window-restore"></i> 上次开启时间: 登录后可见</li>
            <li><i class="fas fa-window-restore"></i> 下次开启时间: 登录后可见</li>
            <li><i class="fas fa-window-restore"></i> 开启时间 1: 登录后可见</li>
            <li><i class="fas fa-window-restore"></i> 开启时间 2: 登录后可见</li>
            <li><i class="fas fa-window-restore"></i> 开启时间 3: 登录后可见</li>
            <li><i class="fas fa-window-restore"></i> 开启时间 4: 登录后可见</li>
            <li><i class="fas fa-window-restore"></i> 开启时间 5: 登录后可见</li>
            <li><i class="fas fa-window-restore"></i> 开启时间 6: 登录后可见</li>
            <li><i class="fas fa-window-restore"></i> 开启时间 7: 登录后可见</li>
        `;
        return;
    }
    
    // 对授权用户显示具体时间
    windowStatus.textContent = '该时间段内可以插卡开启机库大门';
    
    let html = '';
    
    // 上次开启时间
    if (lastOpenTime) {
        html += `<li><i class="fas fa-window-restore"></i> 上次开启时间: ${formatDateTimeFull(lastOpenTime)}</li>`;
    } else {
        html += `<li><i class="fas fa-window-restore"></i> 上次开启时间: 无记录</li>`;
    }
    
    // 下次开启时间
    html += `<li><i class="fas fa-window-restore"></i> 下次开启时间: ${formatDateTimeFull(nextOpenTime)}</li>`;
    
    // 计算未来7次开启时间
    for (let i = 1; i <= 7; i++) {
        const futureOpenTime = new Date(nextOpenTime.getTime() + i * cycleDuration * 60000);
        html += `<li><i class="fas fa-window-restore"></i> 开启时间 ${i}: ${formatDateTimeFull(futureOpenTime)}</li>`;
    }
    
    windowList.innerHTML = html;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 加载设置
    loadSettings();
    
    // 更新用户界面状态
    updateUserInterface();
    
    // 设置页面标题
    document.title = "星际公民行政机库计时系统";
    
    // 数据库状态检查
    checkDatabaseStatus();
    
    // 定期检查数据库状态（每30秒）
    setInterval(checkDatabaseStatus, 30000);
    
    // 新增：页面加载时立即检查令牌状态
    if (currentUser && currentUser.token) {
        setTimeout(() => {
            checkTokenValidity();
        }, 2000);
    }
});

// 检查数据库状态
async function checkDatabaseStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        if (response.ok) {
            document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #2ecc71;"></i> <span>数据库状态: 正常</span>';
        } else {
            document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 异常</span>';
        }
    } catch (error) {
        document.getElementById('db-status').innerHTML = '<i class="fas fa-database" style="color: #e74c3c;"></i> <span>数据库状态: 连接失败</span>';
    }
}

// 确保在页面关闭前清理资源
window.addEventListener('beforeunload', function() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
    }
});
