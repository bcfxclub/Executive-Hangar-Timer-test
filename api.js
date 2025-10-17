// api.js - 修改后的版本，增加令牌验证和续期功能

// api.js - Cloudflare Worker (优化版 - 统一管理所有令牌)
const DEFAULT_PASSWORD = 'admin';

// 简单的加密函数（用于演示，生产环境应使用更强的加密）
function simpleEncrypt(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function simpleDecrypt(encodedText) {
  return decodeURIComponent(escape(atob(encodedText)));
}

// 令牌管理 - 统一存储在单个KV键中
class TokenManager {
  constructor(kv) {
    this.kv = kv;
    this.tokensKey = 'all_tokens';
    this.defaultExpirationDays = 30; // 默认30天过期
  }
  
  async generateToken(user) {
    const token = 'token_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
    
    // 从配置中获取过期时间
    const config = await this.kv.get('config', { type: 'json' }) || {};
    const expirationDays = config.tokenExpirationDays || this.defaultExpirationDays;
    
    const tokenData = {
      token,
      username: user.username,
      isAdmin: user.isAdmin || false,
      isSuperAdmin: user.isSuperAdmin || false,
      permissions: user.permissions || {},
      createdAt: Date.now(),
      expiresAt: Date.now() + (expirationDays * 24 * 60 * 60 * 1000)
    };
    
    // 获取现有令牌
    const allTokens = await this.getAllTokens();
    
    // 添加新令牌
    allTokens[token] = tokenData;
    
    // 保存回KV
    await this.kv.put(this.tokensKey, JSON.stringify(allTokens));
    
    return token;
  }
  
  async getAllTokens() {
    try {
      const tokensData = await this.kv.get(this.tokensKey, { type: 'json' });
      return tokensData || {};
    } catch (error) {
      return {};
    }
  }
  
  async verifyToken(token) {
    if (!token) return null;
    
    try {
      const allTokens = await this.getAllTokens();
      const tokenData = allTokens[token];
      
      // 检查令牌是否存在且未过期
      if (tokenData && tokenData.expiresAt > Date.now()) {
        return tokenData;
      } else if (tokenData) {
        // 令牌已过期，删除它
        await this.revokeToken(token);
      }
      return null;
    } catch (error) {
      return null;
    }
  }
  
  // 新增：验证令牌状态（包含续期检查）
  async verifyTokenWithRenewCheck(token) {
    if (!token) return { valid: false, reason: 'no_token' };
    
    try {
      const allTokens = await this.getAllTokens();
      const tokenData = allTokens[token];
      
      if (!tokenData) {
        return { valid: false, reason: 'invalid_token' };
      }
      
      const now = Date.now();
      const timeUntilExpiry = tokenData.expiresAt - now;
      
      // 检查令牌是否已过期
      if (timeUntilExpiry <= 0) {
        // 令牌已过期，删除它
        await this.revokeToken(token);
        return { valid: false, reason: 'expired' };
      }
      
      // 检查令牌是否即将过期（1小时内）
      const expiresSoon = timeUntilExpiry < (60 * 60 * 1000); // 1小时
      
      return {
        valid: true,
        tokenData,
        expiresSoon,
        timeUntilExpiry
      };
    } catch (error) {
      return { valid: false, reason: 'error' };
    }
  }
  
  // 新增：续期令牌
  async renewToken(token) {
    try {
      const allTokens = await this.getAllTokens();
      const tokenData = allTokens[token];
      
      if (!tokenData) {
        return { success: false, error: '令牌不存在' };
      }
      
      // 从配置中获取过期时间
      const config = await this.kv.get('config', { type: 'json' }) || {};
      const expirationDays = config.tokenExpirationDays || this.defaultExpirationDays;
      
      // 更新过期时间
      tokenData.expiresAt = Date.now() + (expirationDays * 24 * 60 * 60 * 1000);
      
      // 保存回KV
      allTokens[token] = tokenData;
      await this.kv.put(this.tokensKey, JSON.stringify(allTokens));
      
      return {
        success: true,
        tokenData
      };
    } catch (error) {
      return { success: false, error: '续期失败' };
    }
  }
  
  async revokeToken(token) {
    const allTokens = await this.getAllTokens();
    delete allTokens[token];
    await this.kv.put(this.tokensKey, JSON.stringify(allTokens));
  }
  
  async revokeUserTokens(username) {
    const allTokens = await this.getAllTokens();
    let revokedCount = 0;
    
    Object.keys(allTokens).forEach(token => {
      if (allTokens[token].username === username) {
        delete allTokens[token];
        revokedCount++;
      }
    });
    
    if (revokedCount > 0) {
      await this.kv.put(this.tokensKey, JSON.stringify(allTokens));
    }
    
    return revokedCount;
  }
  
  async revokeAllTokens() {
    await this.kv.put(this.tokensKey, JSON.stringify({}));
  }
  
  async cleanExpiredTokens() {
    const allTokens = await this.getAllTokens();
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(allTokens).forEach(token => {
      if (allTokens[token].expiresAt <= now) {
        delete allTokens[token];
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      await this.kv.put(this.tokensKey, JSON.stringify(allTokens));
    }
    
    return cleanedCount;
  }
  
  async getTokenStats() {
    const allTokens = await this.getAllTokens();
    const now = Date.now();
    
    const stats = {
      total: Object.keys(allTokens).length,
      expired: 0,
      active: 0,
      byUser: {}
    };
    
    Object.values(allTokens).forEach(tokenData => {
      if (tokenData.expiresAt <= now) {
        stats.expired++;
      } else {
        stats.active++;
      }
      
      // 按用户统计
      if (!stats.byUser[tokenData.username]) {
        stats.byUser[tokenData.username] = 0;
      }
      stats.byUser[tokenData.username]++;
    });
    
    return stats;
  }
  
  async setAutoCleanInterval(days) {
    // 将自动清理间隔保存到配置中
    const config = await this.kv.get('config', { type: 'json' }) || {};
    config.tokenAutoCleanDays = days;
    await this.kv.put('config', JSON.stringify(config));
  }
  
  async getAutoCleanInterval() {
    const config = await this.kv.get('config', { type: 'json' }) || {};
    return config.tokenAutoCleanDays || this.defaultExpirationDays;
  }
  
  // 新增：获取令牌过期时间
  async getTokenExpirationDays() {
    const config = await this.kv.get('config', { type: 'json' }) || {};
    return config.tokenExpirationDays || this.defaultExpirationDays;
  }
  
  // 新增：设置令牌过期时间
  async setTokenExpirationDays(days) {
    const config = await this.kv.get('config', { type: 'json' }) || {};
    config.tokenExpirationDays = days;
    await this.kv.put('config', JSON.stringify(config));
    
    this.defaultExpirationDays = days;
  }
}

// 权限验证中间件
async function authenticate(request, kv, requireAdmin = false, requiredPermission = null) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: '未授权访问', status: 401 };
    }
    
    const token = authHeader.substring(7);
    const tokenManager = new TokenManager(kv);
    const tokenData = await tokenManager.verifyToken(token);
    
    if (!tokenData) {
      return { success: false, error: '令牌无效或已过期', status: 401 };
    }
    
    // 验证用户是否仍然存在且状态正常
    const users = await kv.get('users', { type: 'json' }) || [];
    const user = users.find(u => u.username === tokenData.username && u.approved && !u.frozen);
    
    if (!user) {
      await tokenManager.revokeToken(token);
      return { success: false, error: '用户不存在或已被禁用', status: 401 };
    }
    
    // 检查管理员权限
    if (requireAdmin && !user.isAdmin && !user.isSuperAdmin) {
      return { success: false, error: '需要管理员权限', status: 403 };
    }
    
    // 检查特定权限
    if (requiredPermission && user.permissions) {
      if (!user.permissions[requiredPermission] && !user.isSuperAdmin) {
        return { success: false, error: '权限不足', status: 403 };
      }
    }
    
    return { 
      success: true, 
      user: user,
      tokenData: tokenData
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: '认证失败', status: 500 };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }
    
    // API 路由
    if (path.startsWith('/api/config')) {
      return handleConfigRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/verify-password')) {
      return handleVerifyPassword(request, env.HANGAR);
    } else if (path.startsWith('/api/change-password')) {
      return handleChangePassword(request, env.HANGAR);
    } else if (path.startsWith('/api/feedback')) {
      return handleFeedbackRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/export')) {
      return handleExportRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/reset')) {
      return handleResetRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/status')) {
      return handleStatusRequest(env.HANGAR);
    } else if (path.startsWith('/api/visits')) {
      return handleVisitsRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/users')) {
      return handleUsersRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/register')) {
      return handleRegisterRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/reset-password')) {
      return handleResetPasswordRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/admin-permissions')) {
      return handleAdminPermissionsRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/recover-password')) {
      return handleRecoverPasswordRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/logout')) {
      return handleLogoutRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/tokens')) {
      return handleTokensRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/verify-token')) {
      // 新增：验证令牌状态接口
      return handleVerifyTokenRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/renew-token')) {
      // 新增：续期令牌接口
      return handleRenewTokenRequest(request, env.HANGAR);
    }
    
    // 默认响应
    return new Response('Not Found', { status: 404 });
  },
};

// 新增：处理令牌验证请求
async function handleVerifyTokenRequest(request, kv) {
  if (request.method === 'GET') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ 
          valid: false, 
          reason: 'no_token',
          canRenew: false
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const token = authHeader.substring(7);
      const tokenManager = new TokenManager(kv);
      
      // 使用新的验证方法检查令牌状态
      const tokenStatus = await tokenManager.verifyTokenWithRenewCheck(token);
      
      if (tokenStatus.valid) {
        return new Response(JSON.stringify({
          valid: true,
          expiresSoon: tokenStatus.expiresSoon,
          canRenew: true, // 可以续期
          expiresAt: tokenStatus.tokenData.expiresAt,
          timeUntilExpiry: tokenStatus.timeUntilExpiry
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({
          valid: false,
          reason: tokenStatus.reason,
          canRenew: false
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      console.error('Verify token error:', error);
      return new Response(JSON.stringify({ 
        valid: false, 
        reason: 'error',
        canRenew: false
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 新增：处理令牌续期请求
async function handleRenewTokenRequest(request, kv) {
  if (request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: '未提供有效令牌' 
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const token = authHeader.substring(7);
      const tokenManager = new TokenManager(kv);
      
      // 续期令牌
      const result = await tokenManager.renewToken(token);
      
      if (result.success) {
        return new Response(JSON.stringify({
          success: true,
          tokenData: result.tokenData,
          message: '令牌已成功续期'
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      console.error('Renew token error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '续期失败' 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 初始化默认管理员账户
async function initializeDefaultAdmin(kv) {
  try {
    const users = await kv.get('users', { type: 'json' }) || [];
    
    // 检查是否已存在管理员账户
    const existingAdmin = users.find(u => u.username === 'admin');
    if (!existingAdmin) {
      const defaultAdmin = {
        id: '1',
        username: 'admin',
        password: 'admin',
        email: 'admin@example.com',
        isAdmin: true,
        isSuperAdmin: true,
        approved: true,
        securityQuestion: '你的姓名是什么？',
        securityAnswer: simpleEncrypt('管理员'),
        permissions: {
          basic: true,
          timeControl: true,
          notification: true,
          appearance: true,
          donation: true,
          data: true,
          feedback: true,
          visits: true,
          users: true,
          footer: true,
          viewHangarTimes: true
        },
        createdAt: new Date().toISOString()
      };
      
      users.push(defaultAdmin);
      await kv.put('users', JSON.stringify(users));
      console.log('默认超级管理员账户已创建: admin/admin');
    } else if (!existingAdmin.isSuperAdmin) {
      // 如果已存在admin用户但不是超级管理员，升级为超级管理员
      existingAdmin.isSuperAdmin = true;
      existingAdmin.permissions = {
        basic: true,
        timeControl: true,
        notification: true,
        appearance: true,
        donation: true,
        data: true,
        feedback: true,
        visits: true,
        users: true,
        footer: true,
        viewHangarTimes: true
      };
      await kv.put('users', JSON.stringify(users));
      console.log('已存在的admin账户已升级为超级管理员');
    }
  } catch (error) {
    console.error('初始化默认管理员失败:', error);
  }
}

// 处理令牌管理请求
async function handleTokensRequest(request, kv) {
  const tokenManager = new TokenManager(kv);
  const url = new URL(request.url);
  const path = url.pathname;
  
  try {
    // 新增：处理令牌过期时间设置
    if (request.method === 'POST' && path.endsWith('/expiration')) {
      // 设置令牌过期时间 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'data');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const { expirationDays } = await request.json();
      
      if (expirationDays && expirationDays > 0 && expirationDays <= 365) {
        // 更新令牌过期时间
        await tokenManager.setTokenExpirationDays(expirationDays);
        
        return new Response(JSON.stringify({
          success: true,
          message: `已设置令牌过期时间为 ${expirationDays} 天。新创建的令牌将使用此设置。`
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: '请输入1-365之间的有效天数'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }
    
    if (request.method === 'GET') {
      // 获取令牌统计信息 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'data');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const stats = await tokenManager.getTokenStats();
      const autoCleanInterval = await tokenManager.getAutoCleanInterval();
      const tokenExpirationDays = await tokenManager.getTokenExpirationDays();
      
      return new Response(JSON.stringify({
        stats,
        autoCleanInterval,
        tokenExpirationDays
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else if (request.method === 'DELETE') {
      // 清理令牌 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'data');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const action = url.searchParams.get('action');
      
      if (action === 'clean-expired') {
        // 清理过期令牌
        const cleanedCount = await tokenManager.cleanExpiredTokens();
        return new Response(JSON.stringify({
          success: true,
          message: `已清理 ${cleanedCount} 个过期令牌`,
          cleanedCount
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else if (action === 'clean-all') {
        // 清理所有令牌
        await tokenManager.revokeAllTokens();
        return new Response(JSON.stringify({
          success: true,
          message: '已清理所有令牌'
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: '无效的操作类型'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } else if (request.method === 'POST') {
      // 设置自动清理间隔 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'data');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const { autoCleanDays } = await request.json();
      
      if (autoCleanDays && autoCleanDays > 0) {
        await tokenManager.setAutoCleanInterval(autoCleanDays);
        return new Response(JSON.stringify({
          success: true,
          message: `已设置令牌自动清理间隔为 ${autoCleanDays} 天`
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: '无效的自动清理间隔天数'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }
  } catch (error) {
    console.error('Tokens request error:', error);
    return new Response(JSON.stringify({ success: false, error: '操作失败' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理配置请求
async function handleConfigRequest(request, kv) {
  // 初始化默认管理员
  await initializeDefaultAdmin(kv);
  
  if (request.method === 'GET') {
    try {
      // 获取配置
      const config = await kv.get('config');
      let configObj = config ? JSON.parse(config) : {};
      
      // 确保新字段有默认值
      if (configObj.hangarTimesVisible === undefined) {
        configObj.hangarTimesVisible = true;
      }
      
      // 确保令牌自动清理间隔有默认值
      if (configObj.tokenAutoCleanDays === undefined) {
        configObj.tokenAutoCleanDays = 30;
      }
      
      // 确保令牌过期时间有默认值
      if (configObj.tokenExpirationDays === undefined) {
        configObj.tokenExpirationDays = 30;
      }
      
      return new Response(JSON.stringify(configObj), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: '读取配置失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } else if (request.method === 'POST') {
    try {
      // 验证权限
      const auth = await authenticate(request, kv, true, 'basic');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 更新配置
      const config = await request.json();
      await kv.put('config', JSON.stringify(config));
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 验证密码
async function handleVerifyPassword(request, kv) {
  // 初始化默认管理员
  await initializeDefaultAdmin(kv);
  
  if (request.method === 'POST') {
    try {
      const { username, password } = await request.json();
      const users = await kv.get('users', { type: 'json' }) || [];
      
      // 查找用户
      const user = users.find(u => u.username === username && u.approved && !u.frozen);
      
      if (user && user.password === password) {
        // 生成令牌
        const tokenManager = new TokenManager(kv);
        const token = await tokenManager.generateToken(user);
        
        // 过滤敏感信息
        const { password: _, securityAnswer: __, ...safeUser } = user;
        return new Response(JSON.stringify({
          valid: true,
          isAdmin: user.isAdmin || false,
          isSuperAdmin: user.isSuperAdmin || false,
          permissions: user.permissions || {},
          user: safeUser,
          token: token
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({
          valid: false,
          error: '用户名或密码错误，或账号未审核/已被冻结'
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      console.error('Verify password error:', error);
      return new Response(JSON.stringify({ valid: false, error: '验证失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理登出请求
async function handleLogoutRequest(request, kv) {
  if (request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const tokenManager = new TokenManager(kv);
        await tokenManager.revokeToken(token);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
      return new Response(JSON.stringify({ success: false, error: '登出失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理管理员权限请求
async function handleAdminPermissionsRequest(request, kv) {
  if (request.method === 'GET') {
    try {
      // 验证权限
      const auth = await authenticate(request, kv, true, 'users');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const users = await kv.get('users', { type: 'json' }) || [];
      const permissionsData = users.map(user => ({
        username: user.username,
        isAdmin: user.isAdmin || false,
        isSuperAdmin: user.isSuperAdmin || false,
        permissions: user.permissions || {}
      }));
      
      return new Response(JSON.stringify(permissionsData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Admin permissions error:', error);
      return new Response(JSON.stringify({ error: '获取权限数据失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 修改密码
async function handleChangePassword(request, kv) {
  if (request.method === 'POST') {
    try {
      // 验证权限
      const auth = await authenticate(request, kv);
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const { username, oldPassword, newPassword } = await request.json();
      
      // 检查用户权限
      if (auth.user.username !== username && !auth.user.isAdmin && !auth.user.isSuperAdmin) {
        return new Response(JSON.stringify({ success: false, error: '无权修改其他用户密码' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const users = await kv.get('users', { type: 'json' }) || [];
      const userIndex = users.findIndex(u => u.username === username);
      
      if (userIndex === -1) {
        return new Response(JSON.stringify({ success: false, error: '用户不存在' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 验证原密码（如果是用户自己修改）
      if (auth.user.username === username && users[userIndex].password !== oldPassword) {
        return new Response(JSON.stringify({ success: false, error: '原密码错误' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      if (newPassword && newPassword.length >= 4) {
        users[userIndex].password = newPassword;
        await kv.put('users', JSON.stringify(users));
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({ success: false, error: '密码长度至少4位' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      console.error('Change password error:', error);
      return new Response(JSON.stringify({ success: false, error: '修改密码失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理反馈请求
async function handleFeedbackRequest(request, kv) {
  const url = new URL(request.url);
  const path = url.pathname;
  const id = path.split('/').pop();
  
  try {
    if (request.method === 'GET') {
      // 获取所有反馈 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'feedback');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const feedback = await kv.get('feedback', { type: 'json' }) || [];
      return new Response(JSON.stringify(feedback), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
    } else if (request.method === 'POST') {
      // 提交新反馈 - 公开接口
      const { content, contact, username } = await request.json();
      const feedback = await kv.get('feedback', { type: 'json' }) || [];
      
      const newFeedback = {
        id: Date.now().toString(),
        content,
        contact: contact || '',
        username: username || '匿名用户',
        timestamp: new Date().toISOString()
      };
      
      feedback.push(newFeedback);
      await kv.put('feedback', JSON.stringify(feedback));
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else if (request.method === 'DELETE' && id) {
      // 删除反馈 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'feedback');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const feedback = await kv.get('feedback', { type: 'json' }) || [];
      const updatedFeedback = feedback.filter(item => item.id !== id);
      
      await kv.put('feedback', JSON.stringify(updatedFeedback));
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (error) {
    console.error('Feedback error:', error);
    return new Response(JSON.stringify({ success: false, error: '操作失败' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理访问记录请求
async function handleVisitsRequest(request, kv) {
  const url = new URL(request.url);
  
  try {
    if (request.method === 'GET') {
      // 获取访问统计 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'visits');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      let visits = await kv.get('visits', { type: 'json' }) || [];
      
      // 按IP聚合数据
      const aggregatedVisits = {};
      let totalVisits = 0;
      
      visits.forEach(visit => {
        totalVisits++;
        if (!aggregatedVisits[visit.ip]) {
          aggregatedVisits[visit.ip] = {
            ip: visit.ip,
            firstVisit: visit.timestamp,
            lastVisit: visit.timestamp,
            visitCount: 1
          };
        } else {
          aggregatedVisits[visit.ip].visitCount++;
          if (new Date(visit.timestamp) > new Date(aggregatedVisits[visit.ip].lastVisit)) {
            aggregatedVisits[visit.ip].lastVisit = visit.timestamp;
          }
          if (new Date(visit.timestamp) < new Date(aggregatedVisits[visit.ip].firstVisit)) {
            aggregatedVisits[visit.ip].firstVisit = visit.timestamp;
          }
        }
      });
      
      // 转换为数组
      const visitsArray = Object.values(aggregatedVisits);
      
      return new Response(JSON.stringify({
        visits: visitsArray,
        totalVisits: totalVisits
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else if (request.method === 'POST') {
      // 记录访问 - 公开接口
      const clientIP = request.headers.get('CF-Connecting-IP') || 
                      request.headers.get('X-Forwarded-For') || 
                      'unknown';
      
      let visits = await kv.get('visits', { type: 'json' }) || [];
      
      const visit = {
        id: Date.now().toString(),
        ip: clientIP,
        timestamp: new Date().toISOString(),
        userAgent: request.headers.get('User-Agent') || 'unknown'
      };
      
      visits.push(visit);
      
      // 限制访问记录数量，最多保留1000条
      if (visits.length > 1000) {
        visits = visits.slice(-1000);
      }
      
      await kv.put('visits', JSON.stringify(visits));
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else if (request.method === 'DELETE') {
      // 清除访问记录 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'visits');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      await kv.put('visits', JSON.stringify([]));
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (error) {
    console.error('Visits request error:', error);
    return new Response(JSON.stringify({ success: false, error: '操作失败' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理用户相关请求
async function handleUsersRequest(request, kv) {
  const url = new URL(request.url);
  const path = url.pathname;
  let username = path.split('/').pop();
  
  // 修复中文用户名问题：对URL中的用户名进行解码
  if (username && username !== 'users') {
    try {
      username = decodeURIComponent(username);
    } catch (e) {
      // 如果解码失败，保持原样
      console.log('Username decode error:', e);
    }
  }
  
  try {
    if (request.method === 'GET') {
      // 获取所有用户 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'users');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const users = await kv.get('users', { type: 'json' }) || [];
      // 过滤掉密码等敏感信息
      const safeUsers = users.map(user => {
        const { password, securityAnswer, ...safeUser } = user;
        return safeUser;
      });
      return new Response(JSON.stringify(safeUsers), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else if (request.method === 'POST' && !username) {
      // 创建用户（管理员用）- 需要管理员权限
      const auth = await authenticate(request, kv, true, 'users');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const userData = await request.json();
      const users = await kv.get('users', { type: 'json' }) || [];
      
      if (users.find(u => u.username === userData.username)) {
        return new Response(JSON.stringify({ success: false, error: '用户名已存在' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const newUser = {
        ...userData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      };
      
      users.push(newUser);
      await kv.put('users', JSON.stringify(users));
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else if (request.method === 'PUT' && username) {
      // 更新用户信息 - 需要管理员权限或用户自己更新基本信息
      const auth = await authenticate(request, kv);
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 检查权限：用户只能更新自己的信息，管理员可以更新任何用户
      if (auth.user.username !== username && !auth.user.isAdmin && !auth.user.isSuperAdmin) {
        return new Response(JSON.stringify({ success: false, error: '无权修改其他用户信息' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      let userData = await request.json();
      const users = await kv.get('users', { type: 'json' }) || [];
      
      const userIndex = users.findIndex(u => u.username === username);
      if (userIndex === -1) {
        return new Response(JSON.stringify({ success: false, error: '用户不存在' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 普通用户只能更新邮箱和密保设置，不能更新权限相关字段
      if (auth.user.username === username && !auth.user.isAdmin && !auth.user.isSuperAdmin) {
        const allowedFields = ['email', 'securityQuestion', 'securityAnswer'];
        const updateData = {};
        allowedFields.forEach(field => {
          if (userData[field] !== undefined) {
            updateData[field] = userData[field];
          }
        });
        userData = updateData;
        
        // 如果普通用户更新了密保答案，进行加密
        if (userData.securityAnswer) {
          userData.securityAnswer = simpleEncrypt(userData.securityAnswer);
        }
      } else {
        // 管理员可以更新所有字段，但要保护超级管理员属性
        if (users[userIndex].isSuperAdmin) {
          userData.isSuperAdmin = true; // 保持超级管理员状态
        }
        
        // 如果管理员更新了密保答案，进行加密
        if (userData.securityAnswer) {
          userData.securityAnswer = simpleEncrypt(userData.securityAnswer);
        }
      }
      
      users[userIndex] = { ...users[userIndex], ...userData };
      await kv.put('users', JSON.stringify(users));
      
      // 如果用户更新了自己的信息，更新令牌中的用户信息
      if (auth.user.username === username) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const tokenManager = new TokenManager(kv);
          const tokenData = await tokenManager.verifyToken(token);
          if (tokenData) {
            const updatedTokenData = {
              ...tokenData,
              username: users[userIndex].username,
              isAdmin: users[userIndex].isAdmin || false,
              isSuperAdmin: users[userIndex].isSuperAdmin || false,
              permissions: users[userIndex].permissions || {}
            };
            
            // 更新令牌数据
            const allTokens = await tokenManager.getAllTokens();
            allTokens[token] = updatedTokenData;
            await kv.put(tokenManager.tokensKey, JSON.stringify(allTokens));
          }
        }
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else if (request.method === 'DELETE' && username) {
      // 删除用户 - 需要管理员权限
      const auth = await authenticate(request, kv, true, 'users');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const users = await kv.get('users', { type: 'json' }) || [];
      const userToDelete = users.find(u => u.username === username);
      
      // 防止删除超级管理员
      if (userToDelete && userToDelete.isSuperAdmin) {
        return new Response(JSON.stringify({ success: false, error: '不能删除超级管理员' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 防止删除自己
      if (userToDelete && userToDelete.username === auth.user.username) {
        return new Response(JSON.stringify({ success: false, error: '不能删除自己' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const updatedUsers = users.filter(u => u.username !== username);
      await kv.put('users', JSON.stringify(updatedUsers));
      
      // 删除该用户的所有令牌
      const tokenManager = new TokenManager(kv);
      await tokenManager.revokeUserTokens(username);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (error) {
    console.error('Users request error:', error);
    return new Response(JSON.stringify({ success: false, error: '操作失败' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理用户注册请求
async function handleRegisterRequest(request, kv) {
  if (request.method === 'POST') {
    try {
      const { username, password, email, securityQuestion, securityAnswer } = await request.json();
      const users = await kv.get('users', { type: 'json' }) || [];
      
      // 检查用户名是否已存在
      if (users.find(u => u.username === username)) {
        return new Response(JSON.stringify({ success: false, error: '用户名已存在' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 检查邮箱是否已存在
      if (users.find(u => u.email === email)) {
        return new Response(JSON.stringify({ success: false, error: '邮箱已存在' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 验证密保问题和答案
      if (!securityQuestion || !securityAnswer) {
        return new Response(JSON.stringify({ success: false, error: '请选择密保问题并填写答案' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 创建新用户（默认未审核，非管理员，普通用户）
      const newUser = {
        id: Date.now().toString(),
        username,
        password,
        email,
        isAdmin: false,
        isSuperAdmin: false,
        approved: false, // 需要管理员审核
        frozen: false,
        securityQuestion,
        securityAnswer: simpleEncrypt(securityAnswer), // 加密存储密保答案
        permissions: {
          viewHangarTimes: true  // 默认开启机库开启时间预测显示权限
        }, 
        createdAt: new Date().toISOString()
      };
      
      users.push(newUser);
      await kv.put('users', JSON.stringify(users));
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      return new Response(JSON.stringify({ success: false, error: '注册失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理重置密码请求（通过邮箱）
async function handleResetPasswordRequest(request, kv) {
  if (request.method === 'POST') {
    try {
      const { username, email, newPassword } = await request.json();
      const users = await kv.get('users', { type: 'json' }) || [];
      
      const userIndex = users.findIndex(u => u.username === username && u.email === email);
      
      if (userIndex === -1) {
        return new Response(JSON.stringify({ success: false, error: '用户名或邮箱错误' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      if (newPassword && newPassword.length >= 4) {
        users[userIndex].password = newPassword;
        await kv.put('users', JSON.stringify(users));
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({ success: false, error: '密码长度至少4位' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      console.error('Reset password error:', error);
      return new Response(JSON.stringify({ success: false, error: '重置密码失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理找回密码请求（通过密保问题）
async function handleRecoverPasswordRequest(request, kv) {
  if (request.method === 'POST') {
    try {
      const { username, email, securityQuestion, securityAnswer } = await request.json();
      const users = await kv.get('users', { type: 'json' }) || [];
      
      const user = users.find(u => u.username === username && u.email === email);
      
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: '用户不存在或邮箱错误' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 验证密保问题和答案
      if (user.securityQuestion !== securityQuestion || 
          simpleDecrypt(user.securityAnswer) !== securityAnswer) {
        return new Response(JSON.stringify({ success: false, error: '密保问题或答案错误' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 返回用户密码
      return new Response(JSON.stringify({ 
        success: true, 
        password: user.password 
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Recover password error:', error);
      return new Response(JSON.stringify({ success: false, error: '找回密码失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理导出请求
async function handleExportRequest(request, kv) {
  try {
    // 验证权限
    const auth = await authenticate(request, kv, true, 'data');
    if (!auth.success) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    const config = await kv.get('config', { type: 'json' }) || {};
    const feedback = await kv.get('feedback', { type: 'json' }) || [];
    const visits = await kv.get('visits', { type: 'json' }) || [];
    const users = await kv.get('users', { type: 'json' }) || [];
    
    // 过滤用户的敏感信息
    const safeUsers = users.map(user => {
      const { password, securityAnswer, ...safeUser } = user;
      return safeUser;
    });
       // 获取令牌统计信息
       const tokenManager = new TokenManager(kv);
       const tokenStats = await tokenManager.getTokenStats();
       const tokenExpirationDays = await tokenManager.getTokenExpirationDays();
       
       const exportData = {
         config: config ? JSON.parse(config) : {},
         feedback,
         visits,
         users: safeUsers,
         tokenStats,
         tokenExpirationDays,
         exportedAt: new Date().toISOString()
       };
       
       return new Response(JSON.stringify(exportData), {
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*',
         },
       });   
    const data = {
      config,
      feedback,
      visits,
      users: safeUsers,
      exportTime: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return new Response(JSON.stringify({ success: false, error: '导出失败' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理重置请求
async function handleResetRequest(request, kv) {
  if (request.method === 'POST') {
    try {
      // 验证权限
      const auth = await authenticate(request, kv, true, 'data');
      if (!auth.success) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      await kv.delete('config');
      await kv.delete('feedback');
      await kv.delete('visits');
      await kv.delete('users');
      
      // 清空所有令牌
      const tokenManager = new TokenManager(kv);
      await tokenManager.revokeAllTokens();
      
      console.log('All data has been reset');
      
      // 重新初始化默认管理员
      await initializeDefaultAdmin(kv);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Reset error:', error);
      return new Response(JSON.stringify({ success: false, error: '重置失败' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理状态请求
async function handleStatusRequest(kv) {
  try {
    // 初始化默认管理员
    await initializeDefaultAdmin(kv);
    
    // 尝试读取KV来检查状态
    await kv.get('config');
    
    // 自动清理过期令牌（每次状态检查时有10%的概率执行清理）
    if (Math.random() < 0.1) {
      const tokenManager = new TokenManager(kv);
      const cleanedCount = await tokenManager.cleanExpiredTokens();
      if (cleanedCount > 0) {
        console.log(`自动清理了 ${cleanedCount} 个过期令牌`);
      }
    }
    
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Status check error:', error);
    return new Response(JSON.stringify({ status: 'error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
