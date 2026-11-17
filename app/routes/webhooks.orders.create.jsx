import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import crypto from "crypto";
import { sendEmailToGifter, sendPersonalOnboardingEmail, sendRenewalSuccessEmail } from "../services/email.server";

async function processOrderInBackground(payload, shop, initialAdmin) {
  try {
    let isDraftThemeOrder = false;
    if (payload.line_items && payload.line_items.length > 0) {
      for (const item of payload.line_items) {
        const properties = item.properties || [];
        for (const p of properties) {
          if (p.name && p.name.trim().toLowerCase() === "_is_draft_theme" && 
              p.value && p.value.toString().trim().toLowerCase() === "true") {
            isDraftThemeOrder = true;
            break;
          }
        }
        if (isDraftThemeOrder) break;
      }
    }

    if (!isDraftThemeOrder) {
      console.log(`🚫 [Order Create Webhook] LIVE THEME ORDER DETECTED (Order ID: ${payload.id}). Skipping all app logic.`);
      return; 
    } else {
      console.log(`✅ [Order Create Webhook] DRAFT THEME ORDER DETECTED (Order ID: ${payload.id}). Processing app logic...`);
    }

    const rawOrderId = payload.id?.toString();
    const orderGid = `gid://shopify/Order/${rawOrderId}`;
    const gifterEmail = payload.email || payload.contact_email;
    const gifterName = payload.customer?.first_name || "Valued Customer";
    const customerId = payload.customer?.id?.toString() || null;
    const baseAddress = payload.shipping_address || payload.billing_address;

    let admin = initialAdmin;
    if (!admin) { 
      const unauth = await unauthenticated.admin(shop); 
      admin = unauth.admin; 
    }
    
    let cartNote = "";
    if (admin) {
      try {
        console.log(`🔄 [Webhook] Fetching existing note for Order: ${rawOrderId}`);
        const orderQuery = await admin.graphql(`query { order(id: "${orderGid}") { note } }`);
        const oData = await orderQuery.json();
        cartNote = oData.data?.order?.note || "";
        console.log(`✅ Old Note Fetched successfully:`, cartNote);
      } catch (e) {
        console.error("❌ Failed to fetch existing note:", e);
      }
    }

    // 🟢 MAIN PRODUCT DHUNDNE KE LIYE (Add-ons bypass karna)
    let mainProductTitle = "";
    for (const item of payload.line_items) {
       const properties = item.properties || [];
       let isHiddenItem = false;
       properties.forEach(p => {
          if (p.name && p.name.trim().toLowerCase() === "_hidden" && p.value && p.value.toString().trim().toLowerCase() === "true") {
             isHiddenItem = true;
          }
       });
       if (!isHiddenItem) {
          mainProductTitle = item.title || "";
          break; // Pehla non-hidden item milte hi ruk jao
       }
    }

    for (const item of payload.line_items) {
      const properties = item.properties || [];
      let isGift = false;
      let isPersonal = false;
      let isGiftTin = false; 
      let isGiftProduct = false;
      let isHidden = false;
      let gifteeEmail = "";
      let gifteeName = "";
      let deliveryDateStr = "";
      let giftMessage = "";
      let renewedCode = "";

      properties.forEach((p) => {
        const pName = p.name ? p.name.trim() : "";
        const pVal = p.value ? p.value.toString().trim() : ""; 
        const pNameLower = pName.toLowerCase();
        const pValLower = pVal.toLowerCase();

        if (pNameLower === "_hidden" && (pValLower === "true" || pValLower === "1")) {
           isHidden = true; return;
        }

        if (pNameLower.includes("product type") && pValLower.includes("tin")) {
           isGiftTin = true;
        }
        else if (pNameLower.includes("product type") && pValLower.includes("gift product")) {
           isGiftProduct = true;
        }
        else if (pNameLower.includes("gift or personal") && pValLower.includes("gift")) isGift = true;
        else if (pNameLower.includes("gift or personal") && pValLower.includes("personal")) isPersonal = true;
        else if (pNameLower.includes("their email")) gifteeEmail = pVal; 
        else if (pNameLower.includes("their name")) gifteeName = pVal;
        else if (pNameLower.includes("email delivery date")) deliveryDateStr = pVal;
        else if (pNameLower.includes("gift message")) giftMessage = pVal;
        else if (pNameLower.includes("renewed code") || pNameLower.includes("_renewedcode")) renewedCode = pVal;
      });

      if (isHidden && !isGift && !isPersonal && !isGiftTin && !isGiftProduct) continue;
      
      const finalTitleToUse = mainProductTitle ? mainProductTitle : item.title;

      if (renewedCode) {
        console.log(`\n====================================`);
        console.log(`🔄 [RENEWAL DETECTED]`);
        console.log(`🛍️ Order ID: ${rawOrderId}`);
        console.log(`🔑 Renewed Code: ${renewedCode}`);
        console.log(`====================================\n`);
        
        try {
          const existingSub = await prisma.giftSubscription.findUnique({ where: { giftCode: renewedCode } });
          if (existingSub) {
            await prisma.giftSubscription.update({
              where: { giftCode: renewedCode },
              data: { 
                status: "AWAITING_FULFILLMENT", 
                orderId: rawOrderId, 
                variantId: item.variant_id?.toString() || "", 
                renewalCount: { increment: 1 }, 
                expiresAt: null
              }
            });
 
            if (admin) {
              let oldTastes = "📝 PREVIOUS READING TASTES:\n";
              if (existingSub.questionnaire && Object.keys(existingSub.questionnaire).length > 0) {
                for (const [key, val] of Object.entries(existingSub.questionnaire)) {
                  const valStr = Array.isArray(val) ? val.join(", ") : (val || "N/A");
                  oldTastes += `• ${key}:\n  - ${valStr}\n`;
                }
              } else { 
                oldTastes += "None provided."; 
              }

              const isPersonalRenewal = renewedCode.toUpperCase().startsWith("MY-");
              const renewalTitle = isPersonalRenewal ? "PERSONAL SUBSCRIPTION RENEWAL" : "GIFT SUBSCRIPTION RENEWAL";
              
              const isAlreadyFulfilled = (payload.fulfillment_status === 'fulfilled' || payload.display_fulfillment_status === 'FULFILLED');
              const fulfillMsg = isAlreadyFulfilled ? "✅ Order is Fulfilled. Timer has started." : "⏳ Timer will start once you Fulfill this order.";

              const updateText = `🟢 ${renewalTitle}\nOld Code Renewed: ${renewedCode}\nPlan: ${finalTitleToUse}\n${fulfillMsg}\n\n${oldTastes}`;
              
              console.log(`📝 Appending Renewal Info & Tastes to order note...`);
              const finalNoteText = cartNote ? `${cartNote}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${updateText}` : updateText;

              await admin.graphql(
                `mutation updateOrderAndTags($input: OrderInput!, $orderId: ID!, $tags: [String!]!) {
                  orderUpdate(input: $input) { userErrors { message } }
                  tagsAdd(id: $orderId, tags: $tags) { userErrors { message } }
                }`,
                { variables: { orderId: orderGid, tags: ["Renewal", `Renewed: ${renewedCode}`], input: { id: orderGid, note: finalNoteText } } }
              );
            }
            await sendRenewalSuccessEmail(existingSub.gifteeEmail, existingSub.gifteeName || "Awesome Reader", finalTitleToUse, "Once your order is shipped").catch((e) => { });
            console.log(`✅ Renewal DB, Email & Note Append Done for: ${renewedCode}`);
          }
        } catch (err) {
          console.error("❌ Renewal Processing Error:", err);
        }
      }
 
      else if (isGiftTin || isGift || isGiftProduct) {
        let codePrefix = "WBC-";
        if (isGiftTin) codePrefix = "WBC-GiftPer-";
        else if (isGiftProduct) codePrefix = "WBC-GiftProduc-";

        const giftCode = codePrefix + crypto.randomBytes(3).toString("hex").toUpperCase();
        
        console.log(`\n====================================`);
        console.log(`🎁 [${isGiftTin ? 'GIFT TIN (PERSONAL GIFT)' : (isGiftProduct ? 'GIFT PRODUCT' : 'REGULAR GIFT')} DETECTED]`);
        console.log(`🛍️ Order ID: ${rawOrderId}`);
        console.log(`🔑 Generated Code: ${giftCode}`);
        console.log(`====================================\n`);

        let parsedDeliveryDate = new Date();
        if (deliveryDateStr && !isNaN(Date.parse(deliveryDateStr))) {
          const userSelectedDate = new Date(deliveryDateStr);
          parsedDeliveryDate.setFullYear(userSelectedDate.getFullYear(), userSelectedDate.getMonth(), userSelectedDate.getDate());
        }
 
        try {
          // GiftTin ke liye AWAITING_TASTES hoga
          const dbStatus = isGiftTin ? "AWAITING_TASTES" : "SCHEDULED_FOR_FUTURE";

          await prisma.giftSubscription.create({
            data: {
              orderId: rawOrderId, variantId: item.variant_id?.toString() || "", giftCode,
              gifterEmail: gifterEmail || "", gifterName: gifterName || "",
              gifteeEmail: gifteeEmail || gifterEmail, gifteeName: gifteeName || "Gift Recipient",
              giftMessage: giftMessage || "", deliveryDate: parsedDeliveryDate, status: dbStatus,
              customerId: customerId
            },
          });
 
          // 🟢 GIFT TIN WALI CONDITION MEIN PERSONAL MAIL
          if (isGiftTin) {
            await sendPersonalOnboardingEmail(gifteeEmail || gifterEmail, gifteeName || gifterName, giftCode).catch((e) => {});
            console.log(`✅ Personal Onboarding Email sent for Gift Tin: ${giftCode}`);
          } else {
            await sendEmailToGifter(gifterEmail, gifterName, gifteeName, deliveryDateStr).catch((e) => {});
          }
 
          if (admin) {
            let updateText = "";
            let tagsToAdd = [];

            // 🟢 NAYA ORDER NOTE FORMAT
            if (isGiftTin) {
              updateText = `🟢 PERSONAL Giftpersonal SUBSCRIPTION\nWaiting for preferences. Code: ${giftCode}`;
              tagsToAdd = ["Gift Tin", "Personal Subscription", "Awaiting Tastes"];
            } else if (isGiftProduct) {
              updateText = `⏳ AWAITING REDEMPTION (NO EXPIRY)\nPlan: ${finalTitleToUse}\nGift Email Date: ${deliveryDateStr || "Today"}\nProduct Type: Gift Product`;
              tagsToAdd = ["Awaiting Redemption", "Gift Product"];
            } else {
              updateText = `⏳ AWAITING REDEMPTION\nPlan: ${finalTitleToUse}\nGift Email Date: ${deliveryDateStr || "Today"}\nProduct Type: Standard Gift`;
              tagsToAdd = ["Awaiting Redemption", "Gift"];
            }

            const finalNoteText = cartNote ? `${cartNote}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${updateText}` : updateText;

            const noteMutation = await admin.graphql(
              `mutation updateOrderNoteTags($input: OrderInput!, $orderId: ID!, $tags: [String!]!) {
                orderUpdate(input: $input) { userErrors { message field } }
                tagsAdd(id: $orderId, tags: $tags) { userErrors { message field } }
              }`,
              { variables: { orderId: orderGid, tags: tagsToAdd, input: { id: orderGid, note: finalNoteText } } }
            );

            // 🟢 GiftTin (Personal) ka address customer enter kar chuka hota hai, isiliye usko 'DO NOT SHIP' se overwrite nahi karna hai
            if (!isGiftTin && baseAddress) {
              const addressInput = {
                id: orderGid,
                shippingAddress: {
                  firstName: "DO NOT SHIP", lastName: "(AWAITING REDEMPTION)", address1: "Address Pending Recipient Entry",
                  city: baseAddress.city || "Hold Order", province: baseAddress.province || "", zip: baseAddress.zip || "", countryCode: baseAddress.country_code || ""
                }
              };
              await admin.graphql(`mutation updateOrderAddress($input: OrderInput!) { orderUpdate(input: $input) { userErrors { message } } }`, { variables: { input: addressInput } });
            }
          }
          console.log(`✅ Database & Note processed for: ${giftCode}`);
        } catch (err) {
          console.error("❌ Database Error for Gift:", err);
        }
      }
 
      else if (isPersonal) {
        const personalCode = "MY-" + crypto.randomBytes(3).toString("hex").toUpperCase();
        
        console.log(`\n====================================`);
        console.log(`👤 [PERSONAL SUBSCRIPTION DETECTED]`);
        console.log(`🛍️ Order ID: ${rawOrderId}`);
        console.log(`🔑 Generated Code: ${personalCode}`);
        console.log(`====================================\n`);

        try {
          await prisma.giftSubscription.create({
            data: {
              orderId: rawOrderId, variantId: item.variant_id?.toString() || "", giftCode: personalCode,
              gifterEmail: gifterEmail || "", gifterName: gifterName || "",
              gifteeEmail: gifterEmail || "", gifteeName: gifterName || "", status: "AWAITING_TASTES", 
              deliveryDate: new Date(), customerId: customerId
            },
          });
 
          await sendPersonalOnboardingEmail(gifterEmail, gifterName, personalCode).catch((e) => {});
 
          if (admin) {
            const updateText = `🟢 PERSONAL SUBSCRIPTION\nWaiting for preferences. Code: ${personalCode}`;
            const finalNoteText = cartNote ? `${cartNote}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${updateText}` : updateText;

            const noteMutation = await admin.graphql(
              `mutation updateOrderPersonal($input: OrderInput!, $orderId: ID!, $tags: [String!]!) {
                orderUpdate(input: $input) { userErrors { message } }
                tagsAdd(id: $orderId, tags: $tags) { userErrors { message } }
              }`,
              { variables: { orderId: orderGid, tags: ["Personal Subscription", "Awaiting Tastes"], input: { id: orderGid, note: finalNoteText } } }
            );
          }
          console.log(`✅ Personal DB & Note applied for: ${personalCode}`);
        } catch (err) {
          console.error("❌ Database Error for Personal:", err);
        }
      }
    }
  } catch (err) {
    console.error("❌ Critical Background Error:", err);
  }
}
 
export const action = async ({ request }) => {
  let payload, topic, shop, admin;
  const clonedReq = request.clone();
 
  try {
    const auth = await authenticate.webhook(request);
    payload = auth.payload;
    topic = auth.topic;
    shop = auth.shop;
    admin = auth.admin;
  } catch (error) {
    shop = clonedReq.headers.get("x-shopify-shop-domain");
    topic = clonedReq.headers.get("x-shopify-topic");
    try { 
      payload = await clonedReq.json(); 
    } catch (e) { 
      return new Response("Webhook error handled", { status: 200 }); 
    }
  }
 
  const normalizedTopic = (topic || "").toUpperCase().replace("/", "_");
  if (normalizedTopic === "CHECKOUTS_UPDATE") return new Response("Checkout update acknowledged", { status: 200 });
  if (normalizedTopic !== "ORDERS_CREATE") return new Response("Unhandled topic", { status: 200 });
  if (!payload || !shop) return new Response("Invalid Request", { status: 200 });

  processOrderInBackground(payload, shop, admin).catch(console.error);
  return new Response("Webhook processed successfully", { status: 200 });
};