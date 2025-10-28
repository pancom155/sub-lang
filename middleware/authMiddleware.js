const publicPaths = [
  "/login",
  "/register",
  "/verify-otp",
  "/resend-otp",
  "/forgot-password/request",
  "/forgot-password/verify",
  "/forgot-password/reset"
];

const authMiddleware = (req, res, next) => {
  if (publicPaths.some(path => req.originalUrl.startsWith(path))) {
    return next();
  }
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
};

const preventBackForward = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (publicPaths.some(path => req.originalUrl.startsWith(path)) || req.originalUrl === "/") {
    return next();
  }

  if (!req.session.user && req.headers.referer) {
    req.session?.destroy(() => {
      res.clearCookie("connect.sid");
      return res.redirect("/login");
    });
    return;
  }

  next();
};

const isStaff = (req, res, next) => {
  if (req.session.user && req.session.user.role === "staff") return next();
  return res.redirect("/login");
};

const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === "admin") return next();
  return res.redirect("/login");
};

module.exports = {
  authMiddleware,
  preventBackForward,
  isStaff,
  isAdmin
};