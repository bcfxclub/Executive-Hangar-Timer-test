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

// ... 其余代码保持不变 ...
