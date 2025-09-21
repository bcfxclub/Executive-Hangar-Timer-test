const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// 数据库初始化
const db = new sqlite3.Database(':memory:');

// 初始化数据库表
db.serialize(() => {
    // 配置表
    db.run(`CREATE TABLE config (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
    
    // 反馈表
    db.run(`CREATE TABLE feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        contact TEXT,
        userId INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // 访问记录表
    db.run(`CREATE TABLE visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        userAgent TEXT,
        userId INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // 用户表
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'pending',
        registerDate DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // 默认配置
    const defaultConfig = {
        startTime: new Date().toISOString(),
        initialPhase: '5-green',
        timerEnabled: true,
        notification: '欢迎使用星际公民行政机库计时系统',
        notificationLink: '',
        notificationColor: '#ffffff',
        customTitle: '星际公民行政机库计时系统',
        headerTextColor: '#ffffff',
        headerFontSize: 1.8,
        logoUrl: '',
        logoSize: 120,
        qrcodeUrl: '',
        qrcodeCaption: '扫描二维码加入我们',
        qrcodeCaptionColor: '#ffffff',
        inviteCode: '',
        inviteLink: '',
        bgType: 'image',
        bgImage: '',
        videoUrl: '',
        bgOpacity: 80,
        windowTextColor: '#2d3748',
        windowCommentColor: '#718096',
        windowTitleColor: '#2c3e50',
        calibrationTextColor: '#718096',
        countdownTextColor: '#2c3e50',
        hangarTimeTextColor: '#2d3748',
        statusTextColor: '#2d3748',
        calibrationTime: new Date().toLocaleString(),
        apiUrl: 'https://time.bcfx.dpdns.org/api',
        donationEnabled: false,
        wechatQrcodeUrl: '',
        alipayQrcodeUrl: '',
        donationBtnColor: '#ff6b6b',
        footerNotice: '欢迎使用行政机库计时系统',
        footerNoticeLink: '',
        recordInfo: 'UEE ICP备0000001号',
        organizationName: '罗伯茨航空航天管理局',
        projectDescription: '星际公民行政机库计时系统是一个用于管理机库开启时间的专业工具，提供精确的计时功能和状态指示。',
        version: '当前版本：v2.1.4\n更新日期：2025-09-21\n更新内容：\n在上一版基础上，做出如下修改：\n1、后台管理可以查看访问人数，显示IP地址，在单独页面进行展示。\n2、反馈联系方式，只需要一个输入框。\n3、网页背景模式切换为第一优先级。',
        about: '星际公民行政机库计时系统由航空航天管理局开发，旨在提供高效的机库时间管理解决方案。如有问题请联系：bcfx@vip.qq.com'
    };
    
    const stmt = db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(defaultConfig)) {
        stmt.run(key, typeof value === 'object' ? JSON.stringify(value) : value);
    }
    stmt.finalize();
    
    // 创建默认管理员账户
    const adminPassword = bcrypt.hashSync('admin', 10);
    db.run("INSERT OR IGNORE INTO users (username, password, email, role, status) VALUES (?, ?, ?, ?, ?)", 
        ['admin', adminPassword, 'admin@example.com', 'admin', 'approved']);
});

// 获取配置
app.get('/api/config', (req, res) => {
    db.all("SELECT key, value FROM config", (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const config = {};
        rows.forEach(row => {
            try {
                config[row.key] = JSON.parse(row.value);
            } catch (e) {
                config[row.key] = row.value;
            }
        });
        
        res.json(config);
    });
});

// 保存配置
app.post('/api/config', (req, res) => {
    const config = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)");
    
    for (const [key, value] of Object.entries(config)) {
        stmt.run(key, typeof value === 'object' ? JSON.stringify(value) : value);
    }
    
    stmt.finalize((err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// 记录访问
app.post('/api/record-visit', (req, res) => {
    const { userAgent, userId } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    db.run("INSERT INTO visits (ip, userAgent, userId) VALUES (?, ?, ?)", 
        [ip, userAgent, userId], 
        function(err) {
            if (err) {
                console.error('Error recording visit:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        });
});

// 获取访问统计
app.get('/api/visits', (req, res) => {
    db.all("SELECT * FROM visits ORDER BY timestamp DESC", (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 清除访问记录
app.delete('/api/visits', (req, res) => {
    db.run("DELETE FROM visits", (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// 用户注册
app.post('/api/register', (req, res) => {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
        return res.status(400).json({ success: false, message: '请填写所有必填字段' });
    }
    
    // 检查用户名是否已存在
    db.get("SELECT id FROM users WHERE username = ?", [username], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        if (row) {
            return res.status(400).json({ success: false, message: '用户名已存在' });
        }
        
        // 检查邮箱是否已存在
        db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
            if (err) {
                return res.status(500).json({ success: false, message: '服务器错误' });
            }
            
            if (row) {
                return res.status(400).json({ success: false, message: '邮箱已被注册' });
            }
            
            // 创建用户
            const hashedPassword = bcrypt.hashSync(password, 10);
            db.run("INSERT INTO users (username, password, email, status) VALUES (?, ?, ?, ?)", 
                [username, hashedPassword, email, 'pending'], 
                function(err) {
                    if (err) {
                        return res.status(500).json({ success: false, message: '注册失败' });
                    }
                    res.json({ success: true, message: '注册成功，请等待管理员审核' });
                });
        });
    });
});

// 用户登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: '请填写用户名和密码' });
    }
    
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        if (!user) {
            return res.status(400).json({ success: false, message: '用户不存在' });
        }
        
        if (user.status !== 'approved') {
            return res.status(400).json({ success: false, message: '账户未通过审核' });
        }
        
        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ success: false, message: '密码错误' });
        }
        
        // 移除密码字段
        const { password: _, ...userWithoutPassword } = user;
        res.json({ success: true, user: userWithoutPassword });
    });
});

// 忘记密码
app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: '请输入邮箱地址' });
    }
    
    db.get("SELECT id FROM users WHERE email = ?", [email], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        if (!user) {
            return res.status(400).json({ success: false, message: '邮箱未注册' });
        }
        
        // 在实际应用中，这里应该发送密码重置邮件
        // 这里仅返回成功消息
        res.json({ success: true, message: '密码重置链接已发送到您的邮箱' });
    });
});

// 获取用户列表
app.get('/api/users', (req, res) => {
    db.all("SELECT id, username, email, role, status, registerDate FROM users ORDER BY registerDate DESC", (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 更新用户信息
app.put('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const { password, email } = req.body;
    
    let query = "UPDATE users SET ";
    let params = [];
    
    if (password) {
        query += "password = ?";
        params.push(bcrypt.hashSync(password, 10));
    }
    
    if (email) {
        if (params.length > 0) query += ", ";
        query += "email = ?";
        params.push(email);
    }
    
    query += " WHERE id = ?";
    params.push(id);
    
    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: '更新失败' });
        }
        res.json({ success: true, message: '更新成功' });
    });
});

// 审核用户
app.post('/api/users/:id/approve', (req, res) => {
    const { id } = req.params;
    
    db.run("UPDATE users SET status = 'approved' WHERE id = ?", [id], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: '操作失败' });
        }
        res.json({ success: true, message: '用户已通过审核' });
    });
});

app.post('/api/users/:id/reject', (req, res) => {
    const { id } = req.params;
    
    db.run("UPDATE users SET status = 'rejected' WHERE id = ?", [id], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: '操作失败' });
        }
        res.json({ success: true, message: '用户已拒绝' });
    });
});

// 删除用户
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    
    db.run("DELETE FROM users WHERE id = ?", [id], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: '删除失败' });
        }
        res.json({ success: true, message: '用户已删除' });
    });
});

// 提交反馈
app.post('/api/feedback', (req, res) => {
    const { content, contact, userId } = req.body;
    
    if (!content) {
        return res.status(400).json({ success: false, message: '反馈内容不能为空' });
    }
    
    db.run("INSERT INTO feedback (content, contact, userId) VALUES (?, ?, ?)", 
        [content, contact, userId], 
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: '提交失败' });
            }
            res.json({ success: true, message: '反馈提交成功' });
        });
});

// 获取反馈列表
app.get('/api/feedback', (req, res) => {
    db.all("SELECT * FROM feedback ORDER BY timestamp DESC", (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 删除反馈
app.delete('/api/feedback/:id', (req, res) => {
    const { id } = req.params;
    
    db.run("DELETE FROM feedback WHERE id = ?", [id], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: '删除失败' });
        }
        res.json({ success: true, message: '反馈已删除' });
    });
});

// 导出数据
app.get('/api/export', (req, res) => {
    const data = {};
    
    db.all("SELECT * FROM config", (err, configRows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        data.config = configRows.reduce((obj, row) => {
            try {
                obj[row.key] = JSON.parse(row.value);
            } catch (e) {
                obj[row.key] = row.value;
            }
            return obj;
        }, {});
        
        db.all("SELECT * FROM feedback", (err, feedbackRows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            data.feedback = feedbackRows;
            
            db.all("SELECT id, username, email, role, status, registerDate FROM users", (err, userRows) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                data.users = userRows;
                
                db.all("SELECT * FROM visits", (err, visitRows) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    data.visits = visitRows;
                    res.json(data);
                });
            });
        });
    });
});

// 重置数据
app.post('/api/reset', (req, res) => {
    db.serialize(() => {
        db.run("DELETE FROM config");
        db.run("DELETE FROM feedback");
        db.run("DELETE FROM visits");
        db.run("DELETE FROM users");
        
        // 重新插入默认配置
        const defaultConfig = {
            startTime: new Date().toISOString(),
            initialPhase: '5-green',
            timerEnabled: true,
            notification: '欢迎使用星际公民行政机库计时系统',
            notificationLink: '',
            notificationColor: '#ffffff',
            customTitle: '星际公民行政机库计时系统',
            headerTextColor: '#ffffff',
            headerFontSize: 1.8,
            logoUrl: '',
            logoSize: 120,
            qrcodeUrl: '',
            qrcodeCaption: '扫描二维码加入我们',
            qrcodeCaptionColor: '#ffffff',
            inviteCode: '',
            inviteLink: '',
            bgType: 'image',
            bgImage: '',
            videoUrl: '',
            bgOpacity: 80,
            windowTextColor: '#2d3748',
            windowCommentColor: '#718096',
            windowTitleColor: '#2c3e50',
            calibrationTextColor: '#718096',
            countdownTextColor: '#2c3e50',
            hangarTimeTextColor: '#2d3748',
            statusTextColor: '#2d3748',
            calibrationTime: new Date().toLocaleString(),
            apiUrl: 'https://time.bcfx.dpdns.org/api',
            donationEnabled: false,
            wechatQrcodeUrl: '',
            alipayQrcodeUrl: '',
            donationBtnColor: '#ff6b6b',
            footerNotice: '欢迎使用行政机库计时系统',
            footerNoticeLink: '',
            recordInfo: 'UEE ICP备0000001号',
            organizationName: '罗伯茨航空航天管理局',
            projectDescription: '星际公民行政机库计时系统是一个用于管理机库开启时间的专业工具，提供精确的计时功能和状态指示。',
            version: '当前版本：v2.1.4\n更新日期：2025-09-21\n更新内容：\n在上一版基础上，做出如下修改：\n1、后台管理可以查看访问人数，显示IP地址，在单独页面进行展示。\n2、反馈联系方式，只需要一个输入框。\n3、网页背景模式切换为第一优先级。',
            about: '星际公民行政机库计时系统由航空航天管理局开发，旨在提供高效的机库时间管理解决方案。如有问题请联系：bcfx@vip.qq.com'
        };
        
        const stmt = db.prepare("INSERT INTO config (key, value) VALUES (?, ?)");
        for (const [key, value] of Object.entries(defaultConfig)) {
            stmt.run(key, typeof value === 'object' ? JSON.stringify(value) : value);
        }
        stmt.finalize();
        
        // 创建默认管理员账户
        const adminPassword = bcrypt.hashSync('admin', 10);
        db.run("INSERT INTO users (username, password, email, role, status) VALUES (?, ?, ?, ?, ?)", 
            ['admin', adminPassword, 'admin@example.com', 'admin', 'approved']);
            
        res.json({ success: true, message: '数据已重置' });
    });
});

// 修改密码
app.post('/api/change-password', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ success: false, message: '新密码不能为空' });
    }
    
    // 在实际应用中，这里应该验证当前用户身份
    // 这里直接修改管理员密码
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run("UPDATE users SET password = ? WHERE username = 'admin'", [hashedPassword], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: '密码修改失败' });
        }
        res.json({ success: true, message: '密码已修改' });
    });
});

// 获取系统状态
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});

module.exports = app;