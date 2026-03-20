package com.example.NeteaseCloudMusic.service;

import com.example.NeteaseCloudMusic.Entity.Playlist;
import com.example.NeteaseCloudMusic.Entity.PlaylistSong;
import com.example.NeteaseCloudMusic.Entity.User;
import com.example.NeteaseCloudMusic.Repository.PlaylistRepository;
import com.example.NeteaseCloudMusic.Repository.PlaylistSongRepository;
import com.example.NeteaseCloudMusic.Repository.UserRepository;
import com.example.NeteaseCloudMusic.vo.PlaylistVO;
import com.example.NeteaseCloudMusic.vo.SongVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class UserPlaylistService {

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private PlaylistRepository playlistRepository;
    @Autowired
    private PlaylistSongRepository playlistSongRepository;
    @Autowired
    private NeteaseMusicService neteaseMusicService;

    // ---------------------- 辅助方法 ----------------------

    private User getUserByPhone(String phone) {
        return userRepository.findByPhone(phone)
                .orElseThrow(() -> new RuntimeException("用户未找到"));
    }

    @Transactional
    public Playlist findOrCreateDefaultPlaylist(User user) {
        Optional<Playlist> existingPlaylist = playlistRepository.findByUser_IdAndDefaultPlaylist(user.getId(), true);

        if (existingPlaylist.isPresent()) {
            return existingPlaylist.get();
        }

        Playlist defaultPlaylist = new Playlist();
        defaultPlaylist.setUser(user);
        defaultPlaylist.setName(Playlist.DEFAULT_PLAYLIST_NAME);
        defaultPlaylist.setDefaultPlaylist(true);
        // ✅ 场景1：创建时使用默认封面 (placeholder.png)
        defaultPlaylist.setCoverUrl("placeholder.png");

        return playlistRepository.save(defaultPlaylist);
    }

    // ---------------------- 核心业务 ----------------------

    /**
     * 收藏歌曲到默认歌单
     */
    @Transactional
    public void addSongToFavorites(String userPhone, Long songId) {
        User user = getUserByPhone(userPhone);
        Playlist favoritesPlaylist = findOrCreateDefaultPlaylist(user);

        addSongToPlaylistInternal(favoritesPlaylist, songId);
    }

    /**
     * ✅ 通用方法：添加歌曲到指定歌单 (包含“第一首歌设为封面”逻辑)
     */
    private void addSongToPlaylistInternal(Playlist playlist, Long songId) {
        // 1. 检查歌曲是否已存在
        Optional<PlaylistSong> existingEntry =
                playlistSongRepository.findByPlaylist_IdAndSongId(playlist.getId(), songId);

        if (existingEntry.isPresent()) {
            return; // 已存在则跳过
        }

        // 2. 获取歌曲详情
        SongVO songDetail = neteaseMusicService.getSongDetail(songId);

        // 3. ✅ 场景2：如果是歌单里的第一首歌，将歌单封面更新为这首歌的封面
        // 注意：getSongs() 是懒加载，这里访问会触发查询
        if (playlist.getSongs() == null || playlist.getSongs().isEmpty()) {
            // 只有当歌单当前没有封面，或者是默认封面时才更新 (可选策略，这里强制更新)
            playlist.setCoverUrl(songDetail.getCoverUrl());
            playlistRepository.save(playlist);
        }

        // 4. 保存歌曲关联信息
        PlaylistSong entry = new PlaylistSong();
        entry.setPlaylist(playlist);
        entry.setSongId(songId);
        entry.setTitle(songDetail.getTitle());
        entry.setArtist(songDetail.getArtist());
        entry.setAlbum(songDetail.getAlbum());
        entry.setCoverUrl(songDetail.getCoverUrl());
        entry.setDuration(songDetail.getDuration());

        playlistSongRepository.save(entry);
    }

    /**
     * 获取用户创建的所有歌单
     */
    public List<Playlist> getUsersPlaylists(String userPhone) {
        User user = getUserByPhone(userPhone);
        return playlistRepository.findByUser_Id(user.getId());
    }

    /**
     * 创建一个新的自定义歌单
     */
    @Transactional
    public Playlist createCustomPlaylist(String userPhone, String name) {
        User user = getUserByPhone(userPhone);

        Playlist newPlaylist = new Playlist();
        newPlaylist.setUser(user);
        newPlaylist.setName(name);
        newPlaylist.setDefaultPlaylist(false);
        // ✅ 场景1：新歌单默认封面
        newPlaylist.setCoverUrl("placeholder.png");

        return playlistRepository.save(newPlaylist);
    }

    /**
     * 重命名歌单
     */
    @Transactional
    public void renamePlaylist(String userPhone, Long playlistId, String newName) {
        User user = getUserByPhone(userPhone);
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new RuntimeException("歌单不存在"));

        if (!playlist.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("无权操作此歌单");
        }

        playlist.setName(newName);
        playlistRepository.save(playlist);
    }

    /**
     * ✅ 场景3：导入在线歌单到本地
     * 直接使用在线歌单的封面
     */
    @Transactional
    public void importOnlinePlaylist(String userPhone, Long onlinePlaylistId) {
        User user = getUserByPhone(userPhone);

        // 1. 从网易云获取完整歌单数据
        PlaylistVO onlineData = neteaseMusicService.getOnlinePlaylistFullInfo(onlinePlaylistId);

        // 新增校验：检查该用户是否已经拥有同名且原作者相同的歌单
        List<Playlist> existingPlaylists = playlistRepository.findByUser_Id(user.getId());
        boolean alreadyImported = existingPlaylists.stream()
                .anyMatch(p -> p.getName().equals(onlineData.getName())
                        && onlineData.getCreatorName().equals(p.getOriginalCreator()));

        if (alreadyImported) {
            throw new RuntimeException("该歌单已经收藏过了，请勿重复收藏");
        }

        // 2. 创建本地歌单
        Playlist newPlaylist = new Playlist();
        newPlaylist.setUser(user);
        newPlaylist.setName(onlineData.getName());
        newPlaylist.setCoverUrl(onlineData.getCoverImgUrl());
        newPlaylist.setDefaultPlaylist(false);
        newPlaylist.setOriginalCreator(onlineData.getCreatorName());
        newPlaylist.setOriginalCreatorAvatar(onlineData.getCreatorAvatar());
        if (onlineData.getCreateTime() != null) {
            newPlaylist.setCreateTime(new Date(onlineData.getCreateTime()));
        }

        // 先保存以获取 ID
        newPlaylist = playlistRepository.save(newPlaylist);

        // 3. 批量保存歌曲
        List<PlaylistSong> songEntities = new ArrayList<>();
        if (onlineData.getSongs() != null) {
            for (SongVO songVO : onlineData.getSongs()) {
                PlaylistSong ps = new PlaylistSong();
                ps.setPlaylist(newPlaylist);
                ps.setSongId(songVO.getSongId());

                ps.setTitle(songVO.getTitle());
                ps.setArtist(songVO.getArtist());
                ps.setAlbum(songVO.getAlbum());
                ps.setCoverUrl(songVO.getCoverUrl());
                ps.setDuration(songVO.getDuration());

                songEntities.add(ps);
            }
            playlistSongRepository.saveAll(songEntities);
        }
    }

    /**
     * ✅ 新增：删除歌单
     */
    @Transactional
    public void deletePlaylist(String userPhone, Long playlistId) {
        User user = getUserByPhone(userPhone);

        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new RuntimeException("歌单不存在"));

        // 1. 权限校验
        if (!playlist.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("无权删除此歌单");
        }

        // 2. 默认歌单校验
        if (playlist.isDefaultPlaylist()) {
            throw new RuntimeException("系统默认歌单无法删除");
        }

        // 🚀🚀🚀 3. 安全删除逻辑：先手动清空歌曲 🚀🚀🚀
        // 虽然 JPA 配置了 Cascade，但手动清空可以避免很多脏数据导致的 500 错误
        if (playlist.getSongs() != null) {
            // 利用 orphanRemoval = true 特性，清空 List 会自动删除数据库记录
            playlist.getSongs().clear();
            // 强制刷新一下，确保歌曲先被删掉
            playlistRepository.saveAndFlush(playlist);
        }

        // 4. 最后删除空的歌单
        playlistRepository.delete(playlist);
    }

    /**
     * 从歌单中移除歌曲
     */
    @Transactional
    public void removeSongFromPlaylist(String userPhone, Long playlistId, Long songId) {
        User user = getUserByPhone(userPhone);

        // 1. 查找歌单
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new RuntimeException("歌单不存在"));

        // 2. 权限校验：只能操作自己的歌单
        if (!playlist.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("无权操作此歌单");
        }

        // 3. 执行删除
        // 注意：这里调用的是 repository 的 deleteBy... 方法
        playlistSongRepository.deleteByPlaylist_IdAndSongId(playlist.getId(), songId);
    }

    // 这里预留一个 Service 方法供未来调用
    @Transactional
    public void addSongToCustomPlaylist(String userPhone, Long playlistId, Long songId) {
        User user = getUserByPhone(userPhone);
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new RuntimeException("歌单不存在"));

        if (!playlist.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("无权操作此歌单");
        }

        addSongToPlaylistInternal(playlist, songId);
    }

    /**
     * ✅ 切换在线歌单收藏状态
     * 如果未收藏则导入，如果已收藏则删除
     */
    @Transactional
    public String toggleOnlinePlaylistCollection(String userPhone, Long onlinePlaylistId) {
        User user = getUserByPhone(userPhone);
        // 获取在线歌单详情以用于比对
        PlaylistVO onlineData = neteaseMusicService.getOnlinePlaylistFullInfo(onlinePlaylistId);

        // 1. 检查该用户是否已经收藏过此歌单（通过名称和原作者比对）
        List<Playlist> existingPlaylists = playlistRepository.findByUser_Id(user.getId());
        Optional<Playlist> collectedPlaylist = existingPlaylists.stream()
                .filter(p -> p.getName().equals(onlineData.getName())
                        && onlineData.getCreatorName().equals(p.getOriginalCreator()))
                .findFirst();

        if (collectedPlaylist.isPresent()) {
            // 2. 已存在：执行取消收藏逻辑
            Playlist playlistToDelete = collectedPlaylist.get();
            // 清空歌曲以触发级联删除（orphanRemoval）
            if (playlistToDelete.getSongs() != null) {
                playlistToDelete.getSongs().clear();
                playlistRepository.saveAndFlush(playlistToDelete);
            }
            playlistRepository.delete(playlistToDelete);
            return "uncollected";
        } else {
            // 3. 不存在：执行导入收藏逻辑
            Playlist newPlaylist = new Playlist();
            newPlaylist.setUser(user);
            newPlaylist.setName(onlineData.getName());
            newPlaylist.setCoverUrl(onlineData.getCoverImgUrl());
            newPlaylist.setDefaultPlaylist(false);
            newPlaylist.setOriginalCreator(onlineData.getCreatorName());
            newPlaylist.setOriginalCreatorAvatar(onlineData.getCreatorAvatar());

            Playlist savedPlaylist = playlistRepository.save(newPlaylist);

            // 批量保存歌曲
            if (onlineData.getSongs() != null) {
                List<PlaylistSong> songEntities = onlineData.getSongs().stream().map(songVO -> {
                    PlaylistSong ps = new PlaylistSong();
                    ps.setPlaylist(savedPlaylist);
                    ps.setSongId(songVO.getSongId());
                    ps.setTitle(songVO.getTitle());
                    ps.setArtist(songVO.getArtist());
                    ps.setAlbum(songVO.getAlbum());
                    ps.setCoverUrl(songVO.getCoverUrl());
                    ps.setDuration(songVO.getDuration());
                    return ps;
                }).collect(java.util.stream.Collectors.toList());
                playlistSongRepository.saveAll(songEntities);
            }
            return "collected";
        }
    }

    @Transactional
    public String toggleFavoriteSong(String userPhone, Long songId) {
        User user = getUserByPhone(userPhone);
        Playlist favoritesPlaylist = findOrCreateDefaultPlaylist(user);

        // 检查歌曲是否已在默认歌单中
        Optional<PlaylistSong> existingEntry =
                playlistSongRepository.findByPlaylist_IdAndSongId(favoritesPlaylist.getId(), songId);

        if (existingEntry.isPresent()) {
            // 已存在：删除并返回 removed
            playlistSongRepository.delete(existingEntry.get());
            return "removed";
        } else {
            // 不存在：添加并返回 added
            addSongToPlaylistInternal(favoritesPlaylist, songId);
            return "added";
        }
    }

    /**
     * ✅ 核心：获取或创建用户的“播放队列”歌单
     */
    @Transactional
    public Playlist getOrCreateQueue(User user) {
        return playlistRepository.findByUser_IdAndIsQueueTrue(user.getId())
                .orElseGet(() -> {
                    Playlist queue = new Playlist();
                    queue.setUser(user);
                    queue.setName("当前播放队列"); // 用户不可见的名字
                    queue.setDefaultPlaylist(false);
                    queue.setQueue(true); // ✅ 标记为队列
                    queue.setCoverUrl("placeholder.png");
                    return playlistRepository.save(queue);
                });
    }

    /**
     * ✅ 核心：全量同步播放队列 (包含去重逻辑)
     */
    @Transactional
    public void updatePlaybackQueue(String phone, List<SongVO> newQueueSongs, Integer currentIndex) {
        User user = getUserByPhone(phone);
        Playlist queue = getOrCreateQueue(user);

        // 1. 清空旧队列 (利用 orphanRemoval=true 级联删除)
        queue.getSongs().clear();
        playlistRepository.saveAndFlush(queue); // 强制刷新确保删除生效

        if (newQueueSongs == null || newQueueSongs.isEmpty()) {
            playlistRepository.save(queue);
            return;
        }

        // 2. 重新填充 (并进行二次去重，确保数据库安全)
        Set<Long> processedSongIds = new HashSet<>();
        int orderIndex = 0;

        for (SongVO vo : newQueueSongs) {
            // ✅ 关键：如果 Set 中已存在该 ID，跳过，确保唯一性
            if (!processedSongIds.add(vo.getSongId())) {
                continue;
            }

            PlaylistSong ps = new PlaylistSong();
            ps.setPlaylist(queue);
            ps.setSongId(vo.getSongId());

            if (vo.getTitle() == null || vo.getCoverUrl() == null || "placeholder.png".equals(vo.getCoverUrl())) {
                try {
                    // 调用现有的服务获取详情 (确保 NeteaseMusicService 已注入)
                    SongVO detail = neteaseMusicService.getSongDetail(vo.getSongId());
                    ps.setTitle(detail.getTitle());
                    ps.setArtist(detail.getArtist());
                    ps.setAlbum(detail.getAlbum());
                    ps.setCoverUrl(detail.getCoverUrl());
                    ps.setDuration(detail.getDuration());
                } catch (Exception e) {
                    // 如果补全也失败，使用默认值防止报错
                    ps.setTitle(vo.getTitle() != null ? vo.getTitle() : "未知标题");
                    ps.setArtist(vo.getArtist());
                    ps.setCoverUrl("placeholder.png");
                }
            } else {
                // 数据完整，直接使用
                ps.setTitle(vo.getTitle());
                ps.setArtist(vo.getArtist());
                ps.setAlbum(vo.getAlbum());
                ps.setCoverUrl(vo.getCoverUrl());
                ps.setDuration(vo.getDuration());
            }

            // ✅ 设置排序
            ps.setSortOrder(orderIndex++);

            queue.getSongs().add(ps);
        }

        playlistRepository.save(queue);
    }

    /**
     * ✅ 修改：获取队列时，同时返回 current_index
     * 返回类型改为 Map
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getPlaybackQueueWithState(String phone) {
        User user = getUserByPhone(phone);
        Optional<Playlist> queueOpt = playlistRepository.findByUser_IdAndIsQueueTrue(user.getId());

        Map<String, Object> result = new HashMap<>();

        if (queueOpt.isEmpty()) {
            result.put("songs", new ArrayList<SongVO>());
            result.put("currentIndex", 0);
            return result;
        }

        Playlist queue = queueOpt.get();

        // 获取歌曲列表 (保持原有排序逻辑)
        List<SongVO> songs = queue.getSongs().stream()
                .sorted(Comparator.comparingInt(ps -> ps.getSortOrder() == null ? 0 : ps.getSortOrder()))
                .map(ps -> {
                    SongVO vo = new SongVO();
                    vo.setSongId(ps.getSongId());
                    vo.setTitle(ps.getTitle());
                    vo.setArtist(ps.getArtist());
                    vo.setAlbum(ps.getAlbum());
                    vo.setCoverUrl(ps.getCoverUrl());
                    vo.setDuration(ps.getDuration());
                    return vo;
                })
                .collect(Collectors.toList());

        result.put("songs", songs);
        result.put("currentIndex", queue.getCurrentIndex());

        return result;
    }
}