import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";

function getCountryTimezone(countryName) {
  const c = (countryName || "").trim().toLowerCase();
  const tzMap = {
    "united states": { tz: "America/New_York", label: "EST (US)" }, "us": { tz: "America/New_York", label: "EST (US)" }, "usa": { tz: "America/New_York", label: "EST (US)" },
    "canada": { tz: "America/Toronto", label: "EST (Canada)" }, "mexico": { tz: "America/Mexico_City", label: "CST (Mexico)" },
    "united kingdom": { tz: "Europe/London", label: "UK Time" }, "uk": { tz: "Europe/London", label: "UK Time" },
    "india": { tz: "Asia/Kolkata", label: "IST (India)" }, "australia": { tz: "Australia/Sydney", label: "AEST (Australia)" },
  };
  if (tzMap[c]) return tzMap[c];
  for (const key in tzMap) { if (c.includes(key)) return tzMap[key]; }
  return { tz: "UTC", label: "UTC" };
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
    try { payload = await clonedReq.json(); } catch (e) { return new Response("Webhook error handled", { status: 200 }); }
  }

  if (topic !== "ORDERS_FULFILLED") return new Response("Unhandled topic", { status: 200 });
  if (!payload || !shop) return new Response("Invalid Request", { status: 200 });

  try {
    const rawOrderId = payload.order_id?.toString() || payload.id?.toString();
    const orderGid = `gid://shopify/Order/${rawOrderId}`;

    const items = payload.line_items || [];
    let isDraftThemeOrder = false;

    for (const item of items) {
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

    if (!isDraftThemeOrder) {
      console.log(`🚫 [Order Fulfilled Webhook] LIVE THEME ORDER DETECTED (Order ID: ${rawOrderId}). Skipping all fulfillment logic.`);
      return new Response("Live Theme Order - Skipped", { status: 200 });
    } else {
      console.log(`✅ [Order Fulfilled Webhook] DRAFT THEME ORDER DETECTED (Order ID: ${rawOrderId}). Processing fulfillment logic...`);
    }
    
    let orderCountry = "United Kingdom"; 
    if (payload.billing_address?.country) orderCountry = payload.billing_address.country;
    else if (payload.shipping_address?.country) orderCountry = payload.shipping_address.country;

    const existingSub = await prisma.giftSubscription.findFirst({ where: { orderId: rawOrderId } });
    if (!existingSub) return new Response("Not a subscription", { status: 200 });
    if (existingSub.expiresAt) return new Response("Expiry already set", { status: 200 });

    if (existingSub.status !== "REDEEMED" && existingSub.status !== "AWAITING_FULFILLMENT") {
        try {
          if (!admin) { const unauth = await unauthenticated.admin(shop); admin = unauth.admin; }
          if (admin) {
             const existingNote = payload.note || "";
             const warningNote = `⚠️ WARNING: Order fulfilled prematurely!\nCustomer has not provided reading tastes or address yet. The subscription timer will automatically start when they redeem this gift.\n\n${existingNote}`;
             console.log(`⚠️ Order ${rawOrderId} fulfilled prematurely. Added warning to order note.`);
             await admin.graphql(`mutation updateOrderNote($id: ID!, $note: String!) { orderUpdate(input: {id: $id, note: $note}) { userErrors { message } } }`, { variables: { id: orderGid, note: warningNote } });
          }
        } catch (e) {}
        return new Response("Premature fulfillment ignored", { status: 200 });
    }

    // 🟢 MAIN PRODUCT DHUNDNE KI LOGIC
    let mainProductTitle = "";
    for (const item of items) {
       const properties = item.properties || [];
       let isHiddenItem = false;
       properties.forEach(p => {
          if (p.name && p.name.trim().toLowerCase() === "_hidden" && p.value && p.value.toString().trim().toLowerCase() === "true") {
             isHiddenItem = true;
          }
       });
       if (!isHiddenItem) {
          mainProductTitle = item.title || "";
          break;
       }
    }
    
    let subItem = items.find(e => {
        const t = (e.title || "").toLowerCase();
        return t.includes("subscription") || t.includes("month") || t.includes("tin");
    });
    let productName = mainProductTitle ? mainProductTitle : (subItem ? subItem.title : (items.length > 0 ? items[0].title : "Subscription"));

    let fullOrderText = items.map(e => (e.name || e.title || "").toLowerCase()).join(" ");

    const isGiftProduct = existingSub.giftCode.startsWith("WBC-GiftProduc-");

    if (isGiftProduct) {
       await prisma.giftSubscription.update({
          where: { id: existingSub.id },
          data: { status: "REDEEMED" }
       });
       console.log(`✅ Order marked REDEEMED for Gift Product ${existingSub.giftCode} (No Expiry applied)`);

       try {
         if (!admin) { const unauth = await unauthenticated.admin(shop); admin = unauth.admin; }
         if (admin) {
           const orderQuery = await admin.graphql(`query { order(id: "${orderGid}") { note } }`);
           const oData = await orderQuery.json();
           let existingNote = oData.data?.order?.note || "";

           let historyNotes = ""; 
           let latestTastesBlock = "";

           if (existingNote) {
               let cleanOriginal = existingNote.replace(/\[PREVIOUS HISTORY\]/g, "");
               let blocks = cleanOriginal.split('━━━━━━━━━━━━━━━━━━━━');
               let validHistoryBlocks = [];
               const historyMarkers = ["📝 ORIGINAL FORM SUBMISSION", "📝 FORM SUBMISSION", "🔄 UPDATED TASTES", "🔄 RENEWAL UPDATED TASTES", "📝 PREVIOUS READING TASTES", "🔄 RENEWAL FORM SUBMISSION"];

               blocks.forEach(block => {
                   let b = block.trim();
                   b = b.replace(/(?:🟢|🔴|⏳|⚠️)[\s\S]*?(?=📝 ORIGINAL FORM SUBMISSION|📝 FORM SUBMISSION|🔄 UPDATED TASTES|🔄 RENEWAL UPDATED TASTES|📝 PREVIOUS READING TASTES|🔄 RENEWAL FORM SUBMISSION|$)/gi, "").trim();
                   
                   let isValid = false;
                   for (const marker of historyMarkers) {
                       if (b.startsWith(marker)) isValid = true;
                   }
                   if (isValid && !validHistoryBlocks.includes(b)) {
                       validHistoryBlocks.push(b);
                   }
               });
               
               if (validHistoryBlocks.length > 0) {
                   if (validHistoryBlocks[0].startsWith("📝 PREVIOUS READING TASTES")) {
                       historyNotes = validHistoryBlocks.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
                   } else {
                       latestTastesBlock = validHistoryBlocks[0]; 
                       if (validHistoryBlocks.length > 1) {
                           historyNotes = validHistoryBlocks.slice(1).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
                       }
                   }
               }
           }

           const activeText = `🟢 REDEEMED (NO EXPIRY)\n📦 Plan: ${productName}\n✓ Tastes Saved. Ready to ship!`;
           let finalNote = activeText;
           if (latestTastesBlock) { finalNote += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n${latestTastesBlock}`; }
           if (historyNotes) { finalNote += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n[PREVIOUS HISTORY]\n${historyNotes}`; }

           await admin.graphql(
               `mutation updateOrderNoteAndTags($id: ID!, $note: String!, $addTags: [String!]!, $removeTags: [String!]!) {
                 orderUpdate(input: {id: $id, note: $note}) { userErrors { message } }
                 tagsAdd(id: $id, tags: $addTags) { userErrors { message } }
                 tagsRemove(id: $id, tags: $removeTags) { userErrors { message } }
               }`,
               { variables: { id: orderGid, note: finalNote, addTags: [`Redeemed: ${existingSub.giftCode}`, "Redeemed"], removeTags: [`Tastes Saved: ${existingSub.giftCode}`] } }
           );
         }
       } catch (e) { }

       return new Response("Gift Product Fulfilled (No Expiry)", { status: 200 });
    }

    let durationMonths = 0; let durationDays = 0; let durationMinutes = 0;
    const allPlans = await prisma.planMapping.findMany();
    let isPlanMatched = false;

    for (const plan of allPlans) {
      if (fullOrderText.includes(plan.keyword.toLowerCase())) {
        if (plan.durationType === "MONTHS") durationMonths = plan.durationQty;
        else if (plan.durationType === "DAYS") durationDays = plan.durationQty;
        else if (plan.durationType === "MINUTES") durationMinutes = plan.durationQty;
        isPlanMatched = true; break;
      }
    }

    if (!isPlanMatched) {
        const text = fullOrderText.toLowerCase();
        const minMatch = text.match(/(\d+)\s*minute/);
        const dayMatch = text.match(/(\d+)\s*day/);
        const monthMatch = text.match(/(\d+)\s*month/);
        if (minMatch) { durationMinutes = parseInt(minMatch[1]); isPlanMatched = true; } 
        else if (dayMatch) { durationDays = parseInt(dayMatch[1]); isPlanMatched = true; } 
        else if (monthMatch) { durationMonths = parseInt(monthMatch[1]); isPlanMatched = true; }
    }

    if (!isPlanMatched) {
        if (existingSub.durationMonths > 0) durationMonths = existingSub.durationMonths;
        else if (existingSub.durationDays > 0) durationDays = existingSub.durationDays;
        else durationMinutes = 5; 
    }

    const exactExpiryTime = new Date();
    if (durationMonths > 0) exactExpiryTime.setMonth(exactExpiryTime.getMonth() + durationMonths);
    else if (durationDays > 0) exactExpiryTime.setDate(exactExpiryTime.getDate() + durationDays);
    else if (durationMinutes > 0) exactExpiryTime.setMinutes(exactExpiryTime.getMinutes() + durationMinutes);

    await prisma.giftSubscription.update({
        where: { id: existingSub.id },
        data: { status: "REDEEMED", expiresAt: exactExpiryTime, durationMonths: durationMonths, durationDays: durationDays }
    });
    
    console.log(`✅ Subscription timer started for ${existingSub.giftCode}. Expires at ${exactExpiryTime}`);

    try {
      if (!admin) { const unauth = await unauthenticated.admin(shop); admin = unauth.admin; }
      if (admin) {
        const orderQuery = await admin.graphql(`query { order(id: "${orderGid}") { note } }`);
        const oData = await orderQuery.json();
        let existingNote = oData.data?.order?.note || ""; 

        const tzInfo = getCountryTimezone(orderCountry);
        const datePart = exactExpiryTime.toLocaleDateString("en-GB", { timeZone: tzInfo.tz, day: 'numeric', month: 'long', year: 'numeric' });
        const timePart = exactExpiryTime.toLocaleTimeString("en-US", { timeZone: tzInfo.tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const formattedExpiry = `${datePart} at ${timePart} (${tzInfo.label})`;

        let historyNotes = ""; 
        let latestTastesBlock = "";
        
        if (existingNote) {
            let cleanOriginal = existingNote.replace(/\[PREVIOUS HISTORY\]/g, "");
            let blocks = cleanOriginal.split('━━━━━━━━━━━━━━━━━━━━');
            let validHistoryBlocks = [];
            const historyMarkers = ["📝 ORIGINAL FORM SUBMISSION", "📝 FORM SUBMISSION", "🔄 UPDATED TASTES", "🔄 RENEWAL UPDATED TASTES", "📝 PREVIOUS READING TASTES", "🔄 RENEWAL FORM SUBMISSION"];

            blocks.forEach(block => {
                let b = block.trim();
                b = b.replace(/(?:🟢|🔴|⏳|⚠️)[\s\S]*?(?=📝 ORIGINAL FORM SUBMISSION|📝 FORM SUBMISSION|🔄 UPDATED TASTES|🔄 RENEWAL UPDATED TASTES|📝 PREVIOUS READING TASTES|🔄 RENEWAL FORM SUBMISSION|$)/gi, "").trim();
                
                let isValid = false;
                for (const marker of historyMarkers) {
                    if (b.startsWith(marker)) isValid = true;
                }
                if (isValid && !validHistoryBlocks.includes(b)) {
                    validHistoryBlocks.push(b);
                }
            });
            
            if (validHistoryBlocks.length > 0) {
                if (validHistoryBlocks[0].startsWith("📝 PREVIOUS READING TASTES")) {
                    historyNotes = validHistoryBlocks.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
                } else {
                    latestTastesBlock = validHistoryBlocks[0]; 
                    if (validHistoryBlocks.length > 1) {
                        historyNotes = validHistoryBlocks.slice(1).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
                    }
                }
            }
        }

        const activeText = `🟢 PLAN ACTIVE\n📅 Expires On: ${formattedExpiry}\n📦 Plan: ${productName}`;
        let finalNote = activeText;
        if (latestTastesBlock) { finalNote += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n${latestTastesBlock}`; }
        if (historyNotes) { finalNote += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n[PREVIOUS HISTORY]\n${historyNotes}`; }

        await admin.graphql(
            `mutation updateOrderNoteAndTags($id: ID!, $note: String!, $addTags: [String!]!, $removeTags: [String!]!) {
              orderUpdate(input: {id: $id, note: $note}) { userErrors { message } }
              tagsAdd(id: $id, tags: $addTags) { userErrors { message } }
              tagsRemove(id: $id, tags: $removeTags) { userErrors { message } }
            }`,
            { variables: { id: orderGid, note: finalNote, addTags: [`Active: ${existingSub.giftCode}`, "Redeemed"], removeTags: [`Tastes Saved: ${existingSub.giftCode}`] } }
        );
      }
    } catch (adminErr) { }
    return new Response("Expiry Date Set on Fulfillment", { status: 200 });

  } catch (error) { return new Response("Webhook error handled", { status: 200 }); }
};