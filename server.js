import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import SpotifyWebApi from "spotify-web-api-node";

const app = express();
app.use(bodyParser.json());

// Setup Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: "http://localhost:8888/callback"
});

let bossState = {};
let accessToken = null;

// Refresh token
async function refreshAccessToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    accessToken = data.body.access_token;
    spotifyApi.setAccessToken(accessToken);
    console.log("✅ Refreshed Spotify access token");
  } catch (err) {
    console.error("❌ Error refreshing token", err);
  }
}
setInterval(refreshAccessToken, 1000 * 60 * 55);
refreshAccessToken();

// -----------------------
// Helper: auto-generate loop points
// -----------------------
function getLoopPoints(durationMs) {
  const introEnd = Math.min(30000, durationMs);       // Intro → 30s
  const buildEnd = Math.min(90000, durationMs);       // Build-Up → 90s
  const climaxEnd = Math.min(150000, durationMs);     // Climax → 150s
  const finalEnd = durationMs;                        // Final → end

  return {
    intro: { start: 0, end: introEnd },
    build: { start: introEnd, end: buildEnd },
    climax: { start: buildEnd, end: climaxEnd },
    final: { start: climaxEnd, end: finalEnd }
  };
}

// Loop a section continuously
function startLoop(trackUri, startMs, endMs) {
  const loopInterval = setInterval(async () => {
    try {
      const playback = await spotifyApi.getMyCurrentPlaybackState();
      if (
        playback.body.is_playing &&
        playback.body.item.uri === trackUri &&
        playback.body.progress_ms >= endMs
      ) {
        await spotifyApi.seek(startMs);
      }
    } catch (err) {
      console.error("Loop error:", err.message);
      clearInterval(loopInterval);
    }
  }, 1000);
}

// -----------------------
// Endpoints
// -----------------------

// Boss event with automatic phase loops
app.post("/event", async (req, res) => {
  const { event, context } = req.body;

  try {
    // Pick a track automatically based on context
    if (!bossState.track) {
      const searchRes = await spotifyApi.searchTracks(`epic battle ${context}`, { limit: 1 });
      const track = searchRes.body.tracks.items[0];
      if (!track) return res.status(404).json({ error: "No suitable track found" });

      bossState.track = track;
      bossState.loopPoints = getLoopPoints(track.duration_ms);
      console.log(`🎵 Selected boss track: ${track.name} by ${track.artists.map(a => a.name).join(", ")}`);
    }

    const trackUri = bossState.track.uri;
    let phase = null;

    if (event === "boss_phase_1") phase = "intro";
    if (event === "boss_phase_2") phase = "build";
    if (event === "boss_phase_3") phase = "climax";
    if (event === "boss_final") phase = "final";

    if (!phase) return res.status(400).json({ error: "Invalid phase event" });

    const { start, end } = bossState.loopPoints[phase];

    // Start playback at phase start
    await spotifyApi.play({ uris: [trackUri], position_ms: start });

    // Begin loop
    startLoop(trackUri, start, end);

    res.json({
      message: `🎶 Now playing ${phase.toUpperCase()} loop for ${bossState.track.name}`,
      track: {
        name: bossState.track.name,
        artist: bossState.track.artists.map(a => a.name).join(", "),
        uri: trackUri,
        phase
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎵 Project X Music server running on port ${PORT}`);
});
