import express from "express";
import cors from "cors";
import helmet from "helmet";
import { supabase } from "./config/supabase.js";

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

// Health check route
app.get("/", (req, res) => {
  res.send({ message: "Courtside API is running" });
});

// Example: Load routes here
// app.use("/api/auth", authRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Courtside API running on port ${port}`));
