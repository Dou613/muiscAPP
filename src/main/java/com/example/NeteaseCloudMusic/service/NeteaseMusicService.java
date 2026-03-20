package com.example.NeteaseCloudMusic.service;

import com.example.NeteaseCloudMusic.feign.NeteaseMusicFeignClient;
import com.example.NeteaseCloudMusic.dto.NeteaseSong;
import com.example.NeteaseCloudMusic.vo.ArtistVO;
import com.example.NeteaseCloudMusic.vo.LyricVO;
import com.example.NeteaseCloudMusic.vo.PlaylistVO;
import com.example.NeteaseCloudMusic.vo.SongVO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import feign.FeignException;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

/**
 * 核心音乐数据服务
 */
@Service
public class NeteaseMusicService {

    @Autowired
    private NeteaseMusicFeignClient feignClient;

    @Autowired
    private ObjectMapper objectMapper;


    /**
     * ✅ 新增：获取相似歌曲 (非个性化)
     * @param songId 基础歌曲 ID
     * @return 歌曲 VO 列表
     */
    public List<SongVO> getSimilarSongs(Long songId) {
        try {
            // 1. 调用 Feign 客户端获取原始 JSON
            String jsonResponse = feignClient.getSimilarSongs(songId);
            JsonNode root = objectMapper.readTree(jsonResponse);

            // 2. 检查状态码
            if (root.path("code").asInt() != 200) {
                System.err.println("Netease API (simi/song) 返回错误码: " + root.path("code").asText());
                return Collections.emptyList();
            }

            // 3. 导航到歌曲列表路径 ("songs")
            JsonNode songsNode = root.path("songs");

            if (songsNode.isMissingNode() || !songsNode.isArray()) {
                // 没有找到相似歌曲
                return Collections.emptyList();
            }

            // 4. 遍历 JsonNode 列表，映射到 NeteaseSong DTO，再转换为 SongVO
            List<SongVO> songVOList = new java.util.ArrayList<>();

            for (JsonNode songNode : songsNode) {
                NeteaseSong neteaseSong = objectMapper.treeToValue(songNode, NeteaseSong.class);
                songVOList.add(convertToSongVO(neteaseSong));
            }

            return songVOList;
        } catch (Exception e) {
            System.err.println("❌ 获取相似歌曲失败: " + e.getMessage());
            e.printStackTrace();
            return Collections.emptyList();
        }
    }

    /**
     * ✅ 新增：获取所有官方/全球榜单列表
     * @return PlaylistVO 列表 (包含 ID, Name, Cover)
     */
    public List<PlaylistVO> getOfficialCharts() {
        try {
            // 1. 调用 Feign 客户端获取原始 JSON
            String jsonResponse = feignClient.getAllTopLists();
            JsonNode root = objectMapper.readTree(jsonResponse);

            // 2. 检查状态码
            if (root.path("code").asInt() != 200) {
                System.err.println("Netease API (top/list) 返回错误代码: " + root.path("code").asInt());
                return Collections.emptyList();
            }

            // 3. 榜单列表位于 list 字段下
            JsonNode resultNode = root.path("list");
            if (!resultNode.isArray()) {
                return Collections.emptyList();
            }

            List<PlaylistVO> charts = new ArrayList<>();

            // 4. 遍历结果并映射到 PlaylistVO
            for (JsonNode item : resultNode) {
                PlaylistVO vo = new PlaylistVO();
                // 榜单 ID 即是歌单 ID
                vo.setPlaylistId(item.path("id").asLong());
                vo.setName(item.path("name").asText());
                vo.setCoverImgUrl(item.path("coverImgUrl").asText());

                charts.add(vo);
            }

            return charts;

        } catch (Exception e) {
            System.err.println("❌ 获取榜单列表失败: " + e.getMessage());
            e.printStackTrace();
            return Collections.emptyList();
        }
    }

    /**
     * ✅ 新增：获取公开热门歌曲 (非个性化)
     * @param type 歌曲类型 (0:全部, 7:华语, 96:欧美)
     * @return 歌曲 VO 列表
     */
    public List<SongVO> getGlobalHotSongs(int type) {
        try {
            // 1. 调用 Feign 客户端获取原始 JSON
            String jsonResponse = feignClient.getGlobalTopSongs(type);
            JsonNode root = objectMapper.readTree(jsonResponse);

            // 2. 检查状态码
            if (root.path("code").asInt() != 200) {
                System.err.println("Netease API (top/song) 返回错误码: " + root.path("code").asText());
                return Collections.emptyList();
            }

            // 3. 导航到歌曲列表路径 ("data")
            JsonNode songsNode = root.path("data");

            if (songsNode.isMissingNode() || !songsNode.isArray()) {
                return Collections.emptyList();
            }

            // 4. 遍历 JsonNode 列表，映射到 NeteaseSong DTO，再转换为 SongVO
            List<SongVO> songVOList = new java.util.ArrayList<>();

            for (JsonNode songNode : songsNode) {
                // 重用 NeteaseSong DTO 进行映射
                NeteaseSong neteaseSong = objectMapper.treeToValue(songNode, NeteaseSong.class);
                songVOList.add(convertToSongVO(neteaseSong));
            }

            return songVOList;
        } catch (Exception e) {
            System.err.println("❌ 获取公开热门歌曲失败: " + e.getMessage());
            e.printStackTrace();
            return Collections.emptyList();
        }
    }

    /**
     * ✅ 新增：获取歌曲歌词
     * @param songId 歌曲 ID
     * @return 包含歌词和翻译的 LyricVO
     */
    public LyricVO getSongLyric(Long songId) {
        LyricVO lyricVO = new LyricVO();
        try {
            // 1. 调用 Feign 客户端获取原始 JSON
            String jsonResponse = feignClient.getLyric(songId);

            // 2. 解析 JSON
            JsonNode root = objectMapper.readTree(jsonResponse);

            // 检查 API 状态码
            if (root.path("code").asInt() != 200) {
                lyricVO.setMessage("❌ 网易云歌词 API 返回错误: " + root.path("code").asText());
                return lyricVO;
            }

            JsonNode lrcNode = root.path("lrc").path("lyric"); // 直接定位到歌词文本节点

            // 检查是否有主歌词内容
            if (lrcNode.isTextual()) {
                lyricVO.setLyric(lrcNode.asText());
            } else if (root.path("nolyric").asBoolean(false)) {
                // 标记为无歌词的纯音乐
                // 关键修复：设置一个LRC格式的提示文本，防止前端字符串操作崩溃
                lyricVO.setLyric("[99:99.00]纯音乐或暂无歌词");
                lyricVO.setMessage("该歌曲暂无歌词");
            } else {
                // 未找到歌词信息 (可能是返回结构异常或其它情况)
                lyricVO.setLyric("[99:99.00]未找到歌词信息");
                lyricVO.setMessage("未找到歌词信息");
            }

            // 4. 提取翻译 (可选，在 tlyric -> lyric 字段下)
            JsonNode tlyricNode = root.path("tlyric").path("lyric"); // 直接定位到翻译文本节点
            if (tlyricNode.isTextual()) {
                lyricVO.setTlyric(tlyricNode.asText());
            } else {
                lyricVO.setTlyric(null); // 翻译歌词可以安全地设为 null
            }

        } catch (Exception e) {
            System.err.println("❌ 获取歌曲 ID " + songId + " 歌词失败: " + e.getMessage());
            e.printStackTrace();
            lyricVO.setMessage("获取歌词服务内部错误: " + e.getMessage());
        }
        return lyricVO;
    }

    /**
     * ✅ 新增：获取推荐歌单
     * @param limit 歌单数量限制
     * @return PlaylistVO 列表
     */
//    public List<PlaylistVO> getRecommendedPlaylists(int limit) {
//        try {
//            // 1. 调用 Feign 客户端获取 Node.js API 的原始 JSON 响应
//            String jsonResponse = feignClient.getRecommendedPlaylists(limit);
//
//            // 2. 解析 JSON 响应
//            JsonNode root = objectMapper.readTree(jsonResponse);
//
//            // 检查 Node.js API 是否成功 (code = 200)
//            if (root.path("code").asInt() != 200) {
//                System.err.println("Netease API (personalized) 返回错误代码: " + root.path("code").asInt());
//                // 如果返回非 200 错误，返回空列表
//                return Collections.emptyList();
//            }
//
//            JsonNode resultNode = root.path("result");
//            if (!resultNode.isArray()) {
//                return Collections.emptyList();
//            }
//
//            List<PlaylistVO> playlists = new ArrayList<>();
//
//            // 3. 遍历结果并手动映射到 PlaylistVO
//            for (JsonNode item : resultNode) {
//                PlaylistVO vo = new PlaylistVO();
//
//                // ✅ 关键映射 1: Node.js API field 'id' -> VO field 'playlistId'
//                vo.setPlaylistId(item.path("id").asLong());
//
//                // ✅ 关键映射 2: Node.js API field 'picUrl' -> VO field 'coverImgUrl'
//                vo.setCoverImgUrl(item.path("picUrl").asText());
//
//                // Field 'name' 字段直接匹配
//                vo.setName(item.path("name").asText());
//
//                // 额外的字段，可以直接忽略或设置为 null
//                // vo.setDescription(null);
//                // vo.setTrackCount(null);
//
//                playlists.add(vo);
//            }
//
//            System.out.println("成功获取推荐歌单数量: " + playlists.size());
//            return playlists;
//
//        } catch (Exception e) {
//            System.err.println("获取推荐歌单失败，请检查 Node.js API (localhost:3000) 是否运行: " + e.getMessage());
//            e.printStackTrace();
//            return Collections.emptyList();
//        }
//    }
    public List<PlaylistVO> getRecommendedPlaylists(int limit) {
        try {
            // 1. 调用 Feign 客户端获取原始 JSON 响应。FeignClient 已被修改为请求 50 个高品质歌单。
            String jsonResponse = feignClient.getHighQualityPlaylists(100); // 请求一个大数量

            // 2. 解析 JSON 响应
            JsonNode root = objectMapper.readTree(jsonResponse);

            if (root.path("code").asInt() != 200) {
                System.err.println("Netease API 返回错误代码: " + root.path("code").asInt());
                return Collections.emptyList();
            }

            // /top/playlist/highquality 接口的歌单列表在 "playlists" 字段下
            JsonNode resultNode = root.path("playlists");
            if (!resultNode.isArray()) {
                System.err.println("Netease API JSON 结构异常，缺少 'playlists' 数组。");
                return Collections.emptyList();
            }

            List<PlaylistVO> allPlaylists = new ArrayList<>();

            // 3. 遍历结果并映射到 PlaylistVO
            for (JsonNode item : resultNode) {
                PlaylistVO vo = new PlaylistVO();
                // 映射: id -> playlistId
                vo.setPlaylistId(item.path("id").asLong());
                // 映射: coverImgUrl -> coverImgUrl
                vo.setCoverImgUrl(item.path("coverImgUrl").asText());
                // 映射: name -> name
                vo.setName(item.path("name").asText());

                allPlaylists.add(vo);
            }

            // 如果获取的歌单数量不足，则直接返回所有
            if (allPlaylists.size() <= limit) {
                return allPlaylists;
            }

            // 4. ✅ 关键步骤：随机打乱列表
            // Collections.shuffle 使用指定的随机源打乱列表，确保每次调用顺序不同
            Collections.shuffle(allPlaylists, new Random());

            // 5. 返回打乱后的前 limit 个 (即 7 个)
            List<PlaylistVO> finalPlaylists = allPlaylists.subList(0, limit);

            System.out.println("成功获取并随机选取推荐歌单数量: " + finalPlaylists.size());
            return finalPlaylists;

        } catch (Exception e) {
            System.err.println("获取推荐歌单失败，请检查 Node.js API (localhost:3000) 是否运行: " + e.getMessage());
            e.printStackTrace();
            return Collections.emptyList();
        }
    }

    /**
     * 将网易云 API 歌单结果转换为 PlaylistVO
     */
    private PlaylistVO convertToPlaylistVO(JsonNode item) {
        PlaylistVO vo = new PlaylistVO();
        vo.setPlaylistId(item.path("id").asLong());
        vo.setName(item.path("name").asText());
        vo.setCoverImgUrl(item.path("picUrl").asText());
        // 推荐歌单接口不返回 description, trackCount, songs 等详细信息
        vo.setDescription(null);
        vo.setTrackCount(null);
        vo.setSongs(Collections.emptyList());
        return vo;
    }

    /**
     * ✅ 新增：获取热搜列表
     * @return List<String> 热搜关键词列表
     */
    public List<String> getHotSearchList() {
        try {
            String json = feignClient.getHotSearchDetail();
            JsonNode root = objectMapper.readTree(json);
            JsonNode data = root.path("data"); // 热搜在 data 节点下

            List<String> hotWords = new ArrayList<>();
            if (data.isArray()) {
                for (JsonNode item : data) {
                    hotWords.add(item.path("searchWord").asText());
                }
            }
            // 只取前 10 个
            return hotWords.size() > 10 ? hotWords.subList(0, 10) : hotWords;
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    /**
     * 通用搜索方法 (支持 type)
     * 逻辑：先通过 /search 搜索，如果是单曲则通过 /song/detail 批量补全封面图
     */
    public Object searchByType(String keywords, int type) {
        try {
            // 1. 调用稳定的 /search 接口 (type: 1=单曲, 100=歌手, 1000=歌单)
            String jsonResponse = feignClient.search(keywords, type, 100);
            JsonNode root = objectMapper.readTree(jsonResponse);

            // 打印简要日志以便调试
            System.out.println("🔍 Search API Response (First 200 chars): " +
                    jsonResponse.substring(0, Math.min(jsonResponse.length(), 200)));

            if (root.path("code").asInt() != 200) return Collections.emptyList();

            JsonNode resultNode = root.path("result");
            if (resultNode.isMissingNode()) return Collections.emptyList();

            // --- A. 搜索单曲 (Type 1) ---
            if (type == 1) {
                JsonNode songsNode = resultNode.path("songs");
                if (songsNode.isArray()) {
                    List<SongVO> songVOList = new ArrayList<>();
                    List<String> idList = new ArrayList<>();

                    // 第一阶段：解析基础信息并收集 ID
                    for (JsonNode node : songsNode) {
                        NeteaseSong dto = objectMapper.treeToValue(node, NeteaseSong.class);
                        SongVO vo = convertToSongVO(dto); // 此时封面可能为空或占位图
                        songVOList.add(vo);
                        idList.add(node.path("id").asText());
                    }

                    // 第二阶段：批量获取详情以补全封面图 (解决 /search 接口没封面的问题)
                    if (!idList.isEmpty()) {
                        String idsStr = String.join(",", idList);
                        try {
                            String detailJson = feignClient.getSongDetail(idsStr);
                            JsonNode detailRoot = objectMapper.readTree(detailJson);
                            JsonNode detailSongs = detailRoot.path("songs");

                            if (detailSongs.isArray()) {
                                Map<Long, String> coverMap = new HashMap<>();
                                Map<Long, Long> durationMap = new HashMap<>();
                                for (JsonNode s : detailSongs) {
                                    // 提取高清封面地址 al.picUrl
                                    coverMap.put(s.path("id").asLong(), s.path("al").path("picUrl").asText());
                                    durationMap.put(s.path("id").asLong(), s.path("dt").asLong());
                                }
                                // 填回 VO 列表
                                for (SongVO vo : songVOList) {
                                    if (coverMap.containsKey(vo.getSongId())) {
                                        vo.setCoverUrl(coverMap.get(vo.getSongId()));
                                    }
                                    if (durationMap.containsKey(vo.getSongId())) {
                                        vo.setDuration(durationMap.get(vo.getSongId()));
                                    }
                                }
                            }
                        } catch (Exception detailEx) {
                            System.err.println("⚠️ 批量补全封面失败: " + detailEx.getMessage());
                        }
                    }
                    return songVOList;
                }
            }
            // --- B. 搜索歌手 (Type 100) ---
            else if (type == 100) {
                JsonNode artistsNode = resultNode.path("artists");
                if (artistsNode.isArray()) {
                    List<ArtistVO> artists = new ArrayList<>();
                    for (JsonNode node : artistsNode) {
                        ArtistVO artist = new ArtistVO();
                        artist.setId(node.path("id").asLong());
                        artist.setName(node.path("name").asText());
                        artist.setPicUrl(node.path("picUrl").asText());
                        artist.setAlbumSize(node.path("albumSize").asInt(0));
                        artist.setMusicSize(node.path("musicSize").asInt(0));
                        artists.add(artist);
                    }
                    return artists;
                }
            }
            // --- C. 搜索歌单 (Type 1000) ---
            else if (type == 1000) {
                JsonNode playlistsNode = resultNode.path("playlists");
                if (playlistsNode.isArray()) {
                    List<PlaylistVO> playlists = new ArrayList<>();
                    for (JsonNode node : playlistsNode) {
                        PlaylistVO vo = new PlaylistVO();
                        vo.setPlaylistId(node.path("id").asLong());
                        vo.setName(node.path("name").asText());
                        vo.setCoverImgUrl(node.path("coverImgUrl").asText());
                        playlists.add(vo);
                    }
                    return playlists;
                }
            }

            return Collections.emptyList();
        } catch (Exception e) {
            System.err.println("❌ 搜索服务出错: " + e.getMessage());
            e.printStackTrace();
            return Collections.emptyList();
        }
    }

    /**
     * ✅ 补充：专门用于搜索单曲的方法 (供 AI 服务或其他模块调用)
     * 本质上是调用 type=1 的搜索
     */
    public List<SongVO> searchMusic(String keywords) {
        try {
            // 1. 调用 Feign 客户端 (type=1 代表单曲)
            String jsonResponse = feignClient.search(keywords, 1, 100);

            // 2. 解析 JSON
            JsonNode root = objectMapper.readTree(jsonResponse);

            if (root.path("code").asInt() != 200) {
                return Collections.emptyList();
            }

            JsonNode songsNode = root.path("result").path("songs");
            if (songsNode.isMissingNode() || !songsNode.isArray()) {
                return Collections.emptyList();
            }

            List<SongVO> songVOList = new ArrayList<>();

            // 3. 转换为 SongVO
            for (JsonNode songNode : songsNode) {
                // 复用 NeteaseSong DTO 进行映射
                NeteaseSong neteaseSong = objectMapper.treeToValue(songNode, NeteaseSong.class);
                songVOList.add(convertToSongVO(neteaseSong));
            }

            return songVOList;

        } catch (Exception e) {
            System.err.println("❌ 搜索单曲失败: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * ✅ 修改：获取歌单完整详情（包含元数据和歌曲）
     * @param playlistId 歌单 ID
     * @return PlaylistVO
     */
    public PlaylistVO getPlaylistDetail(Long playlistId) {
        PlaylistVO playlistVO = new PlaylistVO();
        try {
            // 1. 调用 Node.js API
            String jsonResponse = feignClient.getPlaylistDetail(playlistId);
            JsonNode root = objectMapper.readTree(jsonResponse);

            if (root.path("code").asInt() != 200) {
                return null;
            }

            // 2. 提取歌单基本信息 (playlist 节点)
            JsonNode playlistNode = root.path("playlist");
            if (playlistNode.isMissingNode()) return null;

            playlistVO.setPlaylistId(playlistNode.path("id").asLong());
            playlistVO.setName(playlistNode.path("name").asText());
            playlistVO.setCoverImgUrl(playlistNode.path("coverImgUrl").asText());
            playlistVO.setDescription(playlistNode.path("description").asText());

            // 3. 提取标签
            List<String> tags = new ArrayList<>();
            JsonNode tagsNode = playlistNode.path("tags");
            if (tagsNode.isArray()) {
                for (JsonNode tag : tagsNode) {
                    tags.add(tag.asText());
                }
            }
            playlistVO.setTags(tags);

            // 4. 提取创建者信息
            JsonNode creatorNode = playlistNode.path("creator");
            if (!creatorNode.isMissingNode()) {
                playlistVO.setCreatorName(creatorNode.path("nickname").asText());
                playlistVO.setCreatorAvatar(creatorNode.path("avatarUrl").asText());
            }

            // 5. 提取歌曲列表 (tracks)
            JsonNode tracksNode = playlistNode.path("tracks");
            List<SongVO> songs = new ArrayList<>();
            if (tracksNode.isArray()) {
                for (JsonNode track : tracksNode) {
                    SongVO song = new SongVO();
                    song.setSongId(track.path("id").asLong());
                    song.setTitle(track.path("name").asText());
                    song.setDuration(track.path("dt").asLong());

                    // 专辑
                    song.setAlbum(track.path("al").path("name").asText());
                    song.setCoverUrl(track.path("al").path("picUrl").asText());

                    // 歌手
                    JsonNode arNode = track.path("ar");
                    if (arNode.isArray()) {
                        String artists = StreamSupport.stream(arNode.spliterator(), false)
                                .map(n -> n.path("name").asText())
                                .collect(Collectors.joining(" / "));
                        song.setArtist(artists);
                    }
                    songs.add(song);
                }
            }
            playlistVO.setSongs(songs);
            playlistVO.setTrackCount((long) songs.size());

        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
        return playlistVO;
    }

    /**
     * DTO 转 VO 辅助方法 (包含 null 检查，防止 500)
     * @param dto Netease API 返回的歌曲 DTO
     * @return 应用前端使用的 SongVO
     */
    private SongVO convertToSongVO(NeteaseSong dto) {
        if (dto == null) {
            return null;
        }

        SongVO vo = new SongVO();

        // 1. 歌曲 ID、标题、时长
        vo.setSongId(dto.getId()); // 歌曲 ID
        vo.setTitle(dto.getName()); // 歌曲名 (对应 VO 的 title)
        vo.setDuration(dto.getDuration()); // 时长 (ms)

        // 2. 专辑信息 (Album)
        if (dto.getAlbum() != null) {
            vo.setAlbum(dto.getAlbum().getName()); // 专辑名
            vo.setCoverUrl(dto.getAlbum().getPicUrl()); // 专辑封面 URL (高清封面 URL)
        } else {
            vo.setAlbum("未知专辑");
            vo.setCoverUrl(null);
        }

        // 3. 歌手信息 (Artists) - 合并多个歌手
        List<NeteaseSong.Artist> artists = dto.getArtists();
        if (artists != null && !artists.isEmpty()) {
            // 使用 Stream 将所有歌手名合并，以 " / " 分隔
            String combinedArtists = artists.stream()
                    .map(artist -> artist != null ? artist.getName() : "")
                    .collect(Collectors.joining(" / "));
            vo.setArtist(combinedArtists);
        } else {
            vo.setArtist("未知歌手");
        }

        return vo;
    }

    /**
     * 获取歌曲详情 (用于收藏时填充数据库)
     * 调用网易云接口: /song/detail?ids={songId}
     */
    public SongVO getSongDetail(Long songId) {
        try {
            // 1. 调用 Feign Client 获取原始 JSON 字符串
           String jsonResponse = feignClient.getSongDetail(songId.toString());

            // 2. 解析 JSON
            JsonNode root = objectMapper.readTree(jsonResponse);
            JsonNode songNode = root.path("songs").get(0); // 获取第一首歌

            if (songNode == null || songNode.isMissingNode()) {
                throw new RuntimeException("网易云 API 未返回歌曲详情");
            }

            // 3. 提取数据并构建 SongVO
            SongVO song = new SongVO();
            song.setSongId(songId);
            song.setTitle(songNode.path("name").asText("未知标题"));

            // 解析歌手 (ar 是数组)
            JsonNode arNode = songNode.path("ar");
            if (arNode.isArray() && arNode.size() > 0) {
                // 这里只取第一个歌手，也可以拼接多个
                song.setArtist(arNode.get(0).path("name").asText("未知歌手"));
            } else {
                song.setArtist("未知歌手");
            }

            // 解析专辑和封面 (al 对象)
            JsonNode alNode = songNode.path("al");
            song.setAlbum(alNode.path("name").asText("未知专辑"));
            song.setCoverUrl(alNode.path("picUrl").asText("placeholder.png"));

            // 解析时长 (dt)
            song.setDuration(songNode.path("dt").asLong(0));

            return song;

        } catch (Exception e) {
            e.printStackTrace();
            // 发生错误时返回一个兜底对象，防止收藏失败
            SongVO fallback = new SongVO();
            fallback.setSongId(songId);
            fallback.setTitle("获取失败");
            fallback.setArtist("未知");
            fallback.setCoverUrl("placeholder.png");
            return fallback;
        }
    }

    /**
     * 获取在线歌单详情和歌曲列表 (用于导入)
     * 接口: /playlist/detail?id={id}
     */
    public PlaylistVO getOnlinePlaylistFullInfo(Long playlistId) {
        try {
            // 1. 请求网易云接口
            String jsonResponse = feignClient.getPlaylistDetail(playlistId);
            JsonNode root = objectMapper.readTree(jsonResponse);
            JsonNode playlistNode = root.path("playlist");

            if (playlistNode.isMissingNode()) {
                throw new RuntimeException("获取歌单详情失败");
            }

            // 2. 解析基本信息
            PlaylistVO vo = new PlaylistVO();
            vo.setPlaylistId(playlistId);
            vo.setName(playlistNode.path("name").asText());
            vo.setCoverImgUrl(playlistNode.path("coverImgUrl").asText());
            vo.setDescription(playlistNode.path("description").asText());
            vo.setCreatorName(playlistNode.path("creator").path("nickname").asText());
            vo.setCreatorAvatar(playlistNode.path("creator").path("avatarUrl").asText());
            vo.setCreateTime(playlistNode.path("createTime").asLong()); // 获取时间戳

            // 3. 解析歌曲列表 (tracks)
            List<SongVO> songs = new ArrayList<>();
            JsonNode tracksNode = playlistNode.path("tracks");
            if (tracksNode.isArray()) {
                for (JsonNode track : tracksNode) {
                    SongVO song = new SongVO();
                    song.setSongId(track.path("id").asLong());
                    song.setTitle(track.path("name").asText());

                    // 歌手
                    JsonNode arNode = track.path("ar");
                    if (arNode.isArray() && arNode.size() > 0) {
                        song.setArtist(arNode.get(0).path("name").asText());
                    } else {
                        song.setArtist("未知歌手");
                    }

                    // 专辑
                    song.setAlbum(track.path("al").path("name").asText());
                    // 封面
                    song.setCoverUrl(track.path("al").path("picUrl").asText());
                    // 时长
                    song.setDuration(track.path("dt").asLong());

                    songs.add(song);
                }
            }
            vo.setSongs(songs);
            return vo;

        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("导入失败: 无法解析网易云数据");
        }
    }

    /**
     * 网易云音频流接口: 增加音质降级策略
     */
    public String getSongAudioUrl(Long songId) {
        try {
            // 直接尝试请求 320k (API 通常会自动返回实际可用的最高音质)
            return fetchUrlWithBitrate(songId, 320000);
        } catch (Exception e) {
            System.err.println("❌ 获取播放链接失败 (ID: " + songId + "): " + e.getMessage());
            // 直接抛出异常，让前端显示"无法播放"
            throw new RuntimeException("歌曲资源不可用(VIP/无版权)");
        }
    }

    // 提取公共方法
    private String fetchUrlWithBitrate(Long songId, int bitrate) throws IOException {
        String jsonResponse = feignClient.getSongUrl(songId, bitrate);
        JsonNode root = objectMapper.readTree(jsonResponse);

        if (root.path("code").asInt() != 200) {
            throw new RuntimeException("API Error: " + root.path("code"));
        }

        JsonNode dataNode = root.path("data");
        if (!dataNode.isArray() || dataNode.size() == 0) {
            throw new RuntimeException("API 返回的 data 为空，可能歌曲已下架");
        }

        // 安全获取第一个元素
        JsonNode urlNode = dataNode.get(0).path("url");
        String songUrl = urlNode.asText(null);

        if (songUrl == null || songUrl.isEmpty() || "null".equals(songUrl)) {
            throw new RuntimeException("URL is null");
        }
        return songUrl;
    }

}