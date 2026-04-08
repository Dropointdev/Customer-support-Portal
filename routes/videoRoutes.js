const express  = require("express");
const router   = express.Router();
const mongoose = require("mongoose");

const RecordingSessionSchema = new mongoose.Schema({
  sessionId:     String,
  helpId:        String,
  lockerId:      String,
  cameraId:      String,
  rawVideoFile:  String,
  driveFileId:   String,
  embedUrl:      String,
  viewUrl:       String,
  cloudUploaded: Boolean,
  uploadedAt:    Date,
  status:        String,
  startedAt:     Date,
  endedAt:       Date
}, { collection: "recordingsessions" });

const RecordingSession = mongoose.models.RecordingSession
  || mongoose.model("RecordingSession", RecordingSessionSchema);

// GET /api/videos/:helpId
router.get("/:helpId", async (req, res) => {
  try {
    const sessions = await RecordingSession.find({
      sessionId: req.params.helpId
    })
    .select("cameraId embedUrl viewUrl uploadedAt cloudUploaded status")
    .lean();

    if (!sessions.length) {
      return res.json({ success: true, helpId: req.params.helpId, videos: [] });
    }

    const videos = sessions.map(s => {
      let status;
      if (s.embedUrl)          status = "ready";
      else if (s.cloudUploaded) status = "processing";
      else if (s.status === "failed") status = "failed";   // ✅ surface failures explicitly
      else                      status = "pending";

      return {
        cameraId:   s.cameraId,
        embedUrl:   s.embedUrl  || null,
        viewUrl:    s.viewUrl   || null,
        uploadedAt: s.uploadedAt || null,
        status
      };
    });

    res.json({ success: true, helpId: req.params.helpId, videos });

  } catch (err) {
    console.error("❌ VIDEO ROUTE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;