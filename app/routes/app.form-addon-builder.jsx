import React, { useState } from "react";
import { useSubmit, useNavigation, useLoaderData, useNavigate, redirect, useActionData } from "react-router";
import {
  AppProvider, Page, Text, Box, BlockStack, TextField, InlineStack, 
  Card, Button, Layout, Divider, Tabs, Badge, Thumbnail, Frame
} from "@shopify/polaris";
import { DeleteIcon, ImageIcon } from '@shopify/polaris-icons';
import { authenticate } from "../shopify.server";
import prisma from "../db.server"; 
import enTranslations from '@shopify/polaris/locales/en.json';
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const templateModel = prisma.addonTemplate || prisma.AddonTemplate;
  
  let addonTemplate = null;
  if (templateModel && id) {
    try { addonTemplate = await templateModel.findUnique({ where: { id } }); } catch(e) {}
  }
  return { addonTemplate };
}

export async function action({ request }) {
  await authenticate.admin(request); 
  const formData = await request.formData();
  
  const id = formData.get("id");
  const title = formData.get("title") || "Untitled Addon Template";
  const status = formData.get("status") || "Active"; 
  const mainProducts = formData.get("mainProducts") || "[]"; 
  const addonsData = formData.get("addonsData") || "[]"; 
  const customGiftData = formData.get("customGiftData") || "[]"; 

  const templateModel = prisma.addonTemplate || prisma.AddonTemplate;
  if (!templateModel) return Response.json({ success: false, message: "Database error." });

  try {
    let savedForm;
    if (id) {
      savedForm = await templateModel.update({ 
        where: { id }, 
        data: { title, status, mainProducts, addonsData, customGiftData } 
      });
    } else {
      savedForm = await templateModel.create({ 
        data: { title, status, mainProducts, addonsData, customGiftData } 
      });
    }
    return Response.json({ success: true, message: "Template saved successfully", formId: savedForm.id });
  } catch (error) { 
    return Response.json({ success: false, error: true, message: error.message }); 
  }
}

export default function AddonBuilder() {
  const actionData = useActionData();
  const { addonTemplate } = useLoaderData() || {}; 
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSaving = navigation.state === "submitting";

  const [title, setTitle] = useState(addonTemplate?.title || "New Addon Setup");
  const [status, setStatus] = useState(addonTemplate?.status || "Active");
  const [activeTab, setActiveTab] = useState(0); 

  const [mainProducts, setMainProducts] = useState(addonTemplate?.mainProducts ? JSON.parse(addonTemplate.mainProducts) : []);
  
  const [addons, setAddons] = useState(() => {
    if (!addonTemplate?.addonsData) return [];
    try {
      const parsedData = JSON.parse(addonTemplate.addonsData);
      return parsedData.map(addon => ({
        ...addon,
        variants: addon.variants.map(v => ({
          ...v,
          title: v.title === 'Default Title' ? addon.productTitle : v.title
        }))
      }));
    } catch (e) {
      return [];
    }
  }); 

  // 🟢 Custom Gifts state initialized exactly like Addons state (nested variants format)
  const [customGifts, setCustomGifts] = useState(() => {
    if (!addonTemplate?.customGiftData) return [];
    try {
      const parsedData = JSON.parse(addonTemplate.customGiftData);
      return parsedData.map(gift => {
        // If data is in the old flat format, migrate it to the nested variant format on the fly
        if (!gift.variants) {
           return {
             productId: gift.id,
             productTitle: gift.title,
             image: gift.image,
             variants: [{
               variantId: gift.variantId || gift.id,
               title: gift.title,
               originalPrice: gift.originalPrice || "0.00",
               customPrice: gift.customPrice || "0.00",
               image: gift.image
             }]
           };
        }
        return {
          ...gift,
          variants: gift.variants.map(v => ({
            ...v,
            title: v.title === 'Default Title' ? gift.productTitle : v.title
          }))
        };
      });
    } catch(e) {
      return [];
    }
  });

  // --- Handlers for Main Products (Tab 1) ---
  const openMainProductPicker = async () => {
    const selected = await shopify.resourcePicker({ 
      type: "product", multiple: true, selectionIds: mainProducts.map(p => ({ id: p.id })) 
    });
    if (selected) {
      setMainProducts(selected.map(p => ({ id: p.id, title: p.title, status: p.status, image: p.images?.[0]?.originalSrc || "" })));
    }
  };
  const removeMainProduct = (idx) => setMainProducts(mainProducts.filter((_, i) => i !== idx));

  // --- Handlers for Addon Products (Tab 2) ---
  const openAddonPicker = async () => {
    const selectedVariantIds = addons.map(addon => ({
      id: addon.productId,
      variants: addon.variants.map(v => ({ id: v.variantId }))
    }));

    const selected = await shopify.resourcePicker({ 
      type: "product", 
      multiple: true,
      action: "select",
      selectionIds: selectedVariantIds 
    });
    
    if (selected) {
      const selectedAddons = selected.map(prod => {
        const existingAddon = addons.find(a => a.productId === prod.id);
        
        return {
          productId: prod.id,
          productTitle: prod.title,
          image: prod.images?.[0]?.originalSrc || "",
          variants: prod.variants.map(v => {
            let vImage = "";
            if (v.image && (v.image.originalSrc || v.image.src)) {
               vImage = v.image.originalSrc || v.image.src;
            }
            const existingVariant = existingAddon ? existingAddon.variants.find(ev => ev.variantId === v.id) : null;
            return {
              variantId: v.id,
              title: v.title === 'Default Title' ? prod.title : v.title,
              originalPrice: v.price,
              customPrice: existingVariant ? existingVariant.customPrice : v.price,
              image: vImage
            };
          })
        };
      });
      setAddons(selectedAddons);
    }
  };

  const handleCustomPriceChange = (addonIndex, variantIndex, newPrice) => {
    const updatedAddons = [...addons];
    updatedAddons[addonIndex].variants[variantIndex].customPrice = newPrice;
    setAddons(updatedAddons);
  };

  const removeAddonProduct = (index) => {
    const updated = [...addons];
    updated.splice(index, 1);
    setAddons(updated);
  };

  const removeVariant = (addonIndex, variantIndex) => {
    const updated = [...addons];
    updated[addonIndex].variants.splice(variantIndex, 1);
    setAddons(updated);
  };

  // --- Handlers for Custom Gift (Tab 3) - COMPLETELY MIRRORS TAB 2 ---
  const openCustomGiftPicker = async () => {
    const selectedVariantIds = customGifts.map(gift => ({
      id: gift.productId,
      variants: gift.variants.map(v => ({ id: v.variantId }))
    }));

    const selected = await shopify.resourcePicker({ 
      type: "product", 
      multiple: true,
      action: "select",
      selectionIds: selectedVariantIds 
    });
    
    if (selected) {
      const updatedGifts = selected.map(prod => {
        const existingGift = customGifts.find(g => g.productId === prod.id);
        
        return {
          productId: prod.id,
          productTitle: prod.title,
          image: prod.images?.[0]?.originalSrc || "",
          variants: prod.variants.map(v => {
            let vImage = "";
            if (v.image && (v.image.originalSrc || v.image.src)) {
               vImage = v.image.originalSrc || v.image.src;
            }
            const existingVariant = existingGift ? existingGift.variants.find(ev => ev.variantId === v.id) : null;
            return {
              variantId: v.id,
              title: v.title === 'Default Title' ? prod.title : v.title,
              originalPrice: v.price,
              customPrice: existingVariant ? existingVariant.customPrice : v.price,
              image: vImage
            };
          })
        };
      });
      setCustomGifts(updatedGifts);
    }
  };
  
  const handleGiftCustomPriceChange = (giftIndex, variantIndex, newPrice) => {
    const updatedGifts = [...customGifts];
    updatedGifts[giftIndex].variants[variantIndex].customPrice = newPrice;
    setCustomGifts(updatedGifts);
  };

  const removeCustomGiftProduct = (index) => {
    const updated = [...customGifts];
    updated.splice(index, 1);
    setCustomGifts(updated);
  };

  const removeCustomGiftVariant = (giftIndex, variantIndex) => {
    const updated = [...customGifts];
    updated[giftIndex].variants.splice(variantIndex, 1);
    setCustomGifts(updated);
  };

  // --- Save Form ---
  const handleSave = () => {
    const formData = new FormData();
    if (addonTemplate?.id) {
      formData.append("id", addonTemplate.id);
    } else if (actionData?.formId) {
      formData.append("id", actionData.formId);
    }
    formData.append("title", title);
    formData.append("status", status); 
    formData.append("mainProducts", JSON.stringify(mainProducts));
    formData.append("addonsData", JSON.stringify(addons));
    formData.append("customGiftData", JSON.stringify(customGifts)); 
    
    submit(formData, { 
      method: "post",
      preventScrollReset: true,
      replace: true, 
    });
  };

  const [saveMessage, setSaveMessage] = useState({ text: "", type: "", show: false });
  
  React.useEffect(() => {
    if (actionData) {
      setSaveMessage({
        text: actionData.message,
        type: actionData.success ? "success" : "critical",
        show: true
      });
      const timer = setTimeout(() => {
        setSaveMessage(prev => ({ ...prev, show: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);

  return (
    <AppProvider i18n={enTranslations}>
      <Frame>
      <Page 
        backAction={{ content: 'Back', onAction: () => navigate('/app/form-addon') }}
        titleMetadata={
          <InlineStack gap="400" blockAlign="center">
            <Badge tone={status === "Active" ? "success" : "info"}>{status}</Badge>
            {saveMessage.show && (
              <div style={{
                background: saveMessage.type === "success" ? "#dcfce3" : "#fee2e2",
                color: saveMessage.type === "success" ? "#15803d" : "#b91c1c",
                padding: "4px 12px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                transition: "opacity 0.3s ease-in-out"
              }}>
                {saveMessage.type === "success" ? "✓" : "❌"} {saveMessage.text}
              </div>
            )}
          </InlineStack>
        }
        primaryAction={<Button variant="primary" onClick={handleSave} loading={isSaving}>Save Addon Template</Button>}
      >
        <BlockStack gap="500">
          <InlineStack align="start" blockAlign="center" gap="400">
            <Box width="300px"><TextField value={title} onChange={setTitle} autoComplete="off" placeholder="Template Title" /></Box>
            <Button onClick={() => setStatus(status === "Active" ? "Draft" : "Active")} tone={status === "Active" ? "success" : undefined} pressed={status === "Active"}>{status === "Active" ? "Active" : "Draft"}</Button>
          </InlineStack>

          <Card padding="0">
            <Tabs 
              tabs={[
                {id: 'main-products', content: '1. Select Main Product'}, 
                {id: 'assign-addons', content: '2. Assign Addon Products'},
                {id: 'custom-gift', content: '3. Custom Gift'} 
              ]} 
              selected={activeTab} 
              onSelect={setActiveTab} 
            />
          </Card>

          <Layout>
            <Layout.Section>
              {/* TAB 1: MAIN PRODUCTS */}
              {activeTab === 0 && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <div>
                        <Text variant="headingMd" as="h2">Select Main Subscription Products</Text>
                        <Text tone="subdued" as="p">These are the primary subscriptions (e.g. Fiction Box) that will trigger the addons.</Text>
                      </div>
                      <Button variant="plain" tone="critical" onClick={() => setMainProducts([])}>Clear all</Button>
                    </InlineStack>
                    <Divider />
                    
                    <Box padding="300"><Button onClick={openMainProductPicker}>Browse Main Products</Button></Box>
                    <Divider />
                    
                    {mainProducts.map((prod, idx) => (
                      <div key={idx}>
                        <Box padding="200">
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="300" align="center"><Thumbnail source={prod.image || ImageIcon} alt={prod.title} size="small" /><Text variant="bodyMd" fontWeight="bold">{prod.title}</Text></InlineStack>
                            <InlineStack gap="300" align="center"><Badge tone={prod.status === "ACTIVE" ? "success" : "info"}>{prod.status || "Active"}</Badge><Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => removeMainProduct(idx)} /></InlineStack>
                          </InlineStack>
                        </Box>
                        <Divider />
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* TAB 2: ADDON PRODUCTS */}
              {activeTab === 1 && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <div>
                        <Text variant="headingMd" as="h2">Assign Addon Products</Text>
                        <Text tone="subdued" as="p">Select extra products (like Chocolate, Logbook) to offer with the main product.</Text>
                      </div>
                      <Button variant="plain" tone="critical" onClick={() => setAddons([])}>Clear all</Button>
                    </InlineStack>
                    <Divider />
                    
                    <Box padding="300"><Button onClick={openAddonPicker}>+ Browse Addon Products</Button></Box>
                    
                    {addons.length > 0 && <Divider />}
                    {addons.map((addon, aIndex) => (
                      <div key={addon.productId}>
                        <Box padding="300" background="bg-surface-secondary">
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="300" blockAlign="center">
                              <Thumbnail source={addon.image || ImageIcon} alt={addon.productTitle} size="small" />
                              <Text variant="headingSm">{addon.productTitle}</Text>
                            </InlineStack>
                            <Button variant="plain" tone="critical" onClick={() => removeAddonProduct(aIndex)}>Remove Entire Addon</Button>
                          </InlineStack>
                          
                          <Box paddingBlockStart="400" paddingInlineStart="600">
                            <Text variant="bodySm" fontWeight="bold">Variants & Reading Prices:</Text>
                            <BlockStack gap="200" align="start">
                              {addon.variants.map((variant, vIndex) => (
                                <Box key={variant.variantId} background="bg-surface" padding="300" borderRadius="200" borderColor="border" borderWidth="025" width="100%">
                                  <InlineStack align="space-between" blockAlign="center">
                                    <InlineStack gap="300" blockAlign="center">
                                      <Thumbnail source={variant.image || ImageIcon} alt={variant.title} size="small" />
                                      <Text as="span" fontWeight="medium">{variant.title}</Text>
                                    </InlineStack>
                                    <InlineStack gap="300" blockAlign="center">
                                      <Text as="span" tone="subdued">Original: £{variant.originalPrice}</Text>
                                      <div style={{ width: '120px' }}>
                                        <TextField 
                                          type="number" 
                                          prefix="£" 
                                          value={variant.customPrice} 
                                          onChange={(val) => handleCustomPriceChange(aIndex, vIndex, val)} 
                                          autoComplete="off" 
                                        />
                                      </div>
                                      <Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => removeVariant(aIndex, vIndex)} />
                                    </InlineStack>
                                  </InlineStack>
                                </Box>
                              ))}
                              {addon.variants.length === 0 && <Text tone="subdued">No variants selected.</Text>}
                            </BlockStack>
                          </Box>
                        </Box>
                        <Divider />
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* TAB 3: CUSTOM GIFT (NOW IDENTICAL TO TAB 2) */}
              {activeTab === 2 && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <div>
                        <Text variant="headingMd" as="h2">Custom Gift Products</Text>
                        <Text tone="subdued" as="p">Select products to be offered specifically as Custom Gifts.</Text>
                      </div>
                      <Button variant="plain" tone="critical" onClick={() => setCustomGifts([])}>Clear all</Button>
                    </InlineStack>
                    <Divider />
                    
                    <Box padding="300"><Button onClick={openCustomGiftPicker}>+ Browse Custom Gift Products</Button></Box>
                    
                    {customGifts.length > 0 && <Divider />}
                    {customGifts.map((gift, gIndex) => (
                      <div key={gift.productId}>
                        <Box padding="300" background="bg-surface-secondary">
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="300" blockAlign="center">
                              <Thumbnail source={gift.image || ImageIcon} alt={gift.productTitle} size="small" />
                              <Text variant="headingSm">{gift.productTitle}</Text>
                            </InlineStack>
                            <Button variant="plain" tone="critical" onClick={() => removeCustomGiftProduct(gIndex)}>Remove Entire Gift</Button>
                          </InlineStack>
                          
                          <Box paddingBlockStart="400" paddingInlineStart="600">
                            <Text variant="bodySm" fontWeight="bold">Variants & Custom Prices:</Text>
                            <BlockStack gap="200" align="start">
                              {gift.variants && gift.variants.map((variant, vIndex) => (
                                <Box key={variant.variantId} background="bg-surface" padding="300" borderRadius="200" borderColor="border" borderWidth="025" width="100%">
                                  <InlineStack align="space-between" blockAlign="center">
                                    <InlineStack gap="300" blockAlign="center">
                                      <Thumbnail source={variant.image || ImageIcon} alt={variant.title} size="small" />
                                      <Text as="span" fontWeight="medium">{variant.title}</Text>
                                    </InlineStack>
                                    <InlineStack gap="300" blockAlign="center">
                                      <Text as="span" tone="subdued">Original: £{variant.originalPrice}</Text>
                                      <div style={{ width: '120px' }}>
                                        <TextField 
                                          type="number" 
                                          prefix="£" 
                                          value={variant.customPrice} 
                                          onChange={(val) => handleGiftCustomPriceChange(gIndex, vIndex, val)} 
                                          autoComplete="off" 
                                        />
                                      </div>
                                      <Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => removeCustomGiftVariant(gIndex, vIndex)} />
                                    </InlineStack>
                                  </InlineStack>
                                </Box>
                              ))}
                              {(!gift.variants || gift.variants.length === 0) && <Text tone="subdued">No variants selected.</Text>}
                            </BlockStack>
                          </Box>
                        </Box>
                        <Divider />
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              )}
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
      </Frame>
    </AppProvider>
  );
}