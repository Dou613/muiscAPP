package com.example.NeteaseCloudMusic.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LyricVO {
    private String lyric;    // 原始歌词
    private String tlyric;   // 歌词翻译 (可能为 null)
    private String message;  // 错误或提示信息 (例如 "该歌曲暂无歌词" 或 "服务内部错误")
}