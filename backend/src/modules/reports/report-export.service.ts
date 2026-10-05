import ExcelJS from "exceljs";
import PdfPrinter from "pdfmake";

// Standard 14 built-in PDF fonts (no external file dependencies required)
const pdfFonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

const printer = new PdfPrinter(pdfFonts);

function createPdfBuffer(docDefinition: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument({
        defaultStyle: { font: "Helvetica", fontSize: 9 },
        ...docDefinition,
      });
      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", (err: Error) => reject(err));
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function escapeCsvCell(c: string | number | null | undefined): string {
  const s = String(c ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r") ? `"${s}"` : s;
}

function toCsvBuffer(headers: string[], rows: (string | number | null | undefined)[][]): Buffer {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const dataLines = rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
  const content = "\uFEFF" + headerLine + "\r\n" + dataLines;
  return Buffer.from(content, "utf-8");
}

export class ReportExportService {
  /**
   * Universal Dispatcher
   */
  static async exportReport(
    reportType: string,
    format: "csv" | "xlsx" | "pdf",
    data: any
  ): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
    switch (format.toLowerCase()) {
      case "csv":
        return this.exportToCsv(reportType, data);
      case "xlsx":
        return this.exportToXlsx(reportType, data);
      case "pdf":
        return this.exportToPdf(reportType, data);
      default:
        throw new Error(`Unsupported export format: ${format}. Use csv, xlsx, or pdf.`);
    }
  }

  // ==========================================
  // 1. CSV EXPORT IMPLEMENTATION
  // ==========================================
  static exportToCsv(
    reportType: string,
    data: any
  ): { filename: string; buffer: Buffer; mimeType: string } {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    const dateStamp = new Date().toISOString().slice(0, 10);
    let filename = `BCIS-${reportType}-${dateStamp}.csv`;

    if (reportType === "DAILY_COLLECTION") {
      filename = `BCIS-DailyCollection-${data.date}.csv`;
      headers = [
        "Receipt #",
        "Payment #",
        "Date",
        "Time",
        "Subscriber Account",
        "Subscriber Name",
        "Method",
        "Reference #",
        "Amount (PHP)",
        "Cashier",
        "Collector",
        "Batch #",
      ];
      rows = (data.items || []).map((i: any) => [
        i.receiptNumber,
        i.paymentNumber,
        i.paymentDate,
        i.createdAt.slice(11, 19),
        i.subscriberAccountNumber,
        i.subscriberDisplayName,
        i.paymentMethod,
        i.referenceNumber,
        i.rawAmount,
        i.cashierName,
        i.collectorName,
        i.batchNumber,
      ]);
    } else if (reportType === "MONTHLY_COLLECTION") {
      filename = `BCIS-MonthlyCollection-${data.yearMonth}.csv`;
      headers = ["Day #", "Date", "Transactions", "Cash (PHP)", "Non-Cash (PHP)", "Total Amount (PHP)", "Cumulative (PHP)"];
      rows = (data.days || []).map((d: any) => [
        d.dayNumber,
        d.date,
        d.transactionCount,
        d.cashAmount,
        d.nonCashAmount,
        d.rawTotalAmount,
        d.cumulativeAmount,
      ]);
    } else if (reportType === "BILLING_VS_COLLECTION") {
      filename = `BCIS-BillingVsCollection-${data.year}.csv`;
      headers = ["Cycle Code", "Start Date", "End Date", "Due Date", "Invoices", "Paid", "Total Billed", "Total Collected", "Outstanding", "Efficiency %"];
      rows = (data.cycles || []).map((c: any) => [
        c.cycleCode,
        c.startDate,
        c.endDate,
        c.dueDate,
        c.invoicesCount,
        c.paidInvoicesCount,
        c.rawTotalBilled,
        c.rawTotalCollected,
        c.rawOutstandingBalance,
        `${c.collectionEfficiency}%`,
      ]);
    } else if (reportType === "AR_AGING") {
      filename = `BCIS-ARAging-${data.asOfDate}.csv`;
      headers = ["Subscriber Account", "Subscriber Name", "Mobile", "Area", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total Due"];
      rows = (data.subscribers || []).map((s: any) => [
        s.subscriberAccountNumber,
        s.displayName,
        s.mobile,
        s.areaName,
        s.current,
        s.days1to30,
        s.days31to60,
        s.days61to90,
        s.days90Plus,
        s.totalDue,
      ]);
    } else if (reportType === "COLLECTOR_PERFORMANCE") {
      filename = `BCIS-CollectorPerformance-${data.startDate}_to_${data.endDate}.csv`;
      headers = ["Collector Code", "Name", "Assigned Area", "Batches", "Reconciled", "Expected Cash", "Collected Cash", "Remitted Cash", "Shortage", "Overage", "Efficiency %", "Accuracy %"];
      rows = (data.collectors || []).map((c: any) => [
        c.collectorCode,
        c.name,
        c.assignedArea,
        c.batchesCount,
        c.reconciledBatchesCount,
        c.rawExpectedCash,
        c.rawCollectedCash,
        c.rawRemittedCash,
        c.shortageAmount,
        c.overageAmount,
        `${c.collectionEfficiency}%`,
        `${c.remittanceAccuracy}%`,
      ]);
    } else if (reportType === "PAYMENT_METHOD_SUMMARY") {
      filename = `BCIS-PaymentMethods-${data.startDate}_to_${data.endDate}.csv`;
      headers = ["Payment Method", "Total Amount (PHP)", "Transactions", "Percentage %", "Average Ticket (PHP)"];
      rows = (data.methods || []).map((m: any) => [
        m.method,
        m.rawAmount,
        m.count,
        `${m.percentage}%`,
        m.averageAmount,
      ]);
    } else if (reportType === "SUBSCRIBER_MASTER_LIST") {
      filename = `BCIS-SubscriberMaster-${dateStamp}.csv`;
      headers = ["Account #", "Subscriber Name", "Contact #", "Primary Area", "Primary Plan", "Services", "Balance Due", "Status", "Registered Date"];
      rows = (data.items || []).map((s: any) => [
        s.accountNumber,
        s.displayName,
        s.contactNumber,
        s.primaryArea,
        s.primaryPlan,
        s.serviceAccountsCount,
        s.rawBalanceDue,
        s.status,
        s.registeredDate,
      ]);
    } else if (reportType === "PAYMENT_REVERSALS") {
      filename = `BCIS-PaymentReversals-${data.startDate}_to_${data.endDate}.csv`;
      headers = ["Payment #", "Receipt #", "Payment Date", "Amount (PHP)", "Method", "Subscriber Account", "Subscriber Name", "Reversal Date", "Authorized By", "Reversal Reason"];
      rows = (data.items || []).map((r: any) => [
        r.paymentNumber,
        r.receiptNumber,
        r.paymentDate,
        r.rawAmount,
        r.paymentMethod,
        r.subscriberAccountNumber,
        r.subscriberDisplayName,
        r.reversedAt,
        r.reversedByName,
        r.reversalReason,
      ]);
    } else if (reportType === "AUDIT_ACTIVITY") {
      filename = `BCIS-AuditActivity-${dateStamp}.csv`;
      headers = ["Timestamp", "Action", "Entity Type", "Entity ID", "Actor Name", "Username", "Request ID", "Reason", "IP Address"];
      rows = (data.items || []).map((a: any) => [
        a.occurredAt,
        a.action,
        a.entityType,
        a.entityId,
        a.actorName,
        a.actorUsername,
        a.requestId || "—",
        a.reason || "—",
        a.ipAddress,
      ]);
    } else if (reportType === "SOA") {
      filename = `BCIS-StatementOfAccount-${data.subscriber?.accountNumber || "SOA"}-${data.statementDate || dateStamp}.csv`;
      headers = ["Entry #", "Date", "Reference Type", "Description", "Debit (PHP)", "Credit (PHP)", "Running Balance (PHP)"];
      rows = (data.ledger || []).map((e: any) => [
        e.entryNo,
        e.postedAt,
        e.referenceType,
        e.description,
        e.debitAmount,
        e.creditAmount,
        e.runningBalance,
      ]);
    } else {
      const list = data.items || data.cycles || data.days || data.collectors || data.methods || [];
      if (Array.isArray(list) && list.length > 0) {
        const keys = Object.keys(list[0]).filter((k) => typeof list[0][k] !== "object" && k !== "id");
        headers = keys.map((k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()));
        rows = list.map((item: any) => keys.map((k) => item[k] ?? ""));
      } else {
        headers = ["Field", "Value"];
        rows = Object.entries(data || {})
          .filter(([_, v]) => typeof v !== "object")
          .map(([k, v]) => [k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()), String(v ?? "")]);
      }
    }

    const buffer = toCsvBuffer(headers, rows);
    return {
      filename,
      buffer,
      mimeType: "text/csv; charset=utf-8",
    };
  }

  // ==========================================
  // 2. EXCEL (XLSX) EXPORT IMPLEMENTATION
  // ==========================================
  static async exportToXlsx(
    reportType: string,
    data: any
  ): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "BCIS Subscription Billing and Collection System";
    workbook.created = new Date();

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `BCIS-${reportType}-${dateStamp}.xlsx`;

    const sheet = workbook.addWorksheet("Report");

    // Title Row
    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "BUKIDNON CABLE AND INTERNET SERVICES (BCIS)";
    titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2747" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 30;

    // Subtitle Row
    sheet.mergeCells("A2:H2");
    const subTitleCell = sheet.getCell("A2");
    subTitleCell.value = `Official Report: ${reportType.replace(/_/g, " ")} | Generated: ${new Date().toLocaleString()}`;
    subTitleCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF334155" } };
    subTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    subTitleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(2).height = 20;

    sheet.addRow([]); // Blank row

    let columns: { header: string; key: string; width: number }[] = [];
    let tableRows: any[] = [];

    if (reportType === "DAILY_COLLECTION") {
      columns = [
        { header: "Receipt #", key: "receiptNumber", width: 22 },
        { header: "Payment #", key: "paymentNumber", width: 22 },
        { header: "Date", key: "paymentDate", width: 14 },
        { header: "Subscriber #", key: "subscriberAccountNumber", width: 22 },
        { header: "Subscriber Name", key: "subscriberDisplayName", width: 28 },
        { header: "Method", key: "paymentMethod", width: 14 },
        { header: "Reference #", key: "referenceNumber", width: 20 },
        { header: "Amount (PHP)", key: "rawAmount", width: 18 },
        { header: "Cashier", key: "cashierName", width: 20 },
        { header: "Collector", key: "collectorName", width: 20 },
      ];
      tableRows = data.items || [];
    } else if (reportType === "MONTHLY_COLLECTION") {
      columns = [
        { header: "Day #", key: "dayNumber", width: 10 },
        { header: "Date", key: "date", width: 16 },
        { header: "Transactions", key: "transactionCount", width: 16 },
        { header: "Cash (PHP)", key: "cashAmount", width: 18 },
        { header: "Non-Cash (PHP)", key: "nonCashAmount", width: 18 },
        { header: "Total Amount (PHP)", key: "rawTotalAmount", width: 20 },
        { header: "Cumulative (PHP)", key: "cumulativeAmount", width: 20 },
      ];
      tableRows = data.days || [];
    } else if (reportType === "BILLING_VS_COLLECTION") {
      columns = [
        { header: "Cycle Code", key: "cycleCode", width: 16 },
        { header: "Start Date", key: "startDate", width: 14 },
        { header: "End Date", key: "endDate", width: 14 },
        { header: "Due Date", key: "dueDate", width: 14 },
        { header: "Total Billed (PHP)", key: "rawTotalBilled", width: 20 },
        { header: "Total Collected (PHP)", key: "rawTotalCollected", width: 20 },
        { header: "Outstanding (PHP)", key: "rawOutstandingBalance", width: 20 },
        { header: "Collection %", key: "collectionEfficiency", width: 16 },
      ];
      tableRows = data.cycles || [];
    } else if (reportType === "AR_AGING") {
      columns = [
        { header: "Account #", key: "subscriberAccountNumber", width: 22 },
        { header: "Subscriber Name", key: "displayName", width: 28 },
        { header: "Area", key: "areaName", width: 20 },
        { header: "Current", key: "current", width: 16 },
        { header: "1-30 Days", key: "days1to30", width: 16 },
        { header: "31-60 Days", key: "days31to60", width: 16 },
        { header: "61-90 Days", key: "days61to90", width: 16 },
        { header: "90+ Days", key: "days90Plus", width: 16 },
        { header: "Total Due", key: "totalDue", width: 18 },
      ];
      tableRows = data.subscribers || [];
    } else if (reportType === "COLLECTOR_PERFORMANCE") {
      columns = [
        { header: "Code", key: "collectorCode", width: 14 },
        { header: "Collector Name", key: "name", width: 24 },
        { header: "Area", key: "assignedArea", width: 20 },
        { header: "Batches", key: "batchesCount", width: 12 },
        { header: "Expected (PHP)", key: "rawExpectedCash", width: 18 },
        { header: "Collected (PHP)", key: "rawCollectedCash", width: 18 },
        { header: "Remitted (PHP)", key: "rawRemittedCash", width: 18 },
        { header: "Efficiency %", key: "collectionEfficiency", width: 16 },
        { header: "Accuracy %", key: "remittanceAccuracy", width: 16 },
      ];
      tableRows = data.collectors || [];
    } else if (reportType === "PAYMENT_METHOD_SUMMARY") {
      columns = [
        { header: "Payment Method", key: "method", width: 20 },
        { header: "Amount (PHP)", key: "rawAmount", width: 20 },
        { header: "Transactions", key: "count", width: 16 },
        { header: "Percentage %", key: "percentage", width: 16 },
        { header: "Avg Ticket (PHP)", key: "averageAmount", width: 18 },
      ];
      tableRows = data.methods || [];
    } else if (reportType === "SUBSCRIBER_MASTER_LIST") {
      columns = [
        { header: "Account #", key: "accountNumber", width: 22 },
        { header: "Name", key: "displayName", width: 28 },
        { header: "Contact #", key: "contactNumber", width: 18 },
        { header: "Area", key: "primaryArea", width: 20 },
        { header: "Plan", key: "primaryPlan", width: 22 },
        { header: "Services", key: "serviceAccountsCount", width: 12 },
        { header: "Balance Due (PHP)", key: "rawBalanceDue", width: 20 },
        { header: "Status", key: "status", width: 14 },
      ];
      tableRows = data.items || [];
    } else if (reportType === "PAYMENT_REVERSALS") {
      columns = [
        { header: "Payment #", key: "paymentNumber", width: 22 },
        { header: "Receipt #", key: "receiptNumber", width: 22 },
        { header: "Date", key: "paymentDate", width: 14 },
        { header: "Amount (PHP)", key: "rawAmount", width: 18 },
        { header: "Method", key: "paymentMethod", width: 14 },
        { header: "Subscriber Name", key: "subscriberDisplayName", width: 28 },
        { header: "Authorized By", key: "reversedByName", width: 20 },
        { header: "Reason", key: "reversalReason", width: 30 },
      ];
      tableRows = data.items || [];
    } else if (reportType === "SOA") {
      columns = [
        { header: "Entry #", key: "entryNo", width: 10 },
        { header: "Posted Date", key: "postedAt", width: 16 },
        { header: "Reference Type", key: "referenceType", width: 20 },
        { header: "Description", key: "description", width: 36 },
        { header: "Debit", key: "debitAmount", width: 16 },
        { header: "Credit", key: "creditAmount", width: 16 },
        { header: "Running Balance", key: "runningBalance", width: 18 },
      ];
      tableRows = data.ledger || [];
    } else if (reportType === "AUDIT_ACTIVITY") {
      columns = [
        { header: "Timestamp", key: "occurredAt", width: 24 },
        { header: "Action", key: "action", width: 20 },
        { header: "Entity", key: "entityType", width: 20 },
        { header: "Actor", key: "actorName", width: 24 },
        { header: "Reason", key: "reason", width: 30 },
        { header: "IP Address", key: "ipAddress", width: 18 },
      ];
      tableRows = data.items || [];
    } else {
      const list = data.items || data.cycles || data.days || data.collectors || data.methods || [];
      if (Array.isArray(list) && list.length > 0) {
        const keys = Object.keys(list[0]).filter((k) => typeof list[0][k] !== "object" && k !== "id");
        columns = keys.slice(0, 8).map((k) => ({
          header: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
          key: k,
          width: 20,
        }));
        tableRows = list;
      } else {
        columns = [
          { header: "Field", key: "field", width: 25 },
          { header: "Value", key: "value", width: 35 },
        ];
        tableRows = Object.entries(data || {})
          .filter(([_, v]) => typeof v !== "object")
          .map(([k, v]) => ({
            field: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
            value: String(v ?? "—"),
          }));
      }
    }

    // Set Header row
    const headerRowIndex = 4;
    const headerRow = sheet.getRow(headerRowIndex);
    columns.forEach((col, idx) => {
      sheet.getColumn(idx + 1).width = col.width;
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });
    headerRow.height = 24;

    // Add Data Rows
    tableRows.forEach((rowObj, rIdx) => {
      const row = sheet.getRow(headerRowIndex + 1 + rIdx);
      columns.forEach((col, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        let val = rowObj[col.key];
        cell.value = val !== undefined && val !== null ? val : "";
        cell.font = { name: "Arial", size: 9 };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        // Alternating row background
        if (rIdx % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
      });
      row.height = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      filename,
      buffer: Buffer.from(buffer),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  // ==========================================
  // 3. PDF EXPORT IMPLEMENTATION
  // ==========================================
  static async exportToPdf(
    reportType: string,
    data: any
  ): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `BCIS-${reportType}-${dateStamp}.pdf`;

    let docDefinition: any;

    if (reportType === "SOA") {
      docDefinition = this.buildSoaPdfDefinition(data);
    } else {
      docDefinition = this.buildTabularPdfDefinition(reportType, data);
    }

    const buffer = await createPdfBuffer(docDefinition);
    return {
      filename,
      buffer,
      mimeType: "application/pdf",
    };
  }

  /**
   * Helper: Build Statement of Account PDF Definition
   */
  private static buildSoaPdfDefinition(soa: any) {
    return {
      pageOrientation: "portrait",
      pageSize: "A4",
      pageMargins: [36, 36, 36, 36],
      content: [
        // Company Header
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: soa.company.name, style: "companyHeader" },
                { text: soa.company.address, style: "subText" },
                { text: `Contact: ${soa.company.contactNumber} | Email: ${soa.company.email}`, style: "subText" },
                { text: `TIN: ${soa.company.tin}`, style: "subText" },
              ],
            },
            {
              width: "auto",
              alignment: "right",
              stack: [
                { text: "STATEMENT OF ACCOUNT", style: "docTitle" },
                { text: `Statement #: ${soa.statementNumber}`, style: "metaBold" },
                { text: `Statement Date: ${soa.statementDate}`, style: "subText" },
                { text: `Due Date: ${soa.financialSummary.dueDate}`, style: "metaDueDate" },
              ],
            },
          ],
        },
        { text: "", margin: [0, 8, 0, 8] },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 1.5, lineColor: "#0F2747" }] },
        { text: "", margin: [0, 6, 0, 6] },

        // Subscriber Info & Financial Balance 2-Column Box
        {
          columns: [
            {
              width: "60%",
              style: "boxCard",
              stack: [
                { text: "SUBSCRIBER INFORMATION", style: "sectionTitle" },
                { text: `Account Number: ${soa.subscriber.accountNumber}`, bold: true },
                { text: `Name: ${soa.subscriber.displayName}` },
                { text: `Address: ${soa.subscriber.address}`, style: "subText" },
                { text: `Mobile: ${soa.subscriber.mobileNumber || "N/A"}` },
                { text: `Account Status: ${soa.subscriber.status}`, bold: true },
              ],
            },
            {
              width: "40%",
              style: "financialBox",
              stack: [
                { text: "TOTAL AMOUNT DUE", style: "dueLabel" },
                { text: soa.financialSummary.totalAmountDue, style: "dueAmount" },
                { text: `Pay on or before: ${soa.financialSummary.dueDate}`, style: "dueSub" },
                { text: `Previous Balance: ${soa.financialSummary.previousBalance}`, style: "subText", margin: [0, 4, 0, 0] },
                { text: `Current Charges: ${soa.financialSummary.currentCharges}`, style: "subText" },
              ],
            },
          ],
        },
        { text: "", margin: [0, 8, 0, 8] },

        // Active Services Table
        { text: "ACTIVE SUBSCRIPTIONS & SERVICES", style: "sectionHeader" },
        {
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto"],
            body: [
              [
                { text: "Plan / Description", style: "tableHeader" },
                { text: "Monthly Rate", style: "tableHeader", alignment: "right" },
                { text: "Area", style: "tableHeader" },
                { text: "Status", style: "tableHeader", alignment: "center" },
              ],
              ...(soa.serviceAccounts || []).map((sa: any) => [
                { text: `${sa.planName} (${sa.serviceAccountNumber})` },
                { text: sa.monthlyRate, alignment: "right" },
                { text: sa.area },
                { text: sa.status, alignment: "center" },
              ]),
            ],
          },
          layout: "lightHorizontalLines",
        },
        { text: "", margin: [0, 8, 0, 8] },

        // Invoices Breakdown Table
        { text: "ITEMIZED INVOICES & CHARGES", style: "sectionHeader" },
        {
          table: {
            headerRows: 1,
            widths: ["auto", "auto", "auto", "auto", "auto", "auto"],
            body: [
              [
                { text: "Invoice #", style: "tableHeader" },
                { text: "Date", style: "tableHeader" },
                { text: "Due Date", style: "tableHeader" },
                { text: "Billed", style: "tableHeader", alignment: "right" },
                { text: "Paid", style: "tableHeader", alignment: "right" },
                { text: "Balance Due", style: "tableHeader", alignment: "right" },
              ],
              ...(soa.invoices || []).map((inv: any) => [
                { text: inv.invoiceNumber, bold: true },
                { text: inv.invoiceDate },
                { text: inv.dueDate },
                { text: inv.totalAmount, alignment: "right" },
                { text: inv.amountPaid, alignment: "right" },
                { text: inv.balanceDue, alignment: "right", bold: true },
              ]),
            ],
          },
          layout: "lightHorizontalLines",
        },
        { text: "", margin: [0, 8, 0, 8] },

        // Recent Payments
        { text: "RECENT PAYMENTS & CREDITS", style: "sectionHeader" },
        {
          table: {
            headerRows: 1,
            widths: ["auto", "auto", "auto", "auto", "*"],
            body: [
              [
                { text: "Receipt #", style: "tableHeader" },
                { text: "Payment Date", style: "tableHeader" },
                { text: "Method", style: "tableHeader" },
                { text: "Amount Paid", style: "tableHeader", alignment: "right" },
                { text: "Reference #", style: "tableHeader" },
              ],
              ...(soa.payments && soa.payments.length > 0
                ? soa.payments.map((p: any) => [
                    { text: p.receiptNumber, bold: true },
                    { text: p.paymentDate },
                    { text: p.paymentMethod },
                    { text: p.amount, alignment: "right" },
                    { text: p.referenceNumber },
                  ])
                : [[{ text: "No payments recorded in this period.", colSpan: 5, italic: true }, {}, {}, {}, {}]]),
            ],
          },
          layout: "lightHorizontalLines",
        },
        { text: "", margin: [0, 12, 0, 12] },

        // Remittance / Tear-off Slip Stub
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 1, dash: { length: 4 } }] },
        { text: "✂ TEAR OFF AND RETURN THIS REMITTANCE SLIP WITH PAYMENT", style: "stubText", margin: [0, 4, 0, 6] },
        {
          columns: [
            {
              width: "50%",
              stack: [
                { text: `Subscriber: ${soa.subscriber.displayName}`, bold: true },
                { text: `Account #: ${soa.subscriber.accountNumber}` },
                { text: `Statement #: ${soa.statementNumber}` },
              ],
            },
            {
              width: "50%",
              alignment: "right",
              stack: [
                { text: `Amount Due: ${soa.financialSummary.totalAmountDue}`, bold: true, fontSize: 11 },
                { text: `Due Date: ${soa.financialSummary.dueDate}` },
                { text: "Amount Paid: ₱___________________ Date: ___________" },
              ],
            },
          ],
        },
      ],
      styles: {
        companyHeader: { fontSize: 13, bold: true, color: "#0F2747" },
        docTitle: { fontSize: 14, bold: true, color: "#2563EB" },
        metaBold: { fontSize: 9, bold: true, color: "#0F172A" },
        metaDueDate: { fontSize: 9, bold: true, color: "#DC2626" },
        subText: { fontSize: 8, color: "#64748B" },
        sectionTitle: { fontSize: 9, bold: true, color: "#0F2747", margin: [0, 0, 0, 4] },
        sectionHeader: { fontSize: 10, bold: true, color: "#0F2747", margin: [0, 4, 0, 4] },
        boxCard: { fontSize: 8, margin: [0, 0, 10, 0] },
        financialBox: { fontSize: 8, alignment: "right" },
        dueLabel: { fontSize: 9, bold: true, color: "#64748B" },
        dueAmount: { fontSize: 16, bold: true, color: "#0F2747" },
        dueSub: { fontSize: 8, color: "#DC2626", bold: true },
        tableHeader: { fontSize: 8, bold: true, color: "#0F2747" },
        stubText: { fontSize: 7, italic: true, alignment: "center", color: "#94A3B8" },
      },
    };
  }

  /**
   * Helper: Build Standard Tabular PDF Definition
   */
  private static buildTabularPdfDefinition(reportType: string, data: any) {
    let headers: string[] = [];
    let tableRows: any[][] = [];
    let widths: string[] = [];
    let reportTitle = `Report: ${reportType.replace(/_/g, " ")}`;
    let reportSub = `Generated: ${new Date().toLocaleString()}`;

    if (reportType === "DAILY_COLLECTION") {
      reportTitle = "DAILY COLLECTION REPORT";
      reportSub = `Collection Date: ${data.date || "—"} | Total Collected: ${data.totalCollected || "₱0.00"} (${data.totalTransactions || 0} transactions)`;
      headers = ["Receipt #", "Date", "Subscriber Name", "Method", "Ref #", "Amount (PHP)", "Cashier"];
      widths = ["auto", "auto", "*", "auto", "auto", "auto", "auto"];
      tableRows = (data.items || []).map((i: any) => [
        { text: i.receiptNumber, bold: true },
        { text: i.paymentDate },
        { text: i.subscriberDisplayName },
        { text: i.paymentMethod },
        { text: i.referenceNumber || "—" },
        { text: i.amount, alignment: "right" },
        { text: i.cashierName || "—" },
      ]);
    } else if (reportType === "MONTHLY_COLLECTION") {
      reportTitle = "MONTHLY COLLECTION REPORT";
      reportSub = `Month Period: ${data.yearMonth || "—"} | Total Collected: ${data.totalCollected || "₱0.00"} | Daily Average: ${data.dailyAverage || "₱0.00"}`;
      headers = ["Day", "Date", "Txns", "Cash", "Non-Cash", "Total (PHP)", "Cumulative"];
      widths = ["auto", "auto", "auto", "auto", "auto", "*", "auto"];
      tableRows = (data.days || []).map((d: any) => [
        { text: String(d.dayNumber), alignment: "center" },
        { text: d.date },
        { text: String(d.transactionCount), alignment: "center" },
        { text: d.cashAmount, alignment: "right" },
        { text: d.nonCashAmount, alignment: "right" },
        { text: d.totalAmount, alignment: "right", bold: true },
        { text: d.cumulativeAmount, alignment: "right" },
      ]);
    } else if (reportType === "BILLING_VS_COLLECTION") {
      reportTitle = "BILLING VS COLLECTION REPORT";
      reportSub = `Fiscal Year: ${data.year || "—"} | Total Billed: ${data.overall?.totalBilled || "₱0.00"} | Total Collected: ${data.overall?.totalCollected || "₱0.00"} | Overall Efficiency: ${data.overall?.collectionEfficiency || 0}%`;
      headers = ["Cycle Code", "Period", "Billed (PHP)", "Collected (PHP)", "Outstanding", "Efficiency"];
      widths = ["auto", "*", "auto", "auto", "auto", "auto"];
      tableRows = (data.cycles || []).map((c: any) => [
        { text: c.cycleCode, bold: true },
        { text: `${c.startDate} to ${c.endDate}` },
        { text: c.totalBilled, alignment: "right" },
        { text: c.totalCollected, alignment: "right" },
        { text: c.outstandingBalance, alignment: "right" },
        { text: `${c.collectionEfficiency}%`, alignment: "center", bold: true },
      ]);
    } else if (reportType === "AR_AGING") {
      reportTitle = "ACCOUNTS RECEIVABLE AGING ANALYSIS";
      reportSub = `As of Date: ${data.asOfDate || "—"} | Total Receivable: ${data.summary?.totalReceivable || "₱0.00"}`;
      headers = ["Account #", "Subscriber", "Area", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total Due"];
      widths = ["auto", "*", "auto", "auto", "auto", "auto", "auto", "auto", "auto"];
      tableRows = (data.subscribers || []).map((s: any) => [
        { text: s.subscriberAccountNumber || "—" },
        { text: s.displayName || "—" },
        { text: s.areaName || "—" },
        { text: s.current || "₱0.00", alignment: "right" },
        { text: s.days1to30 || "₱0.00", alignment: "right" },
        { text: s.days31to60 || "₱0.00", alignment: "right" },
        { text: s.days61to90 || "₱0.00", alignment: "right" },
        { text: s.days90Plus || "₱0.00", alignment: "right" },
        { text: s.totalDue || "₱0.00", alignment: "right", bold: true },
      ]);
    } else if (reportType === "COLLECTOR_PERFORMANCE") {
      reportTitle = "FIELD COLLECTOR PERFORMANCE REPORT";
      reportSub = `Period: ${data.startDate || "—"} to ${data.endDate || "—"} | Batches Handled: ${data.overall?.totalBatches || 0} | Total Collected: ${data.overall?.totalCollected || "₱0.00"} | Remitted: ${data.overall?.totalRemitted || "₱0.00"}`;
      headers = ["Code", "Collector Name", "Batches", "Expected", "Collected", "Remitted", "Shortage", "Efficiency", "Accuracy"];
      widths = ["auto", "*", "auto", "auto", "auto", "auto", "auto", "auto", "auto"];
      tableRows = (data.collectors || []).map((c: any) => [
        { text: c.collectorCode || "—", bold: true },
        { text: c.name || "—" },
        { text: String(c.batchesCount ?? 0), alignment: "center" },
        { text: c.expectedCash || "₱0.00", alignment: "right" },
        { text: c.collectedCash || "₱0.00", alignment: "right", bold: true },
        { text: c.remittedCash || "₱0.00", alignment: "right" },
        { text: c.shortageAmount || "₱0.00", alignment: "right" },
        { text: `${c.collectionEfficiency ?? 0}%`, alignment: "center" },
        { text: `${c.remittanceAccuracy ?? 0}%`, alignment: "center", bold: true },
      ]);
    } else if (reportType === "PAYMENT_METHOD_SUMMARY") {
      reportTitle = "PAYMENT CHANNELS & METHODS SUMMARY";
      reportSub = `Period: ${data.startDate || "—"} to ${data.endDate || "—"} | Total Volume: ${data.totalAmount || "₱0.00"} (${data.totalTransactions || 0} transactions)`;
      headers = ["Payment Channel", "Transactions", "Volume Share %", "Average Ticket", "Total Volume (PHP)"];
      widths = ["*", "auto", "auto", "auto", "auto"];
      tableRows = (data.methods || []).map((m: any) => [
        { text: m.method, bold: true },
        { text: String(m.count ?? 0), alignment: "center" },
        { text: `${m.percentage ?? 0}%`, alignment: "center" },
        { text: m.averageAmount || "₱0.00", alignment: "right" },
        { text: m.amount || "₱0.00", alignment: "right", bold: true },
      ]);
    } else if (reportType === "SUBSCRIBER_MASTER_LIST") {
      reportTitle = "SUBSCRIBER DIRECTORY MASTER LIST";
      reportSub = `Total Subscribers: ${data.pagination?.total ?? (data.items || []).length} | Active Master Directory`;
      headers = ["Account #", "Subscriber Name", "Contact #", "Primary Area", "Plan", "Status", "Balance Due"];
      widths = ["auto", "*", "auto", "auto", "auto", "auto", "auto"];
      tableRows = (data.items || []).map((s: any) => [
        { text: s.accountNumber || "—", bold: true },
        { text: s.displayName || "—" },
        { text: s.contactNumber || "—" },
        { text: s.primaryArea || "—" },
        { text: s.primaryPlan || "Standard Plan" },
        { text: s.status || "ACTIVE", alignment: "center" },
        { text: s.balanceDue || "₱0.00", alignment: "right", bold: true },
      ]);
    } else if (reportType === "PAYMENT_REVERSALS") {
      reportTitle = "AUDITED PAYMENT REVERSALS & VOIDS";
      reportSub = `Period: ${data.startDate || "—"} to ${data.endDate || "—"} | Total Reversed: ${data.totalReversedAmount || "₱0.00"} (${data.totalCount || 0} reversals)`;
      headers = ["Receipt #", "Payment Date", "Subscriber", "Method", "Amount (PHP)", "Reversed At", "Supervisor", "Reason"];
      widths = ["auto", "auto", "*", "auto", "auto", "auto", "auto", "*"];
      tableRows = (data.items || []).map((r: any) => [
        { text: r.receiptNumber || r.paymentNumber || "—", bold: true },
        { text: r.paymentDate || "—" },
        { text: r.subscriberDisplayName || "—" },
        { text: r.paymentMethod || "—" },
        { text: r.amount || "₱0.00", alignment: "right", bold: true },
        { text: r.reversedAt ? r.reversedAt.slice(0, 10) : "—" },
        { text: r.reversedByName || "Supervisor" },
        { text: r.reversalReason || "No explanation recorded" },
      ]);
    } else if (reportType === "AUDIT_ACTIVITY") {
      reportTitle = "SYSTEM AUDIT ACTIVITY & COMPLIANCE TRAIL";
      reportSub = `Total Records: ${data.pagination?.total ?? (data.items || []).length} | Immutable Security Log`;
      headers = ["Timestamp", "Actor", "Action", "Entity Type", "Entity / Ref ID", "Reason / Notes", "IP Address"];
      widths = ["auto", "auto", "auto", "auto", "auto", "*", "auto"];
      tableRows = (data.items || []).map((a: any) => [
        { text: a.occurredAt ? a.occurredAt.replace("T", " ").slice(0, 19) : "—" },
        { text: `${a.actorName || "System"}${a.actorUsername ? ` (${a.actorUsername})` : ""}`, bold: true },
        { text: a.action || "—" },
        { text: a.entityType || "—" },
        { text: a.entityId ? a.entityId.slice(0, 8) : a.requestId ? a.requestId.slice(0, 8) : "—" },
        { text: a.reason || "—" },
        { text: a.ipAddress || "—" },
      ]);
    } else {
      const list = data.items || data.cycles || data.days || data.collectors || data.methods || [];
      if (Array.isArray(list) && list.length > 0) {
        const keys = Object.keys(list[0]).filter((k) => typeof list[0][k] !== "object" && k !== "id");
        headers = keys.slice(0, 7).map((k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()));
        widths = headers.map(() => "auto");
        tableRows = list.slice(0, 200).map((item: any) =>
          keys.slice(0, 7).map((k) => ({ text: String(item[k] ?? "—") }))
        );
      } else {
        headers = ["Field", "Details"];
        widths = ["35%", "65%"];
        tableRows = Object.entries(data || {})
          .filter(([_, v]) => typeof v !== "object")
          .map(([k, v]) => [
            { text: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()), bold: true },
            { text: String(v ?? "—") },
          ]);
      }
    }

    return {
      pageOrientation: "landscape",
      pageSize: "A4",
      pageMargins: [28, 28, 28, 28],
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: "BUKIDNON CABLE & INTERNET SERVICES — CONFIDENTIAL OFFICIAL REPORT", alignment: "left", fontSize: 7, color: "#94A3B8" },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", fontSize: 8, color: "#64748B" },
        ],
        margin: [28, 10, 28, 0],
      }),
      content: [
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "BUKIDNON CABLE & INTERNET SERVICES", style: "header" },
                { text: reportTitle, style: "title" },
                { text: reportSub, style: "subHeader" },
              ],
            },
            {
              width: "auto",
              alignment: "right",
              stack: [
                { text: "OFFICIAL EXPORT", style: "badge" },
                { text: `Printed: ${new Date().toLocaleString()}`, style: "subHeader" },
              ],
            },
          ],
        },
        { text: "", margin: [0, 4, 0, 4] },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 785, y2: 0, lineWidth: 1.5, lineColor: "#0F2747" }] },
        { text: "", margin: [0, 6, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths,
            body: [
              headers.map((h) => ({ text: h, style: "tableHeader" })),
              ...tableRows,
            ],
          },
          layout: "lightHorizontalLines",
        },
      ],
      styles: {
        header: { fontSize: 12, bold: true, color: "#0F2747" },
        title: { fontSize: 14, bold: true, color: "#2563EB", margin: [0, 2, 0, 2] },
        subHeader: { fontSize: 8, color: "#64748B" },
        badge: { fontSize: 9, bold: true, color: "#059669" },
        tableHeader: { fontSize: 8, bold: true, color: "#0F2747", fillColor: "#F1F5F9" },
      },
    };
  }
}
