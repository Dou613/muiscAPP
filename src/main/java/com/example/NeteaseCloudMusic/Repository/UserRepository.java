package com.example.NeteaseCloudMusic.Repository;


import com.example.NeteaseCloudMusic.Entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * 根据手机号查询用户（用于登录和注册检查）
     */
    Optional<User> findByPhone(String phone);

    // 如果需要，可以添加其他查询方法，例如 findByUsername
}