package com.example.NeteaseCloudMusic.service;

import org.springframework.stereotype.Service;
import jakarta.servlet.http.HttpServletRequest; // 引入 Servlet API
import jakarta.servlet.http.HttpSession; // 引入 HttpSession

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class UserSessionService {

    // 统一使用一个常量作为 Session Key
    private static final String SESSION_KEY_PHONE = "LOGGED_IN_PHONE";

    private static final Logger logger = LoggerFactory.getLogger(UserSessionService.class); // ✅ 关键新增

    // ✅ 关键新增：定义 JWT Filter 存储用户手机号的 Request Attribute Key
    public static final String AUTH_PHONE_KEY = "AuthenticatedUserPhone";

    /**
     * 设置当前登录用户的手机号 (使用 HttpSession)
     * @param phone 用户的手机号 (主码)
     * @param request 当前的 HTTP 请求
     */
    // ⚠️ 传入 HttpServletRequest
//    public void setLoggedInUserPhone(String phone, HttpServletRequest request) {
//        // 获取或创建一个新的 HTTP Session
//        HttpSession session = request.getSession(true);
//        session.setAttribute(SESSION_KEY_PHONE, phone);
//        System.out.println("✅ 用户会话已设置。当前登录手机号: " + phone + " Session ID: " + session.getId());
//    }

    /**
     * 获取当前登录用户的手机号 (从 JWT Filter 设置的 Request Attribute 获取)
     *
     * @return 用户的手机号
     * @throws RuntimeException 如果用户未登录或 Token 验证失败
     */
    public String getCurrentUserPhone(HttpServletRequest request) {
        // ✅ 核心：从 Request Attributes 中获取 JWT Filter 验证后设置的 phone
        String phone = (String) request.getAttribute(AUTH_PHONE_KEY);

        if (phone != null) {
            return phone;
        }

        // Token 验证失败或未携带
        throw new RuntimeException("用户未登录或 Token 无效");
    }

    /**
     * 清除用户登录状态 (在本地登出时调用)
     * @param request 当前的 HTTP 请求
     */
    // ⚠️ 传入 HttpServletRequest
//    public void clearLoggedInUser(HttpServletRequest request) {
//        HttpSession session = request.getSession(false);
//        if (session != null) {
//            // 使整个 Session 失效，彻底清除服务器端状态
//            session.invalidate();
//            System.out.println("❌ 用户会话已清除。");
//        }
//    }
//}
}