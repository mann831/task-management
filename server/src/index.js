import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import taskRoutes from "./routes/tasks.js";
import { authenticate, requireRole } from "./middleware/auth.js";
import User from "./models/User.js";

const requiredEnvironment = ["MONGODB_URI", "JWT_SECRET", "CLIENT_URL"];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
if (missingEnvironment.length) {
  throw new Error(`Missing required environment variables: ${missingEnvironment.join(", ")}`);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, methods: ["GET", "POST"] }
});

app.set("io", io);
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({ limit: "20kb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.get("/api/employees", authenticate, requireRole("admin"), async (_req, res, next) => {
  try {
    const employees = await User.find({ role: "employee" }).select("name email").sort({ name: 1 });
    res.json({ employees });
  } catch (error) {
    next(error);
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select("_id");
    if (!user) return next(new Error("User not found"));
    socket.userId = user.id;
    next();
  } catch (error) {
    next(error);
  }
});
io.on("connection", (socket) => {
  socket.join(`user:${socket.userId}`);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Something went wrong. Please try again." });
});

const port = Number(process.env.PORT) || 4000;
await mongoose.connect(process.env.MONGODB_URI);
server.listen(port, () => console.log(`Task API listening on http://localhost:${port}`));
