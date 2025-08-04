import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ port: 8080 });
const rooms = {};

wss.on("connection", (ws) => {
  console.log("New WebSocket connection established");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      const { type, room, payload } = data;

      console.log(`Received message: ${type} for room: ${room}`);

      if (type === "join") {
        if (ws.room && rooms[ws.room]) {
          rooms[ws.room] = rooms[ws.room].filter((c) => c !== ws);
          if (rooms[ws.room].length === 0) {
            delete rooms[ws.room];
          }
        }

        ws.room = room;
        rooms[room] = rooms[room] || [];
        rooms[room].push(ws);

        console.log(
          `Client joined room ${room}. Room size: ${rooms[room].length}`
        );

        if (rooms[room].length === 2) {
          console.log(`Room ${room} is full, notifying clients to start call`);
          const caller = rooms[room][0];
          if (caller.readyState === WebSocket.OPEN) {
            caller.send(JSON.stringify({ type: "ready" }));
          }
        } else if (rooms[room].length > 2) {
          console.log(`Room ${room} is full, rejecting new client`);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Room is full. Maximum 2 participants allowed.",
            })
          );
          ws.close();
          return;
        }
      }

      if (type === "signal") {
        if (!room || !rooms[room]) {
          console.error("Signal received but client not in a room");
          return;
        }

        console.log(`Relaying signal ${payload.type} in room ${room}`);

        let relayedCount = 0;
        rooms[room].forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "signal", payload }));
            relayedCount++;
          }
        });

        console.log(`Signal relayed to ${relayedCount} clients`);
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        })
      );
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");

    if (ws.room && rooms[ws.room]) {
      rooms[ws.room] = rooms[ws.room].filter((c) => c !== ws);
      console.log(
        `Client left room ${ws.room}. Remaining clients: ${
          rooms[ws.room].length
        }`
      );

      if (rooms[ws.room].length === 1) {
        rooms[ws.room][0].send(
          JSON.stringify({
            type: "peer-disconnected",
          })
        );
      }

      if (rooms[ws.room].length === 0) {
        delete rooms[ws.room];
        console.log(`Room ${ws.room} deleted (empty)`);
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

process.on("SIGINT", () => {
  console.log("Shutting down server...");
  wss.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

console.log("WebSocket signaling server running on ws://localhost:8080");
