package com.example.NeteaseCloudMusic;

import com.fasterxml.jackson.databind.DeserializationFeature; // 新增
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary; // 新增

@SpringBootApplication
@EnableFeignClients
public class NeteaseCloudMusicApplication {

//    @Bean
//    @Primary // 标记为首选 Bean，确保 Spring AI 优先使用此配置
//    public ObjectMapper objectMapper() {
//        ObjectMapper objectMapper = new ObjectMapper();
//        // 核心配置：遇到未知属性时不报错
//        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
//        return objectMapper;
//    }

    public static void main(String[] args) {
        SpringApplication.run(NeteaseCloudMusicApplication.class, args);
    }
}