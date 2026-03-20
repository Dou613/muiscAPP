package com.example.NeteaseCloudMusic.Repository;

import com.example.NeteaseCloudMusic.Entity.PlaylistSong;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlaylistSongRepository extends JpaRepository<PlaylistSong, Long> {

    // ✅ 修复：通过 Playlist 对象的 ID 查询
    // 对应实体类: private Playlist playlist;
    List<PlaylistSong> findByPlaylist_Id(Long playlistId);

    // ✅ 修复：检查歌曲是否存在
    Optional<PlaylistSong> findByPlaylist_IdAndSongId(Long playlistId, Long songId);

    // ✅ 修复：从歌单移除歌曲
    void deleteByPlaylist_IdAndSongId(Long playlistId, Long songId);
}