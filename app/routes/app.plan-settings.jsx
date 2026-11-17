import React, { useState, useEffect, useCallback } from "react";

import { useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";

import {

  AppProvider,

  Page,

  Card,

  BlockStack,

  TextField,

  Select,

  Button,

  DataTable,

  Text,

  InlineStack,

  Box,

  Frame,

  Toast,

  Layout,

  Modal,

  ButtonGroup

} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

import prisma from "../db.server";

import enTranslations from '@shopify/polaris/locales/en.json';

import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
 
export const links = () => [

  { rel: "stylesheet", href: polarisStyles },

];
 
export const loader = async ({ request }) => {

  await authenticate.admin(request);

  const plans = await prisma.planMapping.findMany({ orderBy: { createdAt: "desc" } });

  return { plans };

};
 
export const action = async ({ request }) => {

  await authenticate.admin(request);

  const formData = await request.formData();

  const actionType = formData.get("actionType");
 
  try {

    if (actionType === "create") {

      await prisma.planMapping.create({

        data: {

          keyword: formData.get("keyword").toLowerCase().trim(),

          durationQty: parseInt(formData.get("durationQty")),

          durationType: formData.get("durationType"),

        }

      });

      return { success: true, message: "Plan Rule added successfully!" };

    } 

    else if (actionType === "update") {

      await prisma.planMapping.update({

        where: { id: formData.get("id") },

        data: {

          keyword: formData.get("keyword").toLowerCase().trim(),

          durationQty: parseInt(formData.get("durationQty")),

          durationType: formData.get("durationType"),

        }

      });

      return { success: true, message: "Plan Rule updated successfully!" };

    }

    else if (actionType === "delete") {

      await prisma.planMapping.delete({ where: { id: formData.get("id") } });

      return { success: true, message: "Plan Rule deleted successfully!" };

    }

  } catch (error) {

    return { error: true, message: "Keyword might already exist or invalid input." };

  }

  return null;

};
 
export default function PlanSettings() {

  const { plans } = useLoaderData();

  const actionData = useActionData();

  const submit = useSubmit();

  const navigation = useNavigation();

  const isLoading = navigation.state === "submitting";
 
  // New Rule Form States

  const [keyword, setKeyword] = useState("");

  const [durationQty, setDurationQty] = useState("");

  const [durationType, setDurationType] = useState("MONTHS");
 
  // Edit Modal States

  const [editModalActive, setEditModalActive] = useState(false);

  const [editId, setEditId] = useState("");

  const [editKeyword, setEditKeyword] = useState("");

  const [editDurationQty, setEditDurationQty] = useState("");

  const [editDurationType, setEditDurationType] = useState("MONTHS");
 
  // Delete Modal States

  const [deleteModalActive, setDeleteModalActive] = useState(false);

  const [itemToDelete, setItemToDelete] = useState(null);
 
  // Toast States

  const [toastActive, setToastActive] = useState(false);

  const [toastMessage, setToastMessage] = useState("");

  const [toastError, setToastError] = useState(false);
 
  const toggleToast = useCallback(() => setToastActive((active) => !active), []);
 
  // Show Toast when actionData changes

  useEffect(() => {

    if (actionData) {

      setToastMessage(actionData.message);

      setToastError(actionData.error ? true : false);

      setToastActive(true);

      // Clear main form on successful create

      if (actionData.success && !editModalActive) {

        setKeyword("");

        setDurationQty("");

      }

    }

  }, [actionData]);
 
  // --- ACTIONS ---

  const handleAddPlan = () => {

    if (!keyword || !durationQty) {

      setToastMessage("Please fill in both Keyword and Duration fields.");

      setToastError(true);

      setToastActive(true);

      return;

    }

    const formData = new FormData();

    formData.append("actionType", "create");

    formData.append("keyword", keyword);

    formData.append("durationQty", durationQty);

    formData.append("durationType", durationType);

    submit(formData, { method: "post" });

  };
 
  // Delete Handlers

  const triggerDelete = (id) => {

    setItemToDelete(id);

    setDeleteModalActive(true);

  };
 
  const confirmDelete = () => {

    if (!itemToDelete) return;

    const formData = new FormData();

    formData.append("actionType", "delete");

    formData.append("id", itemToDelete);

    submit(formData, { method: "post" });

    setDeleteModalActive(false);

    setItemToDelete(null);

  };
 
  // Edit Handlers

  const triggerEdit = (plan) => {

    setEditId(plan.id);

    setEditKeyword(plan.keyword);

    setEditDurationQty(plan.durationQty.toString());

    setEditDurationType(plan.durationType);

    setEditModalActive(true);

  };
 
  const confirmEdit = () => {

    if (!editKeyword || !editDurationQty) {

      setToastMessage("Fields cannot be empty.");

      setToastError(true);

      setToastActive(true);

      return;

    }

    const formData = new FormData();

    formData.append("actionType", "update");

    formData.append("id", editId);

    formData.append("keyword", editKeyword);

    formData.append("durationQty", editDurationQty);

    formData.append("durationType", editDurationType);

    submit(formData, { method: "post" });

    setEditModalActive(false);

  };
 
  // --- UI COMPONENTS ---
 
  const toastMarkup = toastActive ? (
<Toast content={toastMessage} error={toastError} onDismiss={toggleToast} duration={4000} />

  ) : null;
 
  const rows = plans.map(plan => [
<Text fontWeight="bold" as="span">{plan.keyword}</Text>,

    `${plan.durationQty} ${plan.durationType}`,
<ButtonGroup>
<Button onClick={() => triggerEdit(plan)} disabled={isLoading}>Edit</Button>
<Button tone="critical" onClick={() => triggerDelete(plan.id)} disabled={isLoading}>Delete</Button>
</ButtonGroup>

  ]);
 
  return (
<AppProvider i18n={enTranslations}>
<Frame>
<Page title="Dynamic Subscription Plans" subtitle="Map product keywords to exact subscription durations.">
<Layout>
<Layout.Section>
<BlockStack gap="500">

                {/* Form Card */}
<Card padding="500">
<BlockStack gap="400">
<Text variant="headingMd" as="h3">Add New Plan Mapping</Text>
<Text tone="subdued">Example: If your product contains "5 min", set Keyword="5 min", Qty=5, Type="Minutes".</Text>
<InlineStack gap="400" align="start">
<div style={{ flex: 1 }}>
<TextField 

                          label="Product Keyword" 

                          value={keyword} 

                          onChange={setKeyword} 

                          placeholder="e.g. 5 min" 

                          autoComplete="off" 

                        />
</div>
<div style={{ flex: 1 }}>
<TextField 

                          label="Duration Quantity" 

                          type="number" 

                          value={durationQty} 

                          onChange={setDurationQty} 

                          placeholder="e.g. 5" 

                          autoComplete="off" 

                        />
</div>
<div style={{ flex: 1 }}>
<Select 

                          label="Duration Type" 

                          options={[

                            {label: 'Minutes', value: 'MINUTES'}, 

                            {label: 'Days', value: 'DAYS'}, 

                            {label: 'Months', value: 'MONTHS'}

                          ]} 

                          value={durationType} 

                          onChange={setDurationType} 

                        />
</div>
</InlineStack>
<div style={{ marginTop: '10px' }}>
<Button variant="primary" onClick={handleAddPlan} loading={isLoading}>

                        Save Plan Rule
</Button>
</div>
</BlockStack>
</Card>
 
                {/* Data Table Card */}
<Card padding="0">
<Box padding="500" borderBottomWidth="025" borderColor="border">
<Text variant="headingMd" as="h3">Active Plan Rules ({plans.length})</Text>
</Box>
<DataTable

                    columnContentTypes={['text', 'text', 'text']}

                    headings={['Keyword in Product', 'Duration Assigned', 'Action']}

                    rows={rows.length > 0 ? rows : [["No rules added yet", "-", "-"]]}

                    hasZebraStriping

                  />
</Card>
 
              </BlockStack>
</Layout.Section>
</Layout>
</Page>
 
        {/* Edit Modal */}
<Modal

          open={editModalActive}

          onClose={() => setEditModalActive(false)}

          title="Edit Plan Rule"

          primaryAction={{

            content: 'Save Changes',

            onAction: confirmEdit,

            loading: isLoading

          }}

          secondaryActions={[

            {

              content: 'Cancel',

              onAction: () => setEditModalActive(false),

            },

          ]}
>
<Modal.Section>
<BlockStack gap="400">
<TextField 

                label="Product Keyword" 

                value={editKeyword} 

                onChange={setEditKeyword} 

                autoComplete="off" 

              />
<TextField 

                label="Duration Quantity" 

                type="number" 

                value={editDurationQty} 

                onChange={setEditDurationQty} 

                autoComplete="off" 

              />
<Select 

                label="Duration Type" 

                options={[

                  {label: 'Minutes', value: 'MINUTES'}, 

                  {label: 'Days', value: 'DAYS'}, 

                  {label: 'Months', value: 'MONTHS'}

                ]} 

                value={editDurationType} 

                onChange={setEditDurationType} 

              />
</BlockStack>
</Modal.Section>
</Modal>
 
        {/* Delete Confirmation Modal */}
<Modal

          open={deleteModalActive}

          onClose={() => setDeleteModalActive(false)}

          title="Delete Plan Rule?"

          primaryAction={{

            content: 'Delete',

            destructive: true,

            onAction: confirmDelete,

            loading: isLoading

          }}

          secondaryActions={[

            {

              content: 'Cancel',

              onAction: () => setDeleteModalActive(false),

            },

          ]}
>
<Modal.Section>
<Text>Are you sure you want to delete this rule? This action cannot be undone.</Text>
</Modal.Section>
</Modal>
 
        {toastMarkup}
</Frame>
</AppProvider>

  );

}
 