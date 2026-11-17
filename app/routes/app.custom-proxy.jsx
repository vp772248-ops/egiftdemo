import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";
 
function getCountryTimezone(countryName) {
  const c = (countryName || "").trim().toLowerCase();
  const tzMap = {
    "united states": { tz: "America/New_York", label: "EST (US)" }, "us": { tz: "America/New_York", label: "EST (US)" }, "usa": { tz: "America/New_York", label: "EST (US)" },
    "canada": { tz: "America/Toronto", label: "EST (Canada)" }, "mexico": { tz: "America/Mexico_City", label: "CST (Mexico)" },
    "united kingdom": { tz: "Europe/London", label: "UK Time" }, "uk": { tz: "Europe/London", label: "UK Time" }, "great britain": { tz: "Europe/London", label: "UK Time" },
    "india": { tz: "Asia/Kolkata", label: "IST (India)" }, "australia": { tz: "Australia/Sydney", label: "AEST (Australia)" },
  };
  if (tzMap[c]) return tzMap[c];
  for (const key in tzMap) { if (c.includes(key)) return tzMap[key]; }
  return { tz: "UTC", label: "UTC" };
}
 
async function calculateExpiry(fullOrderText, existingSub) {
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
    return { exactExpiryTime, durationMonths, durationDays };
}

function isProductMatch(dbProducts, targetProductId) {
    if (!dbProducts || !targetProductId) return false;
    const rawId = targetProductId.replace("gid://shopify/Product/", "").trim();
    const gid = `gid://shopify/Product/${rawId}`;
    const str = typeof dbProducts === 'string' ? dbProducts : JSON.stringify(dbProducts);
    return str.includes(gid) || str.includes(rawId);
}

function filterFormFields(fields, isPersonal) {
  return fields.filter(field => {
    if (!field.visibility) return true;
    const vis = String(field.visibility).toLowerCase().trim();
    if (vis.includes("both") || vis.includes("all")) return true;
    if (vis.includes("gift")) return !isPersonal;
    if (vis.includes("personal")) return isPersonal;
    return true;
  });
}
 
export const loader = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const shopDomain = url.searchParams.get("shop") || "testteamplatli.myshopify.com";
    const { admin } = await unauthenticated.admin(shopDomain);
 
    if (action === "get_dashboard") {
      const email = url.searchParams.get("email");
      if (!email) return Response.json({ error: "Customer email missing" }, { status: 400 });
 
      const userSubscriptions = await prisma.giftSubscription.findMany({ 
          where: { gifteeEmail: email }, 
          orderBy: { createdAt: 'desc' } 
      });
      return Response.json({ success: true, subscriptions: userSubscriptions }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "get_form_by_product") {
      const productId = url.searchParams.get("productId"); 
      const allForms = await prisma.formTemplate.findMany({ where: { status: "Active" }, orderBy: { createdAt: "asc" } });
      let combinedFields = [];
      let foundMatch = false;

      if (productId) {
         for (const form of allForms) {
            if (isProductMatch(form.products, productId)) {
               if (form.fields) {
                 try { 
                   const parsed = typeof form.fields === 'string' ? JSON.parse(form.fields) : form.fields;
                   combinedFields = [...combinedFields, ...parsed]; 
                 } catch(e) {}
               }
               foundMatch = true;
            }
         }
      }
      if (!foundMatch) {
         if (allForms.length > 0 && allForms[0].fields) {
            try { combinedFields = typeof allForms[0].fields === 'string' ? JSON.parse(allForms[0].fields) : allForms[0].fields; } catch(e){}
         }
      }
      
      const passedCode = url.searchParams.get("code") || "";
      // 🟢 GiftTin is Personal
      const isPersonalDash = passedCode.startsWith("MY-") || passedCode.startsWith("WBC-GiftPer");
      const filteredModalFields = filterFormFields(combinedFields, isPersonalDash);

      return Response.json({ success: true, formFields: filteredModalFields }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "get_addon_by_product") {
        const productId = url.searchParams.get("productId");
        if (!productId) return Response.json({ success: false, message: "Missing Product ID" });

        const allAddons = await prisma.addonTemplate.findMany({ where: { status: "Active" }, orderBy: { createdAt: "asc" } });
        let matchedAddonsData = [];
        let matchedCustomGiftData = [];

        if (productId) {
            for (const addonTemp of allAddons) {
                if (isProductMatch(addonTemp.mainProducts, productId)) {
                    if (addonTemp.addonsData) {
                        try {
                            const parsedAddons = typeof addonTemp.addonsData === 'string' ? JSON.parse(addonTemp.addonsData) : addonTemp.addonsData;
                            matchedAddonsData = matchedAddonsData.concat(parsedAddons);
                        } catch(e) {}
                    }
                    if (addonTemp.customGiftData) {
                        try {
                            const parsedGifts = typeof addonTemp.customGiftData === 'string' ? JSON.parse(addonTemp.customGiftData) : addonTemp.customGiftData;
                            matchedCustomGiftData = matchedCustomGiftData.concat(parsedGifts);
                        } catch(e) {}
                    }
                }
            }
        }
        return Response.json({ success: true, addonsData: matchedAddonsData, customGiftData: matchedCustomGiftData }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "get_single_product_form") {
      const rawProductId = url.searchParams.get("productId"); 
      if (!rawProductId) return Response.json({ success: false, message: "Missing Product ID" });
      const productId = rawProductId.includes("gid://") ? rawProductId : `gid://shopify/Product/${rawProductId}`;
      const allSingleForms = await prisma.singleProductForm.findMany({ where: { status: "Active" }, orderBy: { createdAt: "asc" } });
      let combinedFields = []; 
      for (const form of allSingleForms) {
        if (isProductMatch(form.products, productId)) {
            if (form.fields) {
               try { 
                 const parsed = typeof form.fields === 'string' ? JSON.parse(form.fields) : form.fields;
                 combinedFields = combinedFields.concat(parsed); 
               } catch(e){}
            }
        }
      }
      if (combinedFields.length > 0) {
        return Response.json({ success: true, formFields: combinedFields }, { headers: { "Cache-Control": "no-store" } });
      } else {
        return Response.json({ success: false, message: "No form found for this single product" }, { headers: { "Cache-Control": "no-store" } });
      }
    }
 
    const code = url.searchParams.get("code");
    if (!code || code.trim() === "") return Response.json({ error: "Code is required" }, { status: 400 });
    
    const giftSub = await prisma.giftSubscription.findUnique({ where: { giftCode: code.trim() } });
    if (!giftSub) return Response.json({ error: "Invalid Code" }, { status: 404 });
    if ((giftSub.status === "REDEEMED" || giftSub.status === "AWAITING_FULFILLMENT") && action !== "get_dashboard") {
      return Response.json({ success: true, alreadyRedeemed: true, gift: { giftCode: giftSub.giftCode, gifteeName: giftSub.gifteeName || "Awesome Reader" } }, { headers: { "Cache-Control": "no-store" } });
    }

    // 🟢 GiftTin is Personal
    const isPersonal = giftSub.giftCode.startsWith("MY-") || giftSub.giftCode.startsWith("WBC-GiftPer");
    let orderProductIds = [];
    
    if (giftSub.orderId && admin) {
      try {
        const orderQuery = await admin.graphql(`query { order(id: "gid://shopify/Order/${giftSub.orderId}") { lineItems(first: 20) { edges { node { customAttributes { key value } product { id } } } } } }`);
        const oData = await orderQuery.json();
        if (!oData.errors && oData.data?.order?.lineItems?.edges) {
          orderProductIds = oData.data.order.lineItems.edges.filter(e => {
              const attrs = e.node.customAttributes || [];
              return !attrs.some(attr => attr.key === "_hidden" && String(attr.value).trim() === "true");
          }).map(e => e.node?.product?.id).filter(Boolean);
        }
      } catch (e) { }
    }

    const allFormsRedeem = await prisma.formTemplate.findMany({ where: { status: "Active" }, orderBy: { createdAt: "asc" } });
    let combinedFieldsRedeem = [];
    let foundMatchRedeem = false;

    for (const form of allFormsRedeem) {
        let formMatches = false;
        for (const pId of orderProductIds) {
            if (isProductMatch(form.products, pId)) { formMatches = true; break; }
        }
        if (formMatches) {
             if (form.fields) {
               try { 
                 const parsed = typeof form.fields === 'string' ? JSON.parse(form.fields) : form.fields;
                 combinedFieldsRedeem = [...combinedFieldsRedeem, ...parsed]; 
               } catch(e) {}
             }
             foundMatchRedeem = true;
        }
    }
    
    if (!foundMatchRedeem) {
       if (allFormsRedeem.length > 0 && allFormsRedeem[0].fields) {
           try { combinedFieldsRedeem = typeof allFormsRedeem[0].fields === 'string' ? JSON.parse(allFormsRedeem[0].fields) : allFormsRedeem[0].fields; } catch(e){}
       }
    }

    const filteredRedeemFields = filterFormFields(combinedFieldsRedeem, isPersonal);
    return Response.json({ 
      success: true, 
      gift: { giftCode: giftSub.giftCode, gifteeName: giftSub.gifteeName || "Awesome Reader" }, 
      formFields: filteredRedeemFields 
    }, { headers: { "Cache-Control": "no-store" } });

  } catch (error) { 
    return Response.json({ error: "Server Error" }, { status: 500 }); 
  }
};
 
export const action = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    
    const payload = await request.json();
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop") || "testteamplatli.myshopify.com";
    const { admin } = await unauthenticated.admin(shopDomain);
    const { code, questionnaire, customerId, address, isForMyself } = payload;
    
    const subInfo = await prisma.giftSubscription.findUnique({ where: { giftCode: code } });
    if (!subInfo) return Response.json({ error: "Invalid Code" }, { status: 404 });

    if ((subInfo.status === "REDEEMED" || subInfo.status === "AWAITING_FULFILLMENT") && payload.action !== "update_dashboard_tastes") {
      return Response.json({ error: "Gift already redeemed" }, { status: 400 });
    }
 
    let productName = "Subscription";
    let orderCountry = "UTC";
    if (address && address.country) orderCountry = address.country;
    let isAlreadyFulfilled = false;
    let fullOrderText = "";
    
    let existingNote = ""; 
    let historyNotes = ""; 
 
    if (subInfo.orderId && admin) {
      try {
        const orderQuery = await admin.graphql(
          `query getOrderDetails($id: ID!) { order(id: $id) { note displayFulfillmentStatus billingAddress { country } lineItems(first: 20) { edges { node { title name customAttributes { key value } } } } } }`,
          { variables: { id: `gid://shopify/Order/${subInfo.orderId}` } }
        );
        const oData = await orderQuery.json();
        
        existingNote = oData.data?.order?.note || ""; 
        if (!address || !address.country) orderCountry = oData.data?.order?.billingAddress?.country || "UTC";
        
        if (oData.data?.order?.lineItems?.edges?.length > 0) {
          const edges = oData.data.order.lineItems.edges;
          
          const mainItems = edges.filter(e => {
              const attrs = e.node.customAttributes || [];
              const isHidden = attrs.some(attr => attr.key === "_hidden" && String(attr.value).trim() === "true");
              return !isHidden;
          });

          const targetItems = mainItems.length > 0 ? mainItems : edges;
          let subItem = targetItems.find(e => {
              const t = (e.node.title || "").toLowerCase();
              return t.includes("tin") || t.includes("subscription") || t.includes("month") || t.includes("gift product") || t.includes("card");
          });
          
          if (!subItem) subItem = targetItems[0]; 
          productName = subItem.node.title;
          fullOrderText = targetItems.map(e => (e.node.name || e.node.title || "").toLowerCase()).join(" ");
        }
        
        const orderStatus = oData.data?.order?.displayFulfillmentStatus || "";
        if (orderStatus === "FULFILLED") { isAlreadyFulfilled = true; }
      } catch (e) { }
    }
 
    const tzInfo = getCountryTimezone(orderCountry);
    const exactRedeemTime = new Date();
    const datePart = exactRedeemTime.toLocaleDateString("en-GB", { timeZone: tzInfo.tz, day: 'numeric', month: 'long', year: 'numeric' });
    const timePart = exactRedeemTime.toLocaleTimeString("en-US", { timeZone: tzInfo.tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formattedRedeemDate = `${datePart} at ${timePart}`;
 
    let dynamicTastes = "";
    if (questionnaire && Object.keys(questionnaire).length > 0) {
      for (const [key, val] of Object.entries(questionnaire)) {
        const valStr = Array.isArray(val) ? val.join(", ") : (val || "N/A");
        dynamicTastes += `• ${key}:\n  - ${valStr}\n`;
      }
    } else {
      dynamicTastes += "None provided.";
    }

    let expiryUpdateData = {};
    let finalDbStatus = subInfo.status; 
    let tagsToAdd = [];
    let tagsToRemove = ["Awaiting Tastes", "Awaiting Redemption"]; 
    
    const isGiftProduct = code.trim().startsWith("WBC-GiftProduc-");
    const isGiftTin = code.trim().startsWith("WBC-GiftPer-"); 

    const hasOriginal = existingNote.includes("📝 ORIGINAL FORM SUBMISSION") || existingNote.includes("📝 FORM SUBMISSION") || existingNote.includes("🔄 RENEWAL FORM SUBMISSION");
    const isFirstTimeSubmit = !hasOriginal;

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
            historyNotes = validHistoryBlocks.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
        }
    }

    let newHeader = "";

    if (payload.action === "update_dashboard_tastes" && !isFirstTimeSubmit) {
        tagsToAdd.push("Tastes Updated");
        if (isAlreadyFulfilled || finalDbStatus === "REDEEMED") {
            finalDbStatus = "REDEEMED";
            const dPart = subInfo.expiresAt ? subInfo.expiresAt.toLocaleDateString("en-GB", { timeZone: tzInfo.tz, day: 'numeric', month: 'long', year: 'numeric' }) : "";
            const tPart = subInfo.expiresAt ? subInfo.expiresAt.toLocaleTimeString("en-US", { timeZone: tzInfo.tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "";
            newHeader = subInfo.expiresAt ? `🟢 PLAN ACTIVE\n📅 Expires On: ${dPart} at ${tPart} (${tzInfo.label})\n📦 Plan: ${productName}` : `🟢 PLAN ACTIVE\n📦 Plan: ${productName}`;
        } else if (finalDbStatus === "EXPIRED") {
            newHeader = `🔴 SUBSCRIPTION EXPIRED\n📦 Plan: ${productName}`;
        } else {
            finalDbStatus = "AWAITING_FULFILLMENT";
            newHeader = `🟢 TASTES SAVED\n📦 Plan: ${productName}\n⏳ Timer will start automatically once this order is fulfilled.`;
        }
    } 
    else {
        if (isAlreadyFulfilled) {
           if (isGiftProduct) {
             finalDbStatus = "REDEEMED"; 
             tagsToAdd.push(`Redeemed: ${code.trim()}`, "Redeemed");
             newHeader = `🟢 REDEEMED (NO EXPIRY)\n📦 Plan: ${productName}\n✓ Tastes Saved. Ready to ship!`;
           } else {
             const { exactExpiryTime, durationMonths, durationDays } = await calculateExpiry(fullOrderText, subInfo);
             expiryUpdateData = { expiresAt: exactExpiryTime, durationMonths, durationDays };
             finalDbStatus = "REDEEMED"; 
             tagsToAdd.push(`Active: ${code.trim()}`, "Redeemed");
             const dPart = exactExpiryTime.toLocaleDateString("en-GB", { timeZone: tzInfo.tz, day: 'numeric', month: 'long', year: 'numeric' });
             const tPart = exactExpiryTime.toLocaleTimeString("en-US", { timeZone: tzInfo.tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
             newHeader = `🟢 PLAN ACTIVE\n📅 Expires On: ${dPart} at ${tPart} (${tzInfo.label})\n📦 Plan: ${productName}`;
           }
        } else {
           finalDbStatus = "AWAITING_FULFILLMENT"; 
           tagsToAdd.push(`Tastes Saved: ${code.trim()}`); 
           
           if (isGiftProduct) {
             newHeader = `🟢 TASTES SAVED (NO EXPIRY)\n📦 Plan: ${productName}\n⏳ Awaiting fulfillment to ship this product.`;
           } else {
             // 🟢 GIFT TIN KE LIYE ORDER NOTE: TASTES SAVED hoga submit ke baad
             newHeader = `🟢 TASTES SAVED\n📦 Plan: ${productName}\n⏳ Timer will start automatically once this order is fulfilled.`;
           }
        }
    }
 
    let latestTastesBlock = "";
    if (isFirstTimeSubmit) {
        if (subInfo.renewalCount > 0) {
            latestTastesBlock = `🔄 RENEWAL FORM SUBMISSION (${formattedRedeemDate}):\n\n${dynamicTastes}`;
        } else {
            latestTastesBlock = `📝 ORIGINAL FORM SUBMISSION (${formattedRedeemDate}):\n\n${dynamicTastes}`;
        }
    } else {
        const prefix = subInfo.renewalCount > 0 ? "🔄 RENEWAL UPDATED TASTES" : "🔄 UPDATED TASTES";
        latestTastesBlock = `${prefix} (${formattedRedeemDate}):\n\n${dynamicTastes}`;
    }

    let finalNote = `${newHeader}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${latestTastesBlock}`;
    
    if (historyNotes) {
        finalNote += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n[PREVIOUS HISTORY]\n${historyNotes}`;
    }

    if (admin && subInfo.orderId) {
      try {
        const orderGid = `gid://shopify/Order/${subInfo.orderId}`;
        let orderInput = { id: orderGid, note: finalNote };
        
        // 🟢 FIX: Gift Tin ke proxy submit pe shipping address Shopify backend update na kare, kyunki cart check out time address mil chuka hota hai
        if (address && address.firstName && !isForMyself && !isGiftTin && payload.action !== "update_dashboard_tastes") {
          orderInput.shippingAddress = { 
            firstName: address.firstName, lastName: address.lastName || "", 
            address1: address.address1 || "", address2: address.address2 || "", 
            city: address.city || "", country: address.country || "United States", 
            zip: address.zip || "", province: address.state || "", phone: address.phone || "" 
          };
        }
        
        await admin.graphql(`mutation updateOrderProxy($input: OrderInput!, $orderId: ID!, $addTags: [String!]!, $removeTags: [String!]!) { orderUpdate(input: $input) { userErrors { message field } } tagsAdd(id: $orderId, tags: $addTags) { userErrors { message } } tagsRemove(id: $orderId, tags: $removeTags) { userErrors { message } } }`, 
        { variables: { input: orderInput, orderId: orderGid, addTags: tagsToAdd, removeTags: tagsToRemove } });
      } catch (e) { }
    }
 
    let updateData = { status: finalDbStatus, questionnaire: questionnaire || {}, ...expiryUpdateData };
    if (customerId) updateData.customerId = String(customerId);
    
    // 🟢 Record recipient address manually for normal gifts.
    if (payload.action !== "update_dashboard_tastes" && !isGiftTin) {
       updateData.recipientAddress = isForMyself ? null : (address || {});
    }
 
    await prisma.giftSubscription.update({ where: { giftCode: code }, data: updateData });
    const successMessage = isAlreadyFulfilled ? "Reading tastes saved! Your subscription timer has now started." : "Details saved successfully! Ready for dispatch.";
    return Response.json({ success: true, message: successMessage });
 
  } catch (error) { return Response.json({ error: "Server Error" }, { status: 500 }); }
};