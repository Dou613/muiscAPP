package com.example.NeteaseCloudMusic.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private static final Logger logger = LoggerFactory.getLogger(WebConfig.class); // 用于诊断日志

    // 1. 注入 application.yml 中配置的绝对路径
    // 示例路径：C:/music-cloud-uploads/ 或 /opt/app/uploads/
    @Value("${app.upload-dir}")
    private String uploadDir;

    /**
     * 提供公共方法给 UserController 获取存储路径
     */
    public String getUploadDir() {
        return uploadDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {

        // 诊断：打印注入的路径
        logger.info(">>> WebConfig: Loaded Upload Directory: {}", uploadDir);

        // 2. 确保配置的绝对目录存在，如果不存在则创建
        File dir = new File(uploadDir);
        if (!dir.exists()) {
            boolean created = dir.mkdirs();
            logger.warn(">>> WebConfig: Upload Directory {} was MISSING. Created status: {}", uploadDir, created);
        }

        // 3. 映射资源处理器：将 URL 请求 /uploads/** 映射到注入的绝对路径
        // 关键修复点：在 uploadDir 后面添加 "/"
        String finalUploadPath = "file:" + uploadDir + "/";

        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(finalUploadPath);

        logger.info(">>> WebConfig: Registered Resource Handler: /uploads/** -> {}", finalUploadPath);
    }
}