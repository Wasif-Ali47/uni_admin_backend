const path = require("path");
// Load `.env` next to `package.json` even if the process cwd is elsewhere (e.g. systemd/nodemon from `/root`).
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const secretKey = process.env.JWT_SECRET;
if (!secretKey) {
  throw new Error(
    "JWT_SECRET is required. Copy .env.example to .env in this project folder and set JWT_SECRET (do not delete .env.example)."
  );
}

module.exports = secretKey;
