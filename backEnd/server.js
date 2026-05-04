'use strict';

require('dotenv').config();

const http = require('http');
const { Server: SocketServer } = require('socket.io');
const { createApp } = require('./src/app');
const { initSocket } = require('./src/socket/robotSocket');
const { initDb } = require('./src/config/db');

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  // 1. Init DB (create tables if needed)
  await initDb();

  // 2. Create Socket.io server (must exist before createApp so req.io works)
  const io = new SocketServer({
    cors: {
      origin: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174').split(',').map(s => s.trim()),
      methods: ['GET', 'POST'],
    },
  });

  // 3. Build Express app (needs io for req.io injection)
  const app = createApp(io);
  const httpServer = http.createServer(app);

  // 4. Attach socket.io to the HTTP server
  io.attach(httpServer);

  // 5. Register socket handlers + start status broadcast loop
  initSocket(io);

  // 6. Start listening
  httpServer.listen(PORT, () => {
    console.log(`\nKachaka backend running on http://localhost:${PORT}`);
    console.log(`  REST API : http://localhost:${PORT}/api/robot`);
    console.log(`  Socket.io: ws://localhost:${PORT}`);
    console.log(`  Kachaka  : ${process.env.KACHAKA_HOST || '127.0.0.1'}:${process.env.KACHAKA_PORT || 26400}`);
    console.log('\nPress Ctrl+C to stop.\n');
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
