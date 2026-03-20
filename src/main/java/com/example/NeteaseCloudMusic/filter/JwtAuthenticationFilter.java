package com.example.NeteaseCloudMusic.filter;

import com.example.NeteaseCloudMusic.service.UserSessionService;
import com.example.NeteaseCloudMusic.util.JwtTokenProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String token = null;
        String header = request.getHeader("Authorization");

        // 1. 打印请求路径和 Header，确认请求是否到达 Filter
        System.out.println("🔍 [Filter] 收到请求: " + request.getMethod() + " " + request.getRequestURI());

        if (header != null && header.startsWith("Bearer ")) {
            token = header.substring(7);
        }

        if (token == null) {
            token = request.getParameter("token");
        }

        if (token != null) {
            // 2. 打印 Token 状态
            System.out.println("🔍 [Filter] 发现 Token，正在验证...");
            if (tokenProvider.validateToken(token)) {
                try {
                    String phone = tokenProvider.getPhoneFromToken(token);
                    System.out.println("✅ [Filter] Token 验证通过，用户: " + phone);

                    // ... (保持原有的认证设置代码)
                    request.setAttribute(UserSessionService.AUTH_PHONE_KEY, phone);
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                            phone, null, Collections.emptyList()
                    );
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authentication);

                } catch (Exception e) {
                    System.err.println("❌ [Filter] 设置认证信息失败: " + e.getMessage());
                }
            } else {
                System.err.println("❌ [Filter] Token 验证失败 (validateToken 返回 false)");
            }
        } else {
            System.out.println("⚠️ [Filter] 请求未携带 Token");
        }

        filterChain.doFilter(request, response);
    }
}