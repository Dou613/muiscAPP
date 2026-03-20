package com.example.NeteaseCloudMusic.Repository;

import com.example.NeteaseCloudMusic.Entity.UserProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UserProfileRepository extends JpaRepository<UserProfile, Long> {
    // 由于 ID 共享，我们可以直接通过 ID 查找 Profile
    // 也可以根据需要添加 findByUsername 等方法
}