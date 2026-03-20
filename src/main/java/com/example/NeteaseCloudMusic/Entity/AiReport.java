package com.example.NeteaseCloudMusic.Entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "ai_report")
@Data
public class AiReport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @Column(columnDefinition = "TEXT")
    private String content; // 报告正文

    @Column(columnDefinition = "TEXT")
    private String recommendations; // 推荐歌曲名（格式：歌名-歌手, ...）

    private LocalDateTime createTime = LocalDateTime.now();
}