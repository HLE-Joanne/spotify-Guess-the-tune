// =============================
// 1️⃣ 頁面路由系統
// =============================
const routes = {
    "": 1,
    "/playlist": 2,
    "/playlistselected": 3,
    "/game": 4,
    "/showanswer": 5
};

let playlistUrl = "";
let playlistId = "";
let currentSong = null;
let player;

// 切換頁面
window.addEventListener("popstate", (event) => {
    if (event.state && event.state.page) {
        showPage(event.state.page);
    } else {
        showPage(1); // 如果沒有記錄，回到登入頁面
    }
});

function showPage(pageNumber) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.body.className = `page${pageNumber}`;

    const targetPage = document.getElementById(`page${pageNumber}`);
    if (targetPage) {
        targetPage.classList.add("active");

        let newUrl = Object.keys(routes).find(key => routes[key] === pageNumber) || "";
        
        // **只在使用者手動切換頁面時，更新歷史紀錄**
        if (!history.state || history.state.page !== pageNumber) {
            window.history.pushState({ page: pageNumber }, "", newUrl);
        }

        localStorage.setItem("currentPage", pageNumber);
    }
}


// =============================
// 2️⃣ Spotify PKCE 登入流程
// =============================
const clientId = "176b6fff462242a595c317cbb814c4f4";
const redirectUri = "https://hle-joanne.github.io/spotify-Guess-the-tune/";
let codeVerifier = "";

async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

document.getElementById("loginBtn").addEventListener("click", async () => {
    codeVerifier = btoa(crypto.getRandomValues(new Uint8Array(32))).substring(0, 43);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&code_challenge_method=S256&code_challenge=${codeChallenge}&scope=user-read-private%20user-read-email%20streaming%20playlist-read-private`;
    localStorage.setItem("code_verifier", codeVerifier);
    window.location.href = authUrl;
});

async function handleSpotifyRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (code) {
        const codeVerifier = localStorage.getItem("code_verifier");
        const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier
            })
        });
        const tokenData = await tokenResponse.json();
        localStorage.setItem("access_token", tokenData.access_token);
        showPage(2);
    }
}
handleSpotifyRedirect();

// =============================
// 3️⃣ 初始化 Spotify 播放器
// =============================
window.onSpotifyWebPlaybackSDKReady = () => {
    const token = localStorage.getItem("access_token");
    player = new Spotify.Player({
        name: "Guess The Tune Player",
        getOAuthToken: cb => { cb(token); },
        volume: 0.5
    });

    player.addListener("ready", ({ device_id }) => {
        console.log("Spotify Player is ready with Device ID", device_id);
        localStorage.setItem("device_id", device_id); // 儲存設備 ID，確保播放時使用
    });

    player.connect().then(success => {
        if (success) {
            console.log("Spotify Web Playback SDK connected successfully.");
        } else {
            console.error("Spotify Web Playback SDK failed to connect.");
        }
    });
};

// =============================
// 4️⃣ 取得歌單資訊
// =============================
async function fetchPlaylistInfo() {
    const token = localStorage.getItem("access_token");
    let playlistUrl = localStorage.getItem("playlistUrl")?.trim(); // 讀取並去除空格

    if (!playlistUrl) {
        alert("Playlist or album URL is missing!");
        return;
    }

    // 驗證 URL 並解析 ID
    let match = playlistUrl.match(/(?:playlist|album)\/([a-zA-Z0-9]+)(?:\?|$)/);
    if (!match) {
        alert("Invalid Spotify URL format!");
        return;
    }

    playlistId = match[1]; // 取得 Playlist 或 Album ID
    const isAlbum = playlistUrl.includes("album");
    const apiUrl = isAlbum 
        ? `https://api.spotify.com/v1/albums/${playlistId}`
        : `https://api.spotify.com/v1/playlists/${playlistId}`;

    try {
        const response = await fetch(apiUrl, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Spotify API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        document.getElementById("playlistName").innerText = `${data.name || data.title}`;

        showPage(3); // **只有 API 請求成功才切換到 Page 3**
    } catch (error) {
        console.error("Error fetching playlist:", error);
        alert("Failed to fetch playlist. Please check your URL or try again later.");
    }
}


// =============================
// 5️⃣ 處理按鈕事件
// =============================
document.getElementById("doneBtn").addEventListener("click", async () => {
    playlistUrl = document.getElementById("playlistUrl").value.trim();
    localStorage.setItem("playlistUrl", playlistUrl);

    await fetchPlaylistInfo(); // **現在只有 fetch 成功才會切換頁面**
});


document.getElementById("startBtn").addEventListener("click", async () => {
    await fetchPlaylistInfo();
    await selectRandomSong();
    showPage(4);
});

// =============================
// 6️⃣ 隨機選歌
// =============================
async function selectRandomSong() {
    const token = localStorage.getItem("access_token");
    const isAlbum = playlistUrl.includes("album");
    const apiUrl = isAlbum
        ? `https://api.spotify.com/v1/albums/${playlistId}/tracks`
        : `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
    
    const response = await fetch(apiUrl, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await response.json();
    const tracks = (isAlbum ? data.items : data.items.map(item => item.track)).filter(track => track.uri);
    
    if (tracks.length === 0) {
        alert("No playable tracks in this playlist or album.");
        return;
    }
    
    currentSong = tracks[Math.floor(Math.random() * tracks.length)];
}

// =============================
// 7️⃣ 播放前奏
// =============================
let timeoutId = null; // 記錄 setTimeout ID

function playPreview(seconds) {
    const token = localStorage.getItem("access_token");
    const device_id = localStorage.getItem("device_id");

    if (!device_id) {
        alert("Player is not ready yet. Please wait and try again.");
        return;
    }

    if (currentSong) {
        // **清除之前的 setTimeout，避免提前暫停**
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                uris: [currentSong.uri]
            })
        }).then(response => {
            if (!response.ok) {
                return response.json().then(error => {
                    console.error("Error playing song:", error);
                    alert(`Error playing song: ${error.error.message}`);
                });
            }

            // **設定新的 setTimeout 來暫停**
            timeoutId = setTimeout(() => {
                pauseSpotifyPlayback();
            }, seconds * 1000);
        }).catch(err => console.error("Fetch error:", err));
    }
}


document.getElementById("play3Secs").addEventListener("click", () => playPreview(3));
document.getElementById("play5Secs").addEventListener("click", () => playPreview(5));
document.getElementById("play10Secs").addEventListener("click", () => playPreview(10));

document.getElementById("playFull").addEventListener("click", async () => {
    if (!currentSong) {
        alert("No song selected. Please start the game first.");
        return;
    }

    await pauseSpotifyPlayback();
    // 先切換到 Page 5，顯示歌曲資訊
    showAnswerPage();

    // 確保 Page 5 已顯示後再播放歌曲
    requestAnimationFrame(() => {
        setTimeout(playFullSongWithEmbed, 500); // 減少延遲時間，加速響應
    });
});

function showAnswerPage() {
    if (!currentSong) {
        alert("No song selected.");
        return;
    }

    // 顯示歌曲資訊
    document.getElementById("songTitle").innerText = `🎵 ${currentSong.name}`;
    document.getElementById("songArtist").innerText = `👤 ${currentSong.artists.map(artist => artist.name).join(", ")}`;

    // 切換到 Page 5
    showPage(5);
}

function playFullSongWithEmbed() {
    if (!currentSong) {
        alert("No song selected.");
        return;
    }

    // 設定 Spotify 播放嵌入連結，確保自動播放
    const embedUrl = `https://open.spotify.com/embed/track/${currentSong.id}?utm_source=generator&autoplay=1`;

    // 確保 `iframe` 存在再設定 `src`
    const spotifyPlayer = document.getElementById("spotifyPlayer");
    if (spotifyPlayer) {
        spotifyPlayer.src = embedUrl;
    } else {
        console.error("Spotify Player iframe not found.");
    }
}

// =============================
// 8️⃣ 再來一局
// =============================
async function pauseSpotifyPlayback() {
    const token = localStorage.getItem("access_token");

    if (!token) {
        console.warn("No Spotify access token found.");
        return;
    }

    try {
        await fetch("https://api.spotify.com/v1/me/player/pause", {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.error("Failed to pause Spotify playback:", error);
    }
}



document.getElementById("nextSong").addEventListener("click", async () => {
    await selectRandomSong(); // 重新選擇一首隨機歌曲
    showPage(4);
});



document.getElementById("backToPlaylist").addEventListener("click", async () =>{
    showPage(2);
});
