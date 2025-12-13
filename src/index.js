import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/users.route.js";
import matchRoutes from "./routes/matches.routes.js";
import leaderboardRoutes from "./routes/leaderboard.route.js";
import statsRoutes from "./routes/stats.route.js";
import profileRoutes from "./routes/profile.route.js";
import matchmakingRoutes from "./routes/matchmaking.route.js";

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

// Health check route
app.get("/", (req, res) => {
  res.send({ message: "Courtside API is running" });
});


app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/matchmaking", matchmakingRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/profile", profileRoutes);


app.listen(process.env.PORT || 4000, "0.0.0.0", () => {
  console.log("Server running on LAN");
});
