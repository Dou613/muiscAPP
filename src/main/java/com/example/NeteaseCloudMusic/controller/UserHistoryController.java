package com.example.NeteaseCloudMusic.controller;

import com.example.NeteaseCloudMusic.Entity.PlayHistory;
import com.example.NeteaseCloudMusic.Entity.User;

import com.example.NeteaseCloudMusic.Repository.PlayHistoryRepository;
import com.example.NeteaseCloudMusic.Repository.UserRepository;
import com.example.NeteaseCloudMusic.service.UserSessionService;
import com.example.NeteaseCloudMusic.vo.SongVO;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/user/history")
public class UserHistoryController {

    @Autowired
    private UserSessionService userSessionService;

    @Autowired
    private PlayHistoryRepository historyRepository;

    @Autowired
    private UserRepository userRepository; // ✅ 注入 UserRepository

    /**
     * 1. 记录播放历史
     */
    @PostMapping("/record")
    @Transactional // 建议加上事务
    public ResponseEntity<?> recordHistory(HttpServletRequest request, @RequestBody SongVO song) {
        try {
            // 1. 获取当前登录用户的手机号
            String phone = userSessionService.getCurrentUserPhone(request);

            // 2. ✅ 关键步骤：先查询出完整的 User 实体
            // 因为 phone 不是主键，必须查出实体才能正确建立外键关联
            User user = userRepository.findByPhone(phone)
                    .orElseThrow(() -> new RuntimeException("用户不存在"));

            // 3. 检查历史记录是否存在
            // 注意：这里使用的是 findByUser_PhoneAndSongId (Spring Data JPA 智能查询)
            Optional<PlayHistory> existing = historyRepository.findByUser_PhoneAndSongId(phone, song.getSongId());

            PlayHistory history;
            if (existing.isPresent()) {
                history = existing.get();
                // 仅更新时间
                history.setPlayedTime(LocalDateTime.now());
            } else {
                history = new PlayHistory();

                // ✅ 设置关联的 User 实体 (Hibernate 会自动处理外键)
                history.setUser(user);

                history.setSongId(song.getSongId());
                history.setTitle(song.getTitle());
                history.setArtist(song.getArtist());
                history.setAlbum(song.getAlbum());
                history.setCoverUrl(song.getCoverUrl());
                history.setDuration(song.getDuration());
                history.setPlayedTime(LocalDateTime.now());
            }

            historyRepository.save(history);
            return ResponseEntity.ok("已记录");

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(400).body("记录失败: " + e.getMessage());
        }
    }

    /**
     * 2. 获取最近播放列表
     */
    @GetMapping("/list")
    public ResponseEntity<?> getHistoryList(HttpServletRequest request) {
        try {
            String phone = userSessionService.getCurrentUserPhone(request);

            // 通过关联对象的属性查询: findByUser_Phone...
            List<PlayHistory> histories = historyRepository.findByUser_PhoneOrderByPlayedTimeDesc(phone);

            // 转换为 VO 给前端
            List<SongVO> songs = histories.stream().map(h -> {
                SongVO vo = new SongVO();
                vo.setSongId(h.getSongId());
                vo.setTitle(h.getTitle());
                vo.setArtist(h.getArtist());
                vo.setAlbum(h.getAlbum());
                vo.setCoverUrl(h.getCoverUrl());
                vo.setDuration(h.getDuration());
                return vo;
            }).collect(Collectors.toList());

            return ResponseEntity.ok(songs);

        } catch (Exception e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }
    }

    /**
     * 3. 批量删除
     */
    @PostMapping("/delete")
    @Transactional
    public ResponseEntity<?> deleteHistory(HttpServletRequest request, @RequestBody List<Long> songIds) {
        try {
            String phone = userSessionService.getCurrentUserPhone(request);
            // 通过关联对象的属性删除
            historyRepository.deleteByUser_PhoneAndSongIdIn(phone, songIds);
            return ResponseEntity.ok("删除成功");
        } catch (Exception e) {
            return ResponseEntity.status(500).body(e.getMessage());
        }
    }
}