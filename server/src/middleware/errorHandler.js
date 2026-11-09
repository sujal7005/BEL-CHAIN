export function errorHandler(err, req, res, _next) {
  // Mongoose duplicate key
  if (err.code === 11000) {
    return res.status(409).json({ error: "Duplicate key", keys: err.keyValue });
  }
  // Mongoose validation
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed",
      details: Object.values(err.errors).map((e) => e.message),
    });
  }
  // Zod
  if (err.name === "ZodError") {
    return res.status(400).json({ error: "Validation failed", details: err.issues });
  }
  // JWT
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token" });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired" });
  }
  // Multer
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }
  // Explicit app errors
  const status = err.status || err.statusCode || 500;
  const message = status >= 500 ? "Internal server error" : err.message || "Error";

  if (status >= 500) {
    console.error("💥", err);
  }
  res.status(status).json({ error: message });
}