// server.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import SpotifyWebApi from "spotify-web-api-node";

const app = express();
app.use(bodyParser.json());

// ----------------------
// 🔹 CONFIG
// ----------------------
const PORT = process.env.PORT || 3000;

// Spotify setup
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});
spotifyApi.setAccessToken(process.env.SPOTIFY_ACCESS_TOKEN);
spotifyApi.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);

// ElevenLabs setup
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// ----------------------
// 🔹 STATE
// ----------------------
let battleState = "exploration"; 
// options: exploration, battle, boss1, boss2, boss3, victory, defeat

// ----------------------
// 🔹 MUSIC TRACKS BY STATE
// ----------------------
const musicMap = {
  exploration: "spotify:track:3qZ2yV1htqY2Tx0zzZ0k8i", // ambient
  battle: "spotify:track:1bp0J8BGX8f7H5Rv5U1Q9N",     // standard battle
  boss1: "spotify:track:2l8iwI8oLwrTlcA7xWyQyG",      // boss phase 1
  boss2: "spotify:track:6b8Be6ljOzmkOmFslEb23P",      // boss phase 2
  boss3: "spotify:track:7GhIk7Il098yCjg4BQjzvb",      // boss phase 3
  victory: "spotify:track:4uLU6hMCjMI75M1A2tKUQC",    // victory fanfare
  defeat: "spotify:track:0WzG64X3jOifcRZ9WQX0R5",     // sad / loss
};

// ----------------------
// 🔹 VOICE EMOTIONS BY STATE
// ----------------------
const voiceEmotionMap = {
  exploration: "calm",
  battle: "serious",
  boss1: "intense",
  boss2: "angry",
  boss3: "furious",
  victory: "joyful",
  defeat: "sad",
};

// Example voice IDs for characters
const voices = {
  Simba: "ypyNBxQSnKxwAkJKfQf6",
  Yuji: "EeiCKO3ccklO2iPh9Rmo",
  Legoshi: "p7MXEPYDLZT8KV35ahIO",
  Louis: "tHqiMoxT3OawRFrLpG42",
  Haru: "Z6sWvoG92hsaujmIokrm",
};

// ----------------------
// 🔹 FUNCTIONS
// ----------------------

// Refresh Spotify access token automatically
async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body["access_token"]);
  } catch (err) {
    console.error("Error refreshing Spotify token:", err);
  }
}

// Play track on Spotify with fade transition
async function playSpotifyTrack(uri) {
  try {
    await spotifyApi.play({
      uris: [uri],
    });
  } catch (err) {
    if (err.statusCode === 401) {
      await refreshSpotifyToken();
      await playSpotifyTrack(uri);
    } else {
      console.error("Spotify play error:", err);
    }
  }
}

// Trigger ElevenLabs voice with emotion
async function speakLine(character, text) {
  const voiceId = voices[character];
  const emotion = voiceEmotionMap[battleState];

  const response = await fetch(`${ELEVENLABS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: `[${emotion}] ${text}`, // inject emotion into voice
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.85,
        style: emotion,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Voice generation failed");
  }
  return response.body; // audio stream
}

// ----------------------
// 🔹 ROUTES
// ----------------------

// Change battle state → auto music + voice emotion sync
app.post("/setState", async (req, res) => {
  const { state } = req.body;
  if (!musicMap[state]) {
    return res.status(400).send("Invalid state");
  }

  battleState = state;

  // update music
  await playSpotifyTrack(musicMap[state]);

  res.json({
    message: `State changed to ${state}`,
    music: musicMap[state],
    emotion: voiceEmotionMap[state],
  });
});

// Speak line with correct emotion + character voice
app.post("/speak", async (req, res) => {
  const { character, text } = req.body;
  if (!voices[character]) {
    return res.status(400).send("Unknown character");
  }

  try {
    const audio = await speakLine(character, text);
    res.set("Content-Type", "audio/mpeg");
    audio.pipe(res);
  } catch (err) {
    console.error("Error in /speak:", err);
    res.status(500).send("Error generating voice");
  }
});

// ----------------------
// 🔹 START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
