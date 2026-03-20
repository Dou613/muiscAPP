package com.example.NeteaseCloudMusic.vo;

import lombok.Data;

@Data
public class SongVO {
    // 歌曲 ID (对应网易云的长整型 ID)
    private Long songId;

    private String title;
    private String artist; // 已合并的歌手名
    private String album;
    private String coverUrl; // 高清封面 URL
    private Long duration; // 时长 (ms)
}