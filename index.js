require("dotenv").config();

const express = require("express");
const cors = require("cors");
const MongoDBConnect = require("./connection/connection");
const ensureBody = require("./middlewares/parseRequest");
const promptRouter = require("./routes/promptRoutes");
const userAuthRouter = require("./routes/userAuthRoutes");

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("Missing MONGODB_URI. Create a .env file (see .env.example).");
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT) || 8000;

app.use("/uploads", express.static("uploads"));
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(ensureBody);

app.get("/", (req, res) => {
  res.json({
    service: "AI prompt generator",
    endpoints: {
      auth: {
        signup: "POST /auth/signup",
        verifyOtp: "POST /auth/verify-otp",
        login: "POST /auth/login",
        googleLogin: "POST /auth/google-login",
        profileGet: "GET /auth/profile/:id",
        profilePut: "PUT /auth/profile/:id",
        forgotPassword: "POST /auth/forgot-password",
        resetPassword: "POST /auth/reset-password",
      },
      generate: "POST /api/prompts/generate",
      list: "GET /api/prompts",
      getOne: "GET /api/prompts/:id",
    },
  });
});

app.use("/auth", userAuthRouter);
app.use("/api/prompts", promptRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

MongoDBConnect(mongoUri)
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  })
  .catch(() => process.exit(1));
