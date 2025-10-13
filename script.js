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
// 新增：令牌自动续期间隔（分钟）
let TOKEN_RENEWAL_INTERVAL = 30; // 每30分钟检查一次续期
let tokenCheckInterval;

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
    
    // 停止令牌检查
    if (tokenCheckInterval) {
        clearInterval(tokenCheckInterval);
    }
    
    // 如果还没有显示过过期提示，则显示并标记
    if (!hasShownExpiredAlert) {
        hasShownExpiredAlert = true;
        alert('会话已过期，请重新登录');
    }
}

// 新增：检查令牌状态
async function checkTokenStatus() {
    if (!currentUser || !currentUser.token) {
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE}/status`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            handleTokenExpired();
            return false;
        }
        
        return response.ok;
    } catch (error) {
        console.error('Token status check error:', error);
        // 网络错误时不处理，保持当前状态
        return true;
    }
}

// 新增：自动续期令牌
async function autoRenewToken() {
    if (!currentUser || !currentUser.token) {
        return false;
    }
    
    try {
        // 调用一个需要认证的API来触发令牌验证和可能的续期
        const response = await fetch(`${API_BASE}/config`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            // 检查响应头中是否有新令牌
            const newToken = response.headers.get('X-New-Token');
            if (newToken) {
                // 更新令牌
                currentUser.token = newToken;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                console.log('令牌已自动续期');
            }
            return true;
        } else if (response.status === 401) {
            handleTokenExpired();
            return false;
        }
        return true;
    } catch (error) {
        console.error('Token renewal error:', error);
        return false;
    }
}

// 新增：初始化令牌自动检查
function initTokenAutoCheck() {
    if (tokenCheckInterval) {
        clearInterval(tokenCheckInterval);
    }
    
    if (currentUser && currentUser.token) {
        // 每30分钟检查一次令牌状态并尝试续期
        tokenCheckInterval = setInterval(async () => {
            await autoRenewToken();
        }, TOKEN_RENEWAL_INTERVAL * 60 * 1000);
        
        // 页面可见性变化时检查令牌
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden) {
                await checkTokenStatus();
            }
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
        
        // 初始化令牌自动检查
        initTokenAutoCheck();
    } else {
        userLoginBtn.innerHTML = '<i class="fas fa-user"></i><span>用户登录</span>';
        adminPanelBtn.style.display = 'none';
        userCenterBtn.style.display = 'none';
        
        // 停止令牌检查
        if (tokenCheckInterval) {
            clearInterval(tokenCheckInterval);
        }
    }
    
    // 新增：用户登录状态变化时刷新捐助用户预测显示
    calculateHangarOpenTimes(adjustedStartTime);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 页面加载时检查令牌状态
    if (currentUser) {
        checkTokenStatus().then(isValid => {
            if (!isValid) {
                console.log('令牌已过期，已自动登出');
            }
        });
    }
    
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
});

// 其他函数保持不变...
// [其余代码保持不变，只添加了上述新功能]
