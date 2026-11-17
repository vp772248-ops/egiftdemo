import prisma from "../db.server";

import { sendGiftEmailToGiftee, sendReminderEmail } from "../services/email.server";

export const loader = async ({ request }) => {

  const url = new URL(request.url);

  const secretKey = url.searchParams.get("key");

  // Security check

  if (secretKey !== "MohitCron2026") {

    return new Response("Unauthorized access", { status: 401 });

  }

  console.log("\n====================================");

  console.log(`⏰ GIFT DELIVERY CRON TRIGGERED: ${new Date().toISOString()}`);

  const now = new Date(); // Exact current time (e.g., 17-10-2026 10:58 AM)

  try {

    // 1. Pending Gifts Fetch Karein jinka exact delivery date aur time aa chuka hai

    const giftsToDeliver = await prisma.giftSubscription.findMany({

      where: {

        status: "SCHEDULED_FOR_FUTURE",

        deliveryDate: { lte: now } // Sirf unko pick karega jinka 10:57 AM ya usse pehle ka time tha

      }

    });

    console.log(`📦 Total ${giftsToDeliver.length} gifts ready to deliver.`);

    for (const gift of giftsToDeliver) {

      try {

        console.log(`✉️ Sending Gift Code Email to: ${gift.gifteeEmail}`);

        await sendGiftEmailToGiftee(

          gift.gifteeEmail,

          gift.gifteeName || "Awesome Reader",

          gift.giftCode,

          gift.giftMessage || ""

        );

        await prisma.giftSubscription.update({

          where: { id: gift.id },

          data: { status: "EMAIL_SENT_PENDING_QUESTIONNAIRE" }

        });

        console.log(`✅ Mail Sent & DB Status updated to EMAIL_SENT_PENDING_QUESTIONNAIRE for ${gift.giftCode}`);

      } catch (err) {

        console.error(`❌ Failed to send gift email for ${gift.giftCode}:`, err);

      }

    }

    // 2. Unredeemed Gifts ke Reminders (3 din baad)

    const pendingGifts = await prisma.giftSubscription.findMany({

      where: { status: "EMAIL_SENT_PENDING_QUESTIONNAIRE" }

    });

    for (const pending of pendingGifts) {

      if (!pending.deliveryDate) continue;

      const timeDiff = now.getTime() - new Date(pending.deliveryDate).getTime();

      const daysPassed = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      const reminderCount = pending.reminderCount || 0;

      // if (daysPassed >= 3 && reminderCount === 0) {

      //   try {

      //     await sendReminderEmail(pending.gifteeEmail, pending.gifteeName || "Awesome Reader", pending.giftCode);

      //     await prisma.giftSubscription.update({

      //       where: { id: pending.id },

      //       data: { reminderCount: 1 }

      //     });

      //     console.log(`✅ Reminder 1 sent to ${pending.gifteeEmail}`);

      //   } catch (e) {

      //     console.error(`❌ Reminder 1 error:`, e);

      //   }

      // }
      if (daysPassed >= 3 && reminderCount === 0) {

        try {

          await sendReminderEmail(pending.gifteeEmail, pending.gifteeName || "Awesome Reader", pending.giftCode);

          await prisma.giftSubscription.update({

            where: { id: pending.id },

            data: { reminderCount: 1 } // Update count to 1

          });

          console.log(`✅ Reminder 1 (3 days) sent to ${pending.gifteeEmail}`);

        } catch (e) {

          console.error(`❌ Reminder 1 error:`, e);

        }

      }

      // 🛑 2nd Reminder (Agar 5 din ya usse zyada ho gaye aur pehla reminder ja chuka hai)

      else if (daysPassed >= 5 && reminderCount === 1) {

        try {

          await sendReminderEmail(pending.gifteeEmail, pending.gifteeName || "Awesome Reader", pending.giftCode);

          await prisma.giftSubscription.update({

            where: { id: pending.id },

            data: { reminderCount: 2 } // Update count to 2

          });

          console.log(`✅ Reminder 2 (5 days) sent to ${pending.gifteeEmail}`);

        } catch (e) {

          console.error(`❌ Reminder 2 error:`, e);

        }

      }


    }

    return Response.json({ success: true, deliveredCount: giftsToDeliver.length });

  } catch (error) {

    console.error("❌ GIFT CRON FATAL ERROR:", error);

    return Response.json({ error: "Server Error" }, { status: 500 });

  }

};
 