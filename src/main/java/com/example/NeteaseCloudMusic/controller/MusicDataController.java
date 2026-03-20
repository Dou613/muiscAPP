// MusicDataController.java
package com.example.NeteaseCloudMusic.controller;

import com.example.NeteaseCloudMusic.service.NeteaseMusicService;
import com.example.NeteaseCloudMusic.vo.LyricVO;
import com.example.NeteaseCloudMusic.vo.PlaylistVO;
import com.example.NeteaseCloudMusic.vo.SongVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/data")
public class MusicDataController {

    @Autowired
    private NeteaseMusicService neteaseMusicService;

    /**
     * ✅ 修改：通用搜索接口
     * GET /api/data/search?keywords=xxx&type=1
     */
    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam String keywords, @RequestParam(defaultValue = "1") int type) {
        Object result = neteaseMusicService.searchByType(keywords, type);
        return ResponseEntity.ok(result);
    }

    /**
     * ✅ 新增：获取热搜
     * GET /api/data/search/hot
     */
    @GetMapping("/search/hot")
    public ResponseEntity<List<String>> getHotSearch() {
        return ResponseEntity.ok(neteaseMusicService.getHotSearchList());
    }

    /**
     * ✅ 新增：获取相似歌曲
     * GET /api/data/similar/songs?songId=...
     */
    @GetMapping("/similar/songs")
    public ResponseEntity<List<SongVO>> getSimilarSongs(@RequestParam Long songId) {
        List<SongVO> result = neteaseMusicService.getSimilarSongs(songId);

        if (result.isEmpty()) {
            // 如果没有相似歌曲，返回 204 No Content
            return ResponseEntity.status(HttpStatus.NO_CONTENT).body(Collections.emptyList());
        }
        return ResponseEntity.ok(result);
    }

    /**
     * ✅ 新增：获取所有官方/全球榜单列表
     * GET /api/data/charts
     * (前端点击榜单后，可复用 /api/data/playlist/detail 接口获取歌曲)
     */
    @GetMapping("/charts")
    public ResponseEntity<List<PlaylistVO>> getAllCharts() {
        List<PlaylistVO> result = neteaseMusicService.getOfficialCharts();

        if (result.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NO_CONTENT).body(Collections.emptyList());
        }
        return ResponseEntity.ok(result);
    }

    /**
     * ✅ 新增：获取公开热门歌曲
     * GET /api/data/hot/songs?type=0 (0:全部, 7:华语, 96:欧美)
     */
    @GetMapping("/hot/songs")
    public ResponseEntity<List<SongVO>> getHotSongs(@RequestParam(defaultValue = "0") int type) {
        List<SongVO> result = neteaseMusicService.getGlobalHotSongs(type);

        if (result.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NO_CONTENT).body(Collections.emptyList());
        }
        return ResponseEntity.ok(result);
    }

    /** * ✅ 新增：获取推荐歌单
     * GET /api/data/recommended/playlist?limit=7
     */
    @GetMapping("/recommended/playlist")
    // ✅ 修改 defaultValue 为 7，确保初始时和刷新时符合要求
    public ResponseEntity<List<PlaylistVO>> getRecommendedPlaylists(@RequestParam(defaultValue = "7") int limit) {
        // 直接调用 NeteaseMusicService 中的公共方法
        List<PlaylistVO> playlists = neteaseMusicService.getRecommendedPlaylists(limit);

        if (playlists.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NO_CONTENT).body(Collections.emptyList());
        }

        return ResponseEntity.ok(playlists);
    }

    /** * ✅ 新增：获取歌单详情歌曲列表
     * GET /api/data/playlist/detail?playlistId=...
     */
    /**
     * ✅ 修改：获取歌单详情 (返回完整 VO)
     */
    @GetMapping("/playlist/detail")
    public ResponseEntity<PlaylistVO> getPlaylistDetail(@RequestParam Long playlistId) {
        // 调用刚才修改后的 Service 方法
        PlaylistVO playlist = neteaseMusicService.getPlaylistDetail(playlistId);

        if (playlist == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(playlist);
    }

    /**
     * ✅ 新增：获取歌曲歌词
     * GET /api/data/lyric?songId=...
     */
    @GetMapping("/lyric")
    public ResponseEntity<LyricVO> getLyric(@RequestParam Long songId) {
        LyricVO lyric = neteaseMusicService.getSongLyric(songId);

        // 如果歌词和错误信息都没有，返回 404
        if (lyric.getLyric() == null && lyric.getMessage() == null) {
            return ResponseEntity.notFound().build();
        }

        // 否则返回 200，让前端处理 lyric/tlyric/message 字段
        return ResponseEntity.ok(lyric);
    }
}