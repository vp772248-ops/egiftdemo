import React, { useState, useCallback, useEffect } from "react";
import { useSubmit, useNavigation, useLoaderData, useNavigate, redirect, useActionData } from "react-router";
import {
  AppProvider, Page, Text, Box, BlockStack, TextField, InlineStack, 
  Card, Button, Popover, ActionList, Layout, Divider, 
  Tabs, Badge, Checkbox, Icon, Select, Thumbnail, Frame
} from "@shopify/polaris";
import { 
  PlusIcon, DeleteIcon, TextIcon, ComposeIcon, ImageIcon, 
  ArrowUpIcon, ArrowDownIcon
} from '@shopify/polaris-icons';
import { authenticate } from "../shopify.server";
import prisma from "../db.server"; 
import enTranslations from '@shopify/polaris/locales/en.json';
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

function getFormModel() {
  const db = prisma?.default || prisma;
  return db?.formTemplate || db?.FormTemplate;
}

export async function loader({ request }) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const templateModel = getFormModel();
  
  let form = null;

  if (templateModel) {
    try {
      if (id) {
        form = await templateModel.findUnique({ where: { id } });
      }
    } catch(e) { console.error(e); }
  }
  return { form };
}

export async function action({ request }) {
  await authenticate.admin(request); 
  const formData = await request.formData();
  
  const id = formData.get("id");
  const title = formData.get("title") || "Untitled Form";
  const status = formData.get("status") || "Active"; 
  const fields = formData.get("fields") || "[]"; 
  const products = formData.get("products") || "[]"; 

  const templateModel = getFormModel();
  if (!templateModel) return Response.json({ success: false, message: "Database error." });

  try {
    let savedForm;
    if (id) {
      savedForm = await templateModel.update({ where: { id }, data: { title, status, fields, products } });
    } else {
      savedForm = await templateModel.create({ data: { title, status, fields, products } });
    }
    return Response.json({ success: true, message: "Form saved successfully", formId: savedForm.id });
  } catch (error) { return Response.json({ success: false, message: error.message }); }
}

export default function FormBuilderAdvanced() {
  const actionData = useActionData();
  const { form } = useLoaderData() || {}; 
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSaving = navigation.state === "submitting";

  const [title, setTitle] = useState(form?.title || "Subscription Setup");
  const [status, setStatus] = useState(form?.status || "Active");
  const [fields, setFields] = useState(form?.fields ? JSON.parse(form.fields) : []);
  const [selectedProducts, setSelectedProducts] = useState(form?.products ? JSON.parse(form.products) : []);
  
  const [popoverActive, setPopoverActive] = useState(false);
  const togglePopoverActive = useCallback(() => setPopoverActive((active) => !active), []);
  const [activeTab, setActiveTab] = useState(0); 

  const [saveMessage, setSaveMessage] = useState({ text: "", type: "", show: false });

  useEffect(() => {
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

  const addField = (type) => {
    let newField = { id: `field_${Date.now()}`, type: type, visibility: "both" };
    
    if (type === 'occasion') {
      newField.label = 'SELECT OCCASION';
      newField.options = [{ label: 'FOR MYSELF' }, { label: 'GIFT' }];
    } else if (type === 'genre') {
      newField.label = 'SELECT GENRE*';
      newField.groups = [
        { label: 'ADULT', collectionHandle: '', collectionTitle: '', collectionId: '' },
        { label: 'CHILD & TEEN', collectionHandle: '', collectionTitle: '', collectionId: '' }
      ];
    } else if (type === 'heading') {
      newField.label = 'New Section Heading';
    } else if (type === 'divider') {
      newField.label = '---';
    } else if (type === 'paragraph') {
      newField.label = 'Enter your text here...';
    } else if (type === 'text_with_link') {
      newField.label = 'If you are not sure about their reading preferences, check out our ';
      newField.linkText = 'gift tins!';
      newField.linkUrl = '';
    } else if (type === 'radio_with_textarea') {
      newField.label = 'Not sure on what to tell us? Choose a prompt!';
      newField.fieldHelpText = "";
      newField.required = false;
      newField.options = [{ value: "Prompt 1" }, { value: "Prompt 2" }];
    } else {
      newField.label = type === 'text' ? "Short Answer Question" : 
                       type === 'textarea' ? "Long Answer Question" : 
                       type === 'radio' ? "Single Choice Question" : 
                       type === 'dropdown' ? "Dropdown Selection" :
                       type === 'date' ? "Select Date" :
                       "Multiple Choice (Checkbox)";
      newField.fieldHelpText = "";
      newField.required = false;
      newField.options = (type === 'radio' || type === 'checkbox' || type === 'dropdown') ? [{ value: "Option 1" }, { value: "Option 2" }] : [];
    }
    setFields([...fields, newField]);
    setPopoverActive(false);
  };

  const removeField = (index) => setFields(fields.filter((_, i) => i !== index));

  const moveField = (index, direction) => {
    if (direction === -1 && index === 0) return; 
    if (direction === 1 && index === fields.length - 1) return; 
    const updatedFields = [...fields];
    const temp = updatedFields[index];
    updatedFields[index] = updatedFields[index + direction];
    updatedFields[index + direction] = temp;
    setFields(updatedFields);
  };

  const updateField = (index, key, value) => {
    const updated = [...fields];
    updated[index][key] = value;
    setFields(updated);
  };

  const updateOptionRow = (fieldIndex, optionIndex, key, value) => {
    const updated = [...fields];
    updated[fieldIndex].options[optionIndex][key] = value;
    setFields(updated);
  };

  const addOptionRow = (fieldIndex) => {
    const updated = [...fields];
    updated[fieldIndex].options.push({ value: `Option ${updated[fieldIndex].options.length + 1}` });
    setFields(updated);
  };

  const removeOptionRow = (fieldIndex, optionIndex) => {
    const updated = [...fields];
    updated[fieldIndex].options.splice(optionIndex, 1);
    setFields(updated);
  };

  const updateGroupLabel = (fieldIndex, groupIndex, value) => {
    const updated = [...fields];
    updated[fieldIndex].groups[groupIndex].label = value;
    setFields(updated);
  };

  const openCollectionPicker = async (fieldIndex, groupIndex) => {
    const currentId = fields[fieldIndex].groups[groupIndex].collectionId;
    const initialSelection = currentId ? [{ id: currentId }] : [];
    const selected = await shopify.resourcePicker({ type: "collection", multiple: false, selectionIds: initialSelection });
    if (selected && selected.length > 0) {
      const updated = [...fields];
      if(updated[fieldIndex].groups) {
        updated[fieldIndex].groups[groupIndex].collectionId = selected[0].id;
        updated[fieldIndex].groups[groupIndex].collectionHandle = selected[0].handle; 
        updated[fieldIndex].groups[groupIndex].collectionTitle = selected[0].title;
        setFields(updated);
      }
    }
  };

  const openProductPicker = async () => {
    const selected = await shopify.resourcePicker({ 
      type: "product", 
      multiple: true, 
      selectionIds: selectedProducts.map(p => ({ id: p.id })) 
    });
    
    if (selected) {
      const allowedProducts = selected.map(p => ({ 
        id: p.id, 
        title: p.title, 
        status: p.status, 
        image: p.images?.[0]?.originalSrc || "" 
      }));
      setSelectedProducts(allowedProducts);
    }
  };

  const openLinkPicker = async (index) => {
    const selected = await shopify.resourcePicker({ type: "collection", multiple: false });
    if (selected && selected.length > 0) {
      updateField(index, "linkUrl", `/collections/${selected[0].handle}`);
    }
  };

  const removeProduct = (idx) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== idx));
  };
  
  const handleSave = () => {
    const formData = new FormData();
    if (form?.id) {
      formData.append("id", form.id);
    } else if (actionData?.formId) {
      formData.append("id", actionData.formId);
    }
    formData.append("title", title);
    formData.append("status", status); 
    formData.append("fields", JSON.stringify(fields));
    formData.append("products", JSON.stringify(selectedProducts));
    
    submit(formData, { 
      method: "post",
      preventScrollReset: true,
      replace: true, 
    });
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Frame>
        <Page 
          backAction={{ content: 'Back', onAction: () => navigate('/app/forms') }}
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
          primaryAction={<Button variant="primary" onClick={handleSave} loading={isSaving}>Save Form</Button>}
        >
          <BlockStack gap="500">
            <InlineStack align="start" blockAlign="center" gap="400">
              <Box width="300px"><TextField value={title} onChange={setTitle} autoComplete="off" placeholder="Form Title" /></Box>
              <Button onClick={() => setStatus(status === "Active" ? "Draft" : "Active")} tone={status === "Active" ? "success" : undefined} pressed={status === "Active"}>{status === "Active" ? "Active" : "Draft"}</Button>
            </InlineStack>

            <Card padding="0"><Tabs tabs={[{id: 'build', content: '1. Build option'}, {id: 'assign', content: '2. Assign products'}]} selected={activeTab} onSelect={setActiveTab} /></Card>

            <Layout>
              <Layout.Section>
                {activeTab === 0 ? (
                  <Card>
                    <BlockStack gap="400">
                      {fields.length === 0 && <Box padding="400"><Text tone="subdued">Add Occasion, Genre, or Questions to get started.</Text></Box>}
                      
                      {fields.map((field, index) => (
                        <Card key={field.id || index} background="bg-surface-secondary">
                          <BlockStack gap="400">
                            <InlineStack align="space-between">
                              <InlineStack gap="200" align="center">
                                <Icon source={field.type === 'textarea' ? ComposeIcon : TextIcon} />
                                <Text variant="headingSm" as="h3" style={{textTransform: 'capitalize'}}>
                                  {field.type === 'occasion' ? 'Occasion Selector' : field.type === 'genre' ? 'Genre Mapping' : field.type.replace('_', ' ')} Block
                                </Text>
                              </InlineStack>
                              
                              <InlineStack gap="200" align="center">
                                <Button variant="plain" icon={ArrowUpIcon} disabled={index === 0} onClick={() => moveField(index, -1)} />
                                <Button variant="plain" icon={ArrowDownIcon} disabled={index === fields.length - 1} onClick={() => moveField(index, 1)} />
                                <Button tone="critical" variant="plain" icon={DeleteIcon} onClick={() => removeField(index)} />
                              </InlineStack>
                            </InlineStack>
                            <Divider />
                            
                            {field.type === 'text_with_link' && (
                              <BlockStack gap="400">
                                <TextField 
                                  label="Text Before Link" 
                                  value={field.label} 
                                  onChange={(val) => updateField(index, "label", val)} 
                                  autoComplete="off" 
                                />
                                <InlineStack gap="400">
                                  <Box width="33%">
                                    <TextField 
                                      label="Clickable Text (e.g. gift tins!)" 
                                      value={field.linkText || ''} 
                                      onChange={(val) => updateField(index, "linkText", val)} 
                                      autoComplete="off" 
                                    />
                                  </Box>
                                  <Box width="66%">
                                    <TextField 
                                      label="URL / Destination" 
                                      value={field.linkUrl || ''} 
                                      onChange={(val) => updateField(index, "linkUrl", val)} 
                                      autoComplete="off"
                                      placeholder="Enter link or browse..."
                                      connectedRight={<Button onClick={() => openLinkPicker(index)}>Browse Collections</Button>}
                                    />
                                  </Box>
                                </InlineStack>
                                <Box width="33%">
                                  <Select 
                                    label="Show this block for:"
                                    options={[{label: 'Both (Gift & Personal)', value: 'both'}, {label: 'Gift Only', value: 'gift'}, {label: 'Personal Only', value: 'personal'}]}
                                    value={field.visibility || 'both'}
                                    onChange={(val) => updateField(index, "visibility", val)}
                                  />
                                </Box>
                              </BlockStack>
                            )}

                            {(field.type === 'heading' || field.type === 'paragraph') && (
                              <BlockStack gap="400">
                                <TextField 
                                  label={field.type === 'heading' ? "Heading Text" : "Paragraph Text"} 
                                  value={field.label} 
                                  onChange={(val) => updateField(index, "label", val)} 
                                  multiline={field.type === 'paragraph' ? 3 : false}
                                  autoComplete="off" 
                                />
                                <Box width="33%">
                                  <Select 
                                    label="Show this block for:"
                                    options={[{label: 'Both (Gift & Personal)', value: 'both'}, {label: 'Gift Only', value: 'gift'}, {label: 'Personal Only', value: 'personal'}]}
                                    value={field.visibility || 'both'}
                                    onChange={(val) => updateField(index, "visibility", val)}
                                  />
                                </Box>
                              </BlockStack>
                            )}

                            {field.type === 'divider' && (
                              <Text tone="subdued">This will render a horizontal line (divider) on the frontend.</Text>
                            )}

                            {(field.type !== 'occasion' && field.type !== 'genre' && field.type !== 'heading' && field.type !== 'divider' && field.type !== 'paragraph' && field.type !== 'text_with_link') && (
                              <BlockStack gap="400">
                                <TextField label="Question Label *" value={field.label} onChange={(val) => updateField(index, "label", val)} autoComplete="off" />
                                <InlineStack gap="400" align="start">
                                  <Box width="33%">
                                    <Select 
                                      label="Show this question for:"
                                      options={[{label: 'Both (Gift & Personal)', value: 'both'}, {label: 'Gift Only', value: 'gift'}, {label: 'Personal Only', value: 'personal'}]}
                                      value={field.visibility || 'both'}
                                      onChange={(val) => updateField(index, "visibility", val)}
                                    />
                                  </Box>
                                  <Box width="33%">
                                    <TextField label="Help Text (Optional)" value={field.fieldHelpText} onChange={(val) => updateField(index, "fieldHelpText", val)} autoComplete="off" />
                                  </Box>
                                  <Box width="33%" paddingBlockStart="600">
                                    <Checkbox label="Required Field" checked={field.required} onChange={(val) => updateField(index, "required", val)} />
                                  </Box>
                                </InlineStack>

                                {/* 👇 NAYA CODE: YAHAN radio_with_textarea JODA GAYA HAI TAAKI OPTION CHOICES DIKHEIN */}
                                {(field.type === 'radio' || field.type === 'checkbox' || field.type === 'dropdown' || field.type === 'radio_with_textarea') && (
                                  <Box paddingBlockStart="300">
                                    <Text variant="headingSm" as="h4">Option Choices</Text>
                                    <Box paddingBlockStart="200" padding="300" background="bg-surface" borderRadius="200" borderColor="border" borderWidth="025">
                                      <BlockStack gap="300">
                                        {field.options?.map((opt, optIdx) => (
                                          <InlineStack gap="300" align="center" wrap={false} key={optIdx}>
                                            <div style={{flex: 1}}><TextField value={opt.value} onChange={(val) => updateOptionRow(index, optIdx, "value", val)} autoComplete="off" /></div>
                                            <div><Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => removeOptionRow(index, optIdx)} /></div>
                                          </InlineStack>
                                        ))}
                                        <div style={{marginTop: '10px'}}><Button variant="plain" icon={PlusIcon} onClick={() => addOptionRow(index)}>Add Choice</Button></div>
                                      </BlockStack>
                                    </Box>
                                  </Box>
                                )}
                              </BlockStack>
                            )}
                          </BlockStack>
                        </Card>
                      ))}

                      <Box paddingBlockStart="200">
                        <Popover active={popoverActive} activator={<Button onClick={togglePopoverActive} icon={PlusIcon}>Add Block</Button>} onClose={togglePopoverActive}>
                          <ActionList actionRole="menuitem" items={[
                              {content: '--- STATIC BLOCKS ---'},
                              {content: 'Heading Text', onAction: () => addField('heading')},
                              {content: 'Normal Paragraph', onAction: () => addField('paragraph')},
                              {content: 'Text with Link (Easy URL)', onAction: () => addField('text_with_link')},
                              {content: 'Divider Line', onAction: () => addField('divider')},
                              {content: '--- INPUT BLOCKS ---'},
                              {content: 'Short Answer (Text)', onAction: () => addField('text')},
                              {content: 'Long Answer (Textarea)', onAction: () => addField('textarea')},
                              {content: 'Single Choice (Radio)', onAction: () => addField('radio')},
                              {content: 'Radio with Textarea', onAction: () => addField('radio_with_textarea')},
                              {content: 'Multiple Choice (Checkbox)', onAction: () => addField('checkbox')},
                              {content: 'Dropdown List (Select)', onAction: () => addField('dropdown')},
                              {content: 'Date Picker', onAction: () => addField('date')}
                            ]}/>
                        </Popover>
                      </Box>
                    </BlockStack>
                  </Card>
                ) : (
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h2">Select products</Text>
                        <Button variant="plain" tone="critical" onClick={() => { setSelectedProducts([]); }}>Clear all</Button>
                      </InlineStack>
                      <Divider />
                      
                      <Box padding="300"><Button onClick={openProductPicker}>Browse Products</Button></Box>
                      <Divider />
                      
                      {selectedProducts.map((prod, idx) => (
                        <div key={idx}>
                          <Box padding="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap="300" align="center"><Thumbnail source={prod.image || ImageIcon} alt={prod.title} size="small" /><Text variant="bodyMd" fontWeight="bold">{prod.title}</Text></InlineStack>
                              <InlineStack gap="300" align="center"><Badge tone={prod.status === "ACTIVE" ? "success" : "info"}>{prod.status || "Active"}</Badge><Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => removeProduct(idx)} /></InlineStack>
                            </InlineStack>
                          </Box>
                          <Divider />
                        </div>
                      ))}
                    </BlockStack>
                  </Card>
                )}
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Live Preview</Text><Divider />
                    <Box paddingBlockStart="200">
                      <BlockStack gap="400">
                        {fields.map((f, i) => (
                          <div key={i} style={{ padding: '0px' }}>
                            <Box paddingBlockEnd="300">
                              <InlineStack align="space-between">
                                {f.type !== 'divider' && f.type !== 'paragraph' && f.type !== 'heading' && f.type !== 'text_with_link' && (
                                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '8px' }}>{f.label || "Untitled"} {f.required && <span style={{color:'red'}}>*</span>}</div>
                                )}
                                {f.visibility && f.visibility !== 'both' && (
                                  <Badge tone={f.visibility === 'gift' ? 'info' : 'success'}>{f.visibility === 'gift' ? 'Gift Only' : 'Personal Only'}</Badge>
                                )}
                              </InlineStack>

                              {f.type === 'heading' && <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#004d40' }}>{f.label}</h3>}
                              {f.type === 'divider' && <hr style={{ border: '0', borderTop: '1px solid #ddd', margin: '10px 0' }} />}
                              {f.type === 'paragraph' && <div style={{ fontSize: '12px', color: '#555' }}>{f.label}</div>}
                              
                              {f.type === 'text_with_link' && (
                                <div style={{ fontSize: '12px', color: '#555' }}>
                                  {f.label} <a href={f.linkUrl || "#"} style={{color: '#004d40', textDecoration: 'underline'}}>{f.linkText || "Link"}</a>
                                </div>
                              )}
                              
                              {f.fieldHelpText && <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>{f.fieldHelpText}</div>}
                              
                              {f.type === 'text' && <div style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', background: '#f9f9f9', color: '#888' }}>Short Answer Input</div>}
                              {f.type === 'textarea' && <div style={{ padding: '8px', height: '40px', border: '1px solid #ccc', borderRadius: '4px', background: '#f9f9f9', color: '#888' }}>Long Answer Input...</div>}
                              {f.type === 'date' && <div style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', background: '#f9f9f9', color: '#888' }}>📅 mm/dd/yyyy</div>}
                              {f.type === 'dropdown' && (
                                <select disabled style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', background: '#f9f9f9', color: '#888' }}>
                                  <option>-- Select --</option>
                                  {f.options?.map((opt, idx) => <option key={idx}>{opt.value}</option>)}
                                </select>
                              )}

                              {/* 👇 NAYA CODE: YAHAN BHI radio_with_textarea JODA GAYA HAI TAAKI PREVIEW ME DIKHE */}
                              {(f.type === 'radio' || f.type === 'checkbox' || f.type === 'radio_with_textarea') && (
                                <BlockStack gap="200">
                                  {f.options?.map((opt, idx) => (
                                    <label key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
                                      <input type={f.type === 'checkbox' ? 'checkbox' : 'radio'} disabled />
                                      <span style={{ fontSize: '13px' }}>{opt.value}</span>
                                    </label>
                                  ))}
                                  {f.type === 'radio_with_textarea' && (
                                    <div style={{ marginTop: '5px', padding: '8px', height: '30px', border: '1px solid #ccc', borderRadius: '4px', background: '#f9f9f9', color: '#888', fontSize: '11px' }}>
                                      Textarea will appear here on click...
                                    </div>
                                  )}
                                </BlockStack>
                              )}
                            </Box>
                          </div>
                        ))}
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Page>
      </Frame>
    </AppProvider>
  );
}