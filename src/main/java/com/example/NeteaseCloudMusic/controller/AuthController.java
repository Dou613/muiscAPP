package com.example.NeteaseCloudMusic.controller;

import com.example.NeteaseCloudMusic.Entity.User;
import com.example.NeteaseCloudMusic.dto.LoginRequest; // 假设存在
import com.example.NeteaseCloudMusic.dto.LoginResponse;
import com.example.NeteaseCloudMusic.dto.RegisterRequest; // 假设存在
import com.example.NeteaseCloudMusic.service.AuthService;
import com.example.NeteaseCloudMusic.service.UserSessionService;
import com.example.NeteaseCloudMusic.vo.UserVO;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    /**
     * 用户注册接口
     */
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
        try {
            User registeredUser = authService.register(
                    request.getPhone(),
                    request.getPassword(),
                    request.getUsername()
            );
            return ResponseEntity.ok(convertToUserVO(registeredUser));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        }
    }

    /**
     * 用户登录接口 (返回 Token)
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        try {
            // 1. 登录校验 (沿用原有逻辑)
            User loggedInUser = authService.login(
                    request.getPhone(),
                    request.getPassword()
            );

            // 2. ✅ 核心：生成 Token
            String token = authService.generateToken(loggedInUser.getPhone());

            // 3. ⚠️ 移除 Session 设置
            // userSessionService.setLoggedInUserPhone(loggedInUser.getPhone(), servletRequest);

            // 4. 返回 UserVO 和 Token
            return ResponseEntity.ok(new LoginResponse(convertToUserVO(loggedInUser), token));
        } catch (RuntimeException e) {
            // ✅ 核心修改：根据异常消息返回不同的状态码
            String msg = e.getMessage();

            if ("用户不存在".equals(msg)) {
                // 404 Not Found -> 对应前端"账号不存在"
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(new ErrorResponse(msg)); // 建议封装个 ErrorResponse 对象或 Map
            } else if ("密码错误".equals(msg)) {
                // 401 Unauthorized -> 对应前端"密码错误"
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(new ErrorResponse(msg));
            } else {
                // 其他未知错误
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse(msg));
            }
        }
    }

    static class ErrorResponse {
        public String message;
        public ErrorResponse(String message) { this.message = message; }
    }
    /**
     * 用户登出接口 (Token 模式下，登出仅清除客户端 Token，服务器端无需操作)
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        // ⚠️ 移除 Session 清除操作
        // userSessionService.clearLoggedInUser(request);
        return ResponseEntity.ok("登出成功");
    }

    // 辅助方法：将 User 实体转换为 UserVO，隐藏敏感信息
    private UserVO convertToUserVO(User user) {
        return authService.getUserProfileByPhone(user.getPhone());
    }
}