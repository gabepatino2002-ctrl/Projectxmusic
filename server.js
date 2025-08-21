import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// Needed for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Route to serve your OpenAPI schema
app.get("/openapi.json", (req, res) => {
  res.sendFile(path.join(__dirname, "openapi.json"));
});

// ✅ Health check route (just to see the server is alive)
app.get("/", (req, res) => {
  res.send("🎶 ProjectX Music API is running! Try /openapi.json");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
