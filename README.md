# rochak One Million Checkboxes

A premium, high-performance real-time checkbox grid built with Node.js, Express, Socket.IO, and Redis. This project features the **Rochak CSS** aesthetic and is optimized for massive concurrency.

## Author

**Rochak Tiwari**
- 🌐 [Website](https://rochaktiwari.online)
- 🐦 [X (Twitter)](https://x.com/Rochak__tiwari)
- 💼 [LinkedIn](https://www.linkedin.com/in/rochak-tiwari/)

## Features

- **Real-Time Synchronization**: Every checkbox toggle is broadcasted instantly to all connected users using Socket.IO.
- **Redis Bitmap State**: Stores 1,000,000 checkbox states efficiently in a Redis bitmap, using only ~125KB of memory.
- **High Performance**: Optimized for horizontal scaling using Redis Pub/Sub to coordinate updates across multiple server instances.
- **Custom Rate Limiting**: Built-in protection against spam and automated toggling using Redis-backed rate limiters.

## Run Locally

1. **Start Redis or Valkey**:
   ```bash
   docker compose up -d
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the Application**:
   ```bash
   npm run dev
   ```

4. **Access the Grid**:
   Open `http://localhost:8080` in your browser.

## Technical Details

### Checkbox Storage
Checkbox states are stored as a Redis bitmap in `checkboxes:bitmap:v1`. This allows for extremely fast `SETBIT` and `GETBIT` operations, making it possible to handle thousands of updates per second.

### Scaling & Pub/Sub
The app is designed to scale. When a user toggles a checkbox:
1. The update is persisted to the Redis bitmap.
2. The change is published to a Redis Pub/Sub channel.
3. All running server instances receive the message and broadcast it to their connected clients.

### UI Rendering
To maintain performance with 1,000,000 checkboxes, the frontend uses a windowed rendering approach. It loads and renders a manageable chunk of checkboxes (2,500 at a time) as the user scrolls, keeping the DOM light and responsive.

---
Built with ❤️ by [Rochak Tiwari](https://rochaktiwari.online)
