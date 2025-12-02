import express from "express";
import cors from "cors";
import helmet from "helmet";
import { supabase } from "./config/supabase.js";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/users.route.js";
import matchRoutes from "./routes/matches.route.js";

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


const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Courtside API running on port ${port}`));
