package com.example.NeteaseCloudMusic.dto;

import lombok.Data;

@Data
public class UserUpdateRequest {
    // 接收前端传来的更新数据
    private String username;
    private String avatarUrl;
    private String gender;
    private String birthday;
    private String location;
    private String signature;
}