import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();

const client_id = process.env.f137d53f65ff4931b9aad40d240fc192;
const client_secret = process.env.9c31664e67274f95ac2baa04ddf35744;
const redirect_uri = process.env.https://projectxmusic.onrender.com/callback;

app.get("/", (req, res) => {
  res.send("✅ Project X Spotify server is running! Go to /login to start.");
});

app.get("/login", (req, res) => {
  const scope = "user-read-playback-state user-modify-playback-state";
  const auth_url = new URL("https://accounts.spotify.com/authorize");
  auth_url.searchParams.append("response_type", "code");
  auth_url.searchParams.append("client_id", client_id);
  auth_url.searchParams.append("scope", scope);
  auth_url.searchParams.append("redirect_uri", redirect_uri);
  res.redirect(auth_url.toString());
});

app.get("/callback", async (req, res) => {
  const code = req.query.code || null;

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

  if (data.access_token) {
    res.send("✅ Logged in! Check your Render logs for your Access Token.");
    console.log("Access Token:", data.access_token);
  } else {
    res.send("❌ Login failed: " + JSON.stringify(data));
  }
});

app.listen(3000, () => {
  console.log("✅ Server running on port 3000");
});
