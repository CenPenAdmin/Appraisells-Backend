const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const { Pool } = require("pg");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


// === PostgreSQL Setup ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// === Middleware ===
app.use(cors());
app.use(express.json());

// === Configuration ===
const AUCTION_END = new Date("2025-12-31T23:59:59Z");
const MIN_INCREMENT = 0.1;

// === Save profile info to PostgreSQL ===
app.post("/save-profile", async (req, res) => {
  const { full_name, email, wallet_address } = req.body;
  const created_at = new Date();

  try {
    await pool.query(
      "INSERT INTO profiles (full_name, email, wallet_address, created_at) VALUES ($1, $2, $3, now())",
      [full_name, email, wallet_address]
    );
    res.json({ message: "Profile saved successfully." });
  } catch (err) {
    console.error("Error saving profile:", err);
    res.status(500).json({ message: "Failed to save profile." });
  }
});

// === Return bid history === 
// === Return bid history from PostgreSQL ===
app.get("/get-bids", async (req, res) => {
  try {
    const result = await pool.query("SELECT user_name, amount, timestamp FROM bids ORDER BY timestamp DESC LIMIT 50");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching bids:", err);
    res.status(500).json({ message: "Failed to fetch bids." });
  }
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

wss.on("connection", async (ws) => {
  clients.push(ws);

  // Send bid history on connection
  try {
    const result = await pool.query("SELECT user_name, amount, timestamp FROM bids ORDER BY timestamp DESC LIMIT 50");
    ws.send(JSON.stringify({
      type: "init",
      highest: highestBid,
      user: highestBidder,
      bids: result.rows
    }));
  } catch (err) {
    console.error("Failed to fetch bid history for websocket init:", err);
    ws.send(JSON.stringify({ error: "Could not load bid history." }));
  }

  ws.on("message", async (msg) => {
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

      try {
        await pool.query(
          "INSERT INTO bids (user_name, amount, timestamp) VALUES ($1, $2, $3)",
          [bidData.user, bidData.amount, bidData.timestamp]
        );
      } catch (err) {
        console.error("Failed to store bid in PostgreSQL:", err);
      }

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
