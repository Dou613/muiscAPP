package com.example.NeteaseCloudMusic.service;

import com.example.NeteaseCloudMusic.Entity.User;
import com.example.NeteaseCloudMusic.Entity.UserProfile;
import com.example.NeteaseCloudMusic.Repository.UserProfileRepository;
import com.example.NeteaseCloudMusic.Repository.UserRepository;
import com.example.NeteaseCloudMusic.dto.UserUpdateRequest;
import com.example.NeteaseCloudMusic.util.JwtTokenProvider;
import com.example.NeteaseCloudMusic.vo.UserVO;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder; // 密码加密工具

    @Autowired
    private JwtTokenProvider tokenProvider; // ✅ 注入 JWT 工具类

    @Autowired
    private UserProfileRepository userProfileRepository; // ✅ 新增注入

    /**
     * 用户注册 (同时创建 User 和 UserProfile)
     */
    @Transactional
    public User register(String phone, String password, String username) {
        if (userRepository.findByPhone(phone).isPresent()) {
            throw new RuntimeException("手机号 " + phone + " 已被注册");
        }

        // 1. 创建账户信息
        User newUser = new User();
        newUser.setPhone(phone);
        newUser.setPassword(passwordEncoder.encode(password));

        // 2. 创建个人资料信息
        UserProfile newProfile = new UserProfile();
        newProfile.setUsername(username);
        newProfile.setAvatarUrl("placeholder.png"); // 设置默认头像
        newProfile.setUser(newUser); // 建立双向关联

        // 3. 关联并保存
        // 由于配置了 CascadeType.ALL，保存 User 会自动保存 Profile
        newUser.setProfile(newProfile);

        return userRepository.save(newUser);
    }

    /**
     * 获取用户信息 VO (需要合并两张表的数据)
     */
    public UserVO getUserProfileByPhone(String phone) {
        // 1. 先查 User 获取 ID
        User user = userRepository.findByPhone(phone)
                .orElseThrow(() -> new RuntimeException("用户不存在或未登录"));

        // 2. 获取关联的 Profile (懒加载生效)
        UserProfile profile = user.getProfile();

        if (profile == null) {
            // 极少情况：只有账号没有资料，创建一个空的防止报错
            profile = new UserProfile();
        }

        // 3. 转换数据
        return convertToUserVO(user, profile);
    }

    /**
     * 登录该网站的本地账号 (仅本地校验)
     * @return 登录成功的 User 对象
     * @throws RuntimeException 登录失败
     */
    @Transactional
    public User login(String phone, String password) {
        // 1. 本地用户校验
        User localUser = userRepository.findByPhone(phone)
                .orElseThrow(() -> new RuntimeException("用户不存在或手机号错误"));

        // 校验本地密码
        if (!passwordEncoder.matches(password, localUser.getPassword())) {
            throw new RuntimeException("密码错误");
        }

        // 登录成功，返回本地用户对象
        return localUser;
    }

    /**
     * ✅ 新增：登录成功后生成 Token
     * @return 生成的 JWT Token 字符串
     */
    public String generateToken(String phone) {
        return tokenProvider.createToken(phone);
    }

    /**
     * 更新用户个人信息 (操作 UserProfile 表)
     */
    @Transactional
    public User updateUserProfile(String phone, UserUpdateRequest request) {
        // 1. 查 User
        User user = userRepository.findByPhone(phone)
                .orElseThrow(() -> new RuntimeException("用户不存在"));

        // 2. 获取 Profile
        UserProfile profile = user.getProfile();
        if (profile == null) {
            profile = new UserProfile();
            profile.setUser(user);
            user.setProfile(profile);
        }

        // 3. 更新字段 (仅更新 Profile 表字段)
        if (request.getAvatarUrl() != null) profile.setAvatarUrl(request.getAvatarUrl());
        if (request.getUsername() != null && !request.getUsername().isEmpty()) profile.setUsername(request.getUsername());
        if (request.getGender() != null) profile.setGender(request.getGender());
        if (request.getBirthday() != null) profile.setBirthday(request.getBirthday());
        if (request.getLocation() != null) profile.setLocation(request.getLocation());
        if (request.getSignature() != null) profile.setSignature(request.getSignature());

        // 4. 保存 (Spring Data JPA 会自动检测变化并更新)
        userRepository.save(user);
        return user;
    }

    /**
     * 辅助方法：将 User + UserProfile 合并转换为 UserVO
     */
    private UserVO convertToUserVO(User user, UserProfile profile) {
        UserVO vo = new UserVO();

        // 来自 User 表
        vo.setId(user.getId());
        vo.setPhone(user.getPhone());

        // 来自 UserProfile 表
        if (profile != null) {
            vo.setUsername(profile.getUsername());
            vo.setAvatarUrl(profile.getAvatarUrl());
            vo.setGender(profile.getGender());
            vo.setBirthday(profile.getBirthday());
            vo.setLocation(profile.getLocation());
            vo.setSignature(profile.getSignature());
        }

        return vo;
    }

    // 重载旧方法以兼容旧代码 (Login 接口可能调用)
    private UserVO convertToUserVO(User user) {
        return convertToUserVO(user, user.getProfile());
    }
}