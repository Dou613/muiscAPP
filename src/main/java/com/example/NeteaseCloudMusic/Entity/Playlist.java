package com.example.NeteaseCloudMusic.Entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Entity
@Table(name = "user_playlist")
@Data
@NoArgsConstructor
@ToString(exclude = {"user", "songs"})
public class Playlist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ✅ 修改：关联 User 对象 (外键 user_id)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(columnDefinition = "VARCHAR(500) DEFAULT NULL")
    private String coverUrl;

    @Column(nullable = false)
    private boolean defaultPlaylist = false;

    @Temporal(TemporalType.TIMESTAMP)
    private Date createTime = new Date();

    @Column(length = 100)
    private String originalCreator;

    @Column(columnDefinition = "VARCHAR(500) DEFAULT NULL")
    private String originalCreatorAvatar;

    @Column(nullable = false)
    private boolean isQueue = false; // 是否为播放队列

    // ✅ 新增：记录当前播放到了队列中的哪一首歌（索引）
    @Column(name = "current_index")
    private Integer currentIndex = 0;

    // ✅ 修改：关联歌单内的歌曲 (一对多)
    // orphanRemoval = true 代表从列表中移除歌曲时，数据库也真删
    @OneToMany(mappedBy = "playlist", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PlaylistSong> songs = new ArrayList<>();

    public static final String DEFAULT_PLAYLIST_NAME = "我喜欢的音乐";
}