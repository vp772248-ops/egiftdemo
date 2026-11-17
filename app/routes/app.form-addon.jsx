import React, { useState, useCallback, useEffect } from "react";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "react-router";
import { Page, Card, IndexTable, Text, Badge, Button, InlineStack, Box, AppProvider, Modal, Toast, Frame } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import enTranslations from '@shopify/polaris/locales/en.json';
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }) {
  await authenticate.admin(request);
  const templateModel = prisma.addonTemplate || prisma.AddonTemplate;

  if (!templateModel) return { addons: [] };

  const addons = await templateModel.findMany({ orderBy: { createdAt: "desc" } });
  return { addons };
}

export async function action({ request }) {
  await authenticate.admin(request);
  const formData = await request.formData();
  const id = formData.get("id");

  const templateModel = prisma.addonTemplate || prisma.AddonTemplate;
  if (id && templateModel) {
    try {
      await templateModel.delete({ where: { id } });
      // 🟢 FIX: JSON return kiya taaki toast dikhe, bina redirect kiye
      return Response.json({ success: true, message: "Addon template deleted successfully" });
    } catch (e) {
      return Response.json({ success: false, message: "Failed to delete template" });
    }
  }
  return Response.json({ success: false, message: "Invalid action" });
}

export default function AddonsList() {
  const { addons } = useLoaderData() || { addons: [] };
  const actionData = useActionData();
  const navigate = useNavigate();
  const submit = useSubmit();

  // 🟢 Polaris Modal & Toast states
  const [deleteModalActive, setDeleteModalActive] = useState(false);
  const [addonToDelete, setAddonToDelete] = useState(null);
  
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  useEffect(() => {
    if (actionData) {
      setToastMessage(actionData.message);
      setToastError(!actionData.success);
      setToastActive(true);
    }
  }, [actionData]);

  const toggleToastActive = useCallback(() => setToastActive((active) => !active), []);

  const handleDeleteClick = (id) => {
    setAddonToDelete(id);
    setDeleteModalActive(true);
  };

  const confirmDelete = () => {
    if (addonToDelete) {
      const fd = new FormData();
      fd.append("id", addonToDelete);
      // preventScrollReset and replace keeps us on the same page
      submit(fd, { method: "post", preventScrollReset: true, replace: true });
    }
    setDeleteModalActive(false);
    setAddonToDelete(null);
  };

  const cancelDelete = () => {
    setDeleteModalActive(false);
    setAddonToDelete(null);
  };

  const rowMarkup = (addons || []).map(({ id, title, mainProducts, addonsData, status, createdAt }, index) => {
    let mainCount = 0;
    let addonCount = 0;
    try { mainCount = JSON.parse(mainProducts || "[]").length; } catch(e) {}
    try { addonCount = JSON.parse(addonsData || "[]").length; } catch(e) {}

    return (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell><Text variant="bodyMd" fontWeight="bold" as="span">{title}</Text></IndexTable.Cell>
        <IndexTable.Cell><Badge tone={status === "Active" ? "success" : "info"}>{status}</Badge></IndexTable.Cell>
        <IndexTable.Cell>{mainCount} Products</IndexTable.Cell>
        <IndexTable.Cell>{addonCount} Addons</IndexTable.Cell>
        <IndexTable.Cell>{new Date(createdAt).toLocaleDateString()}</IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200">
            <Button size="slim" onClick={() => navigate(`/app/form-addon-builder?id=${id}`)}>Edit</Button>
            <Button size="slim" tone="critical" onClick={() => handleDeleteClick(id)}>Delete</Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });
  
  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} error={toastError} onDismiss={toggleToastActive} duration={3000} />
  ) : null;

  return (
    <AppProvider i18n={enTranslations}>
      <Frame>
        {toastMarkup}
        <Page 
          title="Addon Product Templates" 
          primaryAction={{ content: 'Create New Addon', onAction: () => navigate('/app/form-addon-builder') }}
        >
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: 'addon', plural: 'addons' }}
              itemCount={(addons || []).length}
              headings={[
                { title: 'Template Name' }, { title: 'Status' }, { title: 'Main Products' },
                { title: 'Addon Items' }, { title: 'Date Created' }, { title: 'Actions' }
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
            {(!addons || addons.length === 0) && (
              <Box padding="400">
                <Text tone="subdued" alignment="center">No addon templates found. Click "Create New Addon" to get started.</Text>
              </Box>
            )}
          </Card>
        </Page>
        
        {/* 🟢 Professional Polaris Modal */}
        <Modal
          open={deleteModalActive}
          onClose={cancelDelete}
          title="Delete Addon Template"
          primaryAction={{
            content: 'Delete',
            onAction: confirmDelete,
            destructive: true,
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: cancelDelete,
            },
          ]}
        >
          <Modal.Section>
            <p>Are you sure you want to delete this addon template? This action cannot be undone.</p>
          </Modal.Section>
        </Modal>
      </Frame>
    </AppProvider>
  );
}