package com.example.NeteaseCloudMusic.controller;

import com.example.NeteaseCloudMusic.Entity.AiReport;
import com.example.NeteaseCloudMusic.Entity.User;
import com.example.NeteaseCloudMusic.Repository.AiReportRepository;
import com.example.NeteaseCloudMusic.Repository.UserRepository;
import com.example.NeteaseCloudMusic.service.AiPlaylistService;
import com.example.NeteaseCloudMusic.service.PlayHistoryService;
import com.example.NeteaseCloudMusic.service.UserSessionService;
import com.example.NeteaseCloudMusic.vo.SongVO;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    @Autowired
    private AiPlaylistService aiPlaylistService;

    @Autowired
    private PlayHistoryService historyService;

    @Autowired
    private UserSessionService userSessionService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AiReportRepository aiReportRepository;

    /**
     * AI 灵感歌单接口
     * POST /api/ai/recommend
     * Body: { "prompt": "下雨天适合一个人听的歌" }
     */
    @PostMapping("/recommend")
    public ResponseEntity<List<SongVO>> generatePlaylist(@RequestBody Map<String, String> request) {
        String prompt = request.get("prompt");
        if (prompt == null || prompt.trim().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        List<SongVO> songs = aiPlaylistService.recommendSongsByPrompt(prompt);
        return ResponseEntity.ok(songs);
    }

    @GetMapping("/report")
    public ResponseEntity<?> getMyMusicReport(HttpServletRequest request) {
        try {
            String phone = userSessionService.getCurrentUserPhone(request);
            List<SongVO> history = historyService.getUserHistory(phone);

            // 调用业务层生成报告并直接返回
            return ResponseEntity.ok(aiPlaylistService.generateAndSaveReport(phone, history));
        } catch (Exception e) {
            // 捕获异常并返回统一的 JSON 错误响应，防止触发 sendError 冲突
            e.printStackTrace();
            return ResponseEntity.status(500).body(java.util.Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/reports/history")
    public ResponseEntity<List<AiReport>> getHistory(HttpServletRequest request) {
        String phone = userSessionService.getCurrentUserPhone(request);
        return ResponseEntity.ok(aiReportRepository.findByUser_PhoneOrderByCreateTimeDesc(phone));
    }


}