import React, { useState } from "react";
import { Form, useActionData, useNavigation } from "react-router"; 
import { AppProvider, Page, Card, BlockStack, Button, Text, Banner, Frame, InlineStack, Badge } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import crypto from "crypto";
import enTranslations from '@shopify/polaris/locales/en.json';
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";



export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
];



function parseCSV(str) {
    const arr = [];
    let quote = false;
    let row = 0, col = 0;
    for (let c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];
        arr[row] = arr[row] || [];
        arr[row][col] = arr[row][col] || '';
        if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
        if (cc === '"') { quote = !quote; continue; }
        if (cc === ',' && !quote) { ++col; continue; }
        if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc === '\n' && !quote) { ++row; col = 0; continue; }
        if (cc === '\r' && !quote) { ++row; col = 0; continue; }
        arr[row][col] += cc;
    }
    return arr.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}



function calculateExpiry(startDateStr, durationQty) {
  const date = new Date(startDateStr);
  if (isNaN(date.getTime())) return new Date();
  date.setMonth(date.getMonth() + durationQty);
  return date;
}



function extractDurationFromTitle(title) {
  const lower = (title || "").toLowerCase();
  const match = lower.match(/(\d+)\s*month/);
  if (match) return parseInt(match[1]);
  return 1; 
}



export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("csvFile");



  if (!file || !file.name.endsWith(".csv")) {
    return Response.json({ error: "Please upload a valid CSV file." }, { status: 400 });
  }



  const csvText = await file.text();
  const rows = parseCSV(csvText); 
  const headers = rows[0].map(h => h.trim());



  const nameIdx = headers.indexOf("Name");
  const rawIdIdx = headers.indexOf("Id"); 
  const emailIdx = headers.indexOf("Email");
  const createdIdx = headers.indexOf("Created at");
  const fulfilledIdx = headers.indexOf("Fulfilled at");
  const lineItemIdx = headers.indexOf("Lineitem name");
  const notesIdx = headers.indexOf("Notes");
  const noteAttributesIdx = headers.indexOf("Note Attributes");
  const billingNameIdx = headers.indexOf("Billing Name");
  const shippingNameIdx = headers.indexOf("Shipping Name");
  const tagsIdx = headers.indexOf("Tags");



  if (nameIdx === -1 || lineItemIdx === -1) {
     return Response.json({ error: "Invalid CSV format. Mandatory columns missing." }, { status: 400 });
  }



  let processedCount = 0;
  let migratedOrders = [];
  const processedNames = new Set();
  const now = new Date();



  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    let orderName = nameIdx < row.length ? row[nameIdx].trim() : "";
    let rawOrderId = rawIdIdx !== -1 && rawIdIdx < row.length ? row[rawIdIdx].trim() : "";
    
    if (rawOrderId.endsWith(".0")) rawOrderId = rawOrderId.replace(".0", ""); 
    
    // Clean order name for searching (remove #)
    const cleanSearchName = orderName.replace("#", "").trim();



    if (!orderName || processedNames.has(orderName)) continue;



    const email = emailIdx !== -1 && emailIdx < row.length ? row[emailIdx].trim() : "";
    const createdAt = createdIdx !== -1 && createdIdx < row.length ? row[createdIdx].trim() : "";
    const fulfilledAt = fulfilledIdx !== -1 && fulfilledIdx < row.length ? row[fulfilledIdx].trim() : "";
    const lineItem = lineItemIdx < row.length ? row[lineItemIdx].trim() : "";
    const tags = tagsIdx !== -1 && tagsIdx < row.length ? row[tagsIdx].trim() : "";
    const orderNote = notesIdx !== -1 && notesIdx < row.length ? row[notesIdx].trim() : "";
    const noteAttributes = noteAttributesIdx !== -1 && noteAttributesIdx < row.length ? row[noteAttributesIdx].trim() : "";
    const billingName = billingNameIdx !== -1 && billingNameIdx < row.length && row[billingNameIdx].trim() !== "" ? row[billingNameIdx].trim() : "Valued Customer";
    const shippingName = shippingNameIdx !== -1 && shippingNameIdx < row.length && row[shippingNameIdx].trim() !== "" ? row[shippingNameIdx].trim() : billingName;



    const lowerLine = lineItem.toLowerCase();
    const isSubscription = lowerLine.includes("month") || lowerLine.includes("subscription") || lowerLine.includes("gift tin");
    if (!isSubscription) continue;



    try {
        const lowerTags = tags.toLowerCase();
        let category = "GIFT_SUBSCRIPTION";
        let codePrefix = "WBC-";
        let categoryLabel = "Gift Subscription";



        if (lowerTags.includes("gift redemption") || lowerLine.includes("redeem your book subscription")) {
            category = "GIFT_REDEEMED"; codePrefix = "WBC-"; categoryLabel = "Gift (Redeemed)";
        } else if (lowerTags.includes("personal subscription")) {
            category = "PERSONAL_SUBSCRIPTION"; codePrefix = "MY-"; categoryLabel = "Personal Subscription";
        } else if (lowerTags.includes("gift subscription") || lowerLine.includes("gift tin")) {
            category = "GIFT_SUBSCRIPTION"; codePrefix = "WBC-"; categoryLabel = "Gift Subscription";
        } else if (billingName.toLowerCase() === shippingName.toLowerCase() && !lowerLine.includes("gift")) {
            category = "PERSONAL_SUBSCRIPTION"; codePrefix = "MY-"; categoryLabel = "Personal Subscription";
        }



        const durationMonths = extractDurationFromTitle(lineItem);
        const giftCode = codePrefix + crypto.randomBytes(3).toString("hex").toUpperCase();
        
        let finalStatus = "";
        let expiryDate = null;
        let deliveryDateVal = null;
        let newNote = "";
        let tagsToAdd = ["Migrated"];



        if (fulfilledAt !== "") {
            const startDate = new Date(fulfilledAt);
            if (isNaN(startDate.getTime())) continue;
            deliveryDateVal = startDate;
            expiryDate = calculateExpiry(startDate, durationMonths);
            finalStatus = expiryDate <= now ? "EXPIRED" : "REDEEMED";



            const formattedExpiry = expiryDate.toLocaleDateString("en-GB", { day: 'numeric', month: 'long', year: 'numeric' });
            const noteHeader = finalStatus === "EXPIRED" ? "🔴 MIGRATED PLAN EXPIRED" : "🟢 MIGRATED PLAN ACTIVE";
            newNote = `${noteHeader}\n📦 Plan: ${lineItem}\n📅 Expires On: ${formattedExpiry}\n🔑 Code: ${giftCode}\n\n(Imported from previous system)\n${orderNote ? `Notes: ${orderNote}` : ""}`.trim();
            tagsToAdd.push(`Active: ${giftCode}`, "Redeemed");
            if (finalStatus === "EXPIRED") tagsToAdd.push("Expired");
        } else {
            const createdDate = new Date(createdAt);
            if (isNaN(createdDate.getTime())) continue;
            deliveryDateVal = createdDate;
            finalStatus = "EMAIL_SENT_PENDING_QUESTIONNAIRE"; 
            newNote = `⏳ MIGRATED PLAN (Pending Fulfillment)\n📦 Plan: ${lineItem}\n🔑 Code: ${giftCode}\n\n⚠️ Timer will start automatically once this order is fulfilled in Shopify.\n\n(Imported from previous system)\n${orderNote ? `Notes: ${orderNote}` : ""}`.trim();
            tagsToAdd.push("Awaiting Redemption");
            if (category === "PERSONAL_SUBSCRIPTION") {
                tagsToAdd.push("Awaiting Tastes");
            }
        }



        // ✨ MEGA-BULLETPROOF VARIANT ID MATCHER ✨
        let fetchedVariantId = null;
        let fetchedCustomerId = null;
        let trueOrderGid = null;
        let cleanOrderId = rawOrderId;



        try {
            // Hum direct order ke naam se Global Search kar rahe hain (Bina name filter ke)
            const orderQuery = await admin.graphql(
              `query getOrderData($query: String!) { 
                orders(first: 1, query: $query) { 
                  edges { 
                    node { 
                      id
                      customer { id }
                      lineItems(first: 10) { 
                        edges { 
                          node { 
                            name 
                            title 
                            variant { id } 
                            product {
                              variants(first: 1) {
                                edges { node { id } }
                              }
                            }
                          } 
                        } 
                      } 
                    } 
                  } 
                } 
              }`,
              { variables: { query: cleanSearchName } }
            );
            const orderJson = await orderQuery.json();
            const orderNodes = orderJson.data?.orders?.edges || [];
            
            if (orderNodes.length > 0) {
                const orderNode = orderNodes[0].node;
                trueOrderGid = orderNode.id;
                cleanOrderId = trueOrderGid.replace("gid://shopify/Order/", "");



                if (orderNode.customer?.id) {
                    fetchedCustomerId = orderNode.customer.id.replace("gid://shopify/Customer/", "");
                }
                
                const edges = orderNode.lineItems?.edges || [];
                const csvNameLower = lineItem.toLowerCase();
                
                let matchedEdge = edges.find(edge => {
                    const nodeName = (edge.node.name || "").toLowerCase();
                    const nodeTitle = (edge.node.title || "").toLowerCase();
                    return nodeName.includes(csvNameLower) || csvNameLower.includes(nodeName) || 
                           nodeTitle.includes(csvNameLower) || csvNameLower.includes(nodeTitle);
                });



                if (!matchedEdge) {
                    matchedEdge = edges.find(edge => {
                        const n = (edge.node.name || "").toLowerCase();
                        return n.includes("month") || n.includes("subscription") || n.includes("tin");
                    });
                }
                
                if (matchedEdge) {
                    if (matchedEdge.node.variant && matchedEdge.node.variant.id) {
                        // 1. Agar direct Variant ID mil gaya
                        fetchedVariantId = matchedEdge.node.variant.id.replace("gid://shopify/ProductVariant/", "");
                    } else if (matchedEdge.node.product?.variants?.edges?.[0]?.node?.id) {
                        // 2. Fallback: Agar purana variant delete ho gaya hai, toh Product ka Naya Variant utha lo
                        fetchedVariantId = matchedEdge.node.product.variants.edges[0].node.id.replace("gid://shopify/ProductVariant/", "");
                    }
                }
            }
        } catch (apiErr) {
            console.error("Error fetching data for Order", orderName, apiErr);
        }



        const existing = await prisma.giftSubscription.findFirst({ where: { orderId: cleanOrderId } });



        if (!existing) {
            const readingTastes = {
              orderNote: orderNote,          
              attributes: noteAttributes,    
              genres: ["Migrated Data"],
              authors: "N/A",
              petPeeves: "N/A"
            };



            await prisma.giftSubscription.create({
                data: {
                  orderId: cleanOrderId, 
                  giftCode: giftCode,
                  gifterEmail: email,
                  gifterName: billingName,    
                  gifteeEmail: email,
                  gifteeName: shippingName,    
                  status: finalStatus,
                  deliveryDate: deliveryDateVal,
                  createdAt: new Date(createdAt),    
                  expiresAt: expiryDate,        
                  durationMonths: durationMonths,
                  durationDays: 0,
                  questionnaire: readingTastes,
                  variantId: fetchedVariantId,      // ✅ Save Exact Variant ID
                  customerId: fetchedCustomerId     // ✅ Save Exact Customer ID
                }
            });



            try {
              const finalMutationId = trueOrderGid || `gid://shopify/Order/${cleanOrderId}`;
              await admin.graphql(
                `mutation updateMigratedOrder($id: ID!, $note: String!, $tags: [String!]!) {
                  orderUpdate(input: {id: $id, note: $note}) { userErrors { message } }
                  tagsAdd(id: $id, tags: $tags) { userErrors { message } }
                }`,
                { variables: { id: finalMutationId, note: newNote, tags: tagsToAdd } }
              );
            } catch (graphqlErr) {
              console.error(`GraphQL update failed for Order #${orderName}:`, graphqlErr);
            }



            processedNames.add(orderName);
            processedCount++;



            migratedOrders.push({ 
              orderName, 
              plan: lineItem, 
              categoryLabel,
              code: giftCode,
              variantId: fetchedVariantId, // UI Display
              status: finalStatus === "EMAIL_SENT_PENDING_QUESTIONNAIRE" ? "WAITING (Unfulfilled)" : finalStatus, 
              startDate: deliveryDateVal.toLocaleDateString("en-GB"), 
              expiryDate: expiryDate ? expiryDate.toLocaleDateString("en-GB") : "Pending Fulfillment",
              gifter: billingName, 
              giftee: shippingName 
            });
        }
    } catch (err) {
        console.error(`Row ${i} failed:`, err);
    }
  }



  return Response.json({ 
      success: true, 
      message: `Successfully migrated ${processedCount} orders. Missing Variant IDs were dynamically fetched via Product Fallback.`,
      details: migratedOrders
  });
};



export default function MigrateCSV() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [fileSelected, setFileSelected] = useState(false);



  const getBadgeTone = (status) => {
      if (status.includes("EXPIRED")) return "critical";
      if (status.includes("WAITING")) return "warning";
      return "success";
  };



  return (
    <AppProvider i18n={enTranslations}>
      <Frame>
        <Page title="Smart Data Migration Tool (with Renewals)">
          <BlockStack gap="500">
            {actionData?.error && (
              <Banner tone="critical" title="Migration Failed">
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData?.success && (
              <Banner tone="success" title="Migration Completed">
                <p>{actionData.message}</p>
              </Banner>
            )}



            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Import Old Subscriptions from CSV</Text>
                <Text as="p" tone="subdued">
                  Upload your <b>orders_export (X).csv</b> file below.
                </Text>
                <ul style={{ paddingLeft: "20px", color: "#616161", fontSize: "14px", lineHeight: "1.6" }}>
                  <li><b>Variant ID Sync:</b> Automatically fetches Shopify Variant IDs. If the old variant was deleted, it securely fetches the current active variant.</li>
                  <li><b>Fulfilled Orders:</b> Timer calculates strictly from the <b>Fulfilled at</b> date.</li>
                  <li><b>Unfulfilled Orders:</b> Safely imported as <b>WAITING</b>. Expiry timer will ONLY start when fulfilled.</li>
                </ul>



                <Form method="post" encType="multipart/form-data">
                  <BlockStack gap="400">
                    <input 
                      type="file" name="csvFile" accept=".csv" required 
                      onChange={(e) => setFileSelected(e.target.files.length > 0)}
                      style={{ padding: "10px", border: "1px dashed #ccc", borderRadius: "8px", width: "100%" }}
                    />
                    <InlineStack>
                      <Button submit variant="primary" loading={isSubmitting} disabled={!fileSelected}>
                        Run Smart Migration
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>



            {actionData?.details && actionData.details.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Processed Orders ({actionData.details.length})</Text>
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {actionData.details.map((order, idx) => (
                      <li key={idx} style={{ padding: "12px 0", borderBottom: "1px solid #ebebeb" }}>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <InlineStack gap="200">
                              <Text fontWeight="bold">#{order.orderName}</Text>
                              <Badge tone="info">{order.categoryLabel}</Badge>
                              <Badge>{order.code}</Badge>
                            </InlineStack>
                            <Badge tone={getBadgeTone(order.status)}>
                              {order.status}
                            </Badge>
                          </InlineStack>
                          <Text variant="bodySm"><b>Plan:</b> {order.plan}</Text>
                          <Text variant="bodySm"><b>From:</b> {order.gifter} ➡ <b>To:</b> {order.giftee}</Text>
                          <Text variant="bodySm" tone="subdued">
                            <b>Fulfillment/Start:</b> {order.startDate} | <b>Expiry:</b> {order.expiryDate}
                          </Text>
                          
                          <div style={{ marginTop: "4px", display: "inline-block", background: order.variantId ? "#dcfce3" : "#fee2e2", color: order.variantId ? "#166534" : "#991b1b", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600" }}>
                            {order.variantId ? `Variant ID Set: ${order.variantId} ✅` : "Variant ID Not Found ❌"}
                          </div>



                        </BlockStack>
                      </li>
                    ))}
                  </ul>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
          <div style={{ paddingBottom: '60px' }}></div>
        </Page>
      </Frame>
    </AppProvider>
  );
}