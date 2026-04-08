// videoRoutes.js — Support Portal
// Reads video embed URLs from the shared MongoDB Atlas cluster.
// The kiosk backend writes these after uploading to Drive.
// Mount in support portal server.js: app.use("/api/videos", require("./videoRoutes"))

const express  = require("express");
const router   = express.Router();
const mongoose = require("mongoose");

// ── RecordingSession schema — must match kiosk backend model ─────────────────
const RecordingSessionSchema = new mongoose.Schema({
  sessionId:    String,
  helpId:       String,
  lockerId:     String,
  cameraId:     String,
  rawVideoFile: String,
  driveFileId:  String,
  embedUrl:     String,   // set by kiosk after Drive upload
  viewUrl:      String,
  cloudUploaded:Boolean,
  uploadedAt:   Date,
  status:       String,
  startedAt:    Date,
  endedAt:      Date
}, { collection: "recordingsessions" });  // ← must match exact collection name in Atlas

const RecordingSession = mongoose.models.RecordingSession
  || mongoose.model("RecordingSession", RecordingSessionSchema);

// GET /api/videos/:helpId
// Returns all camera videos for a complaint with their embed URLs and status
router.get("/:helpId", async (req, res) => {
  try {
    const sessions = await RecordingSession.find({
      sessionId: req.params.helpId   // ✅ matches your schema usage
    })
    .select("cameraId embedUrl viewUrl uploadedAt cloudUploaded status")
    .lean();

    const videos = sessions.map(s => ({
      cameraId: s.cameraId,
      embedUrl: s.embedUrl || null,
      viewUrl: s.viewUrl || null,
      uploadedAt: s.uploadedAt || null,
      status: s.embedUrl
        ? "ready"
        : s.cloudUploaded
        ? "processing"
        : "pending"
    }));

    res.json({
      success: true,
      helpId: req.params.helpId,
      videos
    });

  } catch (err) {
    console.error("❌ VIDEO ROUTE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;