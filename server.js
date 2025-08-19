import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI; // https://projectxmusic.onrender.com/callback

// ✅ Base route
app.get("/", (req, res) => {
  res.send("✅ Project X Spotify server is running! Go to /login to start.");
});

// ✅ Login route
app.get("/login", (req, res) => {
  const scope =
    "user-read-playback-state user-modify-playback-state user-read-currently-playing";
  const auth_url = new URL("https://accounts.spotify.com/authorize");
  auth_url.searchParams.append("response_type", "code");
  auth_url.searchParams.append("client_id", client_id);
  auth_url.searchParams.append("scope", scope);
  auth_url.searchParams.append("redirect_uri", redirect_uri);
  res.redirect(auth_url.toString());
});

// ✅ Callback route (first login)
app.get("/callback", async (req, res) => {
  const code = req.query.code || null;

  try {
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(client_id + ":" + client_secret).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirect_uri,
      }),
    });

    const data = await tokenResponse.json();

    if (data.access_token && data.refresh_token) {
      console.log("✅ Access Token:", data.access_token);
      console.log("🔁 Refresh Token:", data.refresh_token);

      res.send(
        "🎶 Logged in successfully! Copy your refresh token from the logs and save it in Render as SPOTIFY_REFRESH_TOKEN."
      );
    } else {
      console.error("❌ Missing tokens:", data);
      res.status(500).send("Spotify login failed. Missing tokens.");
    }
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
});

// ✅ Refresh token route
app.get("/refresh", async (req, res) => {
  try {
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(client_id + ":" + client_secret).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
      }),
    });

    const data = await tokenResponse.json();

    if (data.access_token) {
      console.log("✅ Refreshed Access Token:", data.access_token);
      res.send("🎶 New Access Token: " + data.access_token);
    } else {
      console.error("❌ Refresh failed:", data);
      res.status(500).send("Failed to refresh: " + JSON.stringify(data));
    }
  } catch (err) {
    console.error("❌ Refresh error:", err);
    res.status(500).send("Internal Error: " + err.message);
  }
});

// ✅ Play route (trigger track or playlist)
app.get("/play", async (req, res) => {
  const trackUri = req.query.track; // e.g. spotify:track:3n3Ppam7vgaVa1iaRUc9Lp
  if (!trackUri) return res.status(400).send("❌ Please provide a track URI.");

  try {
    // Get fresh token
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(client_id + ":" + client_secret).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
      }),
    });

    const tokenData = await tokenResponse.json();
    const access_token = tokenData.access_token;

    // Send play command
    const playResponse = await fetch(
      "https://api.spotify.com/v1/me/player/play",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [trackUri], // Play the given track
        }),
      }
    );

    if (playResponse.status === 204) {
      res.send("🎵 Now playing: " + trackUri);
    } else {
      const errorData = await playResponse.text();
      console.error("❌ Play error:", errorData);
      res.status(500).send("Failed to play: " + errorData);
    }
  } catch (err) {
    console.error("❌ Play route error:", err);
    res.status(500).send("Internal Error: " + err.message);
  }
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
