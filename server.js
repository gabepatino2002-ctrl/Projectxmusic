import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";
import SpotifyWebApi from "spotify-web-api-node";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== 🎶 SPOTIFY CONFIG =====
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: "http://localhost:8888/callback"
});

spotifyApi.setAccessToken(process.env.SPOTIFY_ACCESS_TOKEN);
spotifyApi.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);

// Refresh Spotify token automatically
async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body["access_token"]);
    console.log("🔄 Refreshed Spotify access token");
  } catch (err) {
    console.error("Spotify refresh error:", err);
  }
}
setInterval(refreshSpotifyToken, 1000 * 60 * 30); // refresh every 30min

// ===== 🗣 ELEVENLABS CONFIG =====
const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const ELEVEN_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Character voices + styles
const voices = {
  Simba: { id: "ypyNBxQSnKxwAkJKfQf6", style: "noble, inspiring, protective" },
  Yuji: { id: "EeiCKO3ccklO2iPh9Rmo", style: "energetic, compassionate, youthful" },
  Legoshi: { id: "p7MXEPYDLZT8KV35ahIO", style: "soft, introspective, vulnerable" },
  Louis: { id: "tHqiMoxT3OawRFrLpG42", style: "authoritative, ambitious, sharp" },
  Haru: { id: "Z6sWvoG92hsaujmIokrm", style: "gentle, warm, quietly defiant" }
};

// ===== 🎶 MUSIC LOGIC =====

// Track pool by state (auto-picked + random fallback)
const stateTrackPools = {
  battle: ["spotify:track:4lW1bU1jjVjvVgkHfA2iXu", "spotify:track:2p8BGLM2ZApVq3jEb8GEIi"],
  boss1: ["spotify:track:6ZRuF2n1CQxyxxAAWsKJOy", "spotify:track:0R4c1k2BEmcJjVg5R8jHXy"],
  boss2: ["spotify:track:2YlZnw2ikdb837oKMKjBkW", "spotify:track:3v3hmx0qzRkU7L1eT7tOkq"],
  boss3: ["spotify:track:5mCPDVBb16L4XQwDdbRUpz", "spotify:track:1rqqCSm0Qe4I9rUvWncaom"],
  victory: ["spotify:track:2takcwOaAZWiXQijPHIx7B"],
  defeat: ["spotify:track:0h5ekDWlF8FUl6mnh6NshO"]
};

// Fade function (dynamic per state)
async function fadeOutIn(newTrackUri, state) {
  try {
    let fadeStep = 20; // volume step
    let fadeDelay = 300; // default delay

    // adjust fade timing per state
    if (state === "battle") fadeDelay = 150;
    if (["boss1", "boss2", "boss3"].includes(state)) fadeDelay = 300;
    if (state === "victory" || state === "defeat") fadeDelay = 600;

    // fade out
    for (let vol = 100; vol >= 0; vol -= fadeStep) {
      await spotifyApi.setVolume(vol);
      await new Promise(r => setTimeout(r, fadeDelay));
    }

    // play new track
    await spotifyApi.play({ uris: [newTrackUri] });

    // fade in
    for (let vol = 0; vol <= 100; vol += fadeStep) {
      await spotifyApi.setVolume(vol);
      await new Promise(r => setTimeout(r, fadeDelay));
    }
  } catch (err) {
    console.error("Fade error:", err);
  }
}

// Auto pick track by state
async function playRandomTrackForState(state) {
  try {
    let trackPool = stateTrackPools[state] || [];

    // if empty, pick a truly random track from Spotify
    if (trackPool.length === 0) {
      const search = await spotifyApi.searchTracks("battle OR epic OR intense", { limit: 10 });
      trackPool = search.body.tracks.items.map(t => t.uri);
    }

    const randomIndex = Math.floor(Math.random() * trackPool.length);
    const track = trackPool[randomIndex];

    await fadeOutIn(track, state);
    console.log(`🎶 Playing track for ${state}: ${track}`);
  } catch (err) {
    console.error("Play track error:", err);
  }
}

// ===== 🗣 VOICE ROUTE =====
app.post("/speak", async (req, res) => {
  try {
    const { character, text, emotion = "neutral" } = req.body;
    const voice = voices[character];

    if (!voice) return res.status(400).json({ error: "Unknown character" });

    const response = await fetch(`${ELEVEN_TTS_URL}/${voice.id}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_API_KEY,
        "Content-Type": "application/json",
        "accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: `${voice.style}, with ${emotion} tone`
        }
      })
    });

    const audioBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error("Voice error:", err);
    res.status(500).json({ error: "Voice synthesis failed" });
  }
});

// ===== 🎶 MUSIC ROUTE =====
app.post("/battle-music", async (req, res) => {
  try {
    const { state } = req.body;
    await playRandomTrackForState(state);
    res.json({ success: true, message: `Music started for ${state}` });
  } catch (err) {
    console.error("Music route error:", err);
    res.status(500).json({ error: "Music playback failed" });
  }
});

// ===== 🚀 SERVER START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Project X server running on port ${PORT}`));
