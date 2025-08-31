const nodemailer = require('nodemailer');

if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
  throw new Error('GMAIL_USER and GMAIL_PASS must be set in .env');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

const otpTemplate = (otp, type = 'register') => {
  const title = type === 'register' ? 'Verify Your Zero Degree Account' : 'Reset Your Password';
  const message = type === 'register'
    ? 'Use the following OTP to complete your registration:'
    : 'Use the following OTP to reset your password:';

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; border: 1px solid #ddd;">
        <h2 style="text-align: center; color: #1d3c5a;">Zero Degree Café</h2>
        <p>${message}</p>
        <h1 style="text-align: center; letter-spacing: 8px; color: #0a0b0bff;">${otp}</h1>
        <p style="text-align: center; font-size: 0.9rem; color: #666;">
          This OTP is valid for 5 minutes. Do not share it with anyone.
        </p>
        <p>Thank you,<br>Zero Degree Café Team</p>
      </div>
    </div>
  `;
};

const sendEmail = async (to, subject, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Zero Degree Café" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`Email sent to ${to}: ${info.response}`);
    return info;
  } catch (error) {
    console.error('Email send failed:', error);
    throw error;
  }
};

module.exports = { sendEmail, otpTemplate };
