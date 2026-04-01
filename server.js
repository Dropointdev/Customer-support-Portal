const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const HelpRequest = require("./models/helpRequest");
const customerAgent = require("./models/customerAgent");
const app = express();
require("dotenv").config();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, 'public')));
app.use("/api/videos", require("./routes/videoRoutes"));

// DB
mongoose.connect(process.env.MONGO_URI);
const session = require("express-session");
const passport = require("passport");


app.use(require("express-session")({
  secret: "droppoint-secret",
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());
require("./config/passport");

// Start Google login
// Start Google login
app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Callback
app.get("/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login?error=not_onboarded",
  }),
  (req, res) => {
    // Logged in successfully
    res.redirect("/dashboard");
  }
);
 // adjust path if needed

async function requireAgent(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.redirect("/login");
  }

  try {
    // Update agent status to online + heartbeat
    await customerAgent.findByIdAndUpdate(req.user._id, {
      status: "online",
      lastSeenAt: new Date(),
    });

    // Also update in req.user object (for UI)
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

  req.logout(() => {
    res.redirect("/login");
  });
});
app.get("/dashboard", requireAgent, async (req, res) => {
  const { status, priority, q } = req.query;

  let filter = {};

  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  if (q) {
    filter.$or = [
      { helpId: new RegExp(q, "i") },
      { customerPhone: new RegExp(q, "i") },
      { lockerId: new RegExp(q, "i") },
      { compartmentId: new RegExp(q, "i") },
    ];
  }

  const complaints = await HelpRequest.find(filter).sort({ createdAt: -1 });

  res.render("dashboard", {
    complaints,
    agent: req.user,   // ✅ send logged-in agent to EJS
  });
});


// Home → Dashboard
app.get("/", requireAgent,async (req, res) => {
  const { status, priority, q } = req.query;

  let filter = {};

  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  if (q) {
    filter.$or = [
      { helpId: new RegExp(q, "i") },
      { customerPhone: new RegExp(q, "i") },
      { lockerId: new RegExp(q, "i") },
      { compartmentId: new RegExp(q, "i") },    
    ];
  }

  const complaints = await HelpRequest.find(filter).sort({ createdAt: -1 });

  res.render("dashboard", { complaints });
});

// Show new complaint form
app.get("/complaints/new", (req, res) => {
  res.render("new_complaint");
});

// Create complaint
app.post("/complaints", async (req, res) => {
  const {
    lockerId,
    compartmentId,
    parcelId,
    kioskId,
    category,
    title,
    description,
  } = req.body;

  const helpId = "HR-" + Date.now();

  await HelpRequest.create({
    helpId,
    lockerId,
    compartmentId,
    parcelId,
    kioskId,
    category,
    title,
    description,
  });

  res.redirect("/");
});

// View single complaint
app.get("/complaints/:id", async (req, res) => {
  const complaint = await HelpRequest.findById(req.params.id);
  res.render("complaint_view", { complaint });
});

// Update status
app.post("/complaints/:id/status", async (req, res) => {
  await HelpRequest.findByIdAndUpdate(req.params.id, {
    status: req.body.status,
  });
  res.redirect("/complaints/" + req.params.id);
});






const AgentAccessRequest = require("./models/agentAccessRequest");

// Show form
app.get("/request-access", (req, res) => {
  res.render("request_access", { error: null, success: false });
});

// Submit form
app.post("/request-access", async (req, res) => {
  try {
    const { name, email, phone, reason } = req.body;

    if (!name || !email) {
      return res.render("request_access", {
        error: "Name and email are required",
        success: false,
      });
    }

    // Prevent duplicate requests
    const existing = await AgentAccessRequest.findOne({
      email,
      status: "pending",
    });

    if (existing) {
      return res.render("request_access", {
        error: "You already have a pending request",
        success: false,
      });
    }

    await AgentAccessRequest.create({
      name,
      email,
      phone,
      reason,
    });

    res.render("request_access", {
      error: null,
      success: true,
    });
  } catch (err) {
    console.error("Request access error:", err);
    res.render("request_access", {
      error: "Something went wrong. Please try again.",
      success: false,
    });
  }
});



// Start server
app.listen(3000, () => {
  console.log("🚀 Support system running at http://localhost:3000");
});
