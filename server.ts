import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PORT (Railway uses this)
const PORT = process.env.PORT || 8080;

// SIMPLE TEST ROUTE (IMPORTANT)
app.get("/", (req, res) => {
  res.send("🚀 VoiceForge TTS is running!");
});

// Serve frontend if built
app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// START SERVER
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
