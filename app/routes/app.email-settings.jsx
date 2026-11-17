import React, { useState, useCallback, useEffect } from "react";

import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";

import { AppProvider, Frame, Toast, Page, Layout, Card, TextField, BlockStack, Banner } from "@shopify/polaris";

import enTranslations from '@shopify/polaris/locales/en.json';

import "@shopify/polaris/build/esm/styles.css";

import { authenticate } from "../shopify.server";

import prisma from "../db.server";
 
// 1. Data Load Karna

export const loader = async ({ request }) => {

  await authenticate.admin(request);

  let settings = await prisma.emailSettings.findUnique({ where: { id: "default" } });

  if (!settings) {

    settings = await prisma.emailSettings.create({ data: { id: "default" } });

  }

  return settings;

};
 
// 2. Data Save Karna

export const action = async ({ request }) => {

  await authenticate.admin(request);

  const formData = await request.formData();

  await prisma.emailSettings.update({

    where: { id: "default" },

    data: {

      storeDomain: formData.get("storeDomain"),

      senderEmail: formData.get("senderEmail"),

      giftEmailSubject: formData.get("giftEmailSubject"),

      giftEmailHtml: formData.get("giftEmailHtml"),

      renewalEmailSubject: formData.get("renewalEmailSubject"),

      renewalEmailHtml: formData.get("renewalEmailHtml"),

      reminderEmailSubject: formData.get("reminderEmailSubject"),

      reminderEmailHtml: formData.get("reminderEmailHtml"),

      expiryEmailSubject: formData.get("expiryEmailSubject"),

      expiryEmailHtml: formData.get("expiryEmailHtml"),

      personalEmailSubject: formData.get("personalEmailSubject"),

      personalEmailHtml: formData.get("personalEmailHtml"),

      gifterEmailSubject: formData.get("gifterEmailSubject"),

      gifterEmailHtml: formData.get("gifterEmailHtml"),

    }

  });

  return { success: true };

};
 
// 3. UI Component

export default function EmailSettings() {

  const settings = useLoaderData();

  const submit = useSubmit();

  const nav = useNavigation();

  const actionData = useActionData(); 

  const isSaving = nav.state === "submitting";
 
  const [formState, setFormState] = useState(settings);
 
  // Toast State

  const [active, setActive] = useState(false);

  const toggleActive = useCallback(() => setActive((active) => !active), []);
 
  useEffect(() => {

    if (actionData && actionData.success) {

      setActive(true);

    }

  }, [actionData]);
 
  const handleChange = (value, id) => {

    setFormState({ ...formState, [id]: value });

  };
 
  const handleSave = () => {

    const formData = new FormData();

    Object.keys(formState).forEach(key => {

      if (formState[key] !== null) {

        formData.append(key, formState[key]);

      }

    });

    submit(formData, { method: "post" });

  };
 
  const toastMarkup = active ? (
<Toast content="Settings saved successfully!" onDismiss={toggleActive} duration={3000} />

  ) : null;
 
  return (
<AppProvider i18n={enTranslations}>
<Frame>
<Page 

          title="Email & Domain Settings" 

          primaryAction={{

            content: 'Save Settings',

            onAction: handleSave,

            loading: isSaving,

          }}
>
<BlockStack gap="500">
<Layout>
<Layout.Section>
<Banner title="Variables you can use in HTML" status="info">

                  Use <b>{`{{name}}`}</b>, <b>{`{{code}}`}</b>, <b>{`{{link}}`}</b>, <b>{`{{message}}`}</b>, <b>{`{{planName}}`}</b>, <b>{`{{expiryDate}}`}</b>, <b>{`{{gifteeName}}`}</b>, <b>{`{{deliveryDate}}`}</b> dynamically in your templates below.
</Banner>
</Layout.Section>
 
              {/* General Settings - Annotated Layout */}
<Layout.AnnotatedSection

                title="General Settings"

                description="Set your store domain and the sender email address used for all outbound emails."
>
<Card>
<BlockStack gap="400">
<TextField label="Store Domain" value={formState.storeDomain} onChange={(v) => handleChange(v, 'storeDomain')} autoComplete="off" helpText="e.g. testteamplatli.myshopify.com" />
<TextField label="Sender Email" value={formState.senderEmail} onChange={(v) => handleChange(v, 'senderEmail')} autoComplete="off" helpText="e.g. Willoughby Book Club <>" />
</BlockStack>
</Card>
</Layout.AnnotatedSection>
 
              {/* 1. Gift Email */}
<Layout.AnnotatedSection

                title="1. Gift Email (To Receiver)"

                description="This email is sent to the gift recipient on their scheduled delivery date."
>
<Card>
<BlockStack gap="400">
<TextField label="Subject" value={formState.giftEmailSubject} onChange={(v) => handleChange(v, 'giftEmailSubject')} autoComplete="off" />
<TextField label="HTML Content" value={formState.giftEmailHtml} onChange={(v) => handleChange(v, 'giftEmailHtml')} multiline={4} autoComplete="off" />
</BlockStack>
</Card>
</Layout.AnnotatedSection>
 
              {/* 2. Renewal Success */}
<Layout.AnnotatedSection

                title="2. Renewal Success Email"

                description="Sent automatically to the customer when their subscription is successfully renewed."
>
<Card>
<BlockStack gap="400">
<TextField label="Subject" value={formState.renewalEmailSubject} onChange={(v) => handleChange(v, 'renewalEmailSubject')} autoComplete="off" />
<TextField label="HTML Content" value={formState.renewalEmailHtml} onChange={(v) => handleChange(v, 'renewalEmailHtml')} multiline={4} autoComplete="off" />
</BlockStack>
</Card>
</Layout.AnnotatedSection>
 
              {/* 3. Reminder Email */}
<Layout.AnnotatedSection

                title="3. Unredeemed Reminder Email"

                description="Sent to gift recipients who haven't redeemed their gift after 3 days."
>
<Card>
<BlockStack gap="400">
<TextField label="Subject" value={formState.reminderEmailSubject} onChange={(v) => handleChange(v, 'reminderEmailSubject')} autoComplete="off" />
<TextField label="HTML Content" value={formState.reminderEmailHtml} onChange={(v) => handleChange(v, 'reminderEmailHtml')} multiline={4} autoComplete="off" />
</BlockStack>
</Card>
</Layout.AnnotatedSection>
 
              {/* 4. Expiry Email */}
<Layout.AnnotatedSection

                title="4. Plan Expired Email"

                description="Sent when a customer's subscription plan has officially ended."
>
<Card>
<BlockStack gap="400">
<TextField label="Subject" value={formState.expiryEmailSubject} onChange={(v) => handleChange(v, 'expiryEmailSubject')} autoComplete="off" />
<TextField label="HTML Content" value={formState.expiryEmailHtml} onChange={(v) => handleChange(v, 'expiryEmailHtml')} multiline={4} autoComplete="off" />
</BlockStack>
</Card>
</Layout.AnnotatedSection>
 
              {/* 5. Personal Onboarding */}
<Layout.AnnotatedSection

                title="5. Personal Subscription Welcome"

                description="Sent to buyers of Personal Subscriptions to set up their reading tastes."
>
<Card>
<BlockStack gap="400">
<TextField label="Subject" value={formState.personalEmailSubject} onChange={(v) => handleChange(v, 'personalEmailSubject')} autoComplete="off" />
<TextField label="HTML Content" value={formState.personalEmailHtml} onChange={(v) => handleChange(v, 'personalEmailHtml')} multiline={4} autoComplete="off" />
</BlockStack>
</Card>
</Layout.AnnotatedSection>
 
              {/* 6. Gifter Order Confirmation */}
<Layout.AnnotatedSection

                title="6. Order Confirmation (To Buyer)"

                description="Sent to the person who purchased the gift, confirming the delivery date."
>
<Card>
<BlockStack gap="400">
<TextField label="Subject" value={formState.gifterEmailSubject} onChange={(v) => handleChange(v, 'gifterEmailSubject')} autoComplete="off" />
<TextField label="HTML Content" value={formState.gifterEmailHtml} onChange={(v) => handleChange(v, 'gifterEmailHtml')} multiline={4} autoComplete="off" />
</BlockStack>
</Card>
</Layout.AnnotatedSection>
 
            </Layout>
</BlockStack>
<div style={{ paddingBottom: '60px' }}></div>
</Page>

        {toastMarkup}
</Frame>
</AppProvider>

  );

}
 