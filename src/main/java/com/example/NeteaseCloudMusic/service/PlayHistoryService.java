package com.example.NeteaseCloudMusic.service;

import com.example.NeteaseCloudMusic.Entity.PlayHistory;
import com.example.NeteaseCloudMusic.Entity.User;
import com.example.NeteaseCloudMusic.Repository.PlayHistoryRepository;
import com.example.NeteaseCloudMusic.Repository.UserRepository;
import com.example.NeteaseCloudMusic.vo.SongVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class PlayHistoryService {

    @Autowired
    private PlayHistoryRepository historyRepository;

    @Autowired
    private UserRepository userRepository;

    /**
     * 记录播放历史
     */
    @Transactional
    public void recordSong(String phone, SongVO song) {
        // 1. 先查出 User 实体，因为 PlayHistory 现在需要关联完整的 User 对象
        User user = userRepository.findByPhone(phone)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // 2. 检查是否已存在
        // ✅ 修正点：使用 Repository 中定义的 findByUser_PhoneAndSongId (传入 phone)
        Optional<PlayHistory> existing = historyRepository.findByUser_PhoneAndSongId(phone, song.getSongId());

        PlayHistory history;
        if (existing.isPresent()) {
            // 3. 如果存在，更新时间到最新
            history = existing.get();
            history.setPlayedTime(LocalDateTime.now());
        } else {
            // 4. 如果不存在，创建新记录
            history = new PlayHistory();

            // ✅ 修正点：使用 setUser 关联实体，而不是 setUserId
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
    }

    /**
     * 获取播放历史列表 (转换为 SongVO)
     */
    public List<SongVO> getUserHistory(String phone) {
        // 这一步主要是为了确保用户存在，如果信任 Token 也可以省略
        if (!userRepository.findByPhone(phone).isPresent()) {
            throw new RuntimeException("User not found");
        }

        // ✅ 修正点：使用 Repository 中定义的正确方法名 findByUser_Phone...
        // 并且直接传入 phone (String)，不再需要 user.getId()
        List<PlayHistory> histories = historyRepository.findByUser_PhoneOrderByPlayedTimeDesc(phone);

        // 限制返回最近 100 首
        if (histories.size() > 100) {
            histories = histories.subList(0, 100);
        }

        return histories.stream().map(h -> {
            SongVO vo = new SongVO();
            vo.setSongId(h.getSongId());
            vo.setTitle(h.getTitle());
            vo.setArtist(h.getArtist());
            vo.setAlbum(h.getAlbum());
            vo.setCoverUrl(h.getCoverUrl());
            vo.setDuration(h.getDuration());
            return vo;
        }).collect(Collectors.toList());
    }
}