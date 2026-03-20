package com.example.NeteaseCloudMusic.vo;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ArtistVO {
    private Long id;        // 歌手 ID
    private String name;    // 歌手名称
    private String picUrl;  // 歌手头像 URL

    private Integer albumSize; // 专辑数
    private Integer musicSize; // 单曲数
}