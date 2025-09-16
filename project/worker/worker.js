// index.js - Cloudflare Worker
const DEFAULT_PASSWORD = 'admin';

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
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    
    // API 路由
    if (path.startsWith('/api/config')) {
      return handleConfigRequest(request, env.HANGAR_TIMER);
    } else if (path.startsWith('/api/verify-password')) {
      return handleVerifyPassword(request, env.HANGAR_TIMER);
    } else if (path.startsWith('/api/change-password')) {
      return handleChangePassword(request, env.HANGAR_TIMER);
    } else if (path.startsWith('/api/feedback')) {
      return handleFeedbackRequest(request, env.HANGAR_TIMER);
    } else if (path.startsWith('/api/export')) {
      return handleExportRequest(request, env.HANGAR_TIMER);
    else if (path.startsWith('/api/reset')) {
      return handleResetRequest(request, env.HANGAR_TIMER);
    } else if (path.startsWith('/api/status')) {
      return handleStatusRequest(env.HANGAR_TIMER);
    } else if (path.startsWith('/api/upload')) {
      return handleUploadRequest(request, env.HANGAR_TIMER);
    }
    
    // 默认响应
    return new Response('Not Found', { status: 404 });
  },
};

// 处理配置请求
async function handleConfigRequest(request, kv) {
  if (request.method === 'GET') {
    // 获取配置
    const config = await kv.get('config');
    return new Response(config || '{}', {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } else if (request.method === 'POST') {
    // 更新配置
    const config = await request.json();
    await kv.put('config', JSON.stringify(config));
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 验证密码
async function handleVerifyPassword(request, kv) {
  if (request.method === 'POST') {
    const { password } = await request.json();
    const storedPassword = await kv.get('admin_password');
    
    // 如果没有设置密码，使用默认密码
    const validPassword = storedPassword || DEFAULT_PASSWORD;
    
    return new Response(JSON.stringify({
      valid: password === validPassword
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 修改密码
async function handleChangePassword(request, kv) {
  if (request.method === 'POST') {
    const { password } = await request.json();
    
    if (password && password.length >= 4) {
      await kv.put('admin_password', password);
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
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理反馈请求
async function handleFeedbackRequest(request, kv) {
  const url = new URL(request.url);
  const path = url.pathname;
  const id = path.split('/').pop();
  
  if (request.method === 'GET') {
    // 获取所有反馈
    const feedback = await kv.get('feedback', 'json') || [];
    return new Response(JSON.stringify(feedback), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } else if (request.method === 'POST') {
    // 提交新反馈
    const { content } = await request.json();
    const feedback = await kv.get('feedback', 'json') || [];
    
    const newFeedback = {
      id: Date.now().toString(),
      content,
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
    // 删除反馈
    const feedback = await kv.get('feedback', 'json') || [];
    const updatedFeedback = feedback.filter(item => item.id !== id);
    
    await kv.put('feedback', JSON.stringify(updatedFeedback));
    
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理导出请求
async function handleExportRequest(request, kv) {
  if (request.method === 'GET') {
    const config = await kv.get('config', 'json') || {};
    const feedback = await kv.get('feedback', 'json') || [];
    const adminPassword = await kv.get('admin_password') || DEFAULT_PASSWORD;
    
    const exportData = {
      config,
      feedback,
      adminPassword,
      exportedAt: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(exportData), {
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
    await kv.delete('config');
    await kv.delete('feedback');
    await kv.delete('admin_password');
    
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  return new Response('Method Not Allowed', { status: 405 });
}

// 处理状态请求
async function handleStatusRequest(kv) {
  try {
    // 尝试读取KV来检查状态
    await kv.get('config');
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ status: 'error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// 处理上传请求
async function handleUploadRequest(request, kv) {
  if (request.method === 'POST') {
    try {
      const formData = await request.formData();
      const file = formData.get('file');
      
      if (!file) {
        return new Response(JSON.stringify({ success: false, error: '没有文件上传' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      
      // 这里只是示例，实际应用中应该将文件保存到云存储
      // 并返回文件的URL
      const fileName = `upload_${Date.now()}_${file.name}`;
      
      // 模拟上传成功，返回一个假URL
      const fileUrl = `https://example.com/uploads/${fileName}`;
      
      return new Response(JSON.stringify({ 
        success: true, 
        url: fileUrl 
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
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