import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import { sendExpiryEmail } from "../services/email.server";

export const loader = async ({ request }) => {
  console.log("\n====================================");
  console.log(`⏰ EXPIRY CHECK CRON TRIGGERED: ${new Date().toISOString()}`);

  try {
    const currentTime = new Date();

    const expiredSubs = await prisma.giftSubscription.findMany({
      where: {
        status: "REDEEMED",
        expiresAt: { lte: currentTime }
      }
    });

    console.log(`📦 Found ${expiredSubs.length} plans to EXPIRE.`);

    if (expiredSubs.length === 0) {
      return Response.json({ success: true, message: "No plans to expire." });
    }

    const shop = "testteamplatli.myshopify.com";
    let admin = null;

    try {
      const auth = await unauthenticated.admin(shop);
      admin = auth.admin;
    } catch (authErr) {
      console.log("⚠️ Warning: Shopify Admin API connect nahi hua. Skipping tags, but updating Database & Email.");
    }

    for (const sub of expiredSubs) {
      await prisma.giftSubscription.update({
        where: { id: sub.id },
        data: { status: "EXPIRED" }
      });

      let productName = "Book Subscription";

      if (admin && sub.orderId) {
        let existingNote = ""; 

        try {
          console.log(`🔄 Fetching old notes before EXPIRE for Order: ${sub.orderId}`);
          
          // 🟢 FIX: Hum ab 'first: 10' items manga rahe hain taaki main product dhundh sakein (hidden bundles bypass karke)
          const orderQuery = await admin.graphql(
            `query getOrderDetails($id: ID!) { 
              order(id: $id) { 
                note 
                lineItems(first: 10) { 
                  edges { 
                    node { 
                      title 
                      customAttributes { key value }
                    } 
                  } 
                } 
              } 
            }`,
            { variables: { id: `gid://shopify/Order/${sub.orderId}` } }
          );
          const oData = await orderQuery.json();
          
          existingNote = oData.data?.order?.note || ""; 

          // 🟢 FIX: Sahi main product dhundhne ka logic
          if (oData.data?.order?.lineItems?.edges) {
            for (const edge of oData.data.order.lineItems.edges) {
              const itemTitle = edge.node.title || "";
              
              // Check if item is hidden
              let isHidden = false;
              if (edge.node.customAttributes) {
                for (const attr of edge.node.customAttributes) {
                  if (attr.key === "_hidden" && attr.value === "true") {
                    isHidden = true;
                    break;
                  }
                }
              }

              // Agar hidden nahi hai, aur "bundle" nahi hai, tabhi ise main product manenge
              if (!isHidden && !itemTitle.toLowerCase().includes("happy bundle")) {
                productName = itemTitle;
                break; // Sahi product milte hi loop rok do
              }
            }
          }
        } catch (e) { console.error("❌ Failed to fetch old note on expiry."); }

        const activeTag = `Active: ${sub.giftCode}`;
        const expiredTag = `Expired: ${sub.giftCode}`;
        const formattedDate = sub.expiresAt
          ? new Date(sub.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long" })
          : "N/A";

        // 🟢 CLEANUP: Remove old "Active" and "Tastes Saved" headers so they don't duplicate
        existingNote = existingNote.replace(/🟢 PLAN ACTIVE[\s\S]*?(?=\n\n📝|\n\n🔄|\n\n━━━━━━━━━━━━━━━━━━━━|$)/g, "").trim();
        existingNote = existingNote.replace(/🟢 TASTES SAVED[\s\S]*?(?=\n\n📝|\n\n🔄|\n\n━━━━━━━━━━━━━━━━━━━━|$)/g, "").trim();
        existingNote = existingNote.replace(/🔴 SUBSCRIPTION EXPIRED[\s\S]*?(?=\n\n📝|\n\n🔄|\n\n━━━━━━━━━━━━━━━━━━━━|$)/g, "").trim();
        
        // Remove any stray dashed lines at the very top
        existingNote = existingNote.replace(/^(━━━━━━━━━━━━━━━━━━━━\s*)+/g, "").trim();

        // 🟢 NAYA STATUS
        const expireText = `🔴 SUBSCRIPTION EXPIRED\n📦 Plan: ${productName}\n📅 Expired On: ${formattedDate}`;
        
        // 🟢 APPEND: Expired status sabse upar, aur Q&A (agar hai) uske neeche
        const finalNoteText = existingNote ? `${expireText}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${existingNote}` : expireText;

        try {
          console.log(`📝 Replacing Active Header with Expiry Status in Order Note...`);
          await admin.graphql(
            `mutation updateOrder($id: ID!, $note: String!, $addTags: [String!]!, $removeTags: [String!]!) {
              orderUpdate(input: {id: $id, note: $note}) { userErrors { message } }
              tagsAdd(id: $id, tags: $addTags) { userErrors { message } }
              tagsRemove(id: $id, tags: $removeTags) { userErrors { message } }
            }`,
            {
              variables: {
                id: `gid://shopify/Order/${sub.orderId}`,
                note: finalNoteText,
                addTags: [expiredTag],
                removeTags: [activeTag, "Redeemed"]
              }
            }
          );
          console.log(`✅ Order Expiry Updated in Shopify.`);
        } catch (graphqlErr) {
            console.error("❌ Order Tag/Note Update Error", graphqlErr);
        }
      }

      try {
        await sendExpiryEmail(sub.gifteeEmail, sub.gifteeName, productName);
        console.log(`✅ Expiry Email Sent to ${sub.gifteeEmail} for product: ${productName}`);
      } catch (e) {
        console.error("❌ Failed to send expiry email", e);
      }
    }
    
    console.log(`====================================\n`);
    return Response.json({ success: true, expiredCount: expiredSubs.length });

  } catch (error) {
    console.error("❌ EXPIRY CRON ERROR:", error);
    return Response.json({ error: "Server Error" }, { status: 500 });
  }
};