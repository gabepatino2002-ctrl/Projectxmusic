// server.js
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const SpotifyWebApi = require("spotify-web-api-node");

const app = express();
app.use(cors());
app.use(express.json());

// --- ENV VARIABLES ---
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// --- SPOTIFY SETUP ---
const spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
  redirectUri: "https://projectxmusic.onrender.com/callback",
});

spotifyApi.setRefreshToken(SPOTIFY_REFRESH_TOKEN);

async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body["access_token"]);
    console.log("Spotify token refreshed.");
  } catch (err) {
    console.error("Error refreshing Spotify token:", err.message);
  }
}

// Refresh every 50 min
setInterval(refreshSpotifyToken, 50 * 60 * 1000);
refreshSpotifyToken();

// --- ELEVENLABS SETUP ---
const elevenLabsTTS = async (voiceId, text, emotion = "neutral") => {
  try {
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.85,
          style: emotion, // can be "neutral", "angry", "sad", "happy"
        },
      },
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        responseType: "arraybuffer",
      }
    );
    return res.data;
  } catch (err) {
    console.error("Error generating voice:", err.message);
    throw err;
  }
};

// --- ROUTES ---

// Test
app.get("/", (req, res) => {
  res.send("✅ Project X Music & Voice API is running");
});

// 🎵 Battle music auto-select
app.post("/battle-music", async (req, res) => {
  const { phase = "normal", context = "battle" } = req.body;

  try {
    // Pick query dynamically
    let query = "epic orchestral";
    if (context === "boss") query = "boss battle soundtrack";
    if (phase === "phase2") query = "intense battle theme";
    if (phase === "climax") query = "final boss theme";

    const searchRes = await spotifyApi.searchTracks(query, { limit: 10 });
    const tracks = searchRes.body.tracks.items;

    if (!tracks.length) return res.status(404).json({ error: "No songs found" });

    // Pick random track
    const chosen = tracks[Math.floor(Math.random() * tracks.length)];
    res.json({
      track: {
        name: chosen.name,
        artist: chosen.artists.map((a) => a.name).join(", "),
        uri: chosen.uri,
        preview_url: chosen.preview_url,
      },
      phase,
      context,
    });
  } catch (err) {
    console.error("Error fetching battle music:", err.message);
    res.status(500).json({ error: "Failed to fetch music" });
  }
});

// 🔊 Character voice w/ emotion
app.post("/voice", async (req, res) => {
  const { voiceId, text, emotion = "neutral" } = req.body;

  try {
    const audio = await elevenLabsTTS(voiceId, text, emotion);
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (err) {
    res.status(500).json({ error: "Voice generation failed" });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
