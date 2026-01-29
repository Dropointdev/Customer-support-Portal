require("dotenv").config();

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const CustomerAgent = require("../models/customerAgent");

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        const agent = await CustomerAgent.findOne({ email });

        if (!agent) {
          // Not onboarded
          return done(null, false);
        }

        if (!agent.isActive) {
          // Disabled
          return done(null, false);
        }

        // Link google account if not linked
        if (!agent.googleId) {
          agent.googleId = profile.id;
          await agent.save();
        }

        return done(null, agent); // ✅ MUST return agent document
      } catch (err) {
        console.error("Passport error:", err);
        return done(err, null);
      }
    }
  )
);

// ✅ SERIALIZE
passport.serializeUser((agent, done) => {
  if (!agent || !agent.id) {
    return done(new Error("No agent to serialize"), null);
  }
  done(null, agent.id); // store Mongo _id in session
});

// ✅ DESERIALIZE
passport.deserializeUser(async (id, done) => {
  try {
    const agent = await CustomerAgent.findById(id);
    if (!agent) {
      return done(null, false);
    }
    done(null, agent);
  } catch (err) {
    done(err, null);
  }
});
