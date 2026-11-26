// Record the sgciv trailer frame by frame with headless Chrome, then encode with ffmpeg.
//   cd video && npm install && node record.mjs        -> video/sgciv-trailer.mp4
// Needs: Google Chrome, ffmpeg, python3 (for the static server and music.py).
import puppeteer from "puppeteer-core";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, "..", "web");
const FRAMES = path.join(HERE, "frames");
const OUT = path.join(HERE, "sgciv-trailer.mp4");
const PORT = 8799, FPS = 30, W = 1280, H = 720, SCALE = 1.5; // 1920x1080 output
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1", "--directory", WEB], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
try {
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
  await page.goto(`http://127.0.0.1:${PORT}/?trailer&record`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.TRAILER && window.TRAILER.ready, { timeout: 60000 });
  const dur = await page.evaluate(() => TRAILER.duration);
  const n = Math.round(dur * FPS);
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    await page.evaluate((t) => TRAILER.frame(t), f / FPS);
    await page.screenshot({ path: path.join(FRAMES, `f${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 93 });
    if (f % 60 === 0) console.log(`frame ${f}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await browser.close();
  const music = path.join(HERE, "music.wav");
  if (!existsSync(music)) execFileSync("python3", [path.join(HERE, "music.py"), music, String(dur)], { stdio: "inherit" });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FRAMES, "f%05d.jpg"), "-i", music,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", "-shortest", OUT], { stdio: "inherit" });
  console.log("wrote", OUT);
} finally {
  server.kill();
}
