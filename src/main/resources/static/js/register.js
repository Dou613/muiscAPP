// register.js
document.getElementById('registerBtn').addEventListener('click', async () => {
    const phone = document.getElementById('phone').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const messageElement = document.getElementById('message');

    if (!phone || !username || !password || !confirmPassword) {
        messageElement.textContent = '所有字段都是必填项。';
        messageElement.style.color = '#F56C6C';
        return;
    }

    if (password !== confirmPassword) {
        messageElement.textContent = '两次输入的密码不一致。';
        messageElement.style.color = '#F56C6C';
        return;
    }

    messageElement.textContent = '注册中...';
    messageElement.style.color = '#FF4500';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phone, password, username })
        });

        const data = await response.json();

        if (response.ok) {
            messageElement.textContent = '注册成功！正在跳转登录页面...';
            messageElement.style.color = '#4CAF50';
            setTimeout(() => {
                window.location.href = 'auth.html';
            }, 1500);
        } else {
            messageElement.textContent = data.message || '注册失败，手机号可能已被注册。';
            messageElement.style.color = '#F56C6C';
        }
    } catch (error) {
        console.error('Registration Error:', error);
        messageElement.textContent = '账号已注册，请重新输入。';
        messageElement.style.color = '#F56C6C';
    }
});