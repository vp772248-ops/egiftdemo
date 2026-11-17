import React, { useState, useCallback, useEffect } from "react";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "react-router";
import {
  AppProvider, Page, Card, Button, DataTable, Text, Badge, InlineStack, Modal, Toast, Frame
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import enTranslations from '@shopify/polaris/locales/en.json';
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }) {
  await authenticate.admin(request);
  const templates = await prisma.singleProductForm.findMany({
    orderBy: { createdAt: "desc" }
  });
  return Response.json({ templates });
}

export async function action({ request }) {
  await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const id = formData.get("id");

  if (actionType === "delete" && id) {
    try {
      await prisma.singleProductForm.delete({ where: { id } });
      // 🟢 FIX: Return JSON so we can display a success toast
      return Response.json({ success: true, message: "Form deleted successfully" });
    } catch (e) {
      return Response.json({ success: false, message: "Failed to delete form" });
    }
  }
  return Response.json({ success: false, message: "Invalid action" });
}

export default function SingleProductList() {
  const { templates } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const submit = useSubmit();

  // 🟢 Custom Polaris Modal and Toast States
  const [deleteModalActive, setDeleteModalActive] = useState(false);
  const [formToDelete, setFormToDelete] = useState(null);
  
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
    setFormToDelete(id);
    setDeleteModalActive(true);
  };

  const confirmDelete = () => {
    if (formToDelete) {
      const formData = new FormData();
      formData.append("actionType", "delete");
      formData.append("id", formToDelete);
      // preventScrollReset and replace keeps us on the same page seamlessly
      submit(formData, { method: "post", preventScrollReset: true, replace: true });
    }
    setDeleteModalActive(false);
    setFormToDelete(null);
  };

  const cancelDelete = () => {
    setDeleteModalActive(false);
    setFormToDelete(null);
  };

  const rows = templates.map((template) => {
    let assignedCount = 0;
    try {
      const prods = JSON.parse(template.products);
      assignedCount = prods.length;
    } catch (e) {}

    const dateCreated = new Date(template.createdAt).toLocaleDateString();

    return [
      <Text fontWeight="bold" as="span">{template.title}</Text>,
      <Badge tone={assignedCount > 0 ? "success" : "attention"}>
        {assignedCount} Products
      </Badge>,
      dateCreated,
      <InlineStack gap="300">
        <Button onClick={() => navigate(`/app/single-product-builder?id=${template.id}`)}>Edit</Button>
        <Button tone="critical" variant="plain" onClick={() => handleDeleteClick(template.id)}>Delete</Button>
      </InlineStack>
    ];
  });
  
  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} error={toastError} onDismiss={toggleToastActive} duration={3000} />
  ) : null;

  return (
    <AppProvider i18n={enTranslations}>
      <Frame>
        {toastMarkup}
        <Page
          title="Single Product Forms"
          primaryAction={{
            content: "Create New Form",
            onAction: () => navigate("/app/single-product-builder")
          }}
        >
          <Card padding="0">
            {templates.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <Text tone="subdued" as="span">No single product forms created yet.</Text>
              </div>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Template Name", "Assigned Products", "Date Created", "Actions"]}
                rows={rows}
              />
            )}
          </Card>
        </Page>
        
        {/* 🟢 Professional Polaris Confirmation Modal */}
        <Modal
          open={deleteModalActive}
          onClose={cancelDelete}
          title="Delete Single Product Form"
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
            <p>Are you sure you want to delete this form? This action cannot be undone.</p>
          </Modal.Section>
        </Modal>
      </Frame>
    </AppProvider>
  );
}