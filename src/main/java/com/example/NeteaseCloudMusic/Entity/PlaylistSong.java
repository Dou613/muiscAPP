package com.example.NeteaseCloudMusic.Entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

@Entity
@Table(name = "playlist_song", uniqueConstraints = {
        // 防止同一歌单重复添加同一首歌
        @UniqueConstraint(columnNames = {"playlist_id", "songId"})
})
@Data
@NoArgsConstructor
@ToString(exclude = "playlist")
public class PlaylistSong {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ✅ 修改：关联 Playlist 对象 (外键 playlist_id)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "playlist_id", nullable = false)
    private Playlist playlist;

    // 网易云歌曲 ID
    @Column(nullable = false)
    private Long songId;

    // ✅ 新增：歌曲元数据快照 (必须存储，否则加载歌单会很慢)
    @Column(nullable = false)
    private String title;

    private String artist;

    private String album;

    @Column(length = 500)
    private String coverUrl;

    private Long duration;

    // ✅ 新增：排序权重，用于记录歌曲在队列中的顺序
    @Column(name = "sort_order")
    private Integer sortOrder;


}