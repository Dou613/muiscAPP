package com.example.NeteaseCloudMusic.dto;

import lombok.Data;

@Data
public class LoginRequest {
    private String phone;
    private String password;
}