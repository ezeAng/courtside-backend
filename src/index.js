import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/users.route.js";
import matchRoutes from "./routes/matches.routes.js";
import leaderboardRoutes from "./routes/leaderboard.route.js";
import statsRoutes from "./routes/stats.route.js";
import profileRoutes from "./routes/profile.route.js";
import feedbackRoutes from "./routes/feedback.route.js";
import connectionsRoutes from "./routes/connections.route.js";
import sessionsRoutes from "./routes/sessions.route.js";

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
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/leaderboards", leaderboardRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", feedbackRoutes);
app.use("/api/connections", connectionsRoutes);
app.use("/api", sessionsRoutes);


app.listen(process.env.PORT || 4000, "0.0.0.0", () => {
  console.log("Server running on LAN");
});
