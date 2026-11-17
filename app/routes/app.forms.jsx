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
  const templateModel = prisma.formTemplate || prisma.FormTemplate;

  if (!templateModel) {
    return { forms: [] };
  }

  const forms = await templateModel.findMany({
    orderBy: { createdAt: "desc" }
  });
  return { forms };
}

export async function action({ request }) {
  await authenticate.admin(request);
  const formData = await request.formData();
  const id = formData.get("id");

  const templateModel = prisma.formTemplate || prisma.FormTemplate;
  if (id && templateModel) {
    await templateModel.delete({ where: { id } });
    // 🟢 Maza yaha hai: ab redirect ke bajay properly response bhej rahe hain taaki toast pop ho
    return Response.json({ success: true, message: "Template deleted successfully" });
  }
  return Response.json({ success: false, message: "Failed to delete template" });
}

export default function FormsList() {
  const { forms } = useLoaderData() || { forms: [] };
  const actionData = useActionData();
  const navigate = useNavigate();
  const submit = useSubmit();

  // 🟢 Polaris Modal aur Toast ke states
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
      const fd = new FormData();
      fd.append("id", formToDelete);
      // preventScrollReset se page yahi ruka rahega
      submit(fd, { method: "post", preventScrollReset: true, replace: true });
    }
    setDeleteModalActive(false);
    setFormToDelete(null);
  };

  const cancelDelete = () => {
    setDeleteModalActive(false);
    setFormToDelete(null);
  };

  const rowMarkup = (forms || []).map(({ id, title, products, createdAt }, index) => {
    let assignedProducts = [];
    try {
      assignedProducts = JSON.parse(products || "[]");
    } catch(e) {}

    return (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">{title}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {assignedProducts.length > 0 ? (
            <Badge tone="success">{assignedProducts.length} Products</Badge>
          ) : (
            <Badge tone="warning">No Products</Badge>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>{new Date(createdAt).toLocaleDateString()}</IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200">
            <Button size="slim" onClick={() => navigate(`/app/form-builder?id=${id}`)}>Edit</Button>
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
          title="Questionnaire Form Templates" 
          primaryAction={{ 
            content: 'Create New Form', 
            onAction: () => navigate('/app/form-builder') 
          }}
        >
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: 'form', plural: 'forms' }}
              itemCount={(forms || []).length}
              headings={[
                { title: 'Template Name' },
                { title: 'Assigned Products' },
                { title: 'Date Created' },
                { title: 'Actions' },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
            {(!forms || forms.length === 0) && (
              <Box padding="400">
                <Text tone="subdued" alignment="center">
                  No form templates found. Click "Create New Form" to get started.
                </Text>
              </Box>
            )}
          </Card>
        </Page>
        
        {/* 🟢 Clean Polaris Modal badsurat alert box ki jagah */}
        <Modal
          open={deleteModalActive}
          onClose={cancelDelete}
          title="Delete Form Template"
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
            <p>Are you sure you want to delete this template? This action cannot be undone.</p>
          </Modal.Section>
        </Modal>
      </Frame>
    </AppProvider>
  );
}