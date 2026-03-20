package com.example.NeteaseCloudMusic.vo;

import lombok.Data;

import java.util.List;

@Data
public class PlaylistVO {
    private Long id;

    // 如果前端习惯用 playlistId，保留这个也没事，但 Controller 要改
    private Long playlistId;

    private String name;
    private String coverImgUrl;
    private String creatorName;
    private String creatorAvatar;
    private String description;
    private Long createTime;

    // ✅ 修复：添加 defaultPlaylist 字段
    private boolean defaultPlaylist;

    private List<SongVO> songs;
    private Long trackCount;
    private List<String> tags;
}
