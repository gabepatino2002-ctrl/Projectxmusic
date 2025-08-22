import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import SpotifyWebApi from "spotify-web-api-node";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- SPOTIFY SETUP ----------------
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: "http://localhost:3000/callback"
});

spotifyApi.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);

async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body["access_token"]);
  } catch (err) {
    console.error("Error refreshing Spotify token:", err);
  }
}

// refresh every 30 minutes
setInterval(refreshSpotifyToken, 1000 * 60 * 30);
refreshSpotifyToken();

// ---------------- ELEVENLABS SETUP ----------------
const elevenApi = axios.create({
  baseURL: "https://api.elevenlabs.io/v1",
  headers: {
    "xi-api-key": process.env.ELEVENLABS_API_KEY,
    "accept": "audio/mpeg",
    "Content-Type": "application/json"
  }
});

// ---------------- ROUTES ----------------

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Project X API running" });
});

// Play battle music
app.post("/play-music", async (req, res) => {
  const { battleContext, manualSongUri } = req.body;

  try {
    await refreshSpotifyToken();

    let trackUri = manualSongUri;
    if (!trackUri) {
      // Example: auto-pick track based on context
      if (battleContext.includes("boss")) {
        const search = await spotifyApi.searchTracks("epic orchestral battle");
        trackUri = search.body.tracks.items[0].uri;
      } else {
        const search = await spotifyApi.searchTracks("action game soundtrack");
        trackUri = search.body.tracks.items[0].uri;
      }
    }

    await spotifyApi.play({ uris: [trackUri] });

    res.json({ success: true, playing: trackUri });
  } catch (err) {
    console.error("Spotify error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to play music" });
  }
});

// Generate character voice with emotion
app.post("/generate-voice", async (req, res) => {
  const { character, text, emotion } = req.body;

  try {
    // You’d map character -> voice_id from your earlier config
    const voiceIdMap = {
      Simba: "ypyNBxQSnKxwAkJKfQf6",
      "Yuji Itadori": "EeiCKO3ccklO2iPh9Rmo",
      Legoshi: "p7MXEPYDLZT8KV35ahIO",
      Louis: "tHqiMoxT3OawRFrLpG42",
      Haru: "Z6sWvoG92hsaujmIokrm"
    };

    const voiceId = voiceIdMap[character] || "default";

    const payload = {
      text: `[${emotion}] ${text}`, // simple tagging for emotion
      voice_settings: { stability: 0.6, similarity_boost: 0.8 }
    };

    const response = await elevenApi.post(
      `/text-to-speech/${voiceId}`,
      payload,
      { responseType: "arraybuffer" }
    );

    res.set("Content-Type", "audio/mpeg");
    res.send(response.data);
  } catch (err) {
    console.error("ElevenLabs error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate voice" });
  }
});

// ---------------- OPENAPI SCHEMA ----------------
app.get("/openapi.json", (req, res) => {
  const schema = {
    openapi: "3.0.1",
    info: {
      title: "Project X Control API",
      description: "Endpoints for Spotify battle music and ElevenLabs voices with emotion.",
      version: "1.0.0"
    },
    servers: [{ url: process.env.SERVER_URL || "http://localhost:3000" }],
    paths: {
      "/play-music": {
        post: {
          summary: "Play or switch battle music",
          operationId: "playMusic",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    battleContext: { type: "string" },
                    manualSongUri: { type: "string" }
                  },
                  required: ["battleContext"]
                }
              }
            }
          },
          responses: { "200": { description: "Music started" } }
        }
      },
      "/generate-voice": {
        post: {
          summary: "Generate character voice line",
          operationId: "generateVoice",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    character: { type: "string" },
                    text: { type: "string" },
                    emotion: { type: "string" }
                  },
                  required: ["character", "text"]
                }
              }
            }
          },
          responses: { "200": { description: "Voice generated" } }
        }
      }
    }
  };

  res.json(schema);
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Project X API running on port ${PORT}`);
});
