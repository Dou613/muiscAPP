package com.example.NeteaseCloudMusic.controller;

import com.example.NeteaseCloudMusic.service.NeteaseMusicService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@RestController
@RequestMapping("/api/stream")
public class StreamController {

    @Autowired
    private NeteaseMusicService neteaseMusicService;

    /**
     * 音乐流媒体接口：使用 302 重定向到网易云的实际音频 URL (仅支持网易云)
     * GET /api/stream/{songId}
     *
     * 该方法调用 Service 层获取真实 URL，并在 Controller 层设置 302 重定向。
     */
    @GetMapping("/{songId}")
    public void stream(@PathVariable Long songId, HttpServletResponse response) throws IOException {
        String songUrl;
        try {
            // 1. 调用 Service 方法获取真实的音频 URL
            // Service 层返回 URL 字符串或抛出 RuntimeException
            songUrl = neteaseMusicService.getSongAudioUrl(songId);

            // 2. 设置 302 状态码和 Location Header，实现重定向
            // SC_FOUND = 302
            response.setHeader("Location", songUrl);
            response.setStatus(HttpServletResponse.SC_FOUND);

        } catch (RuntimeException e) {
            // 3. 捕获 Service 层抛出的异常（例如：未找到 URL 或 API 调用失败）
            // 返回 404 Not Found 错误
            System.err.println("❌ 流媒体 URL 获取失败: 歌曲ID=" + songId + ", 错误: " + e.getMessage());
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "歌曲流媒体 URL 获取失败: " + e.getMessage());
        }
    }
    /**
     * ✅ 新增：下载接口
     * 代理下载：后端读取远程文件流，设置强制下载头，转发给前端
     * GET /api/stream/download/{songId}
     */
    @GetMapping("/download/{songId}")
    public void download(@PathVariable Long songId,
                         @RequestParam(required = false) String filename,
                         HttpServletResponse response) throws IOException {
        InputStream inputStream = null;
        try {
            // 1. 获取真实 URL
            String songUrl = neteaseMusicService.getSongAudioUrl(songId);

            // 2. 建立连接读取远程文件
            URL url = new URL(songUrl);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(5000);
            connection.setRequestMethod("GET");

            // 伪装 User-Agent 防止被拦截（可选）
            connection.setRequestProperty("User-Agent", "Mozilla/5.0");

            inputStream = connection.getInputStream();

            // 3. 设置响应头，强制浏览器下载
            response.setContentType("audio/mpeg"); // 设置内容类型
            // 设置文件名 (如果前端没传文件名，就用ID命名)
            String finalName = (filename != null && !filename.isEmpty()) ? filename : "song_" + songId;
            // 处理文件名中文乱码 (简单处理，标准做法需根据浏览器编码)
            String encodedFilename = java.net.URLEncoder.encode(finalName, "UTF-8").replaceAll("\\+", "%20");

            response.setHeader("Content-Disposition", "attachment; filename=\"" + encodedFilename + ".mp3\"");

            // 4. 将输入流复制到响应输出流
            inputStream.transferTo(response.getOutputStream());
            response.flushBuffer();

        } catch (Exception e) {
            System.err.println("❌ 下载失败: 歌曲ID=" + songId + ", 错误: " + e.getMessage());
            if (!response.isCommitted()) {
                response.sendError(HttpServletResponse.SC_NOT_FOUND, "下载失败: " + e.getMessage());
            }
        } finally {
            if (inputStream != null) {
                inputStream.close();
            }
        }
    }
}