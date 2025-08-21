import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import SpotifyWebApi from "spotify-web-api-node";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Needed for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Spotify API Setup ----
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: "http://localhost:3000/callback"
});

// Store refresh token from Render env
spotifyApi.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);

// Function: refresh token before using API
async function ensureFreshToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body["access_token"]);
    console.log("✅ Access token refreshed");
  } catch (err) {
    console.error("❌ Error refreshing access token:", err.message);
  }
}

// Refresh token every 30 minutes automatically
setInterval(ensureFreshToken, 1000 * 60 * 30);

// Immediately refresh once on startup
ensureFreshToken();

// ---- ROUTES ----

// ✅ Health check
app.get("/", (req, res) => {
  res.send("🎶 ProjectX Music API is running with refresh tokens! Try /openapi.json");
});

// ✅ Serve OpenAPI schema
app.get("/openapi.json", (req, res) => {
  res.sendFile(path.join(__dirname, "openapi.json"));
});

// ✅ Play track
app.post("/play", async (req, res) => {
  const { trackUri } = req.body;
  try {
    await ensureFreshToken();
    await spotifyApi.play({ uris: [trackUri] });
    res.json({ message: `Now playing: ${trackUri}` });
  } catch (err) {
    console.error("Error playing track:", err.message);
    res.status(500).json({ error: "Failed to play track" });
  }
});

// ✅ Pause
app.post("/pause", async (req, res) => {
  try {
    await ensureFreshToken();
    await spotifyApi.pause();
    res.json({ message: "Playback paused" });
  } catch (err) {
    console.error("Error pausing playback:", err.message);
    res.status(500).json({ error: "Failed to pause playback" });
  }
});

// ✅ Event-based playback
app.post("/event", async (req, res) => {
  const { eventType } = req.body;
  try {
    await ensureFreshToken();

    const eventTracks = {
      boss_phase_1: "spotify:track:3n3Ppam7vgaVa1iaRUc9Lp",
      boss_phase_2: "spotify:track:7GhIk7Il098yCjg4BQjzvb",
      ambush: "spotify:track:1zHlj4dQ8ZAtrayhuDDmkY",
      victory: "spotify:track:0ofHAoxe9vBkTCp2UQIavz"
    };

    const trackUri = eventTracks[eventType];
    if (!trackUri) return res.status(400).json({ error: "Unknown eventType" });

    await spotifyApi.play({ uris: [trackUri] });
    res.json({ message: `Event music triggered for ${eventType}`, track: trackUri });
  } catch (err) {
    console.error("Error triggering event music:", err.message);
    res.status(500).json({ error: "Failed to trigger event music" });
  }
});

// ✅ AI-driven auto track
app.post("/autoTrack", async (req, res) => {
  const { sceneDescription } = req.body;
  try {
    await ensureFreshToken();

    const searchQuery = sceneDescription.split(" ").slice(0, 3).join(" ");
    const result = await spotifyApi.searchTracks(searchQuery);

    if (result.body.tracks.items.length > 0) {
      const trackUri = result.body.tracks.items[0].uri;
      await spotifyApi.play({ uris: [trackUri] });
      res.json({
        message: `Auto-selected track for scene: "${sceneDescription}"`,
        track: trackUri
      });
    } else {
      res.status(404).json({ error: "No fitting track found" });
    }
  } catch (err) {
    console.error("Error auto-selecting track:", err.message);
    res.status(500).json({ error: "Failed to auto-select track" });
  }
});

// ---- START SERVER ----
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
