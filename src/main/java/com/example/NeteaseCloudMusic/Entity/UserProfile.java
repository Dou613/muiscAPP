package com.example.NeteaseCloudMusic.Entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

@Entity
@Table(name = "user_profile")
@Data
@NoArgsConstructor
@ToString(exclude = "user")
public class UserProfile {

    @Id
    private Long id; // 共享 User 的 ID

    @OneToOne
    @MapsId
    @JoinColumn(name = "user_id")
    private User user;

    @Column(length = 50)
    private String username;

    @Column(columnDefinition = "TEXT")
    private String avatarUrl;

    private String gender;
    private String birthday;
    private String location;

    @Column(length = 500)
    private String signature;
}