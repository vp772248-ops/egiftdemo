import React, { useState, useMemo } from "react";

import { useLoaderData, useNavigate, useRevalidator } from "react-router"; 

import { 

  AppProvider, Page, DataTable, Text, Box, Frame, BlockStack, 

  Pagination, TextField, Icon, InlineStack, Badge, Card, Select, Link 

} from "@shopify/polaris";

import { SearchIcon, RefreshIcon, ExportIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";

import prisma from "../db.server";

import enTranslations from '@shopify/polaris/locales/en.json';

import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
 
export const links = () => [

  { rel: "stylesheet", href: polarisStyles },

];
 
// 🌍 Universal Global Timezone Formatter

function getCountryTimezone(countryName) {

  const c = (countryName || "").trim().toLowerCase();
 
  const tzMap = {

    "united states": { tz: "America/New_York", label: "EST (US)" }, "us": { tz: "America/New_York", label: "EST (US)" }, "usa": { tz: "America/New_York", label: "EST (US)" },

    "canada": { tz: "America/Toronto", label: "EST (Canada)" }, "mexico": { tz: "America/Mexico_City", label: "CST (Mexico)" },

    "jamaica": { tz: "America/Jamaica", label: "EST (Jamaica)" }, "bahamas": { tz: "America/Nassau", label: "EST (Bahamas)" },

    "costa rica": { tz: "America/Costa_Rica", label: "CST (Costa Rica)" }, "panama": { tz: "America/Panama", label: "EST (Panama)" }, "cuba": { tz: "America/Havana", label: "CST (Cuba)" },

    "brazil": { tz: "America/Sao_Paulo", label: "BRT (Brazil)" }, "argentina": { tz: "America/Argentina/Buenos_Aires", label: "ART (Argentina)" },

    "colombia": { tz: "America/Bogota", label: "COT (Colombia)" }, "chile": { tz: "America/Santiago", label: "CLT (Chile)" },

    "peru": { tz: "America/Lima", label: "PET (Peru)" }, "venezuela": { tz: "America/Caracas", label: "VET (Venezuela)" },

    "ecuador": { tz: "America/Guayaquil", label: "ECT (Ecuador)" }, "uruguay": { tz: "America/Montevideo", label: "UYT (Uruguay)" }, "bolivia": { tz: "America/La_Paz", label: "BOT (Bolivia)" },

    "united kingdom": { tz: "Europe/London", label: "UK Time" }, "uk": { tz: "Europe/London", label: "UK Time" }, "great britain": { tz: "Europe/London", label: "UK Time" },

    "ireland": { tz: "Europe/Dublin", label: "IST (Ireland)" }, "germany": { tz: "Europe/Berlin", label: "CET (Germany)" }, "france": { tz: "Europe/Paris", label: "CET (France)" },

    "italy": { tz: "Europe/Rome", label: "CET (Italy)" }, "spain": { tz: "Europe/Madrid", label: "CET (Spain)" }, "netherlands": { tz: "Europe/Amsterdam", label: "CET (Netherlands)" },

    "switzerland": { tz: "Europe/Zurich", label: "CET (Switzerland)" }, "belgium": { tz: "Europe/Brussels", label: "CET (Belgium)" }, "sweden": { tz: "Europe/Stockholm", label: "CET (Sweden)" },

    "norway": { tz: "Europe/Oslo", label: "CET (Norway)" }, "denmark": { tz: "Europe/Copenhagen", label: "CET (Denmark)" }, "finland": { tz: "Europe/Helsinki", label: "EET (Finland)" },

    "poland": { tz: "Europe/Warsaw", label: "CET (Poland)" }, "austria": { tz: "Europe/Vienna", label: "CET (Austria)" }, "greece": { tz: "Europe/Athens", label: "EET (Greece)" },

    "portugal": { tz: "Europe/Lisbon", label: "WET (Portugal)" }, "russia": { tz: "Europe/Moscow", label: "MSK (Russia)" }, "ukraine": { tz: "Europe/Kiev", label: "EET (Ukraine)" },

    "romania": { tz: "Europe/Bucharest", label: "EET (Romania)" }, "czech": { tz: "Europe/Prague", label: "CET (Czechia)" }, "hungary": { tz: "Europe/Budapest", label: "CET (Hungary)" },

    "croatia": { tz: "Europe/Zagreb", label: "CET (Croatia)" },

    "india": { tz: "Asia/Kolkata", label: "IST (India)" }, "china": { tz: "Asia/Shanghai", label: "CST (China)" }, "japan": { tz: "Asia/Tokyo", label: "JST (Japan)" },

    "south korea": { tz: "Asia/Seoul", label: "KST (South Korea)" }, "singapore": { tz: "Asia/Singapore", label: "SGT (Singapore)" }, "malaysia": { tz: "Asia/Kuala_Lumpur", label: "MYT (Malaysia)" },

    "indonesia": { tz: "Asia/Jakarta", label: "WIB (Indonesia)" }, "thailand": { tz: "Asia/Bangkok", label: "ICT (Thailand)" }, "vietnam": { tz: "Asia/Ho_Chi_Minh", label: "ICT (Vietnam)" },

    "philippines": { tz: "Asia/Manila", label: "PHT (Philippines)" }, "taiwan": { tz: "Asia/Taipei", label: "CST (Taiwan)" }, "hong kong": { tz: "Asia/Hong_Kong", label: "HKT (Hong Kong)" },

    "pakistan": { tz: "Asia/Karachi", label: "PKT (Pakistan)" }, "bangladesh": { tz: "Asia/Dhaka", label: "BST (Bangladesh)" }, "sri lanka": { tz: "Asia/Colombo", label: "IST (Sri Lanka)" },

    "nepal": { tz: "Asia/Kathmandu", label: "NPT (Nepal)" }, "maldives": { tz: "Indian/Maldives", label: "MVT (Maldives)" }, "myanmar": { tz: "Asia/Yangon", label: "MMT (Myanmar)" },

    "united arab emirates": { tz: "Asia/Dubai", label: "GST (UAE)" }, "uae": { tz: "Asia/Dubai", label: "GST (UAE)" }, "saudi arabia": { tz: "Asia/Riyadh", label: "AST (Saudi Arabia)" },

    "qatar": { tz: "Asia/Qatar", label: "AST (Qatar)" }, "kuwait": { tz: "Asia/Kuwait", label: "AST (Kuwait)" }, "oman": { tz: "Asia/Muscat", label: "GST (Oman)" },

    "bahrain": { tz: "Asia/Bahrain", label: "AST (Bahrain)" }, "israel": { tz: "Asia/Jerusalem", label: "IST (Israel)" }, "turkey": { tz: "Europe/Istanbul", label: "TRT (Turkey)" },

    "iran": { tz: "Asia/Tehran", label: "IRST (Iran)" }, "iraq": { tz: "Asia/Baghdad", label: "AST (Iraq)" },

    "australia": { tz: "Australia/Sydney", label: "AEST (Australia)" }, "new zealand": { tz: "Pacific/Auckland", label: "NZST (New Zealand)" }, "fiji": { tz: "Pacific/Fiji", label: "FJT (Fiji)" },

    "south africa": { tz: "Africa/Johannesburg", label: "SAST (South Africa)" }, "egypt": { tz: "Africa/Cairo", label: "EET (Egypt)" }, "nigeria": { tz: "Africa/Lagos", label: "WAT (Nigeria)" },

    "kenya": { tz: "Africa/Nairobi", label: "EAT (Kenya)" }, "ghana": { tz: "Africa/Accra", label: "GMT (Ghana)" }, "morocco": { tz: "Africa/Casablanca", label: "WEST (Morocco)" },

    "ethiopia": { tz: "Africa/Addis_Ababa", label: "EAT (Ethiopia)" }, "algeria": { tz: "Africa/Algiers", label: "CET (Algeria)" }, "zimbabwe": { tz: "Africa/Harare", label: "CAT (Zimbabwe)" }

  };
 
  if (tzMap[c]) return tzMap[c];

  for (const key in tzMap) { if (c.includes(key)) return tzMap[key]; }

  return { tz: "UTC", label: "UTC" };

}

 
export const loader = async ({ request }) => {

  const { session } = await authenticate.admin(request);

  const dbSession = await prisma.session.findUnique({

    where: { id: session.id }

  });

  const shopDomain = dbSession ? dbSession.shop : session.shop;

  const storeName = shopDomain.replace(".myshopify.com", "");

  const subscriptions = await prisma.giftSubscription.findMany({

    orderBy: { createdAt: "desc" }

  });

  return { subscriptions, storeName };

};
 
export default function CustomerData() {

  const { subscriptions, storeName } = useLoaderData(); 

  const { revalidate } = useRevalidator(); 

  const [searchTerm, setSearchTerm] = useState("");

  const [filterType, setFilterType] = useState("ALL");

  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 10;
 
  const exportToCSV = () => {

    const headers = ["Order ID", "Order URL", "Type", "Gift Code", "Sender Name", "Receiver Name", "Receiver Email", "Status", "Renewals", "Purchased On", "Expires At"];

    const csvRows = filteredData.map(sub => {

      const type = sub.giftCode.startsWith("MY-") ? "Personal" : "Gift";

      const purchased = new Date(sub.createdAt).toLocaleDateString();
 
      let expiry = "Not Set";

      if(sub.expiresAt) {

          const dateObj = new Date(sub.expiresAt);

          let country = "United States";

          try {

            if (typeof sub.recipientAddress === "object") country = sub.recipientAddress?.country || "United States";

            else country = JSON.parse(sub.recipientAddress)?.country || "United States";

          } catch(e) {}

          const tzInfo = getCountryTimezone(country);

          const dPart = dateObj.toLocaleDateString('en-GB', { timeZone: tzInfo.tz, day: 'numeric', month: 'long', year: 'numeric' });

          const tPart = dateObj.toLocaleTimeString('en-US', { timeZone: tzInfo.tz, hour12: false, hour: '2-digit', minute: '2-digit' });

          expiry = `"${dPart} at ${tPart} (${tzInfo.label})"`;

      }

      const orderUrl = `https://admin.shopify.com/store/${storeName}/orders/${sub.orderId}`;

      return [ `"${sub.orderId}"`, `"${orderUrl}"`, type, sub.giftCode, `"${sub.gifterName || ''}"`, `"${sub.gifteeName || ''}"`, `"${sub.gifteeEmail || ''}"`, sub.status, sub.renewalCount || 0, purchased, expiry ].join(",");

    });
 
    const csvContent = [headers.join(","), ...csvRows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.setAttribute("download", `subscriptions_data_${new Date().getTime()}.csv`);

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

  };
 
  const filteredData = useMemo(() => {

    return subscriptions.filter(sub => {

      const searchLower = searchTerm.toLowerCase();

      const matchesSearch = 

        (sub.giftCode && sub.giftCode.toLowerCase().includes(searchLower)) ||

        (sub.gifterName && sub.gifterName.toLowerCase().includes(searchLower)) ||

        (sub.gifteeName && sub.gifteeName.toLowerCase().includes(searchLower)) ||

        (sub.gifteeEmail && sub.gifteeEmail.toLowerCase().includes(searchLower)) ||

        (sub.orderId && sub.orderId.includes(searchLower));

      let matchesType = true;

      if (filterType === "GIFT") matchesType = sub.giftCode.startsWith("WBC-");

      if (filterType === "PERSONAL") matchesType = sub.giftCode.startsWith("MY-");

      return matchesSearch && matchesType;

    });

  }, [subscriptions, searchTerm, filterType]);
 
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const paginatedData = useMemo(() => {

    const startIndex = (currentPage - 1) * itemsPerPage;

    return filteredData.slice(startIndex, startIndex + itemsPerPage);

  }, [filteredData, currentPage]);
 
  const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(prev => prev + 1); };

  const handlePrevPage = () => { if (currentPage > 1) setCurrentPage(prev => prev - 1); };
 
  const getStatusBadge = (status) => {

    switch (status) {

      case "REDEEMED": case "ACTIVE": return <Badge tone="success">{status}</Badge>;

      case "EXPIRED": return <Badge tone="critical">{status}</Badge>;

      case "AWAITING_TASTES": case "EMAIL_SENT_PENDING_QUESTIONNAIRE": return <Badge tone="warning">WAITING</Badge>;

      case "SCHEDULED_FOR_FUTURE": return <Badge tone="info">SCHEDULED</Badge>;

      default: return <Badge>{status}</Badge>;

    }

  };
 
  const rows = paginatedData.map((sub) => {

    const isPersonal = sub.giftCode.startsWith("MY-");

    let expiryText = "Not Redeemed Yet";
 
    if (sub.expiresAt) {

      const dateObj = new Date(sub.expiresAt);

      let country = "United States";

      try {

        if (typeof sub.recipientAddress === "object") country = sub.recipientAddress?.country || "United States";

        else country = JSON.parse(sub.recipientAddress)?.country || "United States";

      } catch(e) {}

      const tzInfo = getCountryTimezone(country);

      const datePart = dateObj.toLocaleDateString('en-GB', { timeZone: tzInfo.tz, day: 'numeric', month: 'long', year: 'numeric' });

      const timePart = dateObj.toLocaleTimeString('en-US', { timeZone: tzInfo.tz, hour12: false, hour: '2-digit', minute: '2-digit' });

      expiryText = `${datePart} at ${timePart} (${tzInfo.label})`;

    }
 
    const orderLink = `https://admin.shopify.com/store/${storeName}/orders/${sub.orderId}`;

    const renewCount = sub.renewalCount || 0; 

    return [
<Link url={orderLink} target="_blank" removeUnderline><Text fontWeight="bold" tone="magic">#{sub.orderId}</Text></Link>,
<Text fontWeight="bold">{isPersonal ? "Personal" : "Gift"}</Text>,
<Text>{sub.giftCode}</Text>,
<Text>{sub.gifterName}</Text>,
<BlockStack gap="100"><Text fontWeight="bold">{sub.gifteeName}</Text><Text variant="bodySm" tone="subdued">{sub.gifteeEmail}</Text></BlockStack>,

      getStatusBadge(sub.status),
<Badge tone={renewCount > 0 ? "success" : "new"}>{renewCount} Times</Badge>, 
<Text>{expiryText}</Text>

    ];

  });
 
  return (
<AppProvider i18n={enTranslations}>
<Frame>
<Page 

          fullWidth

          title="Subscription Data Dashboard" 

          subtitle="Manage and export Gift and Personal subscriptions"

          primaryAction={{ content: 'Export to CSV', icon: ExportIcon, onAction: exportToCSV }}

          secondaryActions={[{ content: 'Refresh', icon: RefreshIcon, onAction: () => revalidate() }]}
>
<BlockStack gap="400">
<Card padding="400">
<InlineStack gap="400" align="start">
<div style={{ flex: 1 }}><TextField label="Search by Order ID, Name, Email or Code" value={searchTerm} onChange={(val) => { setSearchTerm(val); setCurrentPage(1); }} prefix={<Icon source={SearchIcon} />} autoComplete="off" clearButton onClearButtonClick={() => setSearchTerm("")} /></div>
<div style={{ width: '200px' }}><Select label="Filter by Type" options={[{ label: 'All Types', value: 'ALL' }, { label: 'Gifts Only (WBC-)', value: 'GIFT' }, { label: 'Personal Only (MY-)', value: 'PERSONAL' }]} value={filterType} onChange={(val) => { setFilterType(val); setCurrentPage(1); }} /></div>
</InlineStack>
</Card>
<Card padding="0">
<Box padding="400"><Text variant="headingMd" as="h3">Total Records: {filteredData.length}</Text></Box>
<DataTable columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']} headings={['Order', 'Type', 'Gift Code', 'Sender Name', 'Receiver Info', 'Status', 'Renewals', 'Expiry Date']} rows={rows.length > 0 ? rows : [["No records found", "", "", "", "", "", "", ""]]} hasZebraStriping />

              {totalPages > 1 && (<Box padding="400"><InlineStack align="center"><Pagination hasPrevious={currentPage > 1} onPrevious={handlePrevPage} hasNext={currentPage < totalPages} onNext={handleNextPage} label={`Page ${currentPage} of ${totalPages}`} /></InlineStack></Box>)}
</Card>
</BlockStack>
</Page>
</Frame>
</AppProvider>

  );

}
 