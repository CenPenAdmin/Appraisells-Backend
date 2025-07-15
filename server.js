const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const WebSocket = require("ws");

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

// === Mongoose Schemas ===
const profileSchema = new mongoose.Schema({
  full_name: String,
  email: String,
  wallet_address: String,
  created_at: { type: Date, default: Date.now }
});

const bidSchema = new mongoose.Schema({
  user_name: String,
  amount: Number,
  timestamp: { type: Date, default: Date.now }
});

const Profile = mongoose.model("Profile", profileSchema);
const Bid = mongoose.model("Bid", bidSchema);

// === Save profile info ===
app.post("/save-profile", async (req, res) => {
  try {
    const profile = new Profile(req.body);
    await profile.save();
    res.json({ message: "Profile saved successfully." });
  } catch (err) {
    console.error("Error saving profile:", err);
    res.status(500).json({ message: "Failed to save profile." });
  }
});

// === Return bid history ===
app.get("/get-bids", async (req, res) => {
  try {
    const bids = await Bid.find().sort({ timestamp: -1 }).limit(50);
    res.json(bids);
  } catch (err) {
    console.error("Error fetching bids:", err);
    res.status(500).json({ message: "Failed to fetch bids." });
  }
});

// === Start HTTP server ===
const server = app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

// === WebSocket Setup ===
const wss = new WebSocket.Server({ server });

let highestBid = 0;
let highestBidder = "";
let clients = [];
const AUCTION_END = new Date("2025-12-31T23:59:59Z");
const MIN_INCREMENT = 0.1;

wss.on("connection", async (ws) => {
  clients.push(ws);

  try {
    const recentBids = await Bid.find().sort({ timestamp: -1 }).limit(50);
    ws.send(JSON.stringify({
      type: "init",
      highest: highestBid,
      user: highestBidder,
      bids: recentBids
    }));
  } catch (err) {
    ws.send(JSON.stringify({ error: "Could not load bid history." }));
  }

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);
      const amount = parseFloat(data.amount);
      const user = (data.user || "Anonymous").trim();

      if (new Date() > AUCTION_END) {
        ws.send(JSON.stringify({ error: "Auction has ended." }));
        return;
      }

      if (!user || isNaN(amount) || amount <= highestBid + MIN_INCREMENT - 0.000001) {
        ws.send(JSON.stringify({ error: `Bid must be at least ${MIN_INCREMENT} Pi higher.` }));
        return;
      }

      highestBid = amount;
      highestBidder = user;

      const newBid = new Bid({ user_name: user, amount });
      await newBid.save();

      const broadcast = {
        type: "bid",
        user,
        amount,
        timestamp: new Date().toISOString()
      };

      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(broadcast));
        }
      });
    } catch (err) {
      console.error("WebSocket error:", err);
      ws.send(JSON.stringify({ error: "Invalid input or server error." }));
    }
  });

  ws.on("close", () => {
    clients = clients.filter(client => client !== ws);
  });
});
