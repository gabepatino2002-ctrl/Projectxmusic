// server.js (CommonJS, boot-safe for Render)
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const SpotifyWebApi = require("spotify-web-api-node");

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// 🔐 ENV VARS
// =======================
const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
  ELEVENLABS_API_KEY,
  SERVER_URL // optional, e.g. https://projectxmusic.onrender.com
} = process.env;

// =======================
// 🎶 SPOTIFY SETUP
// =======================
const spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
  redirectUri: "https://projectxmusic.onrender.com/callback"
});

spotifyApi.setRefreshToken(SPOTIFY_REFRESH_TOKEN);

async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    const token = data.body["access_token"];
    spotifyApi.setAccessToken(token);
    console.log("🔄 Spotify token refreshed");
  } catch (err) {
    console.error("❌ Spotify refresh error:", err?.message || err);
  }
}

// Refresh on boot + every 50 minutes
refreshSpotifyToken();
setInterval(refreshSpotifyToken, 50 * 60 * 1000);

// Safe volume helper (ignores "no active device" errors gracefully)
async function setVolumeSafe(level) {
  try {
    await spotifyApi.setVolume(level);
  } catch (err) {
    // Common if no active device is open
    const msg = err?.body?.error?.message || err?.message || "";
    if (!/No active device/i.test(msg)) {
      console.warn("⚠️ setVolume warning:", msg);
    }
  }
}

// =======================
// 🧠 GLOBAL BATTLE STATE
// =======================
let battleState = {
  active: false,
  type: null,      // "normal" | "boss" | null
  phase: 0,        // 1..N for boss; 0 for normal
  maxPhases: 0,
  context: "",     // "minor" | "elite" | "ambush" | "boss"
  trackUri: null
};

// =======================
// 🎼 MUSIC SELECTION & PLAYBACK
// =======================
async function selectTrack(context, phase = 0, type = "normal") {
  // Pick a search query that fits the moment
  let query = "action soundtrack";
  if (type === "boss") {
    if (phase <= 1) query = "tense build up";
    else if (phase === 2) query = "intense battle theme";
    else query = "epic orchestral final boss";
  } else {
    // normal battles
    if (context === "minor") query = "light action theme";
    else if (context === "elite") query = "fast paced battle";
    else if (context === "ambush") query = "chaotic combat theme";
    else query = "video game battle theme";
  }

  const results = await spotifyApi.searchTracks(query, { limit: 10 });
  const items = results?.body?.tracks?.items || [];
  if (!items.length) throw new Error(`No tracks found for query: ${query}`);
  const pick = items[Math.floor(Math.random() * items.length)];
  return pick.uri;
}

// Core playback with transition & intensity handling
async function playMusic(trackUri, transition = "fade_in", intensity = "medium") {
  const options = { uris: [trackUri] };

  // Transition simulation (Spotify crossfade is client-side; we simulate via volume)
  if (transition === "fade_out") {
    await setVolumeSafe(20);
  } else if (transition === "fade_in") {
    await setVolumeSafe(10);
    setTimeout(() => setVolumeSafe(70), 3000);
  } else if (transition === "crossfade") {
    await setVolumeSafe(30);
    setTimeout(() => setVolumeSafe(70), 2000);
  } else if (transition === "cut") {
    // no-op; immediate switch
  } else if (transition === "build_up") {
    await setVolumeSafe(20);
    setTimeout(() => setVolumeSafe(50), 1500);
    setTimeout(() => setVolumeSafe(75), 3000);
  }

  // Intensity (volume curve)
  if (intensity === "low") await setVolumeSafe(30);
  if (intensity === "medium") await setVolumeSafe(55);
  if (intensity === "high") await setVolumeSafe(80);
  if (intensity === "extreme") await setVolumeSafe(95);
  if (intensity === "escalating") {
    let v = 40;
    const h = setInterval(async () => {
      v = Math.min(v + 10, 90);
      await setVolumeSafe(v);
      if (v >= 90) clearInterval(h);
    }, 3000);
  }

  // Finally, play
  try {
    await spotifyApi.play(options);
  } catch (err) {
    // Handle token/device errors
    if (err?.statusCode === 401) {
      await refreshSpotifyToken();
      await spotifyApi.play(options);
    } else {
      console.error("❌ spotify.play error:", err?.message || err);
    }
  }
}

// =======================
// 🗣️ ELEVENLABS VOICES
// =======================
const VOICE_ID_MAP = {
  Simba: "ypyNBxQSnKxwAkJKfQf6",
  "Yuji Itadori": "EeiCKO3ccklO2iPh9Rmo",
  Legoshi: "p7MXEPYDLZT8KV35ahIO",
  Louis: "tHqiMoxT3OawRFrLpG42",
  Haru: "Z6sWvoG92hsaujmIokrm"
};

async function generateVoice({ character, text, emotion = "neutral" }) {
  const voiceId = VOICE_ID_MAP[character] || VOICE_ID_MAP["Yuji Itadori"];
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const resp = await axios.post(
    url,
    {
      text,
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.8,
        style: emotion // e.g., "angry", "sad", "intense", "joyful"
      }
    },
    {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json"
      },
      responseType: "arraybuffer"
    }
  );

  return resp.data; // MP3 buffer
}

// =======================
// 🎮 ROUTES — DIRECT CONTROL
// =======================

// Healthcheck
app.get("/", (req, res) => {
  res.json({ status: "OK", service: "Project X Battle/Voice API" });
});

// Generic music control (manual)
app.post("/play-music", async (req, res) => {
  try {
    const { context = "battle", spotify_uri, transition = "fade_in", intensity = "medium" } = req.body;
    let trackUri = spotify_uri || await selectTrack(context, 0, context.includes("boss") ? "boss" : "normal");
    await playMusic(trackUri, transition, intensity);
    res.json({ message: "Music started", trackUri, context, transition, intensity });
  } catch (err) {
    console.error("❌ /play-music error:", err?.message || err);
    res.status(500).json({ error: "Failed to play music" });
  }
});

// Start a normal battle
app.post("/start-battle", async (req, res) => {
  try {
    const { context = "minor" } = req.body;
    battleState.active = true;
    battleState.type = "normal";
    battleState.context = context;
    battleState.phase = 0;
    battleState.maxPhases = 0;

    battleState.trackUri = await selectTrack(context, 0, "normal");
    await playMusic(battleState.trackUri, "fade_in", "medium");

    res.json({ message: "Normal battle started", battleState });
  } catch (err) {
    console.error("❌ /start-battle error:", err?.message || err);
    res.status(500).json({ error: "Failed to start normal battle" });
  }
});

// Start a boss battle (multi-phase)
app.post("/start-boss-battle", async (req, res) => {
  try {
    const { phases = 3, context = "boss" } = req.body;
    battleState.active = true;
    battleState.type = "boss";
    battleState.phase = 1;
    battleState.maxPhases = phases;
    battleState.context = context;

    battleState.trackUri = await selectTrack(context, battleState.phase, "boss");
    await playMusic(battleState.trackUri, "fade_in", "low");

    res.json({ message: "Boss battle started", battleState });
  } catch (err) {
    console.error("❌ /start-boss-battle error:", err?.message || err);
    res.status(500).json({ error: "Failed to start boss battle" });
  }
});

// Advance boss to next (or specific) phase
app.post("/next-phase", async (req, res) => {
  try {
    if (!(battleState.active && battleState.type === "boss")) {
      return res.status(400).json({ error: "No active boss battle" });
    }

    const { targetPhase } = req.body; // optional explicit phase
    if (typeof targetPhase === "number") {
      battleState.phase = Math.max(1, Math.min(targetPhase, battleState.maxPhases));
    } else {
      if (battleState.phase >= battleState.maxPhases) {
        return res.json({ message: "Boss already at final phase", battleState });
      }
      battleState.phase += 1;
    }

    battleState.trackUri = await selectTrack(battleState.context, battleState.phase, "boss");

    let intensity = "medium";
    if (battleState.phase === battleState.maxPhases - 1) intensity = "high";
    if (battleState.phase === battleState.maxPhases) intensity = "extreme";

    await playMusic(battleState.trackUri, "crossfade", intensity);

    res.json({ message: `Advanced to phase ${battleState.phase}`, battleState });
  } catch (err) {
    console.error("❌ /next-phase error:", err?.message || err);
    res.status(500).json({ error: "Failed to advance phase" });
  }
});

// End any battle and play victory music
app.post("/end-battle", async (req, res) => {
  try {
    const wasBoss = battleState.type === "boss";
    battleState = { active: false, type: null, phase: 0, maxPhases: 0, context: "", trackUri: null };

    const q = wasBoss ? "victory fanfare" : "victory theme";
    const results = await spotifyApi.searchTracks(q, { limit: 5 });
    const victoryUri = results?.body?.tracks?.items?.[0]?.uri;

    if (victoryUri) {
      await playMusic(victoryUri, "fade_in", "medium");
    }

    res.json({ message: "Battle ended", victoryTrack: victoryUri || null });
  } catch (err) {
    console.error("❌ /end-battle error:", err?.message || err);
    res.status(500).json({ error: "Failed to end battle" });
  }
});

// Generate character voice with emotion
app.post("/generate-voice", async (req, res) => {
  try {
    const { character, text, emotion = "neutral" } = req.body;
    if (!character || !text) {
      return res.status(400).json({ error: "character and text are required" });
    }

    // Optionally duck music while speaking
    await setVolumeSafe(20);

    const audioBuffer = await generateVoice({ character, text, emotion });

    // Restore after a short delay
    setTimeout(() => setVolumeSafe(70), 1000);

    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    console.error("❌ /generate-voice error:", err?.message || err);
    res.status(500).json({ error: "Failed to generate voice" });
  }
});

// =======================
// 🎬 STORY DIRECTOR — AUTO PARSING
// =======================
function extractPhaseNumber(lower) {
  if (/\bfinal phase\b/.test(lower)) return "final";
  const m = lower.match(/\bphase\s*(\d+|one|two|three|four|iv|iii|ii|i)\b/);
  if (!m) return null;
  const raw = m[1];
  const map = { one: 1, two: 2, three: 3, four: 4, i: 1, ii: 2, iii: 3, iv: 4 };
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return map[raw] ?? null;
}

function detectEventFromNarration(narration) {
  const lower = narration.toLowerCase();

  // End / Victory
  if (/\b(victory|fight is over|battle ends|enemy defeated|they retreat|we won)\b/.test(lower)) {
    return { event: "end_battle" };
  }

  // Boss + explicit phase
  if (/\bboss\b/.test(lower) && /\bphase\b/.test(lower)) {
    const phase = extractPhaseNumber(lower) || "next";
    return { event: "boss_phase", phase };
  }

  // Boss start cues
  if (/\bboss\b/.test(lower) && /\b(appears|arrives|emerges|roars|reveals|transforms|fight begins|battle begins)\b/.test(lower)) {
    return { event: "start_boss", phases: 3, context: "boss" };
  }

  // Normal battle cues
  if (/\b(ambush|enemies appear|enemy attack|combat begins|draw your weapon|hostiles inbound)\b/.test(lower)) {
    let context = "minor";
    if (/\b(elite|dangerous|deadly|powerful)\b/.test(lower)) context = "elite";
    if (/\b(ambush|trap|surprise)\b/.test(lower)) context = "ambush";
    return { event: "start_normal", context };
  }

  return { event: null };
}

app.post("/director", async (req, res) => {
  try {
    const { narration } = req.body;
    if (!narration || typeof narration !== "string") {
      return res.status(400).json({ error: "Missing 'narration' string" });
    }

    const detected = detectEventFromNarration(narration);

    if (detected.event === "start_boss") {
      const { phases = 3, context = "boss" } = detected;
      battleState.active = true;
      battleState.type = "boss";
      battleState.phase = 1;
      battleState.maxPhases = phases;
      battleState.context = context;

      battleState.trackUri = await selectTrack(context, battleState.phase, "boss");
      await playMusic(battleState.trackUri, "fade_in", "low");

      return res.json({ handled: "start_boss_battle", battleState });
    }

    if (detected.event === "boss_phase") {
      if (!(battleState.active && battleState.type === "boss")) {
        // initialize a default boss battle if not active
        battleState.active = true;
        battleState.type = "boss";
        battleState.phase = 1;
        battleState.maxPhases = 3;
        battleState.context = "boss";
      }

      if (detected.phase === "final") {
        battleState.phase = battleState.maxPhases;
      } else if (detected.phase === "next") {
        battleState.phase = Math.min(battleState.phase + 1, battleState.maxPhases);
      } else if (typeof detected.phase === "number") {
        battleState.phase = Math.max(1, Math.min(detected.phase, battleState.maxPhases));
      }

      battleState.trackUri = await selectTrack(battleState.context, battleState.phase, "boss");

      let intensity = "medium";
      if (battleState.phase === battleState.maxPhases - 1) intensity = "high";
      if (battleState.phase === battleState.maxPhases) intensity = "extreme";

      await playMusic(battleState.trackUri, "crossfade", intensity);
      return res.json({ handled: "boss_next_phase", battleState });
    }

    if (detected.event === "start_normal") {
      const { context = "minor" } = detected;
      battleState.active = true;
      battleState.type = "normal";
      battleState.phase = 0;
      battleState.maxPhases = 0;
      battleState.context = context;

      battleState.trackUri = await selectTrack(context, 0, "normal");
      await playMusic(battleState.trackUri, "fade_in", "medium");
      return res.json({ handled: "start_battle", battleState });
    }

    if (detected.event === "end_battle") {
      const wasBoss = battleState.type === "boss";
      battleState = { active: false, type: null, phase: 0, maxPhases: 0, context: "", trackUri: null };

      const q = wasBoss ? "victory fanfare" : "victory theme";
      const results = await spotifyApi.searchTracks(q, { limit: 5 });
      const victoryUri = results?.body?.tracks?.items?.[0]?.uri;
      if (victoryUri) await playMusic(victoryUri, "fade_in", "medium");

      return res.json({ handled: "end_battle", victory: !!victoryUri });
    }

    res.json({ handled: "none", reason: "no trigger keywords detected" });
  } catch (err) {
    console.error("❌ /director error:", err?.message || err);
    res.status(500).json({ error: "Director failed" });
  }
});

// =======================
// 📜 OPENAPI for GPT Actions
// =======================
app.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.0.1",
    info: {
      title: "Project X Battle + Voice API",
      version: "3.0.0",
      description:
        "Controls Spotify battle music (normal + boss phases) with transitions/intensity, generates ElevenLabs character voices with emotions, and includes a Director endpoint to parse narration automatically."
    },
    servers: [{ url: SERVER_URL || "https://projectxmusic.onrender.com" }],
    paths: {
      "/play-music": {
        post: {
          summary: "Play/transition music (manual)",
          description: "Start or switch music. If no URI given, auto-selects a fitting track based on context.",
          operationId: "playMusic",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    context: { type: "string", description: "e.g., 'battle', 'boss_phase_2', 'victory'" },
                    spotify_uri: { type: "string" },
                    transition: {
                      type: "string",
                      enum: ["fade_in", "fade_out", "crossfade", "cut", "build_up"],
                      default: "fade_in"
                    },
                    intensity: {
                      type: "string",
                      enum: ["low", "medium", "high", "extreme", "escalating"],
                      default: "medium"
                    }
                  },
                  required: ["context"]
                }
              }
            }
          },
          responses: { "200": { description: "Music started or transitioned" } }
        }
      },
      "/start-battle": {
        post: {
          summary: "Start a normal battle",
          operationId: "startBattle",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { context: { type: "string" } } }
              }
            }
          },
          responses: { "200": { description: "Normal battle started" } }
        }
      },
      "/start-boss-battle": {
        post: {
          summary: "Start a multi-phase boss battle",
          operationId: "startBossBattle",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    phases: { type: "integer", default: 3 },
                    context: { type: "string", default: "boss" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Boss battle started" } }
        }
      },
      "/next-phase": {
        post: {
          summary: "Advance to the next (or specific) boss phase",
          operationId: "nextPhase",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { targetPhase: { type: "integer" } } }
              }
            }
          },
          responses: { "200": { description: "Boss phase advanced" } }
        }
      },
      "/end-battle": {
        post: {
          summary: "End the current fight and play victory music",
        operationId: "endBattle",
          responses: { "200": { description: "Victory music started" } }
        }
      },
      "/generate-voice": {
        post: {
          summary: "Generate character voice with emotion (ElevenLabs)",
          operationId: "generateVoice",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    character: {
                      type: "string",
                      enum: ["Simba", "Yuji Itadori", "Legoshi", "Louis", "Haru"]
                    },
                    text: { type: "string" },
                    emotion: {
                      type: "string",
                      enum: ["neutral", "happy", "sad", "angry", "fearful", "heroic", "compassionate", "intense", "playful"]
                    }
                  },
                  required: ["character", "text"]
                }
              }
            }
          },
          responses: {
            "200": {
              description: "MP3 audio",
              content: { "audio/mpeg": { schema: { type: "string", format: "binary" } } }
            }
          }
        }
      },
      "/director": {
        post: {
          summary: "Auto-detects encounter type/phase from narration and triggers music",
          description: "Send narration; the server detects boss vs normal, phases, or victory and applies the right music transitions.",
          operationId: "director",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { narration: { type: "string" } },
                  required: ["narration"]
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Director processed narration",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      handled: { type: "string" },
                      battleState: { type: "object" },
                      victory: { type: "boolean" },
                      reason: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
});

// =======================
// 🚀 START SERVER
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Project X API running on port ${PORT}`);
});
