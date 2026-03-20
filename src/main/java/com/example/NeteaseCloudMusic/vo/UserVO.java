package com.example.NeteaseCloudMusic.vo;

import lombok.Data;

@Data
public class UserVO {
    private Long id;
    private String phone;      // 来自 User 表

    private String username;   // 来自 UserProfile 表
    private String avatarUrl;
    private String gender;
    private String birthday;
    private String location;
    private String signature;
}