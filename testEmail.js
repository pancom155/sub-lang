require("dotenv").config();
const { sendEmail, otpTemplate } = require("./utils/emailService");

(async () => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000);
    const html = otpTemplate(otp, "register");
    await sendEmail("aguilarcyruzjaeg@gmail.com", "Test OTP Email", html);
    console.log("✅ Test email sent successfully!");
  } catch (err) {
    console.error("❌ Failed to send email:", err);
  }
})();