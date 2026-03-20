package com.example.NeteaseCloudMusic.Repository;

import com.example.NeteaseCloudMusic.Entity.PlayHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlayHistoryRepository extends JpaRepository<PlayHistory, Long> {

    // ✅ 方式1：通过手机号查询 (对应 User 实体的 phone 字段)
    // 适合 Controller 层直接拿到 phone 的情况
    List<PlayHistory> findByUser_PhoneOrderByPlayedTimeDesc(String phone);

    // ✅ 方式1辅助：查找特定记录
    Optional<PlayHistory> findByUser_PhoneAndSongId(String phone, Long songId);

    // ✅ 方式1辅助：批量删除
    void deleteByUser_PhoneAndSongIdIn(String phone, List<Long> songIds);

}