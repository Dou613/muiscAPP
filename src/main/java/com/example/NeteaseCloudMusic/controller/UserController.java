package com.example.NeteaseCloudMusic.controller;

import com.example.NeteaseCloudMusic.config.WebConfig;
import com.example.NeteaseCloudMusic.dto.UserUpdateRequest;
import com.example.NeteaseCloudMusic.service.AuthService;
import com.example.NeteaseCloudMusic.service.UserSessionService; // 用于获取当前用户
import com.example.NeteaseCloudMusic.vo.UserVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/user")
public class UserController {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserSessionService userSessionService; // 此服务用于获取当前登录用户

    @Autowired
    private WebConfig webConfig;

    private static class SimpleMessageResponse {
        public String message;
        public SimpleMessageResponse(String message) { this.message = message; }

        // 需要一个默认构造函数，以防 Jackson 序列化时需要
        public SimpleMessageResponse() {}
    }

    private String getLoggedInUserPhone(HttpServletRequest request) {
        // 调用 UserSessionService 中基于 HttpServletRequest 的方法
        return userSessionService.getCurrentUserPhone(request);
    }

    /**
     * ✅ 获取当前登录用户的个人信息
     * GET /api/user/profile
     */
    @GetMapping("/profile")
    public ResponseEntity<UserVO> getUserProfile(HttpServletRequest request) {
        try {
            // 核心：从安全会话中获取 phone，未登录会抛异常
            String phone = getLoggedInUserPhone(request);

            System.out.println("✅ 尝试加载用户资料，手机号: " + phone);
            // 使用 phone 查找用户资料 (AuthService 中的逻辑已验证是正确的)
            UserVO profile = authService.getUserProfileByPhone(phone);
            return ResponseEntity.ok(profile);
        } catch (RuntimeException e) {
            // 用户未登录或信息不存在（如会话过期），返回 401 Unauthorized
            return ResponseEntity.status(401).body(null);
        }
    }

    /**
     * ✅ 更新用户的个人信息
     * POST /api/user/profile
     */
    @PostMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody UserUpdateRequest request, HttpServletRequest servletRequest) {
        try {
            // 核心：从安全会话中获取 phone，作为更新的授权和定位依据
            String phone = getLoggedInUserPhone(servletRequest);

            authService.updateUserProfile(phone, request);
            return ResponseEntity.ok(new SimpleMessageResponse("个人资料更新成功"));
        } catch (RuntimeException e) {
            // 捕获权限不足（未登录）或更新失败的异常
            return ResponseEntity.status(401).body(new SimpleMessageResponse("更新失败: " + e.getMessage()));
        }
    }

    /**
     * ✅ 新增：头像上传接口，同时更新数据库字段
     * POST /api/user/avatar
     */
    @PostMapping("/avatar")
    public ResponseEntity<?> uploadAvatar(@RequestParam("file") MultipartFile file, HttpServletRequest request) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body("文件不能为空");
        }

        try {
            // 1. 获取当前用户 (通过 JWT Filter 设置的 Request Attribute)
            String phone = userSessionService.getCurrentUserPhone(request);

            // 2. 准备文件名和路径 (使用 UUID 确保唯一性)
            String originalFilename = file.getOriginalFilename();
            // 确保能正确处理没有文件后缀的情况
            String suffix = originalFilename.contains(".") ? originalFilename.substring(originalFilename.lastIndexOf(".")) : "";

            String newFilename = UUID.randomUUID().toString() + suffix;

            // 3. ⚠️ 关键：使用注入的 webConfig.getUploadDir() 获取配置的绝对路径
            File uploadDir = new File(webConfig.getUploadDir());

            // 4. 保存文件到本地磁盘
            File dest = new File(uploadDir, newFilename);
            file.transferTo(dest);

            // 5. 生成 Web 访问 URL (对应 WebConfig 映射的路径 /uploads/**)
            String fileUrl = "/uploads/" + newFilename;

            // 6. 更新数据库中的头像 URL
            UserUpdateRequest updateRequest = new UserUpdateRequest();
            updateRequest.setAvatarUrl(fileUrl);
            authService.updateUserProfile(phone, updateRequest);

            // 7. 返回 URL 给前端
            Map<String, String> response = new HashMap<>();
            response.put("url", fileUrl);
            return ResponseEntity.ok(response);

        } catch (IOException e) {
            System.err.println("❌ 文件保存失败: " + e.getMessage());
            return ResponseEntity.status(500).body("文件保存失败。");
        } catch (RuntimeException e) {
            // 捕获未登录异常 (401) 或其他运行时错误
            return ResponseEntity.status(401).body(e.getMessage());
        }
    }
}