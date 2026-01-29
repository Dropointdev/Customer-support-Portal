const mongoose = require("mongoose");

const helpRequestSchema = new mongoose.Schema(
  {
    // Ticket identity
    helpId: { type: String, unique: true, index: true }, // TKT-0000001

    // Customer snapshot
    customerName: String,
    customerPhone: String,
    customerId: String,

    // Parcel / locker context
    parcelId: String,
    lockerId: { type: String, required: true, index: true },
    terminalId: String,
    compartmentId: String,
    compartmentAddress: String, // D-4-M2-1 etc

    // Issue
    category: {
      type: String, // jammed_compartment, lost_parcel, etc
      index: true,
    },
    title: String,
    description: String,

    // Ticket state
    status: {
      type: String,
      enum: ["open", "claimed", "in_progress", "resolved", "closed"],
      default: "open",
      index: true,
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
      index: true,
    },

    // Assignment
    assignedToId: String,
    assignedToName: String,

    // SLA
    slaSeconds: { type: Number, default: 3600 }, // 1 hour default
    slaBreached: { type: Boolean, default: false },

    // Video
    hasVideo: { type: Boolean, default: false },
    liveFeedUrl: String,
    dropoffVideoUrl: String,
    pickupVideoUrl: String,

    // Timeline events
    timeline: [
      {
        type: {
          type: String, // created, claimed, status_changed, note_added, unlock_attempt
        },
        message: String,
        at: { type: Date, default: Date.now },
        by: String,
      },
    ],

    // Internal notes
    notes: [
      {
        message: String,
        by: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("HelpRequest", helpRequestSchema);
