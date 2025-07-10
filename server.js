const express = require("express");
const fs = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === Configuration ===
const AUCTION_END = new Date("2025-12-31T23:59:59Z");  // Set real auction end time
const MIN_INCREMENT = 0.1; // Minimum increment in Pi

// === Save profile info ===
app.post("/save-profile", (req, res) => {
  const data = req.body;
  const profiles = fs.existsSync("profiles.json")
    ? JSON.parse(fs.readFileSync("profiles.json"))
    : [];

  profiles.push(data);
  fs.writeFileSync("profiles.json", JSON.stringify(profiles, null, 2));
  res.json({ message: "Profile saved successfully." });
});

// === Return bid history ===
app.get("/get-bids", (req, res) => {
  const bids = fs.existsSync("bids.json")
    ? JSON.parse(fs.readFileSync("bids.json"))
    : [];
  res.json(bids);
});

// === Start server ===
const server = app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

// === WebSocket Setup ===
const wss = new WebSocket.Server({ server });

let highestBid = 0;
let highestBidder = "";
let clients = [];
let bidHistory = fs.existsSync("bids.json") ? JSON.parse(fs.readFileSync("bids.json")) : [];

wss.on("connection", (ws) => {
  clients.push(ws);

  // Send current auction state to new connection
  ws.send(JSON.stringify({
    type: "init",
    highest: highestBid,
    user: highestBidder,
    bids: bidHistory
  }));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      const amount = parseFloat(data.amount);
      const user = (data.user || "Anonymous").trim();

      if (new Date() > AUCTION_END) {
        ws.send(JSON.stringify({ error: "Auction has ended. No more bids allowed." }));
        return;
      }

      if (!user || isNaN(amount)) {
        ws.send(JSON.stringify({ error: "Invalid bid format." }));
        return;
      }

      if (amount <= highestBid + MIN_INCREMENT - 0.000001) {
        ws.send(JSON.stringify({ error: `Bid must be at least ${MIN_INCREMENT} Pi higher than current.` }));
        return;
      }

      highestBid = amount;
      highestBidder = user;

      const bidData = {
        user: highestBidder,
        amount: highestBid,
        timestamp: new Date().toISOString()
      };

      bidHistory.push(bidData);
      fs.writeFileSync("bids.json", JSON.stringify(bidHistory, null, 2));

      const broadcast = {
        type: "bid",
        ...bidData
      };

      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(broadcast));
        }
      });

    } catch (err) {
      console.error("Error handling message:", err);
      ws.send(JSON.stringify({ error: "Server error. Invalid input." }));
    }
  });

  ws.on("close", () => {
    clients = clients.filter(client => client !== ws);
  });
});
