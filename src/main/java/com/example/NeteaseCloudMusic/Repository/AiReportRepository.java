package com.example.NeteaseCloudMusic.Repository;

import com.example.NeteaseCloudMusic.Entity.AiReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AiReportRepository extends JpaRepository<AiReport, Long> {
    // 按手机号查询该用户的所有报告，时间倒序
    List<AiReport> findByUser_PhoneOrderByCreateTimeDesc(String phone);
}