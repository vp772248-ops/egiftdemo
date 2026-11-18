import { Resend } from "resend";
import prisma from "../db.server";
 
const resend = new Resend("re_KhTM1nVN_9x5wU8k7GdzZXQEniDt45Pv8");
 
async function getEmailSettings() {
  try {
    let settings = await prisma.emailSettings.findUnique({ where: { id: "default" } });
    if (!settings) throw new Error("Settings not found");
    return settings;
  } catch (error) {
    return {
      storeDomain: "testteamplatli.myshopify.com",
      senderEmail: "Willoughby Book Club <onboarding@resend.dev>",
      giftEmailSubject: "A book subscription gift for you!",
      giftEmailHtml: `<p>Hi {{name}},</p><p>Code: <strong>{{code}}</strong></p><a href="{{link}}">REDEEM</a>`,
      renewalEmailSubject: "Your subscription has been renewed! 🎉",
      renewalEmailHtml: `<p>Welcome back, {{name}}!</p>`,
      reminderEmailSubject: "Don't forget to redeem your book gift! 🎁",
      reminderEmailHtml: `<p>Reminder! Code: {{code}}</p>`,
      expiryEmailSubject: "Your book subscription has ended 📚",
      expiryEmailHtml: `<p>Hi {{name}}, your plan ended.</p>`,
      personalEmailSubject: "Set up your Reading Profile! 📚",
      personalEmailHtml: `<p>Welcome {{name}}, code: {{code}}</p>`,
      gifterEmailSubject: "Your gift subscription is confirmed!",
      gifterEmailHtml: `<p>Hi {{name}}, gift scheduled.</p>`
    };
  }
}
 
export async function sendEmailToGifter(gifterEmail, gifterName, gifteeName, deliveryDate) {
  const settings = await getEmailSettings();
  let html = settings.gifterEmailHtml.replace(/{{name}}/g, gifterName)
                                     .replace(/{{gifteeName}}/g, gifteeName)
                                     .replace(/{{deliveryDate}}/g, new Date(deliveryDate).toDateString());
  try {
    return await resend.emails.send({
      from: settings.senderEmail,
      to: [gifterEmail],
      subject: settings.gifterEmailSubject,
      html: html,
    });
  } catch (error) { throw error; }
}
 
export async function sendGiftEmailToGiftee(email, name, code, message) {
  const settings = await getEmailSettings();
  const link = `https://${settings.storeDomain}/pages/redeem-gift?code=${code}`;
  let html = settings.giftEmailHtml.replace(/{{name}}/g, name)
                                   .replace(/{{message}}/g, message || "")
                                   .replace(/{{code}}/g, code)
                                   .replace(/{{link}}/g, link);
  try {
    return await resend.emails.send({
      from: settings.senderEmail,
      to: [email],
      subject: settings.giftEmailSubject,
      html: html,
    });
  } catch (error) { throw error; }
}
 
export async function sendPersonalOnboardingEmail(buyerEmail, buyerName, accessCode) {
  const settings = await getEmailSettings();
  const link = `https://${settings.storeDomain}/pages/customer-portal?code=${accessCode}`;
  let html = settings.personalEmailHtml.replace(/{{name}}/g, buyerName)
                                       .replace(/{{code}}/g, accessCode)
                                       .replace(/{{link}}/g, link);
  try {
    return await resend.emails.send({
      from: settings.senderEmail,
      to: [buyerEmail],
      subject: settings.personalEmailSubject,
      html: html,
    });
  } catch (error) { throw error; }
}
 
export async function sendExpiryEmail(email, name, planName) {
  const settings = await getEmailSettings();
  const link = `https://${settings.storeDomain}/collections/all`;
  let html = settings.expiryEmailHtml.replace(/{{name}}/g, name)
                                     .replace(/{{planName}}/g, planName)
                                     .replace(/{{link}}/g, link);
  try {
    return await resend.emails.send({
      from: settings.senderEmail,
      to: [email],
      subject: settings.expiryEmailSubject,
      html: html,
    });
  } catch (error) { throw error; }
}
 
export async function sendReminderEmail(email, name, code) {
  const settings = await getEmailSettings();
  const link = `https://${settings.storeDomain}/pages/redeem-gift?code=${code}`;
  let html = settings.reminderEmailHtml.replace(/{{name}}/g, name)
                                       .replace(/{{code}}/g, code)
                                       .replace(/{{link}}/g, link);
  try {
    return await resend.emails.send({
      from: settings.senderEmail,
      to: [email],
      subject: settings.reminderEmailSubject,
      html: html,
    });
  } catch (error) { throw error; }
}
export async function sendRenewalSuccessEmail(email, name, planName, expiryDate) {
  const settings = await getEmailSettings();
  let html = settings.renewalEmailHtml.replace(/{{name}}/g, name)
                                      .replace(/{{planName}}/g, planName)
                                      .replace(/{{expiryDate}}/g, expiryDate);
  try {
    return await resend.emails.send({
      from: settings.senderEmail,
      to: [email],
      subject: settings.renewalEmailSubject,
      html: html,
    });
  } catch (error) { throw error; }
}