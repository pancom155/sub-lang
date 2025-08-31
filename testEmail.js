require("dotenv").config();
const nodemailer = require("nodemailer");

(async () => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
      logger: true,
      debug: true,
    });

    const info = await transporter.sendMail({
      from: `"ZeroDegree Test" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER, // send to yourself first
      subject: "Test Email from Node",
      text: "Hello! This is just a test email to check Gmail SMTP.",
    });

    console.log("✅ Test email sent:", info.response);
  } catch (err) {
    console.error("❌ Failed to send:", err);
  }
})();
