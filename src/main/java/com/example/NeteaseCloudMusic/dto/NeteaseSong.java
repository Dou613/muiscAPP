package com.example.NeteaseCloudMusic.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class NeteaseSong {
    private Long id; // 歌曲 ID
    private String name; // 歌曲名

    @JsonAlias("dt") //
    private Long duration;

    @JsonAlias("ar") //
    private List<Artist> artists;

    @JsonAlias("al") //
    private Album album;

    /**
     * 歌手信息 DTO
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Artist {
        private Long id;    // 歌手 ID
        private String name; // 歌手名
        private String picUrl; // 歌手头像 URL
    }

    /**
     * 专辑信息 DTO
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Album {
        private Long id;    // 专辑 ID
        private String name; // 专辑名
        private Long publishTime; // 发布时间戳
        private String picUrl; // 专辑封面 URL
    }
}