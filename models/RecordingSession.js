const mongoose = require("mongoose");

const RecordingSessionSchema = new mongoose.Schema({
  sessionId:     String,
  lockerId:      String,
  cameraId:      String,
  status:        String,
  startedAt:     Date,
  cloudUploaded: Boolean,
  embedUrl:      String,
  viewUrl:       String,
  driveFileId:   String,
  uploadedAt:    Date
}, { collection: "recordingsessions" });

module.exports = mongoose.models.RecordingSession
  || mongoose.model("RecordingSession", RecordingSessionSchema);