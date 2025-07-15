const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3000;

// === Middleware ===
app.use(cors());
app.use(express.json());

// === MongoDB Connection ===
mongoose.connect("mongodb://localhost:27017/appraisells", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ Connected to MongoDB");
}).catch(err => {
  console.error("❌ MongoDB connection error:", err);
});

// === Mongoose Schema for User Profile ===
const profileSchema = new mongoose.Schema({
  full_name: String,
  email: String,
  wallet_address: String,
  created_at: { type: Date, default: Date.now }
});

const Profile = mongoose.model("Profile", profileSchema);

// === Route: Save Profile ===
app.post("/save-profile", async (req, res) => {
  try {
    const profile = new Profile(req.body);
    await profile.save();
    res.json({ message: "✅ Profile saved successfully." });
  } catch (err) {
    console.error("❌ Error saving profile:", err);
    res.status(500).json({ message: "❌ Failed to save profile." });
  }
});

// === Route: Get All Profiles (Optional, for testing) ===
app.get("/profiles", async (req, res) => {
  try {
    const profiles = await Profile.find().sort({ created_at: -1 });
    res.json(profiles);
  } catch (err) {
    console.error("❌ Error fetching profiles:", err);
    res.status(500).json({ message: "❌ Failed to fetch profiles." });
  }
});

// === Start Server ===
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
