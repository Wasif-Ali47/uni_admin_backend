require("dotenv").config();

const cluster = require("cluster");
const os = require("os");
const numCPUs = os.cpus().length;

const express = require('express');
const userRouter = require('./routes/userRoutes');
const userAuthRouter = require('./routes/userAuthRoutes');
const imageRouter = require('./routes/imageRoutes');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const MongoDBConnect = require('./connection/connection');
const ensureBody = require('./middlewares/parseRequest');
const status = require("express-status-monitor");

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("Missing MONGODB_URI. Create a .env file (see .env.example).");
  process.exit(1);
}


console.log("cpu number", numCPUs)

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

} else {

  const app = express();
  const port = Number(process.env.PORT) || 8000;

  app.use("/uploads", express.static("uploads"));
  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(status());
  app.use(cookieParser());
  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(ensureBody);

  MongoDBConnect(mongoUri);
  // response for home screen ===============

  app.get("/", async (req, res) => {
    return res.send("hello! You're at home page");
  });

  app.use("/api/users", userRouter);
  app.use("/auth", userAuthRouter);
  app.use("/api/images", imageRouter);

  app.listen(port, () =>
    console.log(`Worker ${process.pid} started on port ${port}`)
  );
}
