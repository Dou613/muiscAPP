package com.example.NeteaseCloudMusic.Repository;

import com.example.NeteaseCloudMusic.Entity.Playlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, Long> {

    // ✅ 修复：通过 User 对象的 ID 查询 (对应实体类: private User user)
    // Spring Data JPA 会解析为：查找 user 属性 -> 再查找 user 的 id 属性
    List<Playlist> findByUser_Id(Long userId);

    // ✅ 修复：查找默认歌单
    Optional<Playlist> findByUser_IdAndDefaultPlaylist(Long userId, boolean defaultPlaylist);

    // 如果你在某些地方是用手机号查歌单，也可以保留这个：
    List<Playlist> findByUser_Phone(String phone);

    Optional<Playlist> findByUser_IdAndIsQueueTrue(Long userId);
}