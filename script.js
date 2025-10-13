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
    
    return {
      token: token,
      expiresAt: tokenData.expiresAt
    };
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
  
  async refreshToken(oldToken) {
    const allTokens = await this.getAllTokens();
    const oldTokenData = allTokens[oldToken];
    
    if (!oldTokenData) {
      return null;
    }
    
    // 删除旧令牌
    delete allTokens[oldToken];
    
    // 生成新令牌
    const config = await this.kv.get('config', { type: 'json' }) || {};
    const expirationDays = config.tokenExpirationDays || this.defaultExpirationDays;
    
    const newToken = 'token_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
    const newTokenData = {
      ...oldTokenData,
      token: newToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + (expirationDays * 24 * 60 * 60 * 1000)
    };
    
    // 添加新令牌
    allTokens[newToken] = newTokenData;
    
    // 保存回KV
    await this.kv.put(this.tokensKey, JSON.stringify(allTokens));
    
    return {
      token: newToken,
      expiresAt: newTokenData.expiresAt
    };
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
    } else if (path.startsWith('/api/refresh-token')) {
      return handleRefreshTokenRequest(request, env.HANGAR);
    } else if (path.startsWith('/api/verify-token')) {
      return handleVerifyTokenRequest(request, env.HANGAR);
    }
    
    // 默认响应
    return new Response('Not Found', { status: 404 });
  },
};

// 新增：处理令牌续期请求
async function handleRefreshTokenRequest(request, kv) {
  if (request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ success: false, error: '未授权访问' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const oldToken = authHeader.substring(7);
      const tokenManager = new TokenManager(kv);
      
      // 验证旧令牌
      const oldTokenData = await tokenManager.verifyToken(oldToken);
      if (!oldTokenData) {
        return new Response(JSON.stringify({ success: false, error: '令牌无效或已过期' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 续期令牌
      const newTokenInfo = await tokenManager.refreshToken(oldToken);
      if (!newTokenInfo) {
        return new Response(JSON.stringify({ success: false, error: '令牌续期失败' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        token: newTokenInfo.token,
        expiresAt: newTokenInfo.expiresAt
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      return new Response(JSON.stringify({ success: false, error: '令牌续期失败' }), {
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

// 新增：处理令牌验证请求
async function handleVerifyTokenRequest(request, kv) {
  if (request.method === 'GET') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ valid: false }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      const token = authHeader.substring(7);
      const tokenManager = new TokenManager(kv);
      const tokenData = await tokenManager.verifyToken(token);
      
      if (tokenData) {
        return new Response(JSON.stringify({ 
          valid: true,
          expiresAt: tokenData.expiresAt
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({ valid: false }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      console.error('Verify token error:', error);
      return new Response(JSON.stringify({ valid: false }), {
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
        const tokenInfo = await tokenManager.generateToken(user);
        
        // 过滤敏感信息
        const { password: _, securityAnswer: __, ...safeUser } = user;
        return new Response(JSON.stringify({
          valid: true,
          isAdmin: user.isAdmin || false,
          isSuperAdmin: user.isSuperAdmin || false,
          permissions: user.permissions || {},
          user: safeUser,
          token: tokenInfo.token,
          expiresAt: tokenInfo.expiresAt
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

// ... 其余代码保持不变 ...
