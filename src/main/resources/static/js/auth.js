// auth.js
document.getElementById('loginBtn').addEventListener('click', async () => {
    const phone = document.getElementById('phone').value.trim(); // 去除首尾空格
    const password = document.getElementById('password').value;
    const messageElement = document.getElementById('message');

    // 简单校验
    if (!phone || !password) {
        messageElement.textContent = '请输入手机号和密码';
        messageElement.style.color = '#F56C6C';
        return;
    }

    messageElement.textContent = '登录中...';
    messageElement.style.color = '#FF4500';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phone, password })
        });

        // 尝试解析 JSON，如果解析失败（比如后端报错500返回HTML），则给个空对象
        let data = {};
        try {
            data = await response.json();
        } catch (e) {
            console.warn("后端返回的不是JSON格式");
        }

        if (response.ok) {
            // --- 登录成功逻辑 ---
            messageElement.textContent = '登录成功，正在跳转...';
            messageElement.style.color = '#4CAF50';

            // 1. 存储用户信息
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('authToken', data.token);

            // 2. 更新登录历史 (用于账号切换)
            let history = JSON.parse(localStorage.getItem('login_history') || '[]');
            // 先移除旧的同名记录，避免重复
            history = history.filter(h => h.phone !== data.user.phone);
            // 添加最新的记录到头部
            history.unshift({
                phone: data.user.phone,
                username: data.user.username,
                avatarUrl: data.user.avatarUrl, // 确保后端返回了 avatarUrl
                token: data.token
            });
            // 限制保留最近 5 个
            if (history.length > 5) history.pop();
            localStorage.setItem('login_history', JSON.stringify(history));

            // 3. 跳转
            window.location.href = 'index.html';

        } else {
            // --- 登录失败逻辑 (关键修改) ---
            messageElement.style.color = '#F56C6C';

            // 情况1: 账号不存在 (通常状态码 404 或 消息包含"用户不存在/账号不存在")
            // 注意：data.message 是后端返回的错误信息字段
            const msg = (data.message || "").toLowerCase();

            if (response.status === 404 || msg.includes('不存在') || msg.includes('not found')) {
                messageElement.textContent = '帐号不存在或手机号错误';
            }
            // 情况2: 密码错误 (通常状态码 401 或 消息包含"密码")
            else if (response.status === 401 || msg.includes('密码') || msg.includes('password')) {
                messageElement.textContent = '密码错误，请重新输入';
            }
            // 情况3: 其他错误 (直接显示后端返回的信息)
            else {
                messageElement.textContent = data.message || `登录失败 (${response.status})`;
            }
        }

    } catch (error) {
        // --- 网络错误逻辑 ---
        console.error('Login Error:', error);
        messageElement.textContent = '网络连接失败，请检查服务器状态。';
        messageElement.style.color = '#F56C6C';
    }
});

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.warn('Logout failed on server side, proceeding with client cleanup:', error);
    }
    localStorage.removeItem('user');
    // localStorage.removeItem('authToken'); // 可选：登出时也可以清除 token
    window.location.href = 'auth.html';
}