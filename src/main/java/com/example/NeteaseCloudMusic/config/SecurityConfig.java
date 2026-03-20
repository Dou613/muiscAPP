package com.example.NeteaseCloudMusic.config;

import com.example.NeteaseCloudMusic.filter.JwtAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.Collections;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * ✅ 关键修复点：配置 CorsConfigurationSource Bean
     * 明确允许携带 Session Cookie
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        // 允许所有来源（生产环境应替换为具体的前端域名）
        configuration.setAllowedOriginPatterns(Collections.singletonList("*"));

        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Collections.singletonList("*"));

        // 🚀 核心：允许发送凭证 (Session Cookie)
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Autowired
    private JwtAuthenticationFilter jwtAuthenticationFilter; // ✅ 注入 JWT 过滤器

    /**
     * 核心安全过滤链配置
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        // 1. 静态资源和公共接口 -> 允许所有
                        .requestMatchers(
                                "/", "/*.html", "/css/**", "/js/**", "/*.ico", "/*.png", "/uploads/**",
                                "/api/auth/**",  // 登录注册
                                "/api/data/**",  // 公共数据（搜索、榜单）
                                "/api/stream/**", // 播放流
                                "/error"
                        ).permitAll()

                        // 2. 跨域预检请求 -> 允许所有 (关键！)
                        .requestMatchers(HttpMethod.OPTIONS).permitAll()

                        // 3. 用户私人接口 -> 必须认证 (明确指定)
                        .requestMatchers("/api/user/**").authenticated()
                        .requestMatchers("/api/ai/**").authenticated()

                        // 4. 兜底规则
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}