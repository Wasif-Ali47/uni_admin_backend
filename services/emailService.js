const nodemailer = require("nodemailer");

async function sendOTPEmail(email, otp) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    console.warn(
      `[ai-prompt-generator] OTP not emailed (set EMAIL_USER + EMAIL_PASS in .env). OTP for ${email}: ${otp}`
    );
    return;
  }
  // jj

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: user,
    to: email,
    subject: "Email Verification OTP",
    text: `Your OTP is: ${otp}`,
  });
}

async function sendEmail(email, subject, text) {
  if (!email || !subject || !text) {
    console.error("sendEmail: missing email, subject, or text");
    return;
  }

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    console.warn(
      `[ai-prompt-generator] Email skipped (set EMAIL_USER + EMAIL_PASS). To: ${email} | ${subject} | ${text}`
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: user,
    to: email,
    subject,
    text,
  });
}

module.exports = { sendOTPEmail, sendEmail };
