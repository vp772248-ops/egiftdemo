import nodemailer from 'nodemailer';
import prisma from "../db.server";

// 🟢 Yahan Apna Gmail aur App Password daalein
// const SENDER_EMAIL = "vamjamohit.vhits@gmail.com"; 
// const SENDER_APP_PASSWORD = "zyqt zytp clls nrgk"; 

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,      // Render mathi email lese
    pass: process.env.SMTP_PASSWORD    // Render mathi password lese
  }
});
 
// Settings DB se lana
async function getEmailSettings() {
  try {
    let settings = await prisma.emailSettings.findUnique({ where: { id: "default" } });
    if (!settings) throw new Error("Settings not found");
    return settings;
  } catch (error) {
    return {
      storeDomain: "testteamplatli.myshopify.com",
      senderEmail: `"Willoughby Book Club" <${SENDER_EMAIL}>`, // Yahan automatically Sender Email set ho jayega
      giftEmailSubject: "A book subscription gift for you!",
      giftEmailHtml: `<p>Hi {{name}},</p><p>Code: <strong>{{code}}</strong></p><a href="{{link}}">REDEEM</a>`,
      renewalEmailSubject: "Your subscription has been renewed! 🔄",
      renewalEmailHtml: `<p>Welcome back, {{name}}!</p>`,
      reminderEmailSubject: "Don't forget to redeem your book gift! ⏳",
      reminderEmailHtml: `<p>Reminder! Code: {{code}}</p>`,
      expiryEmailSubject: "Your book subscription has ended 🔴",
      expiryEmailHtml: `<p>Hi {{name}}, your plan ended.</p>`,
      personalEmailSubject: "Set up your Reading Profile! 📚",
      personalEmailHtml: `<p>Welcome {{name}}, code: {{code}}</p>`,
      gifterEmailSubject: "Your gift subscription is confirmed!",
      gifterEmailHtml: `<p>Hi {{name}}, gift scheduled.</p>`
    };
  }
}
 
// 1. Gifter ko Email bhejna
export async function sendEmailToGifter(gifterEmail, gifterName, gifteeName, deliveryDate) {
  const settings = await getEmailSettings();
  let html = settings.gifterEmailHtml.replace(/{{name}}/g, gifterName)
                                     .replace(/{{gifteeName}}/g, gifteeName)
                                     .replace(/{{deliveryDate}}/g, new Date(deliveryDate).toDateString());
  try {
    const info = await transporter.sendMail({
      from: settings.senderEmail, 
      to: gifterEmail,  // Yahan Receiver ID (Gifter) pass ho rahi hai
      subject: settings.gifterEmailSubject,
      html: html,
    });
    console.log("✅ Gifter Email Sent:", info.messageId);
    return info;
  } catch (error) { 
    console.error("❌ Gifter Email Error:", error);
    throw error; 
  }
}
 
// 2. Giftee ko Email bhejna
export async function sendGiftEmailToGiftee(email, name, code, message) {
  const settings = await getEmailSettings();
  const link = `https://${settings.storeDomain}/pages/redeem-gift?code=${code}`;
  let html = settings.giftEmailHtml.replace(/{{name}}/g, name)
                                   .replace(/{{message}}/g, message || "")
                                   .replace(/{{code}}/g, code)
                                   .replace(/{{link}}/g, link);
  try {
    const info = await transporter.sendMail({
      from: settings.senderEmail,
      to: email, // Yahan Receiver ID (Giftee) pass ho rahi hai
      subject: settings.giftEmailSubject,
      html: html,
    });
    console.log("✅ Gift Email Sent to Receiver:", info.messageId);
    return info;
  } catch (error) { 
    console.error("❌ Gift Email Error:", error);
    throw error; 
  }
}
 
// 3. Personal Subscription Onboarding Email
export async function sendPersonalOnboardingEmail(buyerEmail, buyerName, accessCode) {
  const settings = await getEmailSettings();
  const link = `https://${settings.storeDomain}/pages/customer-portal?code=${accessCode}`;
  let html = settings.personalEmailHtml.replace(/{{name}}/g, buyerName)
                                       .replace(/{{code}}/g, accessCode)
                                       .replace(/{{link}}/g, link);
  try {
    const info = await transporter.sendMail({
      from: settings.senderEmail,
      to: buyerEmail, // Yahan Receiver ID pass ho rahi hai
      subject: settings.personalEmailSubject,
      html: html,
    });
    console.log("✅ Personal Email Sent:", info.messageId);
    return info;
  } catch (error) { 
    console.error("❌ Personal Email Error:", error);
    throw error; 
  }
}
 
// 4. Expiry Email
export async function sendExpiryEmail(email, name, planName) {
  const settings = await getEmailSettings();
  const link = `https://${settings.storeDomain}/collections/all`;
  let html = settings.expiryEmailHtml.replace(/{{name}}/g, name)
                                     .replace(/{{planName}}/g, planName)
                                     .replace(/{{link}}/g, link);
  try {
    const info = await transporter.sendMail({
      from: settings.senderEmail,
      to: email,
      subject: settings.expiryEmailSubject,
      html: html,
    });
    console.log("✅ Expiry Email Sent:", info.messageId);
    return info;
  } catch (error) { 
    console.error("❌ Expiry Email Error:", error);
    throw error; 
  }
}
 
// 5. Reminder Email
export async function sendReminderEmail(email, name, code) {
  const settings = await getEmailSettings();
  const link = `https://${settings.storeDomain}/pages/redeem-gift?code=${code}`;
  let html = settings.reminderEmailHtml.replace(/{{name}}/g, name)
                                       .replace(/{{code}}/g, code)
                                       .replace(/{{link}}/g, link);
  try {
    const info = await transporter.sendMail({
      from: settings.senderEmail,
      to: email, 
      subject: settings.reminderEmailSubject,
      html: html,
    });
    console.log("✅ Reminder Email Sent:", info.messageId);
    return info;
  } catch (error) { 
    console.error("❌ Reminder Email Error:", error);
    throw error; 
  }
}

// 6. Renewal Success Email
export async function sendRenewalSuccessEmail(email, name, planName, expiryDate) {
  const settings = await getEmailSettings();
  let html = settings.renewalEmailHtml.replace(/{{name}}/g, name)
                                      .replace(/{{planName}}/g, planName)
                                      .replace(/{{expiryDate}}/g, expiryDate);
  try {
    const info = await transporter.sendMail({
      from: settings.senderEmail,
      to: email, 
      subject: settings.renewalEmailSubject,
      html: html,
    });
    console.log("✅ Renewal Email Sent:", info.messageId);
    return info;
  } catch (error) { 
    console.error("❌ Renewal Email Error:", error);
    throw error; 
  }
}