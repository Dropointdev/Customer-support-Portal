const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const HelpRequest = require("./models/helpRequest");
const customerAgent = require("./models/customerAgent");
const AgentAccessRequest = require("./models/agentAccessRequest");
const RecordingSession = require("./models/RecordingSession");
const mailer = require("./config/mailer");
const app = express();
require("dotenv").config();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/videos", require("./routes/videoRoutes"));
const passport = require("passport");
app.use(session({
  secret: "droppoint-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 14 * 24 * 60 * 60  // sessions expire after 14 days
  })
}));
app.use(passport.initialize());
app.use(passport.session());
require("./config/passport");

// ==============================
// 🔐 AUTH
// ==============================

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=not_onboarded" }),
  (req, res) => { res.redirect("/"); }
);

async function requireAgent(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.redirect("/login");
  }
  try {
    await customerAgent.findByIdAndUpdate(req.user._id, {
      status: "online",
      lastSeenAt: new Date(),
    });
    req.user.status = "online";
    next();
  } catch (err) {
    console.error("Failed to update agent status:", err);
    return res.redirect("/login");
  }
}

app.get("/login", (req, res) => {
  res.render("login", { error: req.query.error || null });
});

app.get("/logout", async (req, res) => {
  try {
    if (req.user) {
      await customerAgent.findByIdAndUpdate(req.user._id, {
        status: "offline",
        lastSeenAt: new Date(),
      });
    }
  } catch (err) {
    console.error("Failed to update agent status on logout:", err);
  }
  req.logout(() => { res.redirect("/login"); });
});

// ==============================
// 📋 DASHBOARD — recording sessions
// ==============================

app.get("/dashboard", requireAgent, async (req, res) => {
  const { q, lockerId } = req.query;
  let filter = {};

  if (lockerId) filter.lockerId = new RegExp(lockerId, "i");
  if (q) {
    filter.$or = [
      { sessionId: new RegExp(q, "i") },
      { lockerId:  new RegExp(q, "i") },
      { cameraId:  new RegExp(q, "i") },
    ];
  }

  const all = await RecordingSession.find(filter).sort({ startedAt: -1 }).lean();

  // ✅ Group by sessionId — one row per transaction
  const seen = new Set();
  const sessions = [];
  for (const s of all) {
    if (!seen.has(s.sessionId)) {
      seen.add(s.sessionId);
      // count how many cameras have video ready
      const camsForSession = all.filter(x => x.sessionId === s.sessionId);
      s.totalCams   = camsForSession.length;
      s.readyCams   = camsForSession.filter(x => x.embedUrl).length;
      sessions.push(s);
    }
  }

  res.render("dashboard", { sessions, agent: req.user });
});

app.get("/", requireAgent, async (req, res) => {
  const { q, lockerId } = req.query;
  let filter = {};

  if (lockerId) filter.lockerId = new RegExp(lockerId, "i");
  if (q) {
    filter.$or = [
      { sessionId: new RegExp(q, "i") },
      { lockerId:  new RegExp(q, "i") },
      { cameraId:  new RegExp(q, "i") },
    ];
  }

  const all = await RecordingSession.find(filter).sort({ startedAt: -1 }).lean();

  // ✅ Group by sessionId — one row per transaction
  const seen = new Set();
  const sessions = [];
  for (const s of all) {
    if (!seen.has(s.sessionId)) {
      seen.add(s.sessionId);
      // count how many cameras have video ready
      const camsForSession = all.filter(x => x.sessionId === s.sessionId);
      s.totalCams   = camsForSession.length;
      s.readyCams   = camsForSession.filter(x => x.embedUrl).length;
      sessions.push(s);
    }
  }

  res.render("dashboard", { sessions, agent: req.user });
});

// ==============================
// 🎥 SESSION DETAIL — view videos
// ==============================

app.get("/sessions/:sessionId", requireAgent, async (req, res) => {
  const sessions = await RecordingSession.find({
    sessionId: req.params.sessionId
  }).lean();

  if (!sessions.length) return res.redirect("/");

  res.render("complaint_view", {
    sessionId: req.params.sessionId,
    lockerId:  sessions[0].lockerId,
    startedAt: sessions[0].startedAt,
    sessions
  });
});

// ==============================
// 🔐 ACCESS REQUESTS
// ==============================

app.get("/request-access", (req, res) => {
  res.render("request_access", { error: null, success: false });
});

app.post("/request-access", async (req, res) => {
  try {
    const { name, email, phone, reason } = req.body;

    if (!name || !email) {
      return res.render("request_access", {
        error: "Name and email are required",
        success: false,
      });
    }

    const existing = await AgentAccessRequest.findOne({ email, status: "pending" });
    if (existing) {
      return res.render("request_access", {
        error: "You already have a pending request",
        success: false,
      });
    }

    const accessReq = await AgentAccessRequest.create({ name, email, phone, reason });

    const base = process.env.APP_URL || "http://localhost:3000";
    const approveUrl = `${base}/admin/approve/${accessReq._id}`;
    const rejectUrl  = `${base}/admin/reject/${accessReq._id}`;

    await mailer.sendMail({
      from: `"DropPoint Support" <${process.env.EMAIL_USER}>`,
      to: process.env.APPROVER_EMAIL,
      subject: `New agent access request from ${name}`,
      html: `
        <h2>New Access Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || "—"}</p>
        <p><strong>Reason:</strong> ${reason || "—"}</p>
        <br>
        <a href="${approveUrl}" style="background:#16a34a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-right:12px;">✓ Approve</a>
        <a href="${rejectUrl}"  style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">✗ Reject</a>
      `,
    });

    res.render("request_access", { error: null, success: true });
  } catch (err) {
    console.error("Request access error:", err);
    res.render("request_access", {
      error: "Something went wrong. Please try again.",
      success: false,
    });
  }
});

app.get("/admin/approve/:id", async (req, res) => {
  try {
    const accessReq = await AgentAccessRequest.findById(req.params.id);
    if (!accessReq || accessReq.status !== "pending") {
      return res.send("This request has already been processed.");
    }

    const existing = await customerAgent.findOne({ email: accessReq.email });
    if (!existing) {
      await customerAgent.create({
        name: accessReq.name,
        email: accessReq.email,
        phone: accessReq.phone,
        status: "offline",
      });
    }

    await AgentAccessRequest.findByIdAndUpdate(req.params.id, { status: "approved" });

    await mailer.sendMail({
      from: `"DropPoint Support" <${process.env.EMAIL_USER}>`,
      to: accessReq.email,
      subject: "Your DropPoint access has been approved",
      html: `
        <h2>You're in!</h2>
        <p>Hi ${accessReq.name}, your agent access has been approved.</p>
        <p>You can now log in with your Google account at:</p>
        <a href="${process.env.APP_URL || "http://localhost:3000"}/login">Log in to DropPoint</a>
      `,
    });

    res.send(`
      <h2 style="font-family:sans-serif">✓ Approved</h2>
      <p style="font-family:sans-serif">${accessReq.name} (${accessReq.email}) has been added as an agent and notified.</p>
    `);
  } catch (err) {
    console.error("Approval error:", err);
    res.status(500).send("Something went wrong during approval.");
  }
});

app.get("/admin/reject/:id", async (req, res) => {
  try {
    const accessReq = await AgentAccessRequest.findById(req.params.id);
    if (!accessReq || accessReq.status !== "pending") {
      return res.send("This request has already been processed.");
    }

    await AgentAccessRequest.findByIdAndUpdate(req.params.id, { status: "rejected" });

    await mailer.sendMail({
      from: `"DropPoint Support" <${process.env.EMAIL_USER}>`,
      to: accessReq.email,
      subject: "Your DropPoint access request was not approved",
      html: `
        <p>Hi ${accessReq.name}, unfortunately your access request was not approved at this time.</p>
        <p>Please contact your administrator if you believe this is an error.</p>
      `,
    });

    res.send(`
      <h2 style="font-family:sans-serif">✗ Rejected</h2>
      <p style="font-family:sans-serif">${accessReq.name} has been notified of the rejection.</p>
    `);
  } catch (err) {
    console.error("Rejection error:", err);
    res.status(500).send("Something went wrong during rejection.");
  }
});

// ==============================
// 🚀 START
// ==============================

app.listen(3000, () => {
  console.log("🚀 Support system running at http://localhost:3000");
});