require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const profileRoutes = require("./routes/profile");
const reviewRoutes = require("./routes/reviewRoutes");
const staffRoutes = require("./routes/staffRoutes");
const indexRoutes = require("./routes/indexRoutes");
const staffProcessRoutes = require("./routes/staffProcessRoutes");
const kitchenRoutes = require("./routes/KitchenRoutes");

require("./passportConfig");

const app = express();

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride("_method"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallbacksecret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(flash());
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

app.use(passport.initialize());
app.use(passport.session());

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads/proofs", express.static(path.join(__dirname, "uploads/proofs")));

app.use("/staff", staffProcessRoutes);
app.use("/", profileRoutes);
app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.use("/", reviewRoutes);
app.use("/admin/staff", staffRoutes);
app.use("/", indexRoutes);
app.use("/kitchen", kitchenRoutes);
app.use("/", authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Environment:", process.env.NODE_ENV);
});
