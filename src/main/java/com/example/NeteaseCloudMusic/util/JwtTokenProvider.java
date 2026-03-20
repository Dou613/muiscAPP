package com.example.NeteaseCloudMusic.util;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;

// ⚠️ 删除了错误的 import static javax.crypto.Cipher.SECRET_KEY;

@Component
public class JwtTokenProvider {

    // ✅ 使用完整的 YAML 路径 jwt.secret-key 注入
    @Value("${jwt.secret-key}")
    private String secretKey;

    // ✅ 使用完整的 YAML 路径 jwt.expiration-time 注入
    @Value("${jwt.expiration-time}")
    private long expirationTime;

    /**
     * 获取签名密钥
     * 使用 Base64 解码注入的密钥字符串，创建 Key 对象。
     */
    private Key getSigningKey() {
        // 关键修改：使用注入的 this.secretKey 字段
        byte[] keyBytes = Decoders.BASE64.decode(this.secretKey);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    /**
     * 生成 JWT Token
     * @param phone 用户的手机号 (作为主体信息)
     * @return 生成的 JWT Token 字符串
     */
    public String createToken(String phone) {
        Date now = new Date();
        // 关键修改：使用注入的 expirationTime 字段
        Date expiryDate = new Date(now.getTime() + expirationTime);

        return Jwts.builder()
                .setSubject(phone) // 设置主体为用户的手机号
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    /**
     * 从 Token 中获取用户手机号
     */
    public String getPhoneFromToken(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();

        return claims.getSubject();
    }

    /**
     * 验证 Token 是否有效
     */
    public boolean validateToken(String authToken) {
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(authToken);
            return true;
        } catch (SecurityException | MalformedJwtException e) {
            System.err.println("Invalid JWT signature");
        } catch (ExpiredJwtException e) {
            System.err.println("Expired JWT token");
        } catch (UnsupportedJwtException e) {
            System.err.println("Unsupported JWT token");
        } catch (IllegalArgumentException e) {
            System.err.println("JWT claims string is empty");
        }
        return false;
    }
}