package com.example.NeteaseCloudMusic.Entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "play_history", uniqueConstraints = {
        // 确保同一用户对同一首歌只有一条记录
        @UniqueConstraint(columnNames = {"user_id", "songId"})
})
@Data
@NoArgsConstructor
@ToString(exclude = "user")
@EntityListeners(AuditingEntityListener.class)
public class PlayHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ✅ 修改：回归标准的 user_id 关联，更加稳定
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // 网易云歌曲 ID
    @Column(nullable = false)
    private Long songId;

    // ✅ 已包含：歌曲元数据快照
    private String title;
    private String artist;
    private String album;

    @Column(length = 500)
    private String coverUrl;

    private Long duration;

    @LastModifiedDate
    @Column(nullable = false)
    private LocalDateTime playedTime;
}