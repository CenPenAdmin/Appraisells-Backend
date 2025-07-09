const express = require("express");
const fs = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const app = express();
const port = process.env.PORT || 3000; 

app.use(cors());
app.use(express.json());

// Save profile info
app.post("/save-profile", (req, res) => {
  const data = req.body;
  const profiles = fs.existsSync("profiles.json")
    ? JSON.parse(fs.readFileSync("profiles.json"))
    : [];

  profiles.push(data);
  fs.writeFileSync("profiles.json", JSON.stringify(profiles, null, 2));
  res.json({ message: "Profile saved successfully." });
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

let highestBid = 0;
let highestBidder = "";
let clients = [];

wss.on("connection", (ws) => {
  clients.push(ws);

  ws.send(JSON.stringify({ highest: highestBid, user: highestBidder }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const amount = parseFloat(data.amount);

    if (amount > highestBid) {
      highestBid = amount;
      highestBidder = data.user;

      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            user: highestBidder,
            amount,
            highest: highestBid
          }));
        }
      });
    }
  });

  ws.on("close", () => {
    clients = clients.filter(client => client !== ws);
  });
});
