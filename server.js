const express = require("express");
const { spawn } = require("node:child_process");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const MAX_BYTES = Number(process.env.MAX_BYTES || 25 * 1024 * 1024);
const BITRATE = process.env.BITRATE || "128k";

function sendJsonError(res, status, message, details) {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  res.removeHeader("Content-Type");
  res.removeHeader("Content-Disposition");

  res.status(status).json({
    ok: false,
    error: message,
    details: details || undefined,
  });
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "audio-to-mp3-api",
  });
});

app.post("/convert", (req, res) => {
  const contentType = req.headers["content-type"] || "";

  if (contentType.includes("multipart/form-data")) {
    return sendJsonError(
      res,
      415,
      "No envíes multipart/form-data. Envía el audio como body binario directo."
    );
  }

  let bytesReceived = 0;
  let finished = false;
  let ffmpegError = "";

  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",

    // Entrada desde memoria/stdin
    "-i",
    "pipe:0",

    // Salida MP3
    "-vn",
    "-codec:a",
    "libmp3lame",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-b:a",
    BITRATE,
    "-f",
    "mp3",

    // Salida hacia memoria/stdout
    "pipe:1",
  ]);

  req.on("data", (chunk) => {
    bytesReceived += chunk.length;

    if (bytesReceived > MAX_BYTES && !finished) {
      finished = true;

      req.unpipe(ffmpeg.stdin);
      ffmpeg.kill("SIGKILL");

      return sendJsonError(
        res,
        413,
        `El archivo es demasiado grande. Máximo permitido: ${MAX_BYTES} bytes.`
      );
    }
  });

  req.on("aborted", () => {
    ffmpeg.kill("SIGKILL");
  });

  req.on("error", () => {
    ffmpeg.kill("SIGKILL");
  });

  ffmpeg.stderr.on("data", (data) => {
    ffmpegError += data.toString();
    ffmpegError = ffmpegError.slice(-3000);
  });

  ffmpeg.on("error", (error) => {
    if (finished) return;
    finished = true;

    return sendJsonError(
      res,
      500,
      "No se pudo ejecutar ffmpeg.",
      error.message
    );
  });

  ffmpeg.on("close", (code) => {
    if (finished) return;
    finished = true;

    if (bytesReceived === 0) {
      return sendJsonError(res, 400, "No se recibió ningún archivo de audio.");
    }

    if (code !== 0 && !res.headersSent) {
      return sendJsonError(
        res,
        422,
        "No se pudo convertir el audio a MP3.",
        ffmpegError.trim()
      );
    }

    if (code !== 0 && res.headersSent) {
      res.destroy();
    }
  });

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');

  req.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);
});

app.listen(PORT, () => {
  console.log(`Audio converter API running on port ${PORT}`);
});
