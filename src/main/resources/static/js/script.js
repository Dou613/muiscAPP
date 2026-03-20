// script.js

// ======================= 全局常量和变量 =======================
const API_BASE = '/api/data';
const contentTitle = document.getElementById('contentTitle');
const contentList = document.getElementById('contentList');
const refreshBtn = document.getElementById('refreshBtn');

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const audioPlayer = document.getElementById('audioPlayer');
const playerCover = document.getElementById('playerCover');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');

// 头部用户信息 DOM 引用
const headerAvatar = document.getElementById('headerAvatar');
const headerNickname = document.getElementById('headerNickname');

// 歌词相关元素引用
const lyricDisplay = document.getElementById('lyricDisplay');
const currentLyricText = document.getElementById('currentLyricText');
const lyricModal = document.getElementById('lyricModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalSongTitle = document.getElementById('modalSongTitle');
const fullLyricTextContainer = document.getElementById('fullLyricText');
let currentHighlightedLyric = null; // 用于追踪当前高亮的模态框歌词元素

// 播放列表和播放控制相关元素
const prevSongBtn = document.getElementById('prevSongBtn');
const nextSongBtn = document.getElementById('nextSongBtn');
const playbackModeBtn = document.getElementById('playbackModeBtn');
const playbackModeOptions = document.getElementById('playbackModeOptions');
const togglePlaylistBtn = document.getElementById('togglePlaylistBtn');
const miniPlaylist = document.getElementById('miniPlaylist');
const miniPlaylistSongs = document.getElementById('miniPlaylistSongs');
const closeMiniPlaylistBtn = document.getElementById('closeMiniPlaylistBtn');
const editPlaylistBtn = document.getElementById('editPlaylistBtn');
const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');
const playlistManagementPage = document.getElementById('playlistManagementPage');
const fullPlaylistSongs = document.getElementById('fullPlaylistSongs');
const clearAllSongsBtn = document.getElementById('clearAllSongsBtn');
const mainContent = document.querySelector('.main-content');

// 个人资料 DOM 引用
const profileView = document.getElementById('profileView');
const profileForm = document.getElementById('profileForm');
const profileMessage = document.getElementById('profileMessage');
const profileCurrentAvatar = document.getElementById('profileCurrentAvatar');
const avatarFileInput = document.getElementById('avatarFileInput'); // 用于打开文件目录的隐藏输入框引用

const AppState = {
    playlistTab: 'custom', // custom | collected
    userPlaylists: [], // 缓存自建歌单
    favPlaylists: [] ,// 缓存收藏歌单
    likedSongIds: new Set()
};
// 用于记录推荐页面是否已加载的标记
let isRecommendationLoaded = false;

// 播放状态变量 (扩展)
let currentPlaylist = []; // 存储 SongVO 对象的数组
let currentSongIndex = -1; // 当前播放歌曲在 currentPlaylist 中的索引
// 播放模式: 'sequential' (顺序), 'loop-all' (列表循环), 'loop-one' (单曲循环), 'shuffle' (随机)
let playbackMode = 'sequential';
let shuffledPlaylist = []; // 随机播放模式下的歌单副本 (存储 SongVO 对象)
let currentPlayingSongId = null;
let currentPlayingSongTitle = '未播放';
let parsedLyrics = [];
// 跟踪当前视图类型，防止重复加载
let currentViewType = 'discover';
// 搜索相关状态
let searchHistory = JSON.parse(localStorage.getItem('search_history') || '[]');
let currentSearchType = 1; // 1:歌曲, 100:歌手, 1000:歌单
let currentSearchKeyword = '';
let syncTimer = null;

// ✅ 上传到云端 (带防抖)
function syncQueueToCloud() {
    if (!localStorage.getItem('authToken')) return; // 未登录忽略

    if (syncTimer) clearTimeout(syncTimer);

    // 延迟2秒执行，避免拖拽排序时疯狂发请求
    syncTimer = setTimeout(async () => {
        try {
            // 前端也做一次去重，虽然 Service 层有兜底
            const uniquePlaylist = [];
            const ids = new Set();
            for(let s of currentPlaylist) {
                if(!ids.has(s.songId)) {
                    uniquePlaylist.push(s);
                    ids.add(s.songId);
                }
            }
            // ✅ 修改：发送对象结构，包含索引
                        const payload = {
                            songs: uniquePlaylist,
                            currentIndex: currentSongIndex // 把当前听到的位置也传上去
                        };

            await authenticatedFetch('/api/user/music/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(uniquePlaylist)
            });
            console.log("☁️ 播放队列已同步到云端");
        } catch (e) {
            console.warn("同步失败", e);
        }
    }, 2000);
}

// ✅ 从云端拉取 (覆盖本地)
async function fetchQueueFromCloud() {
    if (!localStorage.getItem('authToken')) return;

    try {
        const res = await authenticatedFetch('/api/user/music/queue');
        if (res.ok) {
            const data = await res.json();

            // ✅ 兼容处理：检查返回的是数组(旧)还是对象(新)
            let cloudSongs = [];
            let cloudIndex = 0;

            if (Array.isArray(data)) {
                cloudSongs = data; // 旧接口兼容
            } else {
                cloudSongs = data.songs || [];
                cloudIndex = data.currentIndex || 0;
            }

            // 如果云端有数据
            if (cloudSongs && cloudSongs.length > 0) {
                console.log(`☁️ 从云端同步：${cloudSongs.length} 首歌曲，当前播放第 ${cloudIndex+1} 首`);

                currentPlaylist = cloudSongs;
                currentSongIndex = cloudIndex;

                // 边界检查
                if (currentSongIndex >= currentPlaylist.length) currentSongIndex = 0;

                // 更新列表 UI
                renderMiniPlaylist();
                renderFullPlaylist();
                localStorage.setItem('currentPlaylist', JSON.stringify(currentPlaylist));
                localStorage.setItem('currentSongIndex', currentSongIndex);

                // ✅ 核心步骤：更新播放器界面显示为云端记录的歌曲 (但不自动播放，避免吓到用户)
                const song = currentPlaylist[currentSongIndex];
                if (song) {
                    playerTitle.textContent = song.title || '未知标题';
                    playerArtist.textContent = song.artist || '未知歌手';
                    playerCover.src = song.coverUrl || 'placeholder.png';
                    // 记录ID用于高亮
                    currentPlayingSongId = song.songId;

                    // 加载音频源但不播放 (preload)
                    const token = localStorage.getItem('authToken');
                    const src = `/api/stream/${song.songId}` + (token ? `?token=${encodeURIComponent(token)}` : '');
                    if(audioPlayer.src !== window.location.origin + src) { // 防止重复加载
                         audioPlayer.src = src;
                    }

                    // 如果需要显示歌词
                    fetchAndDisplayLyric(song.songId, `${song.title} - ${song.artist}`);
                }

            } else if (currentPlaylist.length > 0) {
                // 本地有，云端无 -> 初始化上传
                syncQueueToCloud();
            }
        }
    } catch (e) {
        console.error("拉取云端队列失败", e);
    }
}
/**
 * 随机打乱数组 (Fisher-Yates Shuffle)
 * 用于让推荐内容每次刷新都不一样
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
let toastTimer = null;

/**
 * 显示自动消失的 Toast 提示
 * @param {string} msg - 提示内容
 * @param {string} type - 类型: 'info'(默认), 'success', 'error', 'warning'
 */
function showToast(msg, type = 'info') {
    const toast = document.getElementById('commonToast');
    const msgEl = document.getElementById('commonToastMsg');
    const iconEl = document.getElementById('commonToastIcon');

    if (!toast || !msgEl || !iconEl) return;

    // 1. 设置内容
    msgEl.textContent = msg;

    // 2. 设置图标样式
    switch(type) {
        case 'success': iconEl.className = 'fas fa-check-circle'; break;
        case 'error':   iconEl.className = 'fas fa-times-circle'; break;
        case 'warning': iconEl.className = 'fas fa-exclamation-circle'; break;
        default:        iconEl.className = 'fas fa-info-circle';
    }

    // 3. 应用样式并显示
    // 先移除旧的类型类，再添加新的
    toast.className = `common-toast show ${type}`;

    // 4. 重置定时器 (防止连续点击时闪烁)
    if (toastTimer) clearTimeout(toastTimer);

    // 5. 3秒后自动隐藏
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 1000);
}
/**
 * ✅ 新增：获取所有“我喜欢的音乐”ID，用于全局状态同步
 */
async function fetchLikedSongs() {
    if (!localStorage.getItem('authToken')) return;
    try {
        // 1. 获取所有歌单
        const res = await authenticatedFetch('/api/user/music/playlists');
        if (!res.ok) return;
        const playlists = await res.json();

        // 2. 找到默认歌单 ("我喜欢的音乐")
        const favPlaylist = playlists.find(p => p.defaultPlaylist);

        if (favPlaylist) {
            // 3. 获取歌单详情 (包含所有歌曲)
            const detailRes = await authenticatedFetch(`/api/user/music/playlist/${favPlaylist.id}`);
            if (detailRes.ok) {
                const detail = await detailRes.json();
                // 4. 更新全局 Set
                AppState.likedSongIds.clear();
                if (detail.songs) {
                    detail.songs.forEach(s => AppState.likedSongIds.add(s.songId));
                }
                console.log(`已同步 ${AppState.likedSongIds.size} 首喜欢的歌曲`);
            }
        }
    } catch (e) {
        console.error("加载喜欢列表失败", e);
    }
}
// ======================= 安全检查 (checkLogin) =======================

/**
 * ✅ 核心函数：发送带 Token 的请求
 * 自动添加 Authorization 头，处理 401 过期
 */
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');

    if (!token) {
        alert('认证信息缺失，请重新登录。');
        window.location.href = 'auth.html';
        return { ok: false, status: 401, json: async () => ({}) };
    }

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}` // ⬅️ 关键：将 Token 放入头部
    };

    delete options.credentials;

    try {
        const response = await fetch(url, options);

        if (response.status === 401 || response.status === 403) {
            console.warn('Token 失效或无权访问');
            alert('登录已过期，请重新登录');
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            window.location.href = 'auth.html';
            return response;
        }

        return response;
    } catch (error) {
        throw error;
    }
}

/**
 * 1. 检查登录状态（简化，只检查是否存在本地数据，如果不存在则跳转）
 */
function checkLogin() {
    const userJson = localStorage.getItem('user');
    if (!userJson) {
        window.location.href = 'auth.html';
    }
}

// ======================= 辅助函数：LocalStorage 持久化 =======================

function savePlaybackState() {
    localStorage.setItem('currentPlaylist', JSON.stringify(currentPlaylist));
    localStorage.setItem('currentSongIndex', currentSongIndex);
    localStorage.setItem('playbackMode', playbackMode);
    localStorage.setItem('currentPlayingSongId', currentPlayingSongId);
    localStorage.setItem('currentPlayingSongTitle', currentPlayingSongTitle);

// ✅ 新增：任何改变（添加/删除/排序）都触发同步
    syncQueueToCloud();
}

/**
 * 核心：加载用户昵称和头像到 Header (右上角)
 */
function loadUserHeaderInfo() {
    const userJson = localStorage.getItem('user');
    let user = null;

    if (userJson) {
        try {
            user = JSON.parse(userJson);
        } catch (e) {
            console.error("解析用户数据失败:", e);
        }
    }

    if (user) {
        const nickname = user.username || user.phone || '用户未设置昵称';
        let avatarUrl = user.avatarUrl;
        if (!avatarUrl || avatarUrl === 'null' || avatarUrl.trim() === '') {
            avatarUrl = 'placeholder.png';
        }
        headerNickname.textContent = nickname;
        headerAvatar.src = avatarUrl;
        headerAvatar.onerror = function() { this.onerror = null; this.src = 'placeholder.png'; };

        const logoutItem = document.querySelector('.menu-item[data-content="logout"]');
        if (logoutItem) {
            logoutItem.innerHTML = '<i class="fas fa-sign-out-alt"></i> 退出登录';
            logoutItem.setAttribute('data-content', 'logout');
        }

    } else {
        headerNickname.textContent = '请登录';
        headerAvatar.src = 'placeholder.png';
        headerNickname.style.cursor = 'pointer';
        headerNickname.onclick = () => { window.location.href = 'auth.html'; };

        const logoutItem = document.querySelector('.menu-item[data-content="logout"]');
        if (logoutItem) {
            logoutItem.innerHTML = '<i class="fas fa-sign-in-alt"></i> 立即登录';
            logoutItem.setAttribute('data-content', 'login');
            logoutItem.onclick = (e) => { e.preventDefault(); window.location.href = 'auth.html'; };
        }
    }
}

function loadPlaybackState() {
    const savedPlaylist = localStorage.getItem('currentPlaylist');
    const savedIndex = localStorage.getItem('currentSongIndex');
    const savedMode = localStorage.getItem('playbackMode');

    // 1. 恢复播放列表
    if (savedPlaylist) {
        try {
            currentPlaylist = JSON.parse(savedPlaylist);
            // 确保是数组，防止脏数据
            if (!Array.isArray(currentPlaylist)) {
                currentPlaylist = [];
            }
        } catch (e) {
            console.error("解析本地缓存播放列表失败:", e);
            currentPlaylist = [];
        }
    } else {
        currentPlaylist = [];
    }

    // 2. 恢复播放模式
    if (savedMode) {
        playbackMode = savedMode;
        updatePlaybackModeIcon();
    }

    // 3. 恢复索引
    if (savedIndex !== null) {
        currentSongIndex = parseInt(savedIndex, 10);
    } else {
        currentSongIndex = 0;
    }

    // ================== 核心修复逻辑 ==================

    // 情况 A：列表为空
    if (currentPlaylist.length === 0) {
        currentSongIndex = 0;
        // 重置播放器 UI 显示默认状态
        playerTitle.textContent = "我的音乐云";
        playerArtist.textContent = "听你想听";
        playerCover.src = "placeholder.png";
        renderMiniPlaylist(); // 清空列表 UI
        return; // 结束执行
    }

    // 情况 B：索引越界（比如之前有10首，现在只有5首，但索引还是9）
    if (currentSongIndex < 0 || currentSongIndex >= currentPlaylist.length) {
        console.warn("检测到播放索引越界，已自动重置为第一首");
        currentSongIndex = 0;
        localStorage.setItem('currentSongIndex', 0); // 更新缓存
    }

    // 情况 C：正常恢复
    const currentSong = currentPlaylist[currentSongIndex];
    if (currentSong) {
        // 恢复播放器栏的信息
        playerTitle.textContent = currentSong.title || "未知标题";
        playerArtist.textContent = currentSong.artist || "未知歌手";
        playerCover.src = currentSong.coverUrl || "placeholder.png";

        // 记录 ID 供后续使用
        currentPlayingSongId = currentSong.songId;
        currentPlayingSongTitle = `${currentSong.title} - ${currentSong.artist}`;

        // ✅ 修复点：直接调用渲染函数，它们会自动处理高亮，不需要 highlightCurrentSong()
        renderMiniPlaylist();
        renderFullPlaylist();
    }
    // ================================================
}

// ======================= 歌词解析和同步 =======================

function parseLrc(lyricText) {
    const lines = lyricText.split('\n');
    const lyrics = [];
    const timeRegExp = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

    lines.forEach(line => {
        timeRegExp.lastIndex = 0;
        let text = line.replace(timeRegExp, '').trim();

        if (!text || text.startsWith('作词') || text.startsWith('作曲')) {
            return;
        }

        const timestamps = [];
        timeRegExp.lastIndex = 0;
        let match;
        while ((match = timeRegExp.exec(line)) !== null) {
            const minute = parseInt(match[1], 10);
            const second = parseInt(match[2], 10);
            let millisecond = parseInt(match[3], 10);

            if (match[3].length === 2) {
                millisecond *= 10;
            }

            const time = minute * 60 * 1000 + second * 1000 + millisecond;
            timestamps.push(time);
        }

        timestamps.forEach(time => {
            lyrics.push({ time, text });
        });
    });

    lyrics.sort((a, b) => a.time - b.time);
    return lyrics;
}

function syncLyric() {
    const currentTime = audioPlayer.currentTime * 1000;
    let currentLineText = '';
    let currentLineIndex = -1;

    for (let i = 0; i < parsedLyrics.length; i++) {
        const lyric = parsedLyrics[i];
        const nextLyric = parsedLyrics[i + 1];

        if (currentTime >= lyric.time && (!nextLyric || currentTime < nextLyric.time)) {
            currentLineText = lyric.text;
            currentLineIndex = i;
            break;
        }
    }

    if (currentLineText && currentLineText !== currentLyricText.textContent) {
        currentLyricText.textContent = currentLineText;
        currentLyricText.classList.remove('placeholder-lyric');
    } else if (!currentLineText && audioPlayer.paused === false) {
        if (currentLyricText.textContent !== '♪ 间奏中... ♪') {
            currentLyricText.textContent = '♪ 间奏中... ♪';
            currentLyricText.classList.add('placeholder-lyric');
        }
    }

    if (lyricModal.style.display === 'flex' && currentLineIndex !== -1) {
        const oldIndex = currentHighlightedLyric ? parseInt(currentHighlightedLyric.getAttribute('data-index'), 10) : -2;
        if (currentLineIndex !== oldIndex) {
            highlightModalLyric(currentLineIndex);
        }
    }
}

function highlightModalLyric(index) {
    if (!fullLyricTextContainer) return;

    const lyricItem = fullLyricTextContainer.querySelector(`[data-index="${index}"]`);

    if (currentHighlightedLyric) {
        currentHighlightedLyric.classList.remove('highlight');
    }

    if (lyricItem) {
        lyricItem.classList.add('highlight');
        currentHighlightedLyric = lyricItem;

        const containerHeight = fullLyricTextContainer.clientHeight;
        const itemOffset = lyricItem.offsetTop;
        fullLyricTextContainer.scrollTop = itemOffset - containerHeight / 2 + lyricItem.clientHeight / 2;
    }
}

async function fetchAndDisplayLyric(songId, songTitle) {
    currentLyricText.textContent = '正在获取歌词...';
    currentLyricText.classList.remove('placeholder-lyric');
    parsedLyrics = [];
    audioPlayer.removeEventListener('timeupdate', syncLyric);

    if (fullLyricTextContainer) fullLyricTextContainer.innerHTML = '正在加载歌词...';
    currentHighlightedLyric = null;

    try {
        const url = `${API_BASE}/lyric?songId=${songId}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`请求失败，状态码: ${response.status}`);
        }

        const lyricData = await response.json();
        const rawLyricText = lyricData.lyric || null;

        if (rawLyricText) {
            parsedLyrics = parseLrc(rawLyricText);

            if (fullLyricTextContainer) {
                fullLyricTextContainer.innerHTML = '';
                parsedLyrics.forEach((lyric, index) => {
                    const p = document.createElement('p');
                    p.textContent = lyric.text || ' ';
                    p.setAttribute('data-time', lyric.time);
                    p.setAttribute('data-index', index);
                    p.onclick = () => {
                        audioPlayer.currentTime = lyric.time / 1000;
                        if (audioPlayer.paused) {
                            audioPlayer.play();
                        }
                        highlightModalLyric(index);
                    };
                    fullLyricTextContainer.appendChild(p);
                });
            }

            const initialText = parsedLyrics.length > 0 ? parsedLyrics[0].text : '（暂无歌词同步）';
            currentLyricText.textContent = initialText;
            audioPlayer.addEventListener('timeupdate', syncLyric);
        } else {
            currentLyricText.textContent = lyricData.message || '暂无歌词信息';
            currentLyricText.classList.add('placeholder-lyric');
            if (fullLyricTextContainer) fullLyricTextContainer.innerHTML = `<div style="padding: 20px; color: var(--light-text-color);">${lyricData.message || '抱歉，未能获取到该歌曲的歌词。'}</div>`;
        }
    } catch (error) {
        console.error('获取歌词失败:', error);
        currentLyricText.textContent = '获取歌词失败';
        currentLyricText.classList.add('placeholder-lyric');
        if (fullLyricTextContainer) fullLyricTextContainer.innerHTML = `<div style="padding: 20px; color: #F56C6C;">获取歌词服务内部错误: ${error.message}</div>`;
    }
}

function showLyricModal() {
    if (currentPlayingSongTitle === '未播放' || currentLyricText.textContent === '获取歌词失败') return;
    modalSongTitle.textContent = currentPlayingSongTitle;
    lyricModal.style.display = 'flex';

    if (audioPlayer.paused === false) {
        syncLyric();
    }
}

function hideLyricModal() {
    lyricModal.style.display = 'none';
}




// ======================= 播放列表操作与播放控制 =======================

function playSong(song, addToPlaylist = true, indexInPlaylist = -1) {
    if (addToPlaylist) {
        const existingIndex = currentPlaylist.findIndex(s => s.songId === song.songId);
        if (existingIndex === -1) {
            currentPlaylist.push(song);
            currentSongIndex = currentPlaylist.length - 1;
        } else {
            currentSongIndex = existingIndex;
        }
    } else if (indexInPlaylist !== -1) {
        currentSongIndex = indexInPlaylist;
    } else {
        return;
    }

    const songToPlay = currentPlaylist[currentSongIndex];
    if (!songToPlay) {
        return;
    }

    currentPlayingSongId = songToPlay.songId;
    currentPlayingSongTitle = `${songToPlay.title} - ${songToPlay.artist}`;

    playerTitle.textContent = songToPlay.title;
    playerArtist.textContent = songToPlay.artist;
    playerCover.src = songToPlay.coverUrl || 'placeholder.png';
    playerCover.onerror = function() {
        this.onerror = null;
        this.src = 'placeholder.png';
    };

    fetchAndDisplayLyric(songToPlay.songId, currentPlayingSongTitle);

   // 1. 设置音频源
       const token = localStorage.getItem('authToken');
       if (token) {
           audioPlayer.src = `/api/stream/${songToPlay.songId}?token=${encodeURIComponent(token)}`;
       } else {
           audioPlayer.src = `/api/stream/${songToPlay.songId}`;
       }

       // 2.  增强的播放错误处理
       const playPromise = audioPlayer.play();

       if (playPromise !== undefined) {
           playPromise.catch(error => {
               // 忽略切歌导致的 AbortError
               if (error.name === 'AbortError') return;

               console.error("Audio playback failed:", error);

               // 🎵 核心修改：判断是不是后端返回了 404 或 403
               // 这里的 NotSupportedError 通常意味着后端没有返回音频流，而是返回了错误页面
               if (error.name === 'NotSupportedError' || error.message.includes('supported source')) {
                   showToast(`无法播放 "${songToPlay.title}" (可能是VIP/无版权)`, 'error');

                   // 自动切下一首
                    //setTimeout(() => playNext(), 2000);
               } else {
                   showToast("播放出错，请检查网络", 'error');
               }
           });
       }

    recordPlayHistory(songToPlay);

    renderMiniPlaylist();
    renderFullPlaylist();
    savePlaybackState();
}

function shufflePlaylist() {
    if (currentPlaylist.length === 0) return;

    shuffledPlaylist = [...currentPlaylist];
    for (let i = shuffledPlaylist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPlaylist[i], shuffledPlaylist[j]] = [shuffledPlaylist[j], shuffledPlaylist[i]];
    }
}

function playNext() {
    if (currentPlaylist.length === 0) return;

    let targetSong = null;
    let newIndex = -1;

    if (playbackMode === 'shuffle') {
        if (shuffledPlaylist.length === 0) shufflePlaylist();

        const currentShuffleIndex = shuffledPlaylist.findIndex(s => s.songId === currentPlayingSongId);
        let nextShuffleIndex;

        if (currentShuffleIndex < shuffledPlaylist.length - 1) {
            nextShuffleIndex = currentShuffleIndex + 1;
        } else {
            nextShuffleIndex = 0;
            shufflePlaylist();
        }

        targetSong = shuffledPlaylist[nextShuffleIndex];
        newIndex = currentPlaylist.findIndex(s => s.songId === targetSong.songId);
    } else {
        newIndex = currentSongIndex + 1;

        if (newIndex >= currentPlaylist.length) {
            if (playbackMode === 'loop-all') {
                newIndex = 0;
            } else if (playbackMode === 'sequential') {
                audioPlayer.pause();
                audioPlayer.src = '';
                currentSongIndex = -1;
                renderMiniPlaylist();
                savePlaybackState();
                return;
            } else {
                newIndex = currentPlaylist.length - 1;
            }
        }
        targetSong = currentPlaylist[newIndex];
    }

    if (targetSong) {
        playSong(targetSong, false, newIndex);
    }
}

function playPrev() {
    if (currentPlaylist.length === 0) return;

    let targetSong = null;
    let newIndex = -1;

    if (playbackMode === 'shuffle') {
        if (shuffledPlaylist.length === 0) shufflePlaylist();

        const currentShuffleIndex = shuffledPlaylist.findIndex(s => s.songId === currentPlayingSongId);
        let prevShuffleIndex;

        if (currentShuffleIndex > 0) {
            prevShuffleIndex = currentShuffleIndex - 1;
        } else {
            prevShuffleIndex = shuffledPlaylist.length - 1;
        }

        targetSong = shuffledPlaylist[prevShuffleIndex];
        newIndex = currentPlaylist.findIndex(s => s.songId === targetSong.songId);

    } else {
        newIndex = currentSongIndex - 1;
        if (newIndex < 0) {
            if (playbackMode === 'loop-all') {
                newIndex = currentPlaylist.length - 1;
            } else {
                newIndex = 0;
            }
        }
        targetSong = currentPlaylist[newIndex];
    }

    if (targetSong) {
        playSong(targetSong, false, newIndex);
    }
}

function handleSongEnded() {
    if (playbackMode === 'loop-one') {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    } else {
        playNext();
    }
}

function changePlaybackMode(mode) {
    playbackMode = mode;
    updatePlaybackModeIcon();
    savePlaybackState();
    playbackModeOptions.style.display = 'none';
    if (playbackMode === 'shuffle') {
        shufflePlaylist();
    }
}

function updatePlaybackModeIcon() {
    const icon = playbackModeBtn.querySelector('i');
    const modeMap = {
        'loop-one': { icon: 'fas fa-redo-alt', title: '单曲循环' },
        'shuffle': { icon: 'fas fa-random', title: '随机播放' },
        'loop-all': { icon: 'fas fa-sync-alt', title: '列表循环' },
        'sequential': { icon: 'fas fa-stream', title: '顺序播放' }
    };
    const modeInfo = modeMap[playbackMode] || modeMap['sequential'];
    icon.className = modeInfo.icon;
    playbackModeBtn.title = modeInfo.title;
}

// ======================= 拖拽排序逻辑 =======================
let dragSrcEl = null;
let dragListType = null;

function reorderPlaylist(sourceIndex, targetIndex) {
    if (sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0 || targetIndex > currentPlaylist.length) return;

    const [removed] = currentPlaylist.splice(sourceIndex, 1);
    currentPlaylist.splice(targetIndex, 0, removed);

    if (currentSongIndex === sourceIndex) {
        currentSongIndex = targetIndex;
    } else if (sourceIndex < currentSongIndex && targetIndex <= currentSongIndex) {
        currentSongIndex--;
    } else if (sourceIndex > currentSongIndex && targetIndex >= currentSongIndex) {
        currentSongIndex++;
    }

    if (playbackMode === 'shuffle') {
        shufflePlaylist();
    }

    savePlaybackState();
}

function handleDragStart(e) {
    dragSrcEl = e.target;
    dragSrcEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.getAttribute('data-index'));

    if (e.target.closest('#miniPlaylistSongs')) {
        dragListType = 'mini';
    } else if (e.target.closest('#fullPlaylistSongs')) {
        dragListType = 'full';
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetEl = e.target.closest(dragListType === 'mini' ? '#miniPlaylistSongs li' : '#fullPlaylistSongs li');

    const listContainer = targetEl?.parentElement;
    if (listContainer) {
        listContainer.querySelectorAll('li').forEach(item => item.classList.remove('drop-target-top', 'drop-target-bottom'));
    }

    if (targetEl && targetEl !== dragSrcEl && targetEl.getAttribute('data-index') !== null) {
        const rect = targetEl.getBoundingClientRect();
        const halfHeight = rect.height / 2;
        if (e.clientY - rect.top < halfHeight) {
            targetEl.classList.add('drop-target-top');
        } else {
            targetEl.classList.add('drop-target-bottom');
        }
    }
}

function handleDragLeave(e) {
    e.target.closest('li')?.classList.remove('drop-target-top', 'drop-target-bottom');
}

function handleDrop(e) {
    e.preventDefault();

    const dropTargetEl = e.target.closest(dragListType === 'mini' ? '#miniPlaylistSongs li' : '#fullPlaylistSongs li');
    document.querySelectorAll('#miniPlaylistSongs li, #fullPlaylistSongs li').forEach(item => item.classList.remove('drop-target-top', 'drop-target-bottom'));

    if (dragSrcEl !== dropTargetEl && dropTargetEl && dropTargetEl.getAttribute('data-index') !== null) {
        const sourceIndex = parseInt(dragSrcEl.getAttribute('data-index'), 10);
        let targetIndex = parseInt(dropTargetEl.getAttribute('data-index'), 10);

        const rect = dropTargetEl.getBoundingClientRect();
        const halfHeight = rect.height / 2;
        const dropBefore = e.clientY - rect.top < halfHeight;

        if (!dropBefore) {
            targetIndex = targetIndex + 1;
        }

        if (sourceIndex < targetIndex) {
            targetIndex--;
        }

        if (sourceIndex !== targetIndex) {
            reorderPlaylist(sourceIndex, targetIndex);

            if (dragListType === 'mini') {
                renderMiniPlaylist();
            } else {
                renderFullPlaylist();
            }
        }
    }
}

function handleDragEnd(e) {
    dragSrcEl.classList.remove('dragging');
    document.querySelectorAll('#miniPlaylistSongs li, #fullPlaylistSongs li').forEach(item => item.classList.remove('drop-target-top', 'drop-target-bottom'));
    dragSrcEl = null;
    dragListType = null;
}

function addDragEvents(li, listType) {
    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('dragleave', handleDragLeave);
    li.addEventListener('drop', handleDrop);
    li.addEventListener('dragend', handleDragEnd);
}

function removeSongFromPlaylist(index) {
    if (index < 0 || index >= currentPlaylist.length) return;

    currentPlaylist.splice(index, 1);

    if (index === currentSongIndex) {
        if (currentPlaylist.length > 0) {
            currentSongIndex = (index >= currentPlaylist.length) ? 0 : index;
            const nextSong = currentPlaylist[currentSongIndex];
            if (nextSong) {
                playSong(nextSong, false, currentSongIndex);
            }
        } else {
            audioPlayer.pause();
            audioPlayer.src = '';
            currentSongIndex = -1;
            currentPlayingSongId = null;
            playerTitle.textContent = '播放列表为空';
            playerArtist.textContent = '';
            playerCover.src = 'placeholder.png';
            currentLyricText.textContent = '暂无歌词信息';
        }
    } else if (index < currentSongIndex) {
        currentSongIndex--;
    }

    renderMiniPlaylist();
    renderFullPlaylist();
    savePlaybackState();
}

function clearPlaylist() {
    if (!confirm("确定清空当前播放列表吗？")) return;

    currentPlaylist = [];
    shuffledPlaylist = [];
    currentSongIndex = -1;
    currentPlayingSongId = null;
    currentHighlightedLyric = null;

    audioPlayer.pause();
    audioPlayer.src = '';
    playerTitle.textContent = '播放列表已清空';
    playerArtist.textContent = '';
    playerCover.src = 'placeholder.png';
    currentLyricText.textContent = '暂无歌词信息';
    currentLyricText.classList.add('placeholder-lyric');
    if (fullLyricTextContainer) fullLyricTextContainer.innerHTML = '暂无歌词信息';

    renderMiniPlaylist();
    renderFullPlaylist();
    savePlaybackState();
}

// ======================= 渲染函数 =======================

function renderPlaylistsToContainer(playlists, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    if (!playlists || playlists.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无数据</div>';
        return;
    }

    playlists.forEach(playlist => {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.onclick = () => loadPlaylistDetail(playlist.playlistId, playlist.name);

        const name = playlist.name || '未知歌单';
        const coverUrl = playlist.coverImgUrl || 'placeholder.png';

        card.innerHTML = `
            <img src="${coverUrl}" alt="${name}" onerror="this.onerror=null;this.src='placeholder.png';" >
            <p title="${name}">${name}</p>
        `;
        container.appendChild(card);
    });
}

function hideAllContentPages() {
    // 1. 清空通用列表容器的内容（防止切回来看到旧数据闪烁）
    if (contentList) {
        contentList.innerHTML = '';
    }

    // 2. 隐藏所有的视图容器
    // 包括主内容区、推荐页、歌单管理页、个人资料页等
    document.querySelectorAll('.content-page, .main-content-view').forEach(page => {
        if (page) {
            page.style.display = 'none';
        }
    });
}

function showPlaylistManagementPage() {
    hideAllContentPages();

    if (playlistManagementPage) {
        playlistManagementPage.style.display = 'block';
    } else {
        console.error("无法找到 ID 为 'playlistManagementPage' 的元素。");
        return;
    }

    contentTitle.textContent = '播放列表管理';
    if (refreshBtn) refreshBtn.style.display = 'none';
    renderFullPlaylist();
}

function renderMiniPlaylist() {
    if (!miniPlaylistSongs) return;

    miniPlaylistSongs.innerHTML = '';
    if (currentPlaylist.length === 0) {
        miniPlaylistSongs.innerHTML = '<li class="empty-state">播放列表为空</li>';
        return;
    }

    currentPlaylist.forEach((song, index) => {
        const li = document.createElement('li');
        li.setAttribute('data-index', index);
        li.className = (index === currentSongIndex) ? 'current-playing' : '';
        li.innerHTML = `
            <span class="song-title-mini" title="${song.title}">${song.title}</span>
            <span class="song-artist-mini">${song.artist}</span>
            <button class="remove-btn" title="从列表中移除" onclick="event.stopPropagation(); removeSongFromPlaylist(${index});"><i class="fas fa-times"></i></button>
        `;
        li.onclick = () => playSong(song, false, index);
        miniPlaylistSongs.appendChild(li);
        addDragEvents(li, 'mini');
    });

    const currentItem = miniPlaylistSongs.querySelector('.current-playing');
    if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// script.js - 找到 renderFullPlaylist 函数并完全替换

function renderFullPlaylist() {
    if (!fullPlaylistSongs) return;

    fullPlaylistSongs.innerHTML = '';
    if (currentPlaylist.length === 0) {
        fullPlaylistSongs.innerHTML = '<li class="empty-state">播放列表为空</li>';
        return;
    }

    // 添加表头 (可选，为了对齐更好看)
    // 如果不需要表头可以省略，但加上会让布局更清晰
    // 注意：CSS 中 #fullPlaylistSongs 是 ul，直接加 div 表头可能不符合语义，
    // 但为了简单起见，我们通常不给 li 加表头，或者可以在外部容器加。
    // 这里我们直接渲染列表项。

    currentPlaylist.forEach((song, index) => {
        const li = document.createElement('li');
        li.setAttribute('data-index', index);
        li.className = (index === currentSongIndex) ? 'current-playing' : '';

        // 准备数据
        const sTitle = song.title || '未知标题';
        const sArtist = song.artist || '未知歌手';
        const sCover = song.coverUrl || 'placeholder.png';
        const songDataStr = encodeURIComponent(JSON.stringify(song));

        // 判断是否喜欢
        const isLiked = AppState.likedSongIds.has(song.songId);

        // 构建操作按钮组 (播放、加号、下载、更多)
        // 注意：这里去掉了 "播放" 按钮，因为点击行本身就是播放，或者保留也可以
        // 这里的 playSongByObj 需要 event.stopPropagation()
        const actionBtns = `
            <i class="fas fa-play action-icon" title="播放" onclick="event.stopPropagation(); playSongByObj('${songDataStr}')"></i>
            <i class="fas fa-plus-square action-icon" title="添加到..." onclick="event.stopPropagation(); openAddMenu('${songDataStr}')"></i>
            <i class="fas fa-download action-icon" title="下载" onclick="event.stopPropagation(); handleDownload(${song.songId}, '${sTitle}')"></i>
            <i class="fas fa-ellipsis-h action-icon" title="更多" onclick="showSongMenu(event, '${songDataStr}')"></i>
        `;

        li.innerHTML = `
            <span class="song-index">${index + 1}</span>

            <img src="${sCover}" class="song-row-cover" loading="lazy" onerror="this.src='placeholder.png'">

            <div class="song-info-stack">
                <div class="song-title" title="${sTitle}">${sTitle}</div>
                <div class="song-artist" title="${sArtist}">${sArtist}</div>
            </div>

            <div class="song-actions-cell">
                ${actionBtns}
            </div>

            <div class="like-cell">
                <i class="${isLiked ? 'fas' : 'far'} fa-heart like-btn js-like-icon-${song.songId} ${isLiked ? 'is-favorited' : ''}"
                   style="${isLiked ? 'color:var(--primary-color)' : ''}"
                   title="${isLiked ? '已收藏' : '喜欢'}"
                   onclick="event.stopPropagation(); toggleFavorite(${song.songId}, this)">
                </i>
            </div>

            <span class="song-action" style="text-align: center;">
                <button class="delete-full-btn" title="从列表中移除" onclick="event.stopPropagation(); removeSongFromPlaylist(${index});">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </span>
        `;

        li.onclick = () => playSong(song, false, index);
        fullPlaylistSongs.appendChild(li);

        // 重新绑定拖拽事件
        addDragEvents(li, 'full');
    });

    const currentItem = fullPlaylistSongs.querySelector('.current-playing');
    if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
function renderPlaylists(playlists) {
    hideAllContentPages();
    document.getElementById('mainContentArea').style.display = 'block';
    contentList.className = 'list-container';
    contentList.innerHTML = '';
    playlists.forEach(playlist => {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.onclick = () => loadPlaylistDetail(playlist.playlistId, playlist.name);
        const name = playlist.name || '未知歌单名';
        const coverUrl = playlist.coverImgUrl;
        card.innerHTML = `
            <img src="${coverUrl}" alt="${name}" onerror="this.onerror=null;this.style.backgroundColor='#ccc';this.src='placeholder.png';" >
            <p title="${name}">${name}</p>
        `;
        contentList.appendChild(card);
    });
}

function renderSongRows(songs, startIndex) {
    const fragment = document.createDocumentFragment();
    songs.forEach((song, index) => {
        const songDiv = document.createElement('div');
        songDiv.className = 'song-row';
        songDiv.onclick = () => playSong({
            songId: song.songId,
            title: song.title,
            artist: song.artist,
            coverUrl: song.coverUrl,
            duration: song.duration
        });

        songDiv.innerHTML = `
        <span class="song-index">${startIndex + index + 1}</span>
        <span class="song-title" title="${song.title}">${song.title}</span>
        <span class="song-artist" title="${song.artist}">${song.artist}</span>
        <span class="song-action">
            <i class="far fa-heart favorite-btn js-like-icon-${song.songId}" title="收藏" onclick="event.stopPropagation(); toggleFavorite(${song.songId}, this);"></i></span>
        `;
        fragment.appendChild(songDiv);
    });
    return fragment;
}

function goToProfileEdit() {
    document.getElementById('userPopup').style.display = 'none';
    showUserProfileView();
}

// ================= 账号切换逻辑 =================

function showAccountSwitcher() {
    const switcher = document.getElementById('accountSwitcher');
    const listContainer = document.getElementById('historyAccountList');

    const history = getLoginHistory();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    listContainer.innerHTML = '';

    if (history.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#999">暂无其他账号</div>';
    } else {
        history.forEach(acc => {
            const isCurrent = acc.phone === currentUser.phone;
            const item = document.createElement('div');
            item.className = 'account-item';
            item.onclick = () => switchAccount(acc);

            item.innerHTML = `
                            <img src="${acc.avatarUrl || 'placeholder.png'}">
                            <div class="account-info">
                                <div class="account-name">${acc.username || '用户'}</div>
                                <div class="account-phone">${acc.phone}</div>
                            </div>
                            ${isCurrent ? '<span class="current-tag">当前</span>' : ''}

                            <span class="delete-account-btn" title="移除该账号记录" onclick="removeAccountFromHistory('${acc.phone}', event)">
                                <i class="fas fa-times"></i>
                            </span>
            `;
            listContainer.appendChild(item);
        });
    }

    switcher.style.display = 'flex';
}
/**
 * 新增：从历史记录中移除账号
 * @param {string} phoneToDel - 要删除的账号手机号
 * @param {Event} event - 点击事件对象，用于阻止冒泡
 */
function removeAccountFromHistory(phoneToDel, event) {
    // 1. 阻止事件冒泡，防止触发外层的 switchAccount
    if (event) event.stopPropagation();

    // 2. 确认提示 (可选)
    if (!confirm('确定要移除该账号的登录记录吗？')) {
        return;
    }

    // 3. 获取并过滤历史记录
    let history = getLoginHistory();
    const newHistory = history.filter(h => h.phone !== phoneToDel);

    // 4. 更新 LocalStorage
    localStorage.setItem('login_history', JSON.stringify(newHistory));

    // 5. 重新渲染列表
    showAccountSwitcher();
}

function hideAccountSwitcher() {
    document.getElementById('accountSwitcher').style.display = 'none';
}

function switchAccount(account) {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    if (account.phone === currentUser.phone) {
        document.getElementById('userPopup').style.display = 'none';
        hideAccountSwitcher();
        return;
    }

    if (account.token) {
        document.getElementById('userPopup').style.display = 'none';
        localStorage.setItem('authToken', account.token);
        localStorage.setItem('user', JSON.stringify(account));
        showPremiumToast(account);
        setTimeout(() => {
            location.reload();
        }, 1500);

    } else {
        window.location.href = `auth.html?phone=${account.phone}`;
    }
}

function showPremiumToast(account) {
    const toast = document.getElementById('successToast');
    const avatar = document.getElementById('toastAvatar');
    const name = document.getElementById('toastName');

    avatar.src = account.avatarUrl || 'placeholder.png';
    name.innerText = `欢迎回来，${account.username || account.phone}`;

    toast.classList.add('show');
}

function getLoginHistory() {
    return JSON.parse(localStorage.getItem('login_history') || '[]');
}

// ======================= 数据获取函数 =======================

let currentPlaylistId = null;
let currentPlaylistSongs = [];
let currentDisplayCount = 0;
const SONGS_PER_LOAD = 100;

function loadMoreSongs() {
    if (currentDisplayCount >= currentPlaylistSongs.length) {
        const loadingState = contentList.querySelector('.loading-state');
        if (loadingState) loadingState.remove();
        return;
    }

    const songsToLoad = currentPlaylistSongs.slice(currentDisplayCount, currentDisplayCount + SONGS_PER_LOAD);
    const fragment = renderSongRows(songsToLoad, currentDisplayCount);

    const oldLoadingState = contentList.querySelector('.loading-state');
    if (oldLoadingState) oldLoadingState.remove();

    contentList.appendChild(fragment);
    currentDisplayCount += songsToLoad.length;

    if (currentDisplayCount < currentPlaylistSongs.length) {
        const loadingState = document.createElement('div');
        loadingState.className = 'loading-state';
        loadingState.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在加载更多...';
        contentList.appendChild(loadingState);
    }
}

async function loadRecommendedPlaylists(limit = 10) {
    hideAllContentPages();
    document.getElementById('mainContentArea').style.display = 'block';
    contentTitle.textContent = '推荐歌单';
    contentList.className = 'list-container';

    if (refreshBtn) {
        refreshBtn.style.display = 'block';
        refreshBtn.disabled = true;
        refreshBtn.classList.add('is-loading');
    }

    currentPlaylistId = null;
    currentPlaylistSongs = [];

    contentList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> 正在加载推荐歌单...</div>';

    try {
        const url = `${API_BASE}/recommended/playlist?limit=${limit}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`请求失败，状态码: ${response.status}. ${errorText.substring(0, 50)}...`);
        }
        const playlists = await response.json();

        if (playlists && playlists.length > 0) {
            renderPlaylists(playlists.slice(0, limit));
        } else {
            contentList.innerHTML = '<div class="loading-state">推荐歌单加载失败或暂无数据。请检查后端日志和 Node.js API 状态。</div>';
        }

    } catch (error) {
        console.error('加载推荐歌单错误:', error);
        contentList.innerHTML = `<div class="loading-state" style="color:#F56C6C;">❌ 歌单加载失败: ${error.message}</div>`;
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('is-loading');
        }
    }
}

/**
 * 修复：点击“播放全部”按钮的逻辑
 * 将当前详情页的所有歌曲替换为播放列表，并开始播放第一首
 */
function playAllCurrentList() {
    if (!currentPlaylistSongs || currentPlaylistSongs.length === 0) {
        alert("当前歌单没有歌曲");
        return;
    }

    // 1. 将当前歌单详情页缓存的歌曲列表，复制给全局播放列表
    currentPlaylist = [...currentPlaylistSongs];

    // 2. 如果是随机播放模式，重新打乱
    if (playbackMode === 'shuffle') {
        shufflePlaylist();
    }

    // 3. 从第 0 首开始播放
    // playSong(song对象, 是否添加到列表(false因为已经替换了), 指定索引)
    playSong(currentPlaylist[0], false, 0);

    // 4. 更新 UI
    renderMiniPlaylist();
    renderFullPlaylist();
}

/**
 * 修复：双击歌单详情页歌曲的逻辑
 * 接收经过 URL 编码的 JSON 字符串，解析回对象并播放
 */
function playSongByObj(songDataStr) {
    try {
        // 解码 URI 并解析 JSON 字符串
        const song = JSON.parse(decodeURIComponent(songDataStr));

        // 调用核心播放函数 (默认添加到当前播放列表末尾并播放)
        playSong(song, true);
    } catch (e) {
        console.error("解析歌曲数据失败:", e);
        alert("播放失败：歌曲数据解析错误");
    }
}

/**
 * 修复：点击下载按钮 (占位功能)
 */
function handleDownload(songId, filename) {
    // 1. 构造下载地址
        const downloadApiUrl = `/api/stream/download/${songId}?filename=${encodeURIComponent(filename)}`;

        // 2. 创建隐藏的 iframe
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = downloadApiUrl;

        // 3. 添加到页面触发请求
        document.body.appendChild(iframe);

        // 4. 延时清理
        // 下载通常需要一些时间来建立连接，给它足够的时间（例如 1 分钟）
        // iframe 在后台下载完成后，移除它不会中断下载
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 30000);
}

/**
 * 修复：点击加号打开菜单 (占位功能)
 */
function openAddMenu(songDataStr) {
    // 这里可以弹出一个模态框，选择添加到哪个歌单
    // 暂时用简单的逻辑代替：添加到当前播放列表但不立即播放
    try {
        const song = JSON.parse(decodeURIComponent(songDataStr));

        // 检查是否已存在
        const exists = currentPlaylist.some(s => s.songId === song.songId);
        if (exists) {
            alert("该歌曲已在播放列表中");
        } else {
            currentPlaylist.push(song);
            renderMiniPlaylist();
            renderFullPlaylist();
            alert(`已将 "${song.title}" 添加到播放列表`);
        }
    } catch (e) {
        console.error(e);
    }
}
// 1. 辅助函数：格式化毫秒为 mm:ss
function formatDuration(ms) {
    if (!ms) return '00:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/**
 * 加载歌单详情 (最终完整版)
 * 布局：序号 | 封面 | (歌名+歌手堆叠) | 操作图标 | 专辑 | 喜欢 | 时长
 * 功能：支持本地/在线歌单区分，支持导入在线歌单，支持删除本地歌单
 */
async function loadPlaylistDetail(id, name, isLocal = false) {
    // 1. 界面初始化：隐藏其他页面，显示主内容区
    hideAllContentPages();
    document.getElementById('mainContentArea').style.display = 'block';

    // 隐藏通用标题和刷新按钮 (详情页有自己的 Header)
    contentTitle.style.display = 'none';
    refreshBtn.style.display = 'none';
    contentList.className = '';
    contentList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> 正在加载详细信息...</div>';

    try {
        let data;

        // 2. 数据获取：根据 isLocal 区分请求路径
        if (isLocal) {
            console.log(`正在加载本地歌单 ID: ${id}`);
            const response = await authenticatedFetch(`/api/user/music/playlist/${id}`);
            if (!response.ok) {
                if (response.status === 404) throw new Error("本地歌单不存在或已被删除");
                throw new Error("加载本地歌单失败");
            }
            data = await response.json();
            if (!data.songs) data.songs = [];

        } else {
            console.log(`正在加载网易云歌单 ID: ${id}`);
            const response = await fetch(`${API_BASE}/playlist/detail?playlistId=${id}`);
            if (!response.ok) throw new Error("加载网易云歌单失败");
            data = await response.json();
        }

        // 3. 数据标准化
        const playlist = data.songs ? data : { songs: [], ...data };
        const songs = playlist.songs || [];
        // 缓存当前歌单，供“播放全部”功能使用
        currentPlaylistSongs = songs;

        // === A. 渲染 Header (头部信息) ===
        const coverUrl = playlist.coverImgUrl || playlist.coverUrl || 'placeholder.png';
        const creatorName = playlist.creatorName || (isLocal ? '我' : '网易云用户');
        const creatorAvatar = playlist.creatorAvatar || 'placeholder.png';
        const desc = playlist.description || '暂无简介';

        // 动态按钮组
        let extraBtns = '';
        if (isLocal) {
            extraBtns = `
                <button class="ph-btn secondary" onclick="deleteMyPlaylist(${id})" style="color:#F56C6C;border-color:#F56C6C;">
                    <i class="fas fa-trash"></i> 删除歌单
                </button>
            `;
        } else {
            extraBtns = `
                <button class="ph-btn secondary" onclick="importOnlinePlaylist(${id})">
                    <i class="far fa-heart"></i> 收藏歌单
                </button>
            `;
        }

        const headerHTML = `
            <div class="playlist-header-container">
                <img src="${coverUrl}" class="playlist-header-cover" onerror="this.src='placeholder.png'">
                <div class="playlist-header-info">
                    <h2 class="ph-title">${playlist.name}</h2>
                    <div class="ph-creator">
                        <img src="${creatorAvatar}" style="width:30px;height:30px;border-radius:50%;margin-right:10px;object-fit:cover;" onerror="this.src='placeholder.png'">
                        <span>${creatorName}</span>
                    </div>
                    <div class="ph-desc" title="${desc}">${desc}</div>

                    <div class="ph-actions">
                        <button class="ph-btn primary" onclick="playAllCurrentList()">
                            <i class="fas fa-play"></i> 播放全部
                        </button>
                        ${extraBtns}
                    </div>
                </div>
            </div>
        `;

        // === B. 渲染列表 ===
        let listHTML = `
            <div class="song-list-container">
                <div class="song-row-detailed song-header" style="background:none; color:#888;">
                    <span class="song-index" style="text-align:center">#</span>
                    <span></span> <span>标题</span>
                    <span></span> <span>专辑</span>
                    <span style="text-align:center">喜欢</span>
                    <span style="text-align:right;padding-right:15px;">时长</span>
                </div>
        `;

        if (songs.length === 0) {
            listHTML += '<div class="empty-state">歌单里空空如也</div>';
        } else {
            songs.forEach((song, index) => {
                const sTitle = song.title ? song.title.replace(/"/g, '&quot;') : '未知标题';
                const sArtist = song.artist ? song.artist.replace(/"/g, '&quot;') : '未知歌手';
                const sAlbum = song.album || '未知专辑';
                const sCover = song.coverUrl || 'placeholder.png';
                const durationStr = formatDuration(song.duration);
                // 编码数据
                const isLiked = AppState.likedSongIds.has(song.songId);
                const songDataStr = encodeURIComponent(JSON.stringify(song));
                const removeBtn = '';
                // 包含了：播放、添加、下载、更多(菜单)、移除(如果是本地)

                const actionBtns = `
                    <i class="fas fa-play action-icon" title="播放" onclick="event.stopPropagation(); playSongByObj('${songDataStr}')"></i>
                    <i class="fas fa-plus-square action-icon" title="添加到播放列表" onclick="event.stopPropagation(); openAddMenu('${songDataStr}')"></i>
                    <i class="fas fa-download action-icon" title="下载" onclick="event.stopPropagation(); handleDownload(${song.songId}, '${sTitle}')"></i>
                    <i class="fas fa-ellipsis-h action-icon" title="更多" onclick="showSongMenu(event, '${songDataStr}')"></i>
                    ${removeBtn}
                `;

                                listHTML += `
                                    <div class="song-row-detailed" ondblclick="playSongByObj('${songDataStr}')">
                                        <span class="song-index">${index + 1 < 10 ? '0' + (index + 1) : index + 1}</span>

                                        <img src="${sCover}" class="song-row-cover" loading="lazy" onerror="this.src='placeholder.png'">

                                        <div class="song-info-stack">
                                            <div class="song-title" title="${sTitle}">${sTitle}</div>
                                            <div class="song-artist" title="${sArtist}">${sArtist}</div>
                                        </div>

                                        <div class="song-actions-cell">
                                            ${actionBtns}
                                        </div>

                                        <div class="song-album" title="${sAlbum}">${sAlbum}</div>

                                        <div class="like-cell">
                                            <i class="${isLiked ? 'fas' : 'far'} fa-heart like-btn js-like-icon-${song.songId} ${isLiked ? 'is-favorited' : ''}"
                                               style="${isLiked ? 'color:var(--primary-color)' : ''}"
                                               title="${isLiked ? '已收藏' : '喜欢'}"
                                               onclick="event.stopPropagation(); toggleFavorite(${song.songId}, this)">
                                            </i>
                                        </div>

                                        <div class="duration-cell">${durationStr}</div>
                                    </div>
                                `;
                            });
                        }
        listHTML += `</div>`;

        // 拼接 Header 和 List，渲染到页面
        contentList.innerHTML = headerHTML + listHTML;

    } catch (error) {
        console.error("歌单详情加载失败:", error);
        contentList.innerHTML = `<div class="empty-state" style="color:red;">加载失败: ${error.message}</div>`;
    }
}

/**
 * 收藏（导入）在线歌单到本地
 */
async function importOnlinePlaylist(id) {
    const btn = document.querySelector('.ph-btn.secondary');
    if (!btn) return;

    try {
        const response = await authenticatedFetch(`/api/user/music/playlist/import?id=${id}`, { method: 'POST' });
        if (response.ok) {
            const data = await response.json();
            const heartIcon = btn.querySelector('i');

            if (data.action === 'collected') {
                showToast("已加入收藏歌单", "success");
                if (heartIcon) heartIcon.className = 'fas fa-heart'; // 变红实心
            } else {
                showToast("已取消收藏该歌单", "info");
                if (heartIcon) heartIcon.className = 'far fa-heart'; // 变灰虚心
            }
            loadUserPlaylists(); // 刷新侧边栏
        }
    } catch (e) {
        showToast("操作失败，请重试", "error");
    }
}

/**
 * 删除我的歌单
 */
async function deleteMyPlaylist(id) {
    if (!confirm("确定要删除这个歌单吗？此操作不可恢复。")) return;

    // 防止重复点击
    const btn = document.querySelector('.ph-btn.secondary');
    if(btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 删除中...';
        btn.disabled = true;
    }

    try {
        const response = await authenticatedFetch(`/api/user/music/playlist/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast("歌单已删除", "success");
            // 刷新侧边栏
            loadUserPlaylists();
            // 如果当前正显示该歌单，清空显示或跳转
            hideAllContentPages();
        } else {
            const err = await response.json();
            showToast("删除失败: " + (err.error || "未知错误"), "error");
        }
    } catch (e) {
        console.error(e);
        alert("网络错误，删除失败");
    } finally {
        if(btn) btn.disabled = false;
    }
}
// ================= 用户中心功能 =================

function showUserProfileView() {
    hideAllContentPages();

    if (profileView) {
        profileView.style.display = 'block';
    } else {
        console.error("无法找到 ID 为 'profileView' 的元素。");
        return;
    }

    document.getElementById('contentTitle').textContent = '我的个人资料';
    if (refreshBtn) refreshBtn.style.display = 'none';

    fetchUserProfile();
}

async function fetchUserProfile() {
    profileMessage.textContent = '加载中...';
    profileMessage.style.color = '#FF4500';

    try {
        const response = await authenticatedFetch('/api/user/profile', { method: 'GET' });
        if (response.ok) {
            const profileData = await response.json();

            document.getElementById('profilePhone').value = profileData.phone || 'N/A';
            document.getElementById('profileUsername').value = profileData.username || '';
            document.getElementById('profileGender').value = profileData.gender || 'UNKNOWN';
            document.getElementById('profileBirthday').value = profileData.birthday || '';
            document.getElementById('profileLocation').value = profileData.location || '';
            document.getElementById('profileSignature').value = profileData.signature || '';

            const avatarUrl = profileData.avatarUrl || 'placeholder.png';
            profileCurrentAvatar.src = avatarUrl;
            profileCurrentAvatar.onerror = function() { this.onerror = null; this.src = 'placeholder.png'; };

            profileMessage.textContent = '资料加载完成。';
            profileMessage.style.color = '#4CAF50';

            localStorage.setItem('user', JSON.stringify(profileData));
            loadUserHeaderInfo();

            updateHistoryInfo(profileData);

        } else if (response.status === 401) {
            alert('会话已过期，请重新登录。');
            logout();
        } else {
            profileMessage.textContent = '加载个人资料失败。';
            profileMessage.style.color = '#F56C6C';
        }
    } catch (error) {
        console.error('Fetch Profile Error:', error);
        profileMessage.textContent = '网络错误，无法加载个人资料。';
        profileMessage.style.color = '#F56C6C';
    }
}

profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    profileMessage.textContent = '正在保存...';
    profileMessage.style.color = '#FF4500';

    const updateData = {
        username: document.getElementById('profileUsername').value,
        gender: document.getElementById('profileGender').value,
        birthday: document.getElementById('profileBirthday').value,
        location: document.getElementById('profileLocation').value,
        signature: document.getElementById('profileSignature').value,
    };

    try {
        const response = await authenticatedFetch('/api/user/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });

        const data = await response.json();

        if (response.ok) {
            profileMessage.textContent = '资料更新成功！';
            profileMessage.style.color = '#4CAF50';
            await fetchUserProfile();

            // 获取最新 user 数据并同步到历史记录
            const updatedUser = JSON.parse(localStorage.getItem('user'));
            updateHistoryInfo(updatedUser);

        } else if (response.status === 401) {
            alert('会话过期，请重新登录。');
            logout();
        } else {
            profileMessage.textContent = data.message || '资料更新失败。';
            profileMessage.style.color = '#F56C6C';
        }
    } catch (error) {
        console.error('Update Profile Error:', error);
        profileMessage.textContent = '网络错误，保存失败。';
        profileMessage.style.color = '#F56C6C';
    }
});

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.warn('Logout failed on server side, proceeding with client cleanup:', error);
    }
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = 'auth.html';
}

function initAvatarUploadLogic() {
    if (!profileCurrentAvatar || !avatarFileInput || !profileMessage) {
        console.warn("Avatar upload elements not found. Skipping initialization.");
        return;
    }

    profileCurrentAvatar.addEventListener('click', () => {
        avatarFileInput.click();
    });

    avatarFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        const originalSrc = profileCurrentAvatar.src;
        profileMessage.textContent = '正在上传头像...';
        profileMessage.style.color = '#FF4500';

        try {
            const token = localStorage.getItem('authToken');
            if (!token) { throw new Error('Token is missing'); }

            const response = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                profileCurrentAvatar.src = data.url;
                profileMessage.textContent = '头像更换成功！';
                profileMessage.style.color = '#4CAF50';
                await fetchUserProfile();
                //同步到 history
                const updatedUser = JSON.parse(localStorage.getItem('user'));
                // 确保最新的头像URL也被同步（双重保险）
                updatedUser.avatarUrl = data.url;
                updateHistoryInfo(updatedUser);
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Server error' }));
                profileMessage.textContent = '上传失败：' + errorData.message;
                profileMessage.style.color = '#F56C6C';
                profileCurrentAvatar.src = originalSrc;
            }
        } catch (error) {
            profileMessage.textContent = '网络错误，上传失败。';
            profileMessage.style.color = '#F56C6C';
            profileCurrentAvatar.src = originalSrc;
        }
    });
}
/**
 * ✅ 点击爱心收藏逻辑 (增加删除确认)
 */
async function toggleFavorite(songId, iconElement) {
    if (!localStorage.getItem('authToken')) {
        showToast('请先登录后操作', 'warning');
        return;
    }

    // 1. 判断当前状态 (如果没有传入 iconElement，则尝试在页面上找一个参考)
    let isCurrentlyFavorited = false;
    if (iconElement) {
        isCurrentlyFavorited = iconElement.classList.contains('fas');
    } else {
        // 如果是从菜单点击且没找到对应行，尝试找页面上任意一个该歌曲的图标作为参考
        const refIcon = document.querySelector(`.js-like-icon-${songId}`);
        if (refIcon) isCurrentlyFavorited = refIcon.classList.contains('fas');
    }

    // 2. 确认删除弹窗
    if (isCurrentlyFavorited) {
        if (!confirm("该歌曲已存在于“我喜欢的音乐”，确定要从歌单删除该歌曲吗？")) {
            return;
        }
    }

    try {
        const response = await authenticatedFetch(`/api/user/music/favorite/${songId}`, { method: 'POST' });
        if (response.ok) {
            const data = await response.json();

            // ✅ 核心逻辑：查找页面上所有代表该歌曲的爱心图标，统一更新状态
            // 包括列表中的图标、可能存在的菜单中的图标
            const allIcons = document.querySelectorAll(`.js-like-icon-${songId}, .menu-item-row .fa-heart`);

            // 无论后端返回 added 还是 removed，我们都遍历页面所有图标进行同步
            if (data.action === "added") {
                // 变红
                AppState.likedSongIds.add(songId);
                allIcons.forEach(icon => {
                    // 仅更新该歌曲的图标 (菜单里的图标没有 ID 类，需要特殊处理，但这里为了简化，主要同步列表)
                    if (icon.classList.contains(`js-like-icon-${songId}`)) {
                        icon.classList.remove('fa-regular', 'far');
                        icon.classList.add('fas', 'is-favorited');
                        // 强制颜色更新 (针对 renderMyMusicSongs 里写的行内样式)
                        icon.style.color = 'var(--primary-color)';
                    }
                });
                showToast('已加入我喜欢的歌单', 'success');

            } else if (data.action === "removed") {
                // 变灰
                AppState.likedSongIds.delete(songId);
                allIcons.forEach(icon => {
                    if (icon.classList.contains(`js-like-icon-${songId}`)) {
                        icon.classList.remove('fas', 'is-favorited');
                        icon.classList.add('far'); // 恢复为空心
                        icon.style.color = ''; // 移除红色行内样式
                    }
                });
                showToast('已从我喜欢的音乐中移除', 'info');

                // ✅ 逻辑：如果在“我的音乐”界面取消喜欢，自动移除该行
                if (typeof MyMusicState !== 'undefined' && MyMusicState.currentTab === 'songs' &&
                    document.getElementById('myMusicView').style.display === 'block') {

                    // 找到对应的行并移除，避免整页刷新带来的闪烁
                    const rowsToRemove = document.querySelectorAll(`.js-like-icon-${songId}`);
                    rowsToRemove.forEach(icon => {
                        const row = icon.closest('.song-row-detailed, .song-row');
                        if(row) row.remove();
                    });

                    // 如果删完了，显示空状态
                    const container = document.getElementById('myMusicListContainer');
                    if (container && container.children.length <= 1) { // 1 是表头
                        loadMyFavoriteSongs(); // 重新加载以显示“暂无歌曲”
                    }
                }
            }
        }
    } catch (error) {
        console.error(error);
        showToast('操作失败', 'error');
    }
}

function renderMyPlaylists(playlists) {
    contentList.innerHTML = '';

    if (playlists.length === 0) {
        contentList.innerHTML = '<div class="loading-state">您还没有创建任何歌单。</div>';
        return;
    }

    playlists.forEach(playlist => {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.onclick = () => loadPlaylistDetail(playlist.id, playlist.name, true);

        const name = playlist.name || '未知歌单名';
        const coverUrl = playlist.coverUrl || 'placeholder.png';
        const typeText = playlist.defaultPlaylist ? '我喜欢的音乐' : '自定义歌单';

        card.innerHTML = `
            <img src="${coverUrl}" alt="${name}" onerror="this.onerror=null;this.style.backgroundColor='#ccc';this.src='placeholder.png';" >
            <p title="${name}">${name}</p>
            <small>${typeText}</small>
        `;
        contentList.appendChild(card);
    });
}

async function loadMyMusicPlaylists() {
    hideAllContentPages();
    document.getElementById('mainContentArea').style.display = 'block';
    contentTitle.textContent = '我的音乐';
    contentList.className = 'list-container';
    refreshBtn.style.display = 'none';

    contentList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> 正在加载我的歌单...</div>';

    try {
        const response = await authenticatedFetch('/api/user/music/playlists', { method: 'GET' });

        if (!response.ok) {
            throw new Error('服务器错误');
        }

        const playlists = await response.json();

        if (playlists) {
            renderMyPlaylists(playlists);
        } else {
            contentList.innerHTML = '<div class="loading-state">您还没有创建任何歌单。</div>';
        }
    } catch (error) {
        console.error('My Music load error:', error);
        contentList.innerHTML = `<div class="loading-state" style="color:#F56C6C;">❌ 加载我的歌单失败: ${error.message}</div>`;
    }
}
/**
 * 专门用于推荐卡片点击“播放全部”
 * @param {Array} songs - 完整的歌曲对象数组
 */
function playRecommendList(songs) {
    if (!songs || songs.length === 0) {
        alert("该歌单暂时没有歌曲可以播放");
        return;
    }

    // 1. 替换当前播放列表
    currentPlaylist = [...songs];

    // 2. 如果当前是随机模式，则打乱
    if (playbackMode === 'shuffle') {
        shufflePlaylist();
    }

    // 3. 播放第一首
    // 参数: song, addToPlaylist(false因为已经替换了), index(0)
    playSong(currentPlaylist[0], false, 0);

    // 4. 更新 UI
    renderMiniPlaylist();
    renderFullPlaylist();

}
// 1. 替换播放 (点击卡片主体时触发)
function playByReplacingCurrent(song) {
    if (currentPlaylist.length === 0) {
        currentPlaylist = [song];
        playSong(song, false, 0);
    } else {
        // 替换当前正在播放的索引处的歌曲
        let targetIndex = currentSongIndex === -1 ? 0 : currentSongIndex;
        currentPlaylist.splice(targetIndex, 1, song);
        playSong(song, false, targetIndex);
    }
    renderMiniPlaylist();
    renderFullPlaylist();
}

// 2. 下一首播放 (菜单功能)
function addToNextPlay(song) {
    if (currentPlaylist.length === 0) {
        playByReplacingCurrent(song);
        return;
    }

    const isDuplicate = currentPlaylist.some(s => s.songId === song.songId);

        if (isDuplicate) {
            showToast("该歌曲已在播放列表中", "warning");
            closeContextMenu(); // 关闭可能存在的菜单
            return;
        }

    currentPlaylist.splice(currentSongIndex + 1, 0, song);
    renderMiniPlaylist();
    renderFullPlaylist();
    showToast("已添加到下一首播放", "success");
}

// 3. 显示菜单 (点击三个点触发)
window.showSongMenu = function(e, songDataStr) {
    // 阻止冒泡，防止触发卡片背景的点击事件
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    try {
        const song = JSON.parse(decodeURIComponent(songDataStr));
        window.contextMenuTargetSong = song; // 全局保存当前选中的歌曲

        const songRow = e.target.closest('.song-row-detailed, .song-row, .simi-song-card');
        if (songRow) {
                    // 优先查找带有同步标识的图标，如果没有则查找通用类名
                    window.targetHeartIcon = songRow.querySelector(`.js-like-icon-${song.songId}`)
                                          || songRow.querySelector('.favorite-btn, .like-btn, .simi-action-btn i');
        } else {
                window.targetHeartIcon = null;
        }

       // AppState.likedSongIds 是我们在页面加载时同步好的所有喜欢歌曲ID集合
       const isLiked = AppState.likedSongIds.has(song.songId);

        const menu = document.getElementById('contextMenu');
        document.body.appendChild(menu); // 确保菜单在最上层

        // === 1. 渲染菜单内容 ===
       menu.innerHTML = `
                   <div class="menu-item-row" onclick="handleMenuClick('play')">
                       <i class="fas fa-play"></i> 播放
                   </div>
                   <div class="menu-item-row" onclick="handleMenuClick('next')">
                       <i class="fas fa-step-forward"></i> 下一首播放
                   </div>
                   <div class="menu-divider"></div>
                   <div class="menu-item-row" onclick="handleMenuClick('like')">
                       <i class="${isLiked ? 'fas' : 'far'} fa-heart" style="${isLiked ? 'color:var(--primary-color)' : ''}"></i> 我喜欢
                   </div>
                   <div class="menu-item-row" onclick="handleMenuClick('add_to', event)">
                       <i class="fas fa-plus"></i> 添加到... <i class="fas fa-chevron-right"></i>
                   </div>
                   <div class="menu-item-row" onclick="handleMenuClick('download')">
                       <i class="fas fa-download"></i> 下载
                   </div>
               `;

        // === 2. 智能定位计算 ===

        // 关键步骤：先显示菜单，这样才能获取到它真实的 offsetWidth 和 offsetHeight
        // 使用 visibility: hidden 可以在用户看不见的情况下占据空间进行计算
        menu.style.visibility = 'hidden';
        menu.style.display = 'block';

        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // 获取鼠标点击坐标
        let clickX = e.clientX;
        let clickY = e.clientY;

        // --- 水平方向判断 (靠左还是靠右) ---
        // 如果 (鼠标X + 菜单宽度) 超过了屏幕宽度，则向左展开
        let leftPosition = clickX;
        if (clickX + menuWidth > windowWidth) {
            leftPosition = clickX - menuWidth;
            // 边缘修正：防止向左展开后超出左边界
            if (leftPosition < 0) leftPosition = 0;
        }

        // --- 垂直方向判断 (向上还是向下) ---
        // 如果 (鼠标Y + 菜单高度) 超过了屏幕高度，则向上展开
        let topPosition = clickY;
        if (clickY + menuHeight > windowHeight) {
            topPosition = clickY - menuHeight;
            // 边缘修正：防止向上展开后超出上边界
            if (topPosition < 0) topPosition = 0;
        }

        // === 3. 应用位置并显示 ===
        menu.style.left = `${leftPosition}px`;
        menu.style.top = `${topPosition}px`;

        // 恢复可见性
        menu.style.visibility = 'visible';

        // 延迟绑定关闭事件
        setTimeout(() => {
            document.addEventListener('click', closeContextMenu);
        }, 100);

    } catch (err) {
        console.error("菜单加载失败:", err);
    }
};

// 关闭菜单函数
window.closeContextMenu = function() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
    // 移除监听器，防止内存泄漏
    document.removeEventListener('click', closeContextMenu);
};

// 4. 菜单点击处理
function handleMenuClick(action, event) {
    if (!contextMenuTargetSong) return;
    const song = contextMenuTargetSong;

    switch(action) {
        case 'play': playByReplacingCurrent(song); break;
        case 'next': addToNextPlay(song); break;
        case 'like':
            toggleFavorite(song.songId, window.targetHeartIcon);
            break;
        case 'download':
            handleDownload(song.songId, song.title);
            showToast("下载任务已开始", "info");
            break;
        case 'add_to':
            if(event) event.stopPropagation();
            showAddToSubMenu(); // 这里复用上一条回答中的 showAddToSubMenu 逻辑
            return;
    }
    closeContextMenu();
}
// ======================= “添加到”子菜单及相关逻辑 =======================

/**
 * 显示“添加到”二级菜单
 * 逻辑：替换主菜单内容，显示“返回”、“播放列表”、“新建歌单”以及“用户的自建歌单”
 */
async function showAddToSubMenu() {
    const menu = document.getElementById('contextMenu');
    const song = contextMenuTargetSong;
    if (!song) return;

    // A. 异步获取该歌曲已存在于哪些歌单
    let membershipIds = [];
    try {
        const res = await authenticatedFetch(`/api/user/music/song-membership/${song.songId}`);
        if (res.ok) membershipIds = await res.json();
    } catch (e) { console.error("检查歌曲归属失败", e); }

    const myPlaylists = AppState.userPlaylists || [];

    // B. 渲染菜单项，检查是否置灰
    let playlistsHtml = myPlaylists.map(pl => {
        const isExists = membershipIds.includes(pl.id);
        return `
            <div class="menu-item-row ${isExists ? 'menu-item-disabled' : ''}"
                 ${isExists ? '' : `onclick="addToUserPlaylistWithToast(${pl.id}, '${pl.name.replace(/'/g, "\\'")}')"`}>
                <i class="fas fa-list-ul"></i> ${pl.name} ${isExists ? '(已存在)' : ''}
            </div>
        `;
    }).join('');

    menu.innerHTML = `
        <div class="menu-item-row" style="color:#666;border-bottom:1px solid #eee;" onclick="closeContextMenu()">
             <i class="fas fa-chevron-left"></i> 返回
        </div>
        <div class="menu-item-row" onclick="addToCurrentQueue()">
            <i class="fas fa-list-ol"></i> 当前播放队列
        </div>
        <div class="menu-divider"></div>
        ${playlistsHtml}
    `;
}
async function addToUserPlaylistWithToast(playlistId, playlistName) {
    await addToUserPlaylist(playlistId);
    showToast(`已成功加入歌单：${playlistName}`, "success");
}

/**
 * 动作：添加到当前播放队列 (不立即播放，只追加)
 */
function addToCurrentQueue() {
    if (!contextMenuTargetSong) return;

    const isDuplicate = currentPlaylist.some(s => s.songId === contextMenuTargetSong.songId);
    if (isDuplicate) {
            showToast("该歌曲已在播放列表中", "warning");
            closeContextMenu(); // 关闭菜单
            return; // ⛔️ 终止操作，不再添加
    }

    currentPlaylist.push(contextMenuTargetSong);

    // 刷新UI
    renderMiniPlaylist();
    renderFullPlaylist();

    closeContextMenu();
    showToast("已加入播放队列末尾", "success");
}

/**
 * 动作：添加到已存在的自建歌单
 * @param {Number} playlistId 目标歌单ID
 */
async function addToUserPlaylist(playlistId) {
    if (!contextMenuTargetSong) return;

    try {
        // 调用后端接口添加歌曲
        const response = await authenticatedFetch(`/api/user/music/playlist/${playlistId}/song`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ songId: contextMenuTargetSong.songId })
        });

        if (response.ok) {
            showToast("添加成功！", "success");
        } else {
            const err = await response.json();
            showToast("添加失败: " + (err.message || "歌曲可能已存在"), "error");
        }
    } catch (e) {
        console.error(e);
        alert("网络错误，添加失败");
    }

    closeContextMenu();
}
/**
 * 触发：打开新建歌单弹窗，并记录当前要添加的歌曲ID
 */
function triggerCreatePlaylistForSong() {
    closeContextMenu(); // 关闭菜单

    const modal = document.getElementById('createPlaylistModal');
    const input = document.getElementById('newPlaylistNameInput');

    if (!contextMenuTargetSong) return;

    // ✨ 核心技巧：在 DOM 元素上挂载数据，标记“这首歌等着被添加”
    modal.dataset.pendingSongId = contextMenuTargetSong.songId;

    // 重置输入框
    input.value = '';
    input.placeholder = "请输入新歌单名称";

    // 显示弹窗
    modal.style.display = 'flex';
    input.focus();
}

/**
 * 1. 热门歌曲 (黑胶风格) - 5首
 */
async function loadHotSongsSection(btn) {
    if(btn) btn.classList.add('is-loading');
    const container = document.getElementById('recHotSongsList');

    // 清除旧样式
    container.innerHTML = '<div class="loading-state" style="grid-column: 1/-1">加载中...</div>';
    container.style.cssText = '';
    container.className = '';

    const types = [0, 7, 96, 8];
    const randomType = types[Math.floor(Math.random() * types.length)];

    try {
        const response = await fetch(`${API_BASE}/hot/songs?type=${randomType}&t=${Date.now()}`);
        const songs = await response.json();

        container.innerHTML = '';

        if (songs && songs.length > 0) {
            // 取5首
            const targetSongs = shuffleArray(songs).slice(0, 5);

            targetSongs.forEach(song => {
                const card = document.createElement('div');
                card.className = 'vinyl-card'; // 对应 CSS 类
                card.onclick = () => playSong({ songId: song.songId, title: song.title, artist: song.artist, coverUrl: song.coverUrl });

                // 黑胶 HTML 结构
                card.innerHTML = `
                    <div class="vinyl-wrapper">
                        <div class="vinyl-disc"></div>
                        <img class="vinyl-cover-img" src="${song.coverUrl}" onerror="this.src='placeholder.png'" alt="${song.title}">
                    </div>
                    <div class="vinyl-title" title="${song.title}">${song.title}</div>
                    <div class="vinyl-artist" title="${song.artist}">${song.artist}</div>
                `;
                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1">暂无热门歌曲</div>';
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1">加载失败</div>';
    } finally {
        if(btn) btn.classList.remove('is-loading');
    }
}

/**
 * 2. 相似歌曲 (列表风格) - 终极裂变版：循环查找直到凑齐9首
 */
async function loadSimiSongsSection(btn) {
    if (btn) btn.classList.add('is-loading');
    const container = document.getElementById('recSimiSongsList');
    const titleEl = document.getElementById('simiSongsTitle');

    // 样式重置
    container.style.cssText = "";
    container.className = '';
    if (!container.hasChildNodes()) {
        container.innerHTML = '<div class="loading-state" style="grid-column: 1/-1;">正在根据您的口味生成...</div>';
    }

    try {
        // === 1. 确定初始种子 (Seed) ===
        let initialSeedId = null;
        let initialSeedName = "";

        // 尝试步骤 A: 从后端获取“最近播放”历史，并随机选一首
        try {
            const token = localStorage.getItem('authToken');
            if (token) {
                // 调用后端接口获取历史列表
                const historyRes = await authenticatedFetch('/api/user/history/list');
                if (historyRes.ok) {
                    const historyList = await historyRes.json();
                    if (historyList && historyList.length > 0) {
                        // ✅ 核心修改：从历史记录中随机选取一首
                        const randomIndex = Math.floor(Math.random() * historyList.length);
                        const randomHistorySong = historyList[randomIndex];

                        initialSeedId = randomHistorySong.songId;
                        initialSeedName = randomHistorySong.title;
                        console.log(`[猜你喜欢] 选中历史种子: ${initialSeedName}`);
                    }
                }
            }
        } catch (e) {
            console.warn("获取历史记录种子失败，将降级处理", e);
        }

        // 尝试步骤 B: 如果没找到历史记录种子 (未登录或记录为空)，从热门歌曲随机选
        if (!initialSeedId) {
            try {
                const hotRes = await fetch(`${API_BASE}/hot/songs?type=0&t=${Date.now()}`);
                if (hotRes.ok) {
                    const hotSongs = await hotRes.json();
                    if (hotSongs && hotSongs.length > 0) {
                        const randomSong = hotSongs[Math.floor(Math.random() * hotSongs.length)];
                        initialSeedId = randomSong.songId;
                        initialSeedName = randomSong.title;
                        console.log(`[猜你喜欢] 无历史记录，使用热门种子: ${initialSeedName}`);
                    }
                }
            } catch (e) {
                console.warn("热门歌曲获取失败");
            }
        }

        // 尝试步骤 C: 终极兜底 (防止 API 全挂导致空指针)
        if (!initialSeedId) {
            initialSeedId = 347230; // 海阔天空
            initialSeedName = "海阔天空";
        }

        // 更新标题
        if (titleEl) titleEl.textContent = `📻 猜你喜欢 (根据 "${initialSeedName}")`;

        // === 2. 核心：广度优先搜索 (BFS) 循环裂变 ===
        // (这部分逻辑保持不变，用于找满9首相似歌)

        const collectedSongsMap = new Map();
        const searchQueue = [initialSeedId];
        const visitedSeeds = new Set();
        const TARGET_COUNT = 9;
        const MAX_ROUNDS = 6;
        let rounds = 0;

        while (collectedSongsMap.size < TARGET_COUNT && searchQueue.length > 0 && rounds < MAX_ROUNDS) {
            const currentSeedId = searchQueue.shift();
            if (visitedSeeds.has(currentSeedId)) continue;
            visitedSeeds.add(currentSeedId);

            try {
                const response = await fetch(`${API_BASE}/similar/songs?songId=${currentSeedId}&t=${Date.now()}`);
                if (response.ok && response.status !== 204) {
                    const songs = await response.json();
                    for (const song of songs) {
                        if (song.songId === initialSeedId) continue; // 排除种子本身

                        if (!collectedSongsMap.has(song.songId)) {
                            collectedSongsMap.set(song.songId, song);
                            searchQueue.push(song.songId); // 加入队列继续裂变
                        }
                        if (collectedSongsMap.size >= TARGET_COUNT) break;
                    }
                }
            } catch (err) {
                console.warn(`种子 ${currentSeedId} 查询失败，跳过`);
            }
            rounds++;
        }

        // === 3. 渲染结果 ===
                const finalSongs = Array.from(collectedSongsMap.values()).slice(0, TARGET_COUNT);
                container.innerHTML = '';

                if (typeof finalSongs !== 'undefined' && finalSongs.length > 0) {
                        finalSongs.forEach(song => {
                            const card = document.createElement('div');
                            card.className = 'simi-song-card';

                            // 编码歌曲对象，防止引号冲突
                            const songDataStr = encodeURIComponent(JSON.stringify(song));
                            const isLiked = AppState.likedSongIds.has(song.songId);

                            // 1. 卡片整体点击：直接替换播放
                            card.onclick = () => playByReplacingCurrent(song);

                            card.innerHTML = `
                                                            <div class="simi-cover-wrap">
                                                                <img src="${song.coverUrl}" onerror="this.src='placeholder.png'" alt="cover">
                                                                <div class="simi-play-overlay">
                                                                    <i class="fas fa-play"></i>
                                                                </div>
                                                            </div>

                                                            <div class="simi-info">
                                                                <div class="simi-title" title="${song.title}">${song.title}</div>
                                                                <div class="simi-artist" title="${song.artist}">${song.artist}</div>
                                                            </div>

                                                            <div class="simi-actions">
                                                               <button class="simi-action-btn" title="${isLiked ? '已收藏' : '喜欢'}"
                                                                   onclick="event.stopPropagation(); toggleFavorite(${song.songId}, this.querySelector('i'))">
                                                                   <i class="${isLiked ? 'fas' : 'far'} fa-heart js-like-icon-${song.songId} ${isLiked ? 'is-favorited' : ''}"
                                                                      style="${isLiked ? 'color:var(--primary-color)' : ''}"></i>
                                                               </button>

                                                                <button class="simi-action-btn" title="更多"
                                                                    onclick="showSongMenu(event, '${songDataStr}')">
                                                                    <i class="fas fa-ellipsis-h"></i>
                                                                </button>
                                                            </div>
                                                        `;
                                                        container.appendChild(card);
                                                    });
                    } else {
                        container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">暂无相似推荐</div>';
                    }

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">加载失败</div>';
    } finally {
        if (btn) btn.classList.remove('is-loading');
    }
}

/**
 * 3. 推荐歌单 (网格) - 12个
 */
async function loadRecPlaylistsSection(btn) {
    if(btn) btn.classList.add('is-loading');
    const container = document.getElementById('recRecPlaylists');

    container.style.cssText = '';
    if (!container.hasChildNodes()) {
        container.innerHTML = '<div class="loading-state" style="grid-column: 1/-1">加载中...</div>';
    }

    try {
        // 1. 获取推荐歌单列表
        const response = await fetch(`${API_BASE}/recommended/playlist?limit=30&t=${Date.now()}`);
        const allPlaylists = await response.json();

        // 2. 随机取 6 个
        const targetPlaylists = shuffleArray(allPlaylists).slice(0, 6);

        container.innerHTML = '';

        if (targetPlaylists && targetPlaylists.length > 0) {

            // 3. 并行获取这 6 个歌单的详情(为了拿前3首歌)
            const detailPromises = targetPlaylists.map(pl =>
                fetch(`${API_BASE}/playlist/detail?playlistId=${pl.id || pl.playlistId}`)
                    .then(res => res.json())
                    .then(detail => ({
                        info: pl,
                        tracks: detail.songs || []
                    }))
                    .catch(() => ({ info: pl, tracks: [] }))
            );

            const playlistsWithSongs = await Promise.all(detailPromises);

            // 4. 渲染卡片
            playlistsWithSongs.forEach(item => {
                const playlist = item.info;
                const tracks = item.tracks;
                const top3 = tracks.slice(0, 3);

                const card = document.createElement('div');
                card.className = 'playlist-card';

                // 点击卡片任意位置：跳转详情页
                card.onclick = () => loadPlaylistDetail(playlist.id || playlist.playlistId, playlist.name);

                // 构建前3首歌的 HTML
                let songListHtml = '';
                top3.forEach((song, idx) => {
                    songListHtml += `
                        <div class="overlay-song-item">
                            ${idx + 1} ${song.title}
                        </div>`;
                });

                // 构建 HTML 结构
                // 注意：这里去掉了原来的底部 <p> 标签，将标题移入了 .info-overlay 中
                card.innerHTML = `
                    <img src="${playlist.coverImgUrl || playlist.coverUrl}" alt="${playlist.name}" onerror="this.src='placeholder.png'">

                    <div class="info-overlay">
                        <div class="overlay-title">${playlist.name}</div>

                        <div class="overlay-song-list">
                            ${songListHtml || '<div class="overlay-song-item">点击查看详情</div>'}
                        </div>

                        <div class="overlay-play-btn" title="播放全部">
                            <i class="fas fa-play"></i>
                        </div>
                    </div>
                `;

                // 绑定播放按钮事件
                const playBtn = card.querySelector('.overlay-play-btn');
                playBtn.onclick = (e) => {
                    e.stopPropagation(); // 阻止冒泡
                    playRecommendList(tracks);
                };

                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1">暂无推荐歌单</div>';
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1">加载失败</div>';
    } finally {
        if(btn) btn.classList.remove('is-loading');
    }
}

/**
 * 4. 榜单精选 (卡片) - 6个
 */
async function loadChartsSection(btn) {
    if(btn) btn.classList.add('is-loading');
    const container = document.getElementById('recCharts');
    container.className = 'charts-grid'; // 确保 CSS 生效
    container.style.cssText = "";

    if (!container.hasChildNodes()) {
        container.innerHTML = '<div class="loading-state">正在加载榜单...</div>';
    }

    try {
        const response = await fetch(`${API_BASE}/charts?t=${Date.now()}`);
        const allCharts = await response.json();

        // 随机打乱并取 6 个
        const shuffledCharts = shuffleArray(allCharts);
        const targetCharts = shuffledCharts.slice(0, 6);

        container.innerHTML = '';

        const chartPromises = targetCharts.map(async (chart) => {
            const detailRes = await fetch(`${API_BASE}/playlist/detail?playlistId=${chart.playlistId}&t=${Date.now()}`);
            const detailData = await detailRes.json();
            return { info: chart, songs: detailData.songs || [] };
        });

        const chartsWithSongs = await Promise.all(chartPromises);

        chartsWithSongs.forEach(data => {
            const chartInfo = data.info;
            const top3Songs = data.songs.slice(0, 3);

            const card = document.createElement('div');
            card.className = 'chart-card'; // 对应 CSS 类
            card.onclick = () => loadPlaylistDetail(chartInfo.playlistId, chartInfo.name);

            let songsHtml = '';
            if (top3Songs.length > 0) {
                top3Songs.forEach((s, idx) => {
                    const rank = idx + 1;
                    const rankClass = rank <= 3 ? 'top-rank' : '';
                    songsHtml += `
                        <div class="chart-song-item" title="${s.title} - ${s.artist}">
                            <span class="rank-num ${rankClass}">${rank}</span>
                            <span class="song-name">${s.title}</span>
                            <span class="artist-name"> - ${s.artist}</span>
                        </div>
                    `;
                });
            } else {
                songsHtml = '<div style="color:#ccc; font-size:0.8em; padding-top:20px;">暂无歌曲数据</div>';
            }

            const updateText = chartInfo.updateFrequency || '每日更新';

            card.innerHTML = `
                <div class="chart-header">
                    <span class="chart-name">${chartInfo.name}</span>
                    <span class="chart-update">${updateText}</span>
                </div>
                <div class="chart-body">
                    <img src="${chartInfo.coverImgUrl}" class="chart-cover" onerror="this.src='placeholder.png'">
                    <div class="chart-song-list">
                        ${songsHtml}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state">榜单加载失败</div>';
    } finally {
        if(btn) btn.classList.remove('is-loading');
    }
}

function initRecommendationPage() {
    hideAllContentPages();
    const recView = document.getElementById('recommendationView');
    if (recView) recView.style.display = 'block';
    if (refreshBtn) refreshBtn.style.display = 'none';

    updateGreeting();

    // 并行加载
    if (!isRecommendationLoaded) {
            console.log("初始化推荐页面数据..."); // 调试日志

            // 并行加载所有模块
            loadHotSongsSection();
            loadSimiSongsSection();
            loadRecPlaylistsSection();
            loadChartsSection();

            // 标记为已加载，下次进入不再触发
            isRecommendationLoaded = true;
    }
}

function switchPlaylistTab(type) {
    AppState.playlistTab = type;
    document.getElementById('tabCustomPlaylist').className = type === 'custom' ? 'toggle-tab active' : 'toggle-tab';
    document.getElementById('tabCollectedPlaylist').className = type === 'collected' ? 'toggle-tab active' : 'toggle-tab';
    renderSidebarPlaylists();
}

function renderSidebarPlaylists() {
    const container = document.getElementById('sidebarPlaylistList');
    const list = AppState.playlistTab === 'custom' ? AppState.userPlaylists : AppState.favPlaylists;

    container.innerHTML = '';

    if (!list || list.length === 0) {
        container.innerHTML = '<div style="padding:10px 20px;color:#ccc;font-size:0.8em">暂无歌单</div>';
        return;
    }

    list.forEach(pl => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.onclick = () => loadPlaylistDetail(pl.id, pl.name, true);
        div.innerHTML = `<i class="fas fa-list-ul"></i> <span>${pl.name}</span>`;

        // 如果是“自建歌单”模式，绑定双击重命名事件
        if (AppState.playlistTab === 'custom') {
            div.ondblclick = (e) => {
            e.stopPropagation(); // 阻止冒泡，防止触发单击加载详情
            // 调用已有的重命名逻辑
            enableSidebarRename(pl.id, div, pl.name);
            };
            // 鼠标悬停提示
           div.title = "双击可重命名";
        }

        container.appendChild(div);
    });
}

async function loadUserPlaylists() {
    try {
        const res = await authenticatedFetch('/api/user/music/playlists', { method: 'GET' });
        if (res.ok) {
            const all = await res.json();

            // 1. 过滤掉 defaultPlaylist (我喜欢的音乐)，它不显示在侧边栏，只在"我的音乐"TAB显示
            const visiblePlaylists = all.filter(p => !p.defaultPlaylist);

            // 2. 分类：
            // - 自建歌单 (custom): 没有 creatorName (原作者) 的
            // - 收藏歌单 (fav/collected): 有 creatorName (原作者) 的
            // 注意：后端 getUsersPlaylists 必须返回 setCreatorName(p.getOriginalCreator())

            AppState.userPlaylists = visiblePlaylists.filter(p => !p.creatorName);
            AppState.favPlaylists = visiblePlaylists.filter(p => p.creatorName);

            renderSidebarPlaylists();
        }
    } catch (e) {
        console.error('加载歌单失败', e);
    }
}

function openCreatePlaylistModal() {
    const modal = document.getElementById('createPlaylistModal');
    const input = document.getElementById('newPlaylistNameInput');
    input.value = `新建歌单${AppState.userPlaylists.length + 1}`;
    modal.style.display = 'flex';
    input.focus();
    input.select();
}

async function confirmCreatePlaylist() {
    const modal = document.getElementById('createPlaylistModal');
    const input = document.getElementById('newPlaylistNameInput');
    const name = input.value.trim();

    // 获取挂载的待添加歌曲ID (如果有的话)
    const pendingSongId = modal.dataset.pendingSongId;

    if (!name) return showToast('歌单名不能为空', 'warning');

    //防止重复点击
    const confirmBtn = modal.querySelector('button[onclick="confirmCreatePlaylist()"]');
    const originalText = confirmBtn ? confirmBtn.innerText : '创建';
    if(confirmBtn) {
        confirmBtn.innerText = '处理中...';
        confirmBtn.disabled = true;
    }

    try {
        // 1. 请求创建歌单
        const res = await authenticatedFetch(`/api/user/music/playlist?name=${encodeURIComponent(name)}`, { method: 'POST' });

        if (res.ok) {
            // 假设后端返回创建好的歌单对象，包含 id
            // 如果后端只返回 boolean，你需要让后端返回新建的 playlist 对象，或者这里重新 fetch 列表取最新的
            const newPlaylist = await res.json();
            let successMsg = `歌单 "${name}" 创建成功`;

            // 2. 检查是否有待添加的歌曲，并且新歌单ID存在
            if (pendingSongId && newPlaylist && newPlaylist.id) {
                // 立即调用添加歌曲接口
                const addRes = await authenticatedFetch(`/api/user/music/playlist/${newPlaylist.id}/song`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ songId: parseInt(pendingSongId) })
                });

                if (addRes.ok) {
                    successMsg += " 并已添加歌曲";
                } else {
                    successMsg += "，但歌曲添加失败";
                }
            }

            showToast(successMsg, 'success');
            // 3. 清理工作
            closeModal('createPlaylistModal');
            delete modal.dataset.pendingSongId; // 清除标记

            // 4. 刷新侧边栏
            switchPlaylistTab('custom');
            await loadUserPlaylists();

        } else {
            const err = await res.json();
            showToast('创建失败: ' + (err.message || '未知错误'), 'error');
        }
    } catch (e) {
        console.error(e);
       showToast('操作失败，网络错误', 'error');
    } finally {
        if(confirmBtn) {
            confirmBtn.innerText = originalText;
            confirmBtn.disabled = false;
        }
    }
}

function enableSidebarRename(id, element, oldName) {
    const span = element.querySelector('span');
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.value = oldName;

    input.onclick = (e) => e.stopPropagation();
    input.ondblclick = (e) => e.stopPropagation();

    const save = async () => {
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
            try {
                const res = await authenticatedFetch(`/api/user/music/playlist/${id}?name=${encodeURIComponent(newName)}`, { method: 'PATCH' });
                if (res.ok) {
                    span.innerText = newName;
                    const pl = AppState.userPlaylists.find(p => p.id === id);
                    if (pl) pl.name = newName;
                } else {
                    span.innerText = oldName;
                    alert('重命名失败');
                }
            } catch (e) {
                span.innerText = oldName;
            }
        } else {
            span.innerText = oldName;
        }
    };

    input.onblur = save;
    input.onkeypress = (e) => { if (e.key === 'Enter') save(); };

    span.innerHTML = '';
    span.appendChild(input);
    input.focus();
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function toggleUserPopup() {
    const popup = document.getElementById('userPopup');
    if (popup.style.display === 'none' || popup.style.display === '') {
        renderPopupData();
        popup.style.display = 'block';
    } else {
        popup.style.display = 'none';
        hideAccountSwitcher();
    }
}

function renderPopupData() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const avatarEl = document.getElementById('popupAvatar');
    if (avatarEl) {
        avatarEl.src = user.avatarUrl || 'placeholder.png';
        avatarEl.onerror = () => { avatarEl.src = 'placeholder.png'; };
    }

    const nameEl = document.getElementById('popupNickname');
    if (nameEl) nameEl.innerText = user.username || user.phone || '未命名用户';

    const birthEl = document.getElementById('popupBirthday');
    if (birthEl) {
        birthEl.innerText = user.birthday ? user.birthday : '生日未设置';
    }

    const signEl = document.getElementById('popupSign');
    if (signEl) {
        signEl.innerText = user.signature ? user.signature : '个性签名：这个人很懒，什么都没写~';
        signEl.title = signEl.innerText;
    }
}

/**
 * ✅ 新增：同步更新登录历史中的用户信息
 * 确保修改头像/昵称后，切换账号列表也能即时更新
 */
function updateHistoryInfo(updatedUser) {
    let history = getLoginHistory();
    // 找到当前账号在历史记录中的位置
    const index = history.findIndex(h => h.phone === updatedUser.phone);

    if (index !== -1) {
        // 更新必要字段
        history[index].username = updatedUser.username;
        history[index].avatarUrl = updatedUser.avatarUrl;
        // 如果有其他需要同步的字段（如签名）也可以加在这里

        // 保存回 localStorage
        localStorage.setItem('login_history', JSON.stringify(history));
    }
}
/**
 * 0. 更新问候语
 */
function updateGreeting() {
    const userJson = localStorage.getItem('user');
    let username = '音乐爱好者';
    if (userJson) {
        const user = JSON.parse(userJson);
        username = user.username || user.phone || '用户';
    }
    const header = document.getElementById('recGreeting');
    if (header) {
        header.textContent = `HI ${username}，今日为你推荐`;
    }
}
// =======================================================
//   最近播放与批量操作模块 (Recent Playback & Batch Mode)
// =======================================================

let recentSongsCache = [];     // 缓存从后端获取的列表
let isBatchMode = false;       // 是否处于批量模式
let selectedRecentIds = new Set(); // 已选中的歌曲ID集合
let currentBatchType = 'general';  // 'general' (批量操作) | 'download' (批量下载)

/**
 * 1. 自动记录播放历史
 * 该函数在 playSong() 中被调用
 */
async function recordPlayHistory(song) {
    if (!localStorage.getItem('authToken')) return; // 未登录不记录

    // 构造符合后端 SongVO 的对象
    const historyData = {
        songId: song.songId,
        title: song.title,
        artist: song.artist,
        album: song.album || '未知专辑',
        coverUrl: song.coverUrl,
        duration: song.duration
    };

    try {
        // 调用后端接口
        await authenticatedFetch('/api/user/history/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(historyData)
        });
        // 如果当前正好停留在"最近播放"页面，刷新数据略显突兀，暂不自动刷新
    } catch (e) {
        console.warn("记录播放历史失败", e);
    }
}

/**
 * 2. 加载“最近播放”页面主逻辑
 */
async function loadRecentlyPlayed() {
    hideAllContentPages(); // 隐藏其他页面
    const view = document.getElementById('recentPlaybackView');
    if(view) view.style.display = 'block';

    // 每次进入重置状态
    exitBatchMode();

    const container = document.getElementById('recentListContainer');
    container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> 正在读取云端记录...</div>';

    try {
        const res = await authenticatedFetch('/api/user/history/list');
        if (res.ok) {
            recentSongsCache = await res.json();
            document.getElementById('recentCount').textContent = recentSongsCache.length + '首';
            renderRecentList(recentSongsCache);
        } else {
            container.innerHTML = '<div class="empty-state">获取失败，请稍后重试</div>';
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state">网络连接错误</div>';
    }
}

/**
 * 3. 渲染歌曲列表 (核心渲染函数，兼容批量模式)
 */
function renderRecentList(songs) {
    const container = document.getElementById('recentListContainer');
    container.innerHTML = '';

    // 1. 渲染表头 (注意：增加了操作栏宽度 120px -> 150px)
    const header = document.createElement('div');
    header.className = isBatchMode ? 'song-header grid-layout-detailed-batch' : 'song-header grid-layout-detailed';

    header.innerHTML = `
        ${isBatchMode ? '<span style="text-align:center">选</span>' : ''}
        <span class="song-index" style="text-align:center">#</span>
        <span></span> <span>标题</span>
        <span></span> <span>专辑</span>
        <span style="text-align:center">喜欢</span>
        <span style="text-align:right;padding-right:15px;">时长</span>
    `;
    container.appendChild(header);

    if (songs.length === 0) {
        container.innerHTML += '<div class="empty-state">暂无播放记录，去听听歌吧~</div>';
        return;
    }

    // 2. 渲染列表项
    songs.forEach((song, index) => {
            const div = document.createElement('div');
            div.className = `song-row-detailed ${selectedRecentIds.has(song.songId) ? 'selected' : ''}`;

            if (isBatchMode) {
                div.classList.add('grid-layout-detailed-batch');
                div.style.gridTemplateColumns = "40px 50px 60px 4fr 150px 2fr 40px 60px";
            } else {
                div.classList.add('grid-layout-detailed');
            }

            const sTitle = song.title || '未知标题';
            const sArtist = song.artist || '未知歌手';
            const sAlbum = song.album || '未知专辑';
            const sCover = song.coverUrl || 'placeholder.png';
            const durationStr = formatDuration(song.duration);
            // 编码数据
            const songDataStr = encodeURIComponent(JSON.stringify(song));

            div.onclick = (e) => handleRecentRowClick(e, song);

            const checkboxHtml = isBatchMode ?
                `<input type="checkbox" class="batch-checkbox" style="display:block;margin:0 auto;"
                ${selectedRecentIds.has(song.songId) ? 'checked' : ''} disabled>` : '';

            // ✅ 1. 判断是否已喜欢
            const isLiked = AppState.likedSongIds.has(song.songId);

            // ✅ 确保这里只有唯一的 actionBtns 定义
            const actionBtns = `
                <i class="fas fa-play action-icon" title="播放" onclick="event.stopPropagation(); playSongByObj('${songDataStr}')"></i>
                <i class="fas fa-plus-square action-icon" title="添加到播放列表" onclick="event.stopPropagation(); openAddMenu('${songDataStr}')"></i>
                <i class="fas fa-download action-icon" title="下载" onclick="event.stopPropagation(); handleDownload(${song.songId}, '${sTitle}')"></i>
                <i class="fas fa-ellipsis-h action-icon" title="更多" onclick="showSongMenu(event, '${songDataStr}')"></i>
            `;

            div.innerHTML = `
                ${checkboxHtml}
                <span class="song-index">${index + 1 < 10 ? '0' + (index + 1) : index + 1}</span>
                <img src="${sCover}" class="song-row-cover" loading="lazy" onerror="this.src='placeholder.png'">
                <div class="song-info-stack">
                    <div class="song-title" title="${sTitle}">${sTitle}</div>
                    <div class="song-artist" title="${sArtist}">${sArtist}</div>
                </div>
                <div class="song-actions-cell">
                    ${actionBtns}
                </div>
                <div class="song-album" title="${sAlbum}">${sAlbum}</div>

                <div class="like-cell">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart like-btn js-like-icon-${song.songId} ${isLiked ? 'is-favorited' : ''}"
                       style="${isLiked ? 'color:var(--primary-color)' : ''}"
                       title="${isLiked ? '已收藏' : '喜欢'}"
                       onclick="event.stopPropagation(); toggleFavorite(${song.songId}, this)">
                    </i>
                </div>

                <div class="duration-cell">${durationStr}</div>
            `;
            container.appendChild(div);
        });
}
/**
 * 4. 行点击交互
 */
function handleRecentRowClick(e, song) {
    // 忽略收藏心形的点击
    if (e.target.tagName === 'I' || e.target.classList.contains('action-icon')) return;

    if (isBatchMode) {
        // 批量模式：切换选中状态
        if (selectedRecentIds.has(song.songId)) {
            selectedRecentIds.delete(song.songId);
        } else {
            selectedRecentIds.add(song.songId);
        }
        updateBatchUI(); // 更新界面（全选框状态、选中数量）
    } else {
        // 普通模式：直接播放
        playSong(song, true); // true = 添加到播放列表末尾并播放
    }
}

/**
 * 5. 前端搜索过滤
 */
function filterRecentSongs(keyword) {
    keyword = keyword.toLowerCase().trim();
    // 从缓存数据中筛选
    const filtered = recentSongsCache.filter(s =>
        s.title.toLowerCase().includes(keyword) ||
        s.artist.toLowerCase().includes(keyword)
    );
    renderRecentList(filtered);
}

/**
 * 6. “播放全部”功能
 */
function playAllRecent() {
    if (!recentSongsCache.length) return alert('列表为空');
    // 替换当前播放列表
    currentPlaylist = [...recentSongsCache];
    if (playbackMode === 'shuffle') shufflePlaylist();
    // 播放第一首
    playSong(currentPlaylist[0], false, 0);
    renderMiniPlaylist();
    renderFullPlaylist();
}

/**
 * 7. 进入批量模式 (下载页 或 通用操作页)
 */
function enterBatchMode(type) {
    isBatchMode = true;
    currentBatchType = type;
    selectedRecentIds.clear(); // 清空旧选择

    // 显示底部操作栏
    const bar = document.getElementById('batchActionBar');
    bar.style.display = 'flex';

    // 切换按钮组显示
    document.getElementById('batchGeneralBtns').style.display = (type === 'general') ? 'flex' : 'none';
    document.getElementById('batchDownloadBtns').style.display = (type === 'download') ? 'flex' : 'none';

    // 重新渲染列表（此时 renderRecentList 会检测 isBatchMode 并显示复选框）
    const currentKeyword = document.getElementById('recentSearchInput').value;
    filterRecentSongs(currentKeyword);

    updateBatchUI();
}

/**
 * 8. 退出批量模式
 */
function exitBatchMode() {
    isBatchMode = false;
    selectedRecentIds.clear();

    document.getElementById('batchActionBar').style.display = 'none';
    document.getElementById('selectAllCheckbox').checked = false;

    // 重新渲染恢复原状
    const currentKeyword = document.getElementById('recentSearchInput').value;
    filterRecentSongs(currentKeyword);
}

/**
 * 9. 全选/反选
 */
function toggleSelectAll(isChecked) {
    // 获取当前筛选后的列表（支持搜索状态下的全选）
    const keyword = document.getElementById('recentSearchInput').value.toLowerCase().trim();
    const visibleSongs = recentSongsCache.filter(s =>
        s.title.toLowerCase().includes(keyword) ||
        s.artist.toLowerCase().includes(keyword)
    );

    visibleSongs.forEach(s => {
        if (isChecked) selectedRecentIds.add(s.songId);
        else selectedRecentIds.delete(s.songId);
    });

    updateBatchUI();
}

/**
 * 10. 更新批量操作界面状态 (计数、重新渲染选中高亮)
 */
function updateBatchUI() {
    // 更新计数
    document.getElementById('batchSelectCount').innerText = selectedRecentIds.size;

    // 更新列表高亮和复选框勾选 (通过重新渲染实现)
    const currentKeyword = document.getElementById('recentSearchInput').value;
    renderRecentList(
        recentSongsCache.filter(s =>
            s.title.toLowerCase().includes(currentKeyword.toLowerCase().trim()) ||
            s.artist.toLowerCase().includes(currentKeyword.toLowerCase().trim())
        )
    );
}

/**
 * 11. 执行批量操作
 */
async function batchAction(action) {
    if (selectedRecentIds.size === 0) return alert('请先选择至少一首歌曲');

    const selectedSongs = recentSongsCache.filter(s => selectedRecentIds.has(s.songId));
    const ids = Array.from(selectedRecentIds);

    switch(action) {
        case 'play':
            // 将选中歌曲加入播放列表并播放
            currentPlaylist = [...selectedSongs];
            if (playbackMode === 'shuffle') shufflePlaylist();
            playSong(currentPlaylist[0], false, 0);
            renderMiniPlaylist();
            renderFullPlaylist();
            exitBatchMode();
            break;

        case 'add':
            // 添加到当前播放列表（但不立即播放）
            let addedCount = 0;
            selectedSongs.forEach(s => {
                // 简单去重
                if (!currentPlaylist.find(p => p.songId === s.songId)) {
                    currentPlaylist.push(s);
                    addedCount++;
                }
            });
            renderMiniPlaylist();
            renderFullPlaylist();
            showToast(`已将 ${addedCount} 首新歌添加到播放队列`, 'success');
            exitBatchMode();
            break;

        case 'download':
            // 批量下载逻辑
            if(confirm(`准备下载 ${selectedSongs.length} 首歌曲？\n(注意：浏览器可能会拦截多个弹窗，请务必点击“允许”或留意地址栏拦截提示)`)) {
                            selectedSongs.forEach((s, index) => {
                                // 使用 setTimeout 错开请求
                                // 配合 iframe 方案，1500毫秒 (1.5秒) 的间隔通常足够
                                setTimeout(() => {
                                    handleDownload(s.songId, `${s.title}-${s.artist}`);
                                }, index * 1500);
                            });
            }
            exitBatchMode();
            break;

        case 'delete':
            // 删除记录
            if(!confirm(`确定要从历史记录中移除这 ${ids.length} 首歌吗？`)) return;
            try {
                const res = await authenticatedFetch('/api/user/history/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(ids)
                });
                if(res.ok) {
                    // 后端删除成功后，同步更新前端缓存
                    recentSongsCache = recentSongsCache.filter(s => !selectedRecentIds.has(s.songId));
                    exitBatchMode(); // 退出模式
                    renderRecentList(recentSongsCache); // 刷新列表
                    document.getElementById('recentCount').textContent = recentSongsCache.length + '首';
                    showToast('删除成功', 'success');
                } else {
                   showToast('删除失败', 'error');
                }
            } catch(e) {
                console.error(e);
                alert('网络错误，删除失败');
            }
            break;
    }
}

// ======================= 我的音乐 (My Music) 模块 =======================

const MyMusicState = {
    currentTab: 'songs', // 'songs' | 'playlists' | 'charts'
    dataList: [],        // 当前Tab展示的数据全集 (用于搜索过滤)
    selectedIds: new Set(), // 选中的 ID 集合
    isBatchMode: false,
    batchType: null      // 'general' | 'download' | 'playlist'
};

/**
 * 1. 初始化入口：点击侧边栏“我的音乐”时调用
 */
async function loadMyMusicPage() {
    hideAllContentPages();
    document.getElementById('myMusicView').style.display = 'block';

    // 默认加载歌曲 Tab
    switchMyMusicTab('songs');
}

/**
 * 2. Tab 切换逻辑
 */
function switchMyMusicTab(tabName) {
    MyMusicState.currentTab = tabName;

    // 防止 exitMyMusicBatchMode -> getFilteredData 使用错误的字段（如 name vs title）过滤旧数据导致崩溃
    MyMusicState.dataList = [];

    exitMyMusicBatchMode(); // 切换Tab时退出批量模式

    // 1. 更新 Tab 高亮
    document.querySelectorAll('.music-tab').forEach(el => el.classList.remove('active'));
    const activeTab = document.querySelector(`.music-tab[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    // 2. 切换工具栏显示
    const songsToolbar = document.getElementById('myMusicSongsToolbar');
    const playlistToolbar = document.getElementById('myMusicPlaylistToolbar');
    const listContainer = document.getElementById('myMusicListContainer');

    if (tabName === 'songs') {
        if(songsToolbar) songsToolbar.style.display = 'flex';
        if(playlistToolbar) playlistToolbar.style.display = 'none';

        if(listContainer) {
            listContainer.className = 'list-container song-list';
            loadMyFavoriteSongs();
        }
    } else {
        if(songsToolbar) songsToolbar.style.display = 'none';
        if(playlistToolbar) playlistToolbar.style.display = 'flex';

        if(listContainer) {
            listContainer.className = 'list-container playlist-mode'; // 切换为网格布局
            loadMyCollection(tabName);
        }
    }
}

/**
 * 3. 加载“歌曲” (即“我喜欢的音乐”歌单)
 */
async function loadMyFavoriteSongs() {
    const container = document.getElementById('myMusicListContainer');
    container.innerHTML = '<div class="loading-state">加载中...</div>';

    try {
        // 先获取所有歌单，找到 defaultPlaylist = true 的那个
        const res = await authenticatedFetch('/api/user/music/playlists');
        if (!res.ok) throw new Error("加载失败");
        const playlists = await res.json();
        const favPlaylist = playlists.find(p => p.defaultPlaylist);

        if (favPlaylist) {
            // 获取该歌单详情
            const detailRes = await authenticatedFetch(`/api/user/music/playlist/${favPlaylist.id}`);
            const detail = await detailRes.json();

            MyMusicState.dataList = detail.songs || [];
            renderMyMusicSongs(MyMusicState.dataList);
        } else {
            container.innerHTML = '<div class="empty-state">暂无喜欢的歌曲</div>';
            MyMusicState.dataList = [];
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
}

/**
 * 4. 加载“歌单”或“排行榜”
 * 简单的区分逻辑：如果歌单名字包含“榜”或者创建者是“网易云音乐”，归为排行榜；否则为普通歌单
 */
async function loadMyCollection(type) {
    const container = document.getElementById('myMusicListContainer');
    container.innerHTML = '<div class="loading-state">加载中...</div>';

    try {
        const res = await authenticatedFetch('/api/user/music/playlists');
        if (!res.ok) throw new Error("加载失败");
        const allPlaylists = await res.json();

        // 过滤掉默认歌单
        const collections = allPlaylists.filter(p => !p.defaultPlaylist);

        // 区分歌单和排行榜 (简单规则)
        let filteredList = [];
        if (type === 'charts') {
            // 假设名字含“榜”或者是某些特定创建者
            filteredList = collections.filter(p => p.name.includes('榜') || p.name.includes('Top') || p.name.includes('云音乐'));
        } else {
            // 普通歌单：排除掉上面的
            filteredList = collections.filter(p => !(p.name.includes('榜') || p.name.includes('Top') || p.name.includes('云音乐')) && p.creatorName);
        }

        MyMusicState.dataList = filteredList;
        renderMyMusicPlaylists(filteredList);

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
}

/**
 * 5. 渲染歌曲列表
 */
function renderMyMusicSongs(songs) {
    const container = document.getElementById('myMusicListContainer');
    container.innerHTML = '';

    if (!songs || songs.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无歌曲</div>';
        return;
    }

    // 1. 渲染表头 (同样调整宽度)
    const header = document.createElement('div');
    header.className = MyMusicState.isBatchMode ? 'song-header grid-layout-detailed-batch' : 'song-header grid-layout-detailed';

    header.innerHTML = `
        ${MyMusicState.isBatchMode ? '<span style="text-align:center">选</span>' : ''}
        <span class="song-index" style="text-align:center">#</span>
        <span></span>
        <span>标题</span>
        <span></span>
        <span>专辑</span>
        <span style="text-align:center">喜欢</span>
        <span style="text-align:right;padding-right:15px;">时长</span>
    `;
    container.appendChild(header);

    // 2. 渲染列表
    songs.forEach((song, index) => {
        const div = document.createElement('div');
        div.className = `song-row-detailed ${MyMusicState.selectedIds.has(song.songId) ? 'selected' : ''}`;

        if(MyMusicState.isBatchMode) {
             div.classList.add('grid-layout-detailed-batch');
             div.style.gridTemplateColumns = "40px 50px 60px 4fr 150px 2fr 40px 60px";
        } else {
             div.classList.add('grid-layout-detailed');
        }

        const sTitle = song.title || '未知标题';
        const sArtist = song.artist || '未知歌手';
        const sAlbum = song.album || '-';
        const sCover = song.coverUrl || 'placeholder.png';
        const durationStr = formatDuration(song.duration);
        const songDataStr = encodeURIComponent(JSON.stringify(song));

        div.onclick = (e) => {
             if (MyMusicState.isBatchMode) {
                 toggleMyMusicSelection(song.songId);
             } else {
                 playSong(song, true);
             }
        };

        const checkboxHtml = MyMusicState.isBatchMode ?
            `<input type="checkbox" class="batch-checkbox" style="display:block;margin:0 auto;"
            ${MyMusicState.selectedIds.has(song.songId) ? 'checked' : ''} disabled>` : '';

        const actionBtns = `
            <i class="fas fa-play action-icon" title="播放" onclick="event.stopPropagation(); playSongByObj('${songDataStr}')"></i>
            <i class="fas fa-plus-square action-icon" title="添加到播放列表" onclick="event.stopPropagation(); openAddMenu('${songDataStr}')"></i>
            <i class="fas fa-download action-icon" title="下载" onclick="event.stopPropagation(); handleDownload(${song.songId}, '${sTitle}')"></i>
            <i class="fas fa-ellipsis-h action-icon" title="更多" onclick="showSongMenu(event, '${songDataStr}')"></i>
        `;

        div.innerHTML = `
            ${checkboxHtml}
            <span class="song-index">${index + 1 < 10 ? '0' + (index + 1) : index + 1}</span>
            <img src="${sCover}" class="song-row-cover" loading="lazy" onerror="this.src='placeholder.png'">
            <div class="song-info-stack">
                <div class="song-title" title="${sTitle}">${sTitle}</div>
                <div class="song-artist" title="${sArtist}">${sArtist}</div>
            </div>
            <div class="song-actions-cell">
                ${actionBtns}
            </div>
            <div class="song-album" title="${sAlbum}">${sAlbum}</div>
            <div class="like-cell">
                <i class="fas fa-heart like-btn is-favorited js-like-icon-${song.songId}"
                   style="color:var(--primary-color)"
                   title="已收藏 (点击取消)"
                   onclick="event.stopPropagation(); toggleFavorite(${song.songId}, this)">
                </i>
            </div>
            <div class="duration-cell">${durationStr}</div>
        `;
        container.appendChild(div);
    });
}

/**
 * 6. 渲染歌单/排行榜列表 (卡片式)
 */
function renderMyMusicPlaylists(playlists) {
    const container = document.getElementById('myMusicListContainer');
    container.innerHTML = '';

    if (!playlists || playlists.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无内容</div>';
        return;
    }

    playlists.forEach(pl => {
        const card = document.createElement('div');
        card.className = `playlist-card ${MyMusicState.selectedIds.has(pl.id) ? 'selected-card' : ''}`;
        card.style.position = 'relative'; // 为了定位checkbox

        if (MyMusicState.isBatchMode) {
            card.onclick = () => toggleMyMusicSelection(pl.id);
            if (MyMusicState.selectedIds.has(pl.id)) {
                card.innerHTML += `<input type="checkbox" checked class="batch-checkbox-overlay" disabled>`;
            } else {
                card.innerHTML += `<input type="checkbox" class="batch-checkbox-overlay" disabled>`;
            }
        } else {
            card.onclick = () => loadPlaylistDetail(pl.id, pl.name, true);
        }

        const img = document.createElement('img');
        img.src = pl.coverImgUrl || 'placeholder.png';

        const p = document.createElement('p');
        p.innerText = pl.name;

        card.appendChild(img);
        card.appendChild(p);
        container.appendChild(card);
    });
}

// ======================= 批量操作逻辑 =======================

function enterMyMusicBatchMode(type) {
    MyMusicState.isBatchMode = true;
    MyMusicState.batchType = type; // 'general' | 'download'
    MyMusicState.selectedIds.clear();

    document.getElementById('myMusicBatchBar').style.display = 'flex';
    document.getElementById('mmSelectAllCheckbox').checked = false;

    // 显示对应的按钮组
    document.getElementById('mmBatchGeneralBtns').style.display = (type === 'general') ? 'flex' : 'none';
    document.getElementById('mmBatchDownloadBtns').style.display = (type === 'download') ? 'flex' : 'none';
    document.getElementById('mmBatchPlaylistBtns').style.display = 'none';

    refreshMyMusicUI();
}

function enterMyMusicPlaylistBatchMode() {
    MyMusicState.isBatchMode = true;
    MyMusicState.batchType = 'playlist';
    MyMusicState.selectedIds.clear();

    document.getElementById('myMusicBatchBar').style.display = 'flex';
    document.getElementById('mmSelectAllCheckbox').checked = false;

    document.getElementById('mmBatchGeneralBtns').style.display = 'none';
    document.getElementById('mmBatchDownloadBtns').style.display = 'none';
    document.getElementById('mmBatchPlaylistBtns').style.display = 'flex'; // 显示删除歌单按钮

    refreshMyMusicUI();
}

function exitMyMusicBatchMode() {
    MyMusicState.isBatchMode = false;
    MyMusicState.batchType = null;
    MyMusicState.selectedIds.clear();
    document.getElementById('myMusicBatchBar').style.display = 'none';
    refreshMyMusicUI();
}

function toggleMyMusicSelection(id) {
    if (MyMusicState.selectedIds.has(id)) {
        MyMusicState.selectedIds.delete(id);
    } else {
        MyMusicState.selectedIds.add(id);
    }
    document.getElementById('myMusicSelectCount').innerText = MyMusicState.selectedIds.size;
    refreshMyMusicUI();
}

function toggleMyMusicSelectAll(checked) {
    const currentList = getFilteredData(); // 获取当前搜索过滤后的列表

    if (checked) {
        currentList.forEach(item => {
            const id = (MyMusicState.currentTab === 'songs') ? item.songId : item.id;
            MyMusicState.selectedIds.add(id);
        });
    } else {
        MyMusicState.selectedIds.clear();
    }
    document.getElementById('myMusicSelectCount').innerText = MyMusicState.selectedIds.size;
    refreshMyMusicUI();
}

function refreshMyMusicUI() {
    const list = getFilteredData();
    if (MyMusicState.currentTab === 'songs') {
        renderMyMusicSongs(list);
    } else {
        renderMyMusicPlaylists(list);
    }
}

// ======================= 搜索过滤 =======================

function searchMyMusicSongs(keyword) {
    // 触发重绘，render中使用 getFilteredData
    refreshMyMusicUI();
}

function searchMyMusicPlaylists(keyword) {
    refreshMyMusicUI();
}

/**
 * 获取经过搜索框过滤后的数据
 */
function getFilteredData() {
    let keyword = '';
    if (MyMusicState.currentTab === 'songs') {
        keyword = document.getElementById('myMusicSongSearch').value.toLowerCase();
        return MyMusicState.dataList.filter(s => s.title.toLowerCase().includes(keyword) || s.artist.toLowerCase().includes(keyword));
    } else {
        keyword = document.getElementById('myMusicPlaylistSearch').value.toLowerCase();
        return MyMusicState.dataList.filter(p => p.name.toLowerCase().includes(keyword));
    }
}
// ======================= 搜索增强模块 =======================

// 1. 初始化搜索框交互
function initSearchEvents() {
    const input = document.getElementById('searchInput');
    const overlay = document.getElementById('searchOverlay');
    const searchBtn = document.getElementById('searchBtn');

    if (!input || !overlay || !searchBtn) return;

    // 聚焦输入框：显示悬浮层
    input.addEventListener('focus', () => {
        renderSearchHistory();
        loadHotSearch();
        overlay.style.display = 'block';
    });

    // 点击其他区域：关闭悬浮层
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !overlay.contains(e.target) && e.target !== searchBtn) {
            overlay.style.display = 'none';
        }
    });

    // 阻止悬浮层内部点击冒泡
    overlay.addEventListener('click', (e) => e.stopPropagation());

    // 绑定新的搜索逻辑
    searchBtn.onclick = () => {
        performSearch(input.value);
        overlay.style.display = 'none';
    };

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch(input.value);
            overlay.style.display = 'none';
        }
    });
}

// 2. 加载热门搜索
async function loadHotSearch() {
    const list = document.getElementById('hotSearchList');
    if (list.querySelector('.hot-item')) return; // 防止重复加载

    try {
        const res = await fetch(`${API_BASE}/search/hot`);
        const hotWords = await res.json();

        list.innerHTML = '';
        hotWords.forEach((word, index) => {
            const div = document.createElement('div');
            div.className = 'hot-item';
            div.onclick = () => {
                performSearch(word);
                document.getElementById('searchOverlay').style.display = 'none';
            };
            div.innerHTML = `<span class="hot-index">${index + 1}</span><span class="hot-word">${word}</span>`;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = '<div style="padding:10px;color:#999;font-size:0.8em">热搜加载失败</div>';
    }
}

// 3. 渲染历史记录
function renderSearchHistory() {
    const container = document.getElementById('searchHistoryTags');
    const section = document.getElementById('historySection');
    container.innerHTML = '';

    if (searchHistory.length === 0) {
        if(section) section.style.display = 'none';
        return;
    }
    if(section) section.style.display = 'block';

    searchHistory.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'history-tag';
        span.textContent = tag;
        span.onclick = () => {
            performSearch(tag);
            document.getElementById('searchOverlay').style.display = 'none';
        };
        container.appendChild(span);
    });
}

// 4. 清空历史
function clearSearchHistory() {
    if(confirm("确定清空搜索历史吗？")) {
        searchHistory = [];
        localStorage.removeItem('search_history');
        renderSearchHistory();
    }
}

// 5. 执行搜索 (入口)
function performSearch(keyword) {
    if (!keyword || !keyword.trim()) return;
    keyword = keyword.trim();

    document.getElementById('searchInput').value = keyword;

    // 更新历史
    searchHistory = searchHistory.filter(h => h !== keyword);
    searchHistory.unshift(keyword);
    if (searchHistory.length > 10) searchHistory.pop();
    localStorage.setItem('search_history', JSON.stringify(searchHistory));

    currentSearchKeyword = keyword;

    // 切换视图
    hideAllContentPages();
    document.getElementById('searchResultView').style.display = 'block';
    document.getElementById('searchKeywordTitle').textContent = `搜索 "${keyword}"`;

    // 默认搜歌曲
    switchSearchTab(1);
}

// 6. 切换 Tab
function switchSearchTab(type, subType = null) {
    currentSearchType = type;

    document.querySelectorAll('.search-tab').forEach(tab => {
        tab.classList.remove('active');
        const tabType = tab.getAttribute('data-type');
        if (subType === 'charts') {
            if (tabType === '1000_chart') tab.classList.add('active');
        } else {
            if (tabType == type && tabType !== '1000_chart') tab.classList.add('active');
        }
    });

    loadSearchResults(type, subType);
}

// 7. 加载数据
async function loadSearchResults(type, subType) {
    const container = document.getElementById('searchResultContainer');
    container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> 正在搜索...</div>';

    // 重置容器样式
    container.className = 'list-container';
    container.style.display = 'block';

    try {
        const url = `${API_BASE}/search?keywords=${encodeURIComponent(currentSearchKeyword)}&type=${type}`;
        const response = await fetch(url);
        const data = await response.json();
        renderSearchResultByType(data, type, subType, container);
    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="empty-state">搜索失败: ${error.message}</div>`;
    }
}

// 8. 渲染逻辑 (关键修改点：确保歌曲使用详细列表样式)
function renderSearchResultByType(data, type, subType, container) {
    // --- 1. 重置容器状态 ---
    container.innerHTML = '';
    container.removeAttribute('style'); // 清除内联样式

    // --- 2. 根据类型动态设置容器类名 ---
    if (type === 1) {
        // 歌曲模式：必须加上 song-list 类，确保 display: block 使其垂直排列
        container.className = 'list-container song-list';
    } else if (type === 100) {
        // 歌手模式：使用 6 列网格
        container.className = 'artist-grid';
    } else {
        // 歌单/排行榜：使用默认 5 列网格
        container.className = 'list-container';
    }

    // 过滤逻辑
    let list = data;
    if (subType === 'charts') {
        list = data.filter(item => item.name.includes('榜') || item.name.includes('Top') || item.name.includes('云音乐'));
    } else if (type === 1000) {
        list = data.filter(item => !(item.name.includes('榜') || item.name.includes('Top') || item.name.includes('云音乐')));
    }

    if (!list || list.length === 0) {
        container.innerHTML = '<div class="empty-state">未找到相关内容</div>';
        return;
    }

    // --- 3. 渲染歌曲内容 (Type 1) ---
    if (type === 1) {
        // 渲染详细表头 (同步最近播放)
        const header = document.createElement('div');
        header.className = 'song-header grid-layout-detailed';
        header.innerHTML = `
            <span class="song-index" style="text-align:center">#</span>
            <span></span> <span>标题</span>
            <span></span> <span>专辑</span>
            <span style="text-align:center">喜欢</span>
            <span style="text-align:right;padding-right:15px;">时长</span>
        `;
        container.appendChild(header);

        list.forEach((song, index) => {
            const div = document.createElement('div');
            div.className = 'song-row-detailed grid-layout-detailed';

            const isLiked = AppState.likedSongIds.has(song.songId);

            const sTitle = song.title || '未知标题';
            const sArtist = song.artist || '未知歌手';
            const sAlbum = song.album || '未知专辑';
            const sCover = song.coverUrl || 'placeholder.png';
            const durationStr = formatDuration(song.duration);
            const songDataStr = encodeURIComponent(JSON.stringify(song));

            const actionBtns = `
                            <i class="fas fa-play action-icon" title="播放" onclick="event.stopPropagation(); playSongByObj('${songDataStr}')"></i>
                            <i class="fas fa-plus-square action-icon" title="添加到播放列表" onclick="event.stopPropagation(); openAddMenu('${songDataStr}')"></i>
                            <i class="fas fa-download action-icon" title="下载" onclick="event.stopPropagation(); handleDownload(${song.songId}, '${sTitle}')"></i>
                            <i class="fas fa-ellipsis-h action-icon" title="更多" onclick="showSongMenu(event, '${songDataStr}')"></i>
                        `;

                        div.innerHTML = `
                                        <span class="song-index">${index + 1 < 10 ? '0' + (index + 1) : index + 1}</span>
                                        <img src="${sCover}" class="song-row-cover" loading="lazy" onerror="this.src='placeholder.png'">
                                        <div class="song-info-stack">
                                            <div class="song-title" title="${sTitle}">${sTitle}</div>
                                            <div class="song-artist" title="${sArtist}">${sArtist}</div>
                                        </div>
                                        <div class="song-actions-cell">${actionBtns}</div>
                                        <div class="song-album" title="${sAlbum}">${sAlbum}</div>

                                        <div class="like-cell">
                                            <i class="${isLiked ? 'fas' : 'far'} fa-heart like-btn js-like-icon-${song.songId} ${isLiked ? 'is-favorited' : ''}"
                                               style="${isLiked ? 'color:var(--primary-color)' : ''}"
                                               title="${isLiked ? '已收藏' : '喜欢'}"
                                               onclick="event.stopPropagation(); toggleFavorite(${song.songId}, this)">
                                            </i>
                                        </div>

                                        <div class="duration-cell">${durationStr}</div>
                                    `;

                        div.ondblclick = () => playSong(song, true);
                        container.appendChild(div);
                    });
    }
    // 情况 2：歌手 (Type 100)
    else if (type === 100) {
        container.className = 'artist-grid'; //
        list.forEach(artist => {
            const div = document.createElement('div');
            div.className = 'artist-card';
            const pic = artist.picUrl || 'placeholder.png';
            div.innerHTML = `
                <div class="artist-img-wrap">
                    <img src="${pic}" onerror="this.src='placeholder.png'" alt="${artist.name}">
                </div>
                <div class="artist-name" title="${artist.name}">${artist.name}</div>
                <div class="artist-meta">
                    <span>单曲:${artist.musicSize || 0}</span>
                    <span>专辑:${artist.albumSize || 0}</span>
                </div>
            `;
            div.onclick = () => performSearch(artist.name);
            container.appendChild(div);
        });
    }
    // 情况 3：歌单 (Type 1000)
    else if (type === 1000) {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(5, 1fr)';
        container.style.gap = '20px';

        list.forEach(pl => {
            const div = document.createElement('div');
            div.className = 'playlist-card';
            div.onclick = () => loadPlaylistDetail(pl.playlistId || pl.id, pl.name);
            div.innerHTML = `
                <img src="${pl.coverImgUrl || 'placeholder.png'}" onerror="this.src='placeholder.png'">
                <p title="${pl.name}">${pl.name}</p>
            `;
            container.appendChild(div);
        });
    }
}

// ======================= 动作执行 =======================

async function mmBatchAction(action) {
    if (MyMusicState.selectedIds.size === 0) return alert("请先选择项目");

    // 获取选中的对象列表
    const selectedItems = MyMusicState.dataList.filter(item => MyMusicState.selectedIds.has(item.songId));

    if (action === 'play') {
        // 播放选中
        currentPlaylist = [...selectedItems];
        if (playbackMode === 'shuffle') shufflePlaylist();
        playSong(currentPlaylist[0], false, 0);
        renderMiniPlaylist();
        renderFullPlaylist();
        exitMyMusicBatchMode();

    } else if (action === 'add') {
        // 弹出弹窗：加入播放列表 OR 加入歌单
        // 这里简化：直接复用加入播放列表逻辑，或者你可以弹出一个模态框
        // 暂时只实现加入当前播放列表
        selectedItems.forEach(s => {
             if (!currentPlaylist.find(p => p.songId === s.songId)) {
                currentPlaylist.push(s);
             }
        });
        renderMiniPlaylist();
        renderFullPlaylist();
        showToast(`已添加 ${selectedItems.length} 首歌到播放列表`, "success");
        exitMyMusicBatchMode();

    } else if (action === 'download') {
        // 批量下载
        if (confirm(`确定下载选中的 ${selectedItems.length} 首歌吗？`)) {
            selectedItems.forEach(s => {
                handleDownload(s.songId, `${s.title}-${s.artist}`);
            });
        }
        exitMyMusicBatchMode();

    } else if (action === 'delete') {
        // 取消喜欢 (从“我喜欢的音乐”移除)
        if (!confirm(`确定将这 ${selectedItems.length} 首歌从喜欢列表中移除吗？`)) return;

        // 需要知道默认歌单ID
        const res = await authenticatedFetch('/api/user/music/playlists');
        const playlists = await res.json();
        const favPlaylist = playlists.find(p => p.defaultPlaylist);

        if (favPlaylist) {
             for (let item of selectedItems) {
                 // 调用移除接口（需后端支持 removeSongFromMyPlaylist 类似逻辑，通常是 DELETE /playlist/{pid}/song/{sid}，这里假设复用 script.js 里的逻辑）
                 // 注意：这里需要你确保 script.js 或 controller 有单个移除的接口，或者我们需要扩展一个批量移除接口
                 // 暂时循环调用移除单曲
                 await authenticatedFetch(`/api/user/music/playlist/${favPlaylist.id}/song/${item.songId}`, { method: 'DELETE' });
             }
             showToast("移除成功", "success");
             loadMyFavoriteSongs(); // 刷新列表
        }
    }
}

async function mmBatchPlaylistAction(action) {
     if (MyMusicState.selectedIds.size === 0) return alert("请先选择歌单");

     if (action === 'delete') {
         if (!confirm(`确定删除选中的 ${MyMusicState.selectedIds.size} 个歌单吗？`)) return;

         for (let id of MyMusicState.selectedIds) {
             await authenticatedFetch(`/api/user/music/playlist/${id}`, { method: 'DELETE' });
         }
         showToast("删除成功", "success");
         loadMyCollection(MyMusicState.currentTab); // 刷新
         exitMyMusicBatchMode();
     }
}

// 播放全部按钮
function playAllMyMusicSongs() {
    if (MyMusicState.dataList.length === 0) return showToast("列表为空", "warning");
    currentPlaylist = [...MyMusicState.dataList];
    playSong(currentPlaylist[0], false, 0);
    renderMiniPlaylist();
    renderFullPlaylist();
}
// 1. 打开报告中心主入口
async function openAiReportCenter() {
    // 显示新建立的独立弹窗
    document.getElementById('aiReportModal').style.display = 'flex';

    // 初始化显示状态
    const reportText = document.getElementById('aiReportText');
    reportText.innerHTML = '<div class="thinking-box"><div class="thinking-title">正在调取云端记录...</div></div>';
    document.getElementById('aiRecSongsSection').style.display = 'none';

    try {
        // 获取该用户的所有历史报告记录 (后端需实现此接口)
        const res = await authenticatedFetch('/api/ai/reports/history');
        if (!res.ok) {
                    throw new Error(`获取历史记录失败: ${res.status}`);
                }
        const history = await res.json();

        if (!Array.isArray(history)) {
                    console.warn("历史记录格式错误，应为数组:", history);
                    // 如果后端返回了空或错误格式，给一个空数组防止报错
                    renderReportHistorySidebar([]);
                } else {
                    // 渲染左侧历史列表
                    renderReportHistorySidebar(history);

                    // 逻辑判断：如果没有历史记录，则自动触发生成一份新的
                    if (history.length === 0) {
                        await generateNewAiReport();
                    } else {
                        // 否则默认展示最新的一份报告
                        renderReportDetail(history[0]);
                    }
                }
    } catch (err) {
        console.error("加载报告中心失败:", err);
        reportText.innerHTML = `<div class="empty-state" style="color:#F56C6C;">❌ 报告加载失败: ${err.message}</div>`;
    }
}

// 2. 侧边栏渲染逻辑
function renderReportHistorySidebar(data) {
    const listContainer = document.getElementById('reportHistoryList');
    listContainer.innerHTML = '<h4>历史记录</h4>';

    data.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-report-item';
        // 命名规则：报告 1, 报告 2...
        const dateStr = new Date(item.createTime).toLocaleDateString();
        div.innerHTML = `<i class="far fa-file-alt"></i> 听歌报告 ${data.length - index} <br><small>${dateStr}</small>`;

        // 点击切换报告内容
        div.onclick = () => {
            // 切换 active 类名
            document.querySelectorAll('.history-report-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            renderReportDetail(item);
        };
        listContainer.appendChild(div);
    });
}

// 3. 渲染单份报告详情（含推荐歌曲搜索）
async function renderReportDetail(report) {
    const textContainer = document.getElementById('aiReportText');
    const recSection = document.getElementById('aiRecSongsSection');
    const recGrid = document.getElementById('aiRecGrid');

    // 填充文本报告
    textContainer.innerHTML = `
        <div class="thinking-box" style="border-left-color: #67C23A;">
            <div class="thinking-title" style="color:#67C23A;"><i class="fas fa-check-circle"></i> 深度分析完成</div>
        </div>
        <div class="report-final" style="font-size:1.1em; line-height:1.8;">
            ${report.content.replace(/\n/g, '<br>')}
        </div>
    `;

    // 处理推荐歌曲 (解析后端存储的 "歌名-歌手" 字符串)
    if (report.recommendations) {
        recSection.style.display = 'block';
        recGrid.innerHTML = '<div class="loading-state">正在匹配音乐资源...</div>';

        const songItems = report.recommendations
                    .split(/[,，、\n]/)
                    .map(item => {
                        // 去除首尾空格，并去除可能的序号 (如 "1. 七里香" -> "七里香")
                        return item.trim().replace(/^\d+[\.\s]*/, '');
                    })
                    .filter(item => item.length > 1); // 过滤掉空字符串或过短的垃圾字符

                recGrid.innerHTML = ''; // 清空加载状态

        for (let item of songItems) {
            try {
                // 利用现有的 search 接口寻找真实歌曲对象
                const searchRes = await fetch(`${API_BASE}/search?keywords=${encodeURIComponent(item.trim())}&type=1`);
                const songs = await searchRes.json();
                if (songs && songs.length > 0) {
                    const song = songs[0];
                    const card = document.createElement('div');
                    card.className = 'simi-song-card'; // 复用现有相似歌曲样式
                    card.onclick = () => playSong(song, true);
                    card.innerHTML = `
                        <div class="simi-cover-wrap"><img src="${song.coverUrl}"></div>
                        <div class="simi-info">
                            <div class="simi-title">${song.title}</div>
                            <div class="simi-artist">${song.artist}</div>
                        </div>
                        <div class="simi-play-overlay"><i class="fas fa-play"></i></div>
                    `;
                    recGrid.appendChild(card);
                }
            } catch (e) { console.warn("歌曲匹配失败:", item); }
        }
    } else {
        recSection.style.display = 'none';
    }
}

// 4. 生成新报告逻辑 (关联当前账号)
async function generateNewAiReport() {
    const reportText = document.getElementById('aiReportText');
    const recSection = document.getElementById('aiRecSongsSection');
    const btn = document.getElementById('manualGenerateReportBtn');

    // 按钮防止重复点击状态
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';
    }

    // 如果是手动点击，先清空右侧显示区域给用户反馈
    reportText.innerHTML = '<div class="thinking-box"><div class="thinking-title">DeepSeek 正在解析您的最近听歌记录...</div></div>';
    recSection.style.display = 'none';

    try {
        const res = await authenticatedFetch('/api/ai/report');

        if (res.ok) {
            const newReport = await res.json();
            // 成功后重新刷新列表并展示最新的一份
            await openAiReportCenter(); // 这里会重新加载历史列表并选中最新的
            showToast("新报告生成成功！", "success");
        } else {
            // 处理错误情况
            const errData = await res.json();

            // ✅ 核心逻辑：检测后端返回的特定错误标记
            if (errData.error === "NO_NEW_RECORDS") {
                // 恢复显示最近的一份报告（如果不恢复，右侧会一直显示 loading）
                const historyRes = await authenticatedFetch('/api/ai/reports/history');
                if (historyRes.ok) {
                    const history = await historyRes.json();
                    if (history.length > 0) {
                        renderReportDetail(history[0]); // 恢复显示最新的旧报告
                    } else {
                        reportText.innerHTML = '<div class="empty-state">暂无报告</div>';
                    }
                }

                // 弹出温馨提示
                showToast("最近播放列表没有变化，多去听听歌稍后再来吧~ 🎵", "info");
            } else {
                throw new Error(errData.error || "生成失败");
            }
        }
    } catch (err) {
        console.error("生成报告错误:", err);
        reportText.innerHTML = `<div class="empty-state" style="color:#F56C6C;">${err.message || '生成失败，请稍后重试'}</div>`;
    } finally {
        // 恢复按钮状态
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sparkles"></i> 生成新报告';
        }
    }
}

// ======================= 初始化 (添加所有事件监听) =======================
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    loadUserHeaderInfo();
    fetchLikedSongs();
    fetchUserProfile();
    loadPlaybackState();
    fetchQueueFromCloud(); // ✅ 然后静默拉取云端数据，若有变动则自动刷新
    loadUserPlaylists();
    initSearchEvents(); // ✅ 启动搜索功能

    const userInfoArea = document.getElementById('userInfoArea');
    if (userInfoArea) {
        userInfoArea.onclick = (e) => {
            e.stopPropagation();
            toggleUserPopup();
        };
    }
    // ✅ 绑定手动生成报告按钮事件
        const manualGenBtn = document.getElementById('manualGenerateReportBtn');
        if (manualGenBtn) {
            manualGenBtn.onclick = () => generateNewAiReport();
        }

    initAvatarUploadLogic();

    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const contentType = item.getAttribute('data-content');

            document.querySelector('.menu-item.active')?.classList.remove('active');
            item.classList.add('active');

            if (contentType === 'recommendation') {
                initRecommendationPage();
            }else if (contentType === 'recent-playback') {
                     loadRecentlyPlayed();
            }else if (contentType === 'player-playlist') {
                showPlaylistManagementPage();
            } else if (contentType === 'profile') {
                showUserProfileView();
            } else if (contentType === 'logout') {
                logout();
            } else if (contentType === 'login') {
                window.location.href = 'auth.html';
            } else if (contentType === 'my-music') {
                loadMyMusicPage();
            } else {
                hideAllContentPages();
                document.getElementById('mainContentArea').style.display = 'block';
                if (refreshBtn) refreshBtn.style.display = 'none';
                currentPlaylistId = null;
                currentPlaylistSongs = [];
                contentList.className = 'list-container song-list';
                contentList.innerHTML = `<div class=\"loading-state\">功能 \"${item.textContent.trim()}\" 待开发...</div>`;
                contentTitle.textContent = item.textContent.trim();
            }
        });
    });

    initRecommendationPage();

    document.addEventListener('click', (e) => {
        const popup = document.getElementById('userPopup');
        const headerArea = document.getElementById('userInfoArea');
        if (popup.style.display === 'block' && !popup.contains(e.target) && !headerArea.contains(e.target)) {
            popup.style.display = 'none';
            hideAccountSwitcher();
        }
    });

    const recMenuItem = document.querySelector('.menu-item[data-content="recommendation"]');
    if (recMenuItem) recMenuItem.classList.add('active');

    lyricDisplay.addEventListener('click', showLyricModal);
    closeModalBtn.addEventListener('click', hideLyricModal);
    lyricModal.addEventListener('click', (e) => {
        if (e.target === lyricModal) {
            hideLyricModal();
        }
    });

    prevSongBtn.addEventListener('click', playPrev);
    nextSongBtn.addEventListener('click', playNext);
    audioPlayer.addEventListener('ended', handleSongEnded);

    playbackModeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playbackModeOptions.style.display = (playbackModeOptions.style.display === 'block') ? 'none' : 'block';
    });

    document.querySelectorAll('.playback-mode-options .option-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const mode = item.getAttribute('data-mode');
            changePlaybackMode(mode);
        });
    });
    document.addEventListener('click', () => {
        playbackModeOptions.style.display = 'none';
    });

    togglePlaylistBtn.addEventListener('click', () => {
        miniPlaylist.classList.toggle('show');
    });
    closeMiniPlaylistBtn.addEventListener('click', () => {
        miniPlaylist.classList.remove('show');
    });
    editPlaylistBtn.addEventListener('click', () => {
        miniPlaylist.classList.remove('show');
        showPlaylistManagementPage();
        document.querySelector('.menu-item.active')?.classList.remove('active');
        //docconst playlistMenuItem = document.querySelector('.menu-item[data-content="player-playlist"]');
        if (playlistMenuItem) {
               playlistMenuItem.classList.add('active');
        }ument.querySelector('.menu-item[data-content="player-playlist"]').classList.add('active');
    });
    clearPlaylistBtn.addEventListener('click', clearPlaylist);

    if (clearAllSongsBtn) clearAllSongsBtn.addEventListener('click', clearPlaylist);

    if (mainContent) {
        mainContent.addEventListener('scroll', () => {
            if (currentPlaylistId !== null && currentPlaylistSongs.length > 0 && currentDisplayCount < currentPlaylistSongs.length) {
                const isScrolledToBottom = mainContent.scrollHeight - mainContent.scrollTop <= mainContent.clientHeight + 100;
                if (isScrolledToBottom) {
                    if (!contentList.querySelector('.loading-state')) {
                        const loadingState = document.createElement('div');
                        loadingState.className = 'loading-state';
                        loadingState.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在加载更多...';
                        contentList.appendChild(loadingState);
                    }
                    setTimeout(() => {
                        if (contentList.querySelector('.loading-state')) {
                            loadMoreSongs();
                        }
                    }, 200);
                }
            }
        });
    }
});