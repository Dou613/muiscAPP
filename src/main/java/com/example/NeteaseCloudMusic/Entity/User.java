package com.example.NeteaseCloudMusic.Entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "user", uniqueConstraints = {
        @UniqueConstraint(columnNames = "phone", name = "uk_user_phone")
})
@Data
@NoArgsConstructor
// 避免 Lombok toString 循环引用
@ToString(exclude = {"profile", "playlists", "playHistories"})
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 11)
    private String phone;

    @Column(nullable = false)
    private String password;

    // 1. 关联个人资料 (一对一)
    @OneToOne(mappedBy = "user", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private UserProfile profile;

    // 2. 关联个人歌单 (一对多)
    // cascade = ALL 代表删除用户时，连带删除他的歌单
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Playlist> playlists = new ArrayList<>();

    // 3. 关联播放历史 (一对多，可选)
    // 通常历史记录较多，这里主要用于级联删除
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PlayHistory> playHistories = new ArrayList<>();
}