package com.example.NeteaseCloudMusic.service;

import com.example.NeteaseCloudMusic.Entity.AiReport;
import com.example.NeteaseCloudMusic.Entity.PlayHistory;
import com.example.NeteaseCloudMusic.Entity.User;
import com.example.NeteaseCloudMusic.Repository.AiReportRepository;
import com.example.NeteaseCloudMusic.Repository.PlayHistoryRepository;
import com.example.NeteaseCloudMusic.Repository.UserRepository;
import com.example.NeteaseCloudMusic.vo.SongVO;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AiPlaylistService {

    private final ChatModel chatModel;

    @Autowired
    private NeteaseMusicService musicService; // 复用现有的搜索服务

    @Autowired
    private AiReportRepository aiReportRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PlayHistoryRepository playHistoryRepository;

    @Autowired
    public AiPlaylistService(ChatModel chatClient) {
        this.chatModel = chatClient;
    }

    /**
     * 根据用户描述生成歌单
     */
    public List<SongVO> recommendSongsByPrompt(String userPrompt) {
        // 1. 精心设计的提示词 (Prompt Engineering)
        // 我们要求 AI 只返回歌名和歌手，用特殊符号分隔，方便程序解析
        String message = """
                你是一个专业的音乐 DJ。用户想听：{prompt}。
                请推荐 5 首最契合该场景的中文或英文歌曲。

                【严格的返回格式要求】：
                1. 不要包含任何开场白、序号或结束语。
                2. 每一首歌的格式必须是："歌名 歌手"。
                3. 歌曲之间用英文逗号 "," 分隔。

                例如：七里香 周杰伦, Hotel California Eagles, 晴天 周杰伦
                """;

        PromptTemplate template = new PromptTemplate(message);
        Prompt prompt = template.create(Map.of("prompt", userPrompt));

        // 2. 调用 DeepSeek API
        String response = chatModel.call(prompt).getResult().getOutput().getContent();
        System.out.println("🤖 AI 推荐结果: " + response); // 打印日志方便调试

        // 3. 解析结果并搜索真实歌曲
        String[] keywords = response.split(",");
        List<SongVO> playlist = new ArrayList<>();


        for (String keyword : keywords) {
            // 清理空格
            String cleanKeyword = keyword.trim();
            if (cleanKeyword.isEmpty()) continue;


            List<SongVO> searchResult = musicService.searchMusic(cleanKeyword);

            if (!searchResult.isEmpty()) {
                playlist.add(searchResult.get(0));
            }
        }

        return playlist;
    }

    public AiReport generateAndSaveReport(String phone, List<SongVO> history) {
        User user = userRepository.findByPhone(phone).orElseThrow(() -> new RuntimeException("用户不存在"));

        // 1. 增加校验：如果历史记录为空，直接抛出异常，避免发送无效数据给 AI
        if (history == null || history.isEmpty()) {
            throw new RuntimeException("由于您最近没有听歌记录，AI 无法生成分析报告，去听听歌再来吧！");
        }

        // 2.1 获取用户最近的一份报告
        List<AiReport> existingReports = aiReportRepository.findByUser_PhoneOrderByCreateTimeDesc(phone);

        if (!existingReports.isEmpty()) {
            AiReport lastReport = existingReports.get(0);

            // 2.2 获取用户最近的一次听歌记录时间
            List<PlayHistory> lastPlayHistory = playHistoryRepository.findByUser_PhoneOrderByPlayedTimeDesc(phone);

            if (!lastPlayHistory.isEmpty()) {
                PlayHistory latestSong = lastPlayHistory.get(0);

                // 2.3 比较时间：如果 最新报告时间 > 最新听歌时间，说明报告后没听过歌
                if (lastReport.getCreateTime().isAfter(latestSong.getPlayedTime())) {
                    // 抛出特定异常信息，前端根据这个文案弹窗
                    throw new IllegalArgumentException("NO_NEW_RECORDS");
                }
            }
        }

        // 构造听歌清单（取前 15 首）
        String songs = history.stream().limit(15)
                .map(s -> s.getTitle() + " - " + s.getArtist())
                .collect(Collectors.joining(", "));

        String prompt = "你是资深音乐分析师。根据用户听歌记录：[" + songs + "]，生成200字左右感性的听歌风格分析，"
                + "并在最后以'##推荐## 歌名-歌手, 歌名-歌手'格式推荐3首相似歌曲。"
                + "【注意】：推荐部分请严格使用英文逗号分隔，不要换行，不要添加序号。";

        // 2. 调用 AI 并增加响应结果的非空校验
        String response = chatModel.call(prompt);
        if (response == null || response.trim().isEmpty()) {
            throw new RuntimeException("AI 响应超时或生成报告失败，请稍后再试。");
        }

        // 3. 安全地解析报告正文与推荐歌曲
        String[] parts = response.split("##推荐##");
        AiReport report = new AiReport();
        report.setUser(user);

        // 即使 AI 未按预期格式返回分隔符，也确保程序不崩溃
        report.setContent(parts[0].trim());

        if (parts.length > 1) {
            report.setRecommendations(parts[1].trim());
        } else {
            // 兜底处理：若无推荐部分，设置默认值
            report.setRecommendations("暂无推荐歌曲");
        }

        return aiReportRepository.save(report);
    }
}