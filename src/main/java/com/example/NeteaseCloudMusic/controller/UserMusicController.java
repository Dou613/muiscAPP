package com.example.NeteaseCloudMusic.controller;

import com.example.NeteaseCloudMusic.Entity.Playlist;
import com.example.NeteaseCloudMusic.Entity.PlaylistSong;
import com.example.NeteaseCloudMusic.Entity.User;
import com.example.NeteaseCloudMusic.Repository.PlayHistoryRepository;
import com.example.NeteaseCloudMusic.Repository.PlaylistRepository;
import com.example.NeteaseCloudMusic.Repository.PlaylistSongRepository;
import com.example.NeteaseCloudMusic.Repository.UserRepository;
import com.example.NeteaseCloudMusic.service.UserPlaylistService;
import com.example.NeteaseCloudMusic.service.UserSessionService;
import com.example.NeteaseCloudMusic.vo.PlaylistVO;
import com.example.NeteaseCloudMusic.vo.SongVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/user/music")
public class UserMusicController {

    @Autowired
    private UserPlaylistService playlistService;

    @Autowired
    private UserSessionService userSessionService;

    @Autowired
    private PlaylistRepository playlistRepository;

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private PlaylistSongRepository playlistSongRepository;

    /**
     * 辅助方法：从 Request 中获取当前登录用户的手机号 (JWT filter 已设置)
     */
    private String getLoggedInUserPhone(HttpServletRequest request) {
        // 调用 UserSessionService 中基于 HttpServletRequest 的方法
        return userSessionService.getCurrentUserPhone(request);
    }

    /**
     * 1. 收藏歌曲接口：将歌曲添加到默认歌单
     * POST /api/user/music/favorite/{songId}
     */
    @PostMapping("/favorite/{songId}")
    public ResponseEntity<?> addSongToFavorite(@PathVariable Long songId, HttpServletRequest request) {
        try {
            String phone = getLoggedInUserPhone(request);
            // 调用新写的 toggle 方法
            String action = playlistService.toggleFavoriteSong(phone, songId);

            return ResponseEntity.ok(Map.of(
                    "message", action.equals("added") ? "已添加到我喜欢的音乐" : "已从我喜欢的音乐中移除",
                    "action", action
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 2. 获取用户的所有歌单 (包括默认歌单和自定义歌单)
     * GET /api/user/music/playlists
     */
    @GetMapping("/playlists")
    // ✅ 修复：将返回类型从 List<Playlist> 改为 List<PlaylistVO>
    public ResponseEntity<List<PlaylistVO>> getUsersPlaylists(HttpServletRequest request) {
        // 1. 获取手机号
        String phone = userSessionService.getCurrentUserPhone(request);
        // 2. 先通过手机号查 User，获取 userId
        User user = userRepository.findByPhone(phone).orElseThrow(() -> new RuntimeException("用户不存在"));

        // 3. 使用 userId 查询歌单
        List<Playlist> playlists = playlistRepository.findByUser_Id(user.getId());

        List<PlaylistVO> result = playlists.stream()
                // ✅ 核心修改：过滤掉 isQueue=true 的播放队列歌单
                .filter(p -> !p.isQueue())
                .map(p -> {
                    PlaylistVO vo = new PlaylistVO();
                    vo.setId(p.getId());
                    vo.setName(p.getName());
                    vo.setCoverImgUrl(p.getCoverUrl());
                    vo.setDefaultPlaylist(p.isDefaultPlaylist());
                    vo.setCreatorName(p.getOriginalCreator());
                    return vo;
                }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    /**
     * 3. 创建自定义歌单
     * POST /api/user/music/playlist?name=xxx
     */
    @PostMapping("/playlist")
    public ResponseEntity<PlaylistVO> createPlaylist(@RequestParam String name, HttpServletRequest request) {
        try {
            String phone = getLoggedInUserPhone(request);
            // 1. 创建歌单（数据库操作已完成）
            Playlist newPlaylist = playlistService.createCustomPlaylist(phone, name);

            // 2. 关键修改：将 Entity 转换为 VO，切断循环引用
            PlaylistVO vo = new PlaylistVO();
            vo.setId(newPlaylist.getId());
            vo.setPlaylistId(newPlaylist.getId());
            vo.setName(newPlaylist.getName());
            vo.setCoverImgUrl(newPlaylist.getCoverUrl());
            vo.setDefaultPlaylist(newPlaylist.isDefaultPlaylist());
            vo.setCreatorName(null); // 自建歌单创建者为自己，VO中通常留空或设为当前用户名
            // 注意处理 Date 转 Long
            if (newPlaylist.getCreateTime() != null) {
                vo.setCreateTime(newPlaylist.getCreateTime().getTime());
            }

            return ResponseEntity.status(HttpStatus.CREATED).body(vo);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(null);
        }
    }

    /**
     * ✅ 新增：重命名歌单接口
     * PATCH /api/user/music/playlist/{id}?name=新名称
     */
    @PatchMapping("/playlist/{id}")
    public ResponseEntity<?> renamePlaylist(@PathVariable Long id, @RequestParam String name, HttpServletRequest request) {
        try {
            String phone = getLoggedInUserPhone(request);
            playlistService.renamePlaylist(phone, id, name);
            return ResponseEntity.ok(Map.of("message", "重命名成功"));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 获取本地歌单详情
     * 对应前端请求: authenticatedFetch(`/api/user/music/playlist/${id}`)
     */
    @GetMapping("/playlist/{id}")
    public ResponseEntity<?> getLocalPlaylistDetail(HttpServletRequest request, @PathVariable Long id) {
        String phone = userSessionService.getCurrentUserPhone(request);

        Optional<Playlist> plOpt = playlistRepository.findById(id);
        if (plOpt.isEmpty()) return ResponseEntity.notFound().build();

        Playlist pl = plOpt.get();

        boolean needSave = false;

        // 1. 修复封面：如果是默认封面，但歌单里有歌，自动把第一首歌设为封面
        if (("placeholder.png".equals(pl.getCoverUrl()) || pl.getCoverUrl() == null)
                && pl.getSongs() != null && !pl.getSongs().isEmpty()) {
            // 取第一首歌的封面
            String firstSongCover = pl.getSongs().get(0).getCoverUrl();
            if (firstSongCover != null && !firstSongCover.isEmpty()) {
                pl.setCoverUrl(firstSongCover);
                needSave = true;
            }
        }

        // 2. 修复自建歌单的创建者头像 (针对自建歌单)
        // 如果是自建歌单 (originalCreator为空)，但前端拿到的头像是 null
        if (pl.getOriginalCreator() == null && pl.getUser().getProfile() != null) {
            // 这里其实不需要存库，因为是实时取 User 表的，但为了逻辑统一可以打印个日志
        }

        // 如果修改了数据，保存回数据库
        if (needSave) {
            playlistRepository.save(pl);
        }

        // 构建返回对象 VO
        PlaylistVO vo = new PlaylistVO();
        vo.setId(pl.getId());
        vo.setPlaylistId(pl.getId());
        vo.setName(pl.getName());
        vo.setCoverImgUrl(pl.getCoverUrl());
        vo.setDefaultPlaylist(pl.isDefaultPlaylist());

        // 处理创建者信息
        if (pl.getOriginalCreator() != null && !pl.getOriginalCreator().isEmpty()) {
            // --- 收藏歌单 ---
            vo.setCreatorName(pl.getOriginalCreator());
            // 如果数据库里存了原作者头像，就用存的；如果没存(旧数据为null)，暂时给个默认图
            // *注意：收藏歌单的原作者头像很难自动修复，除非重新调网易云API，建议删除重导*
            vo.setCreatorAvatar(pl.getOriginalCreatorAvatar() != null ? pl.getOriginalCreatorAvatar() : "placeholder.png");
        } else {
            // --- 自建歌单 ---
            String myName = "未知用户";
            String myAvatar = "placeholder.png";

            if (pl.getUser() != null) {
                if (pl.getUser().getProfile() != null) {
                    if (pl.getUser().getProfile().getUsername() != null) myName = pl.getUser().getProfile().getUsername();
                    if (pl.getUser().getProfile().getAvatarUrl() != null) myAvatar = pl.getUser().getProfile().getAvatarUrl();
                } else {
                    myName = pl.getUser().getPhone();
                }
            }
            vo.setCreatorName(myName);
            vo.setCreatorAvatar(myAvatar); // ✅ 这里确保赋值，不要给 null
        }

        if (pl.getCreateTime() != null) {
            vo.setDescription("创建于 " + pl.getCreateTime());
        }

        // 映射歌曲列表
        List<SongVO> songs = new ArrayList<>();
        if (pl.getSongs() != null) {
            for (PlaylistSong ps : pl.getSongs()) {
                SongVO song = new SongVO();
                song.setSongId(ps.getSongId());
                song.setTitle(ps.getTitle());
                song.setArtist(ps.getArtist());
                song.setAlbum(ps.getAlbum());
                song.setCoverUrl(ps.getCoverUrl());
                song.setDuration(ps.getDuration());
                songs.add(song);
            }
        }
        vo.setSongs(songs);

        return ResponseEntity.ok(vo);
    }

    /**
     * 导入歌单接口
     * POST /api/user/music/playlist/import?id=xxx
     */
    @PostMapping("/playlist/import")
    public ResponseEntity<?> importPlaylist(@RequestParam Long id, HttpServletRequest request) {
        try {
            String phone = userSessionService.getCurrentUserPhone(request);
            // 调用 Service 中的切换逻辑
            String action = playlistService.toggleOnlinePlaylistCollection(phone, id);
            return ResponseEntity.ok(java.util.Map.of(
                    "message", action.equals("collected") ? "歌单收藏成功" : "已取消收藏该歌单",
                    "action", action
            ));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(java.util.Map.of("error", e.getMessage()));
        }
    }

    /**
     * ✅ ：删除歌单接口
     * DELETE /api/user/music/playlist/{id}
     */
    @DeleteMapping("/playlist/{id}")
    public ResponseEntity<?> deletePlaylist(@PathVariable Long id, HttpServletRequest request) {
        // 1. 先打印进来了
        System.out.println("🔥 Controller 正在处理删除请求: ID=" + id);

        try {
            String phone = userSessionService.getCurrentUserPhone(request);
            playlistService.deletePlaylist(phone, id);
            return ResponseEntity.ok(Map.of("message", "删除成功"));

        } catch (Exception e) {
            // 🚀🚀🚀 2. 关键：打印完整的错误堆栈到控制台 🚀🚀🚀
            e.printStackTrace();

            // 3. 返回错误信息给前端
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "服务端错误: " + e.getMessage()));
        }
    }

    /**
     * ✅ 新增：移除歌单中的歌曲接口
     * DELETE /api/user/music/playlist/{playlistId}/song/{songId}
     */
    @DeleteMapping("/playlist/{playlistId}/song/{songId}")
    public ResponseEntity<?> removeSongFromPlaylist(
            @PathVariable Long playlistId,
            @PathVariable Long songId,
            HttpServletRequest request) {
        try {
            String phone = userSessionService.getCurrentUserPhone(request);

            // 调用 Service 方法
            playlistService.removeSongFromPlaylist(phone, playlistId, songId);

            return ResponseEntity.ok(Map.of("message", "移除成功"));
        } catch (Exception e) {
            // 捕获异常并返回 400 错误，包含错误信息
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * ✅ 新增：向指定自建歌单添加歌曲
     * 对应前端路径: POST /api/user/music/playlist/{playlistId}/song
     */
    @PostMapping("/playlist/{playlistId}/song")
    public ResponseEntity<?> addSongToPlaylist(
            @PathVariable Long playlistId,
            @RequestBody Map<String, Object> body, // 接收前端的 { "songId": 123 }
            HttpServletRequest request) {
        try {
            // 1. 获取当前用户手机号
            String phone = getLoggedInUserPhone(request);

            // 2. 解析 songId
            Object songIdObj = body.get("songId");
            if (songIdObj == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "歌曲ID不能为空"));
            }
            // 转换为 Long 类型
            Long songId = Long.valueOf(songIdObj.toString());

            // 3. 调用 Service 层已有的方法
            playlistService.addSongToCustomPlaylist(phone, playlistId, songId);

            return ResponseEntity.ok(Map.of("message", "添加成功"));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * ✅ 新增：检查某首歌曲存在于当前用户的哪些歌单中
     * 用于前端在“添加到歌单”菜单中置灰已存在的项目
     */
    @GetMapping("/song-membership/{songId}")
    public ResponseEntity<List<Long>> getPlaylistsContainingSong(@PathVariable Long songId, HttpServletRequest request) {
        String phone = userSessionService.getCurrentUserPhone(request);
        User user = userRepository.findByPhone(phone).orElseThrow();

        // 获取该用户的所有歌单
        List<Playlist> playlists = playlistRepository.findByUser_Id(user.getId());

        // 过滤出包含该歌曲的歌单ID列表
        List<Long> containingPlaylistIds = playlists.stream()
                .filter(pl -> playlistSongRepository.findByPlaylist_IdAndSongId(pl.getId(), songId).isPresent())
                .map(Playlist::getId)
                .collect(java.util.stream.Collectors.toList());

        return ResponseEntity.ok(containingPlaylistIds);
    }

    /**
     * ✅ 获取云端队列 (返回 Map: {songs: [], currentIndex: 0})
     */
    @GetMapping("/queue")
    public ResponseEntity<Map<String, Object>> getQueue(HttpServletRequest request) {
        try {
            String phone = userSessionService.getCurrentUserPhone(request);
            // 调用新的 Service 方法
            return ResponseEntity.ok(playlistService.getPlaybackQueueWithState(phone));
        } catch (Exception e) {
            return ResponseEntity.status(401).build();
        }
    }

    /**
     * ✅ 同步队列 (接收 {songs: [], currentIndex: 0})
     */
    @PostMapping("/queue")
    public ResponseEntity<?> syncQueue(@RequestBody Map<String, Object> payload, HttpServletRequest request) {
        try {
            String phone = userSessionService.getCurrentUserPhone(request);

            // 解析参数
            List<Map<String, Object>> songsRaw = (List<Map<String, Object>>) payload.get("songs");
            Integer currentIndex = (Integer) payload.get("currentIndex");

            // 将 Map 转换回 SongVO (Jackson 可能没法直接转泛型 List)
            List<SongVO> songs = new ArrayList<>();
            if (songsRaw != null) {
                ObjectMapper mapper = new ObjectMapper(); // 局部使用或注入
                for (Map<String, Object> map : songsRaw) {
                    songs.add(mapper.convertValue(map, SongVO.class));
                }
            }

            playlistService.updatePlaybackQueue(phone, songs, currentIndex);
            return ResponseEntity.ok("同步成功");
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }
}