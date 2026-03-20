package com.example.NeteaseCloudMusic.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;


@FeignClient(name = "netease-music-api", url = "http://localhost:3000")
public interface NeteaseMusicFeignClient {

    /**
     * 搜索歌曲/歌手/歌单
     * @param type 1:单曲, 10:专辑, 100:歌手, 1000:歌单, 1002:用户, 1004:MV, 1006:歌词, 1009:电台
     */
    @GetMapping("/search")
    String search(@RequestParam("keywords") String keywords, @RequestParam(value = "type", defaultValue = "1") int type,@RequestParam(value = "limit", defaultValue = "100") int limit);

    /** * ✅ 新增：获取热搜列表 (详细版)
     */
    @GetMapping("/search/hot/detail")
    String getHotSearchDetail();

    /** * ✅ 获取歌曲 URL，增加 br 参数 (比特率)
     */
    @GetMapping("/song/url")
    String getSongUrl(@RequestParam("id") Long id, @RequestParam(value = "br", defaultValue = "320000") int bitrate);

    /** * ✅ 获取推荐歌单
     * limit: 歌单数量
     */
//    @GetMapping("/personalized")
//    String getRecommendedPlaylists(@RequestParam(value = "limit", defaultValue = "50") int limit);
    @GetMapping("/top/playlist/highquality")
    String getHighQualityPlaylists(@RequestParam(value = "limit", defaultValue = "100") int limit);

    /** * ✅ 获取歌曲歌词
     * @param id 歌曲 ID
     * @return 包含歌词信息的原始 JSON 字符串
     */
    @GetMapping("/lyric")
    String getLyric(@RequestParam("id") Long id);

    /** * 获取歌单详情，返回原始 JSON 字符串
     */
    @GetMapping("/playlist/detail")
    String getPlaylistDetail(@RequestParam("id") Long id);

    /** * ✅ 获取公开热门歌曲 (非个性化) type: 0:全部 7:华语 96:欧美 */
    @GetMapping("/top/song")
    String getGlobalTopSongs(@RequestParam(value = "type", defaultValue = "0") int type);

    /** * ✅ 新增：获取所有官方/全球榜单列表 */
    @GetMapping("/toplist")
    String getAllTopLists();

    /** * ✅ 获取相似歌曲 (不需要登录) */
    @GetMapping("/simi/song")
    String getSimilarSongs(@RequestParam("id") Long songId);

    /* 获取歌曲详情 */
    @GetMapping("/song/detail")
    String getSongDetail(@RequestParam("ids") String ids);
}