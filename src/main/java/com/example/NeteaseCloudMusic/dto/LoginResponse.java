package com.example.NeteaseCloudMusic.dto;

import com.example.NeteaseCloudMusic.vo.UserVO;
import lombok.Data;
import lombok.NoArgsConstructor; // 可选，但推荐

@Data
@NoArgsConstructor // 推荐添加无参构造函数
public class LoginResponse {

    private UserVO user;
    private String token;

    public LoginResponse(UserVO user, String token) {
        this.user = user;
        this.token = token;
    }
}
