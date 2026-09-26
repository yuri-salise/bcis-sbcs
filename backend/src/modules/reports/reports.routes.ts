import type { FastifyPluginAsync } from "fastify";
import { ReportsService } from "./reports.service.js";
import { ReportExportService } from "./report-export.service.js";
import { authenticate, requirePermission } from "../auth/auth.guard.js";

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Dashboard Metrics (Accessible to authenticated users)
  fastify.get(
    "/reports/dashboard",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Retrieve executive dashboard KPIs and supporting trendlines",
        tags: ["Reports & Dashboard"],
      },
    },
    async (_request, reply) => {
      const data = await ReportsService.getDashboardMetrics();
      return reply.send(data);
    }
  );

  // 2. Daily Collection Report
  fastify.get<{
    Querystring: {
      date?: string;
      collectionAreaId?: string;
      paymentMethod?: string;
      cashierUserId?: string;
    };
  }>(
    "/reports/daily-collection",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate daily collection report with cashier and method breakdowns",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const data = await ReportsService.getDailyCollectionReport(request.query);
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      date?: string;
      collectionAreaId?: string;
      paymentMethod?: string;
      cashierUserId?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/daily-collection/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export daily collection report to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const reportData = await ReportsService.getDailyCollectionReport(request.query);
      const exported = await ReportExportService.exportReport("DAILY_COLLECTION", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 3. Monthly Collection Report
  fastify.get<{
    Querystring: {
      yearMonth?: string;
      collectionAreaId?: string;
    };
  }>(
    "/reports/monthly-collection",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate monthly collection report with day-by-day aggregations",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const data = await ReportsService.getMonthlyCollectionReport(request.query);
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      yearMonth?: string;
      collectionAreaId?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/monthly-collection/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export monthly collection report to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const reportData = await ReportsService.getMonthlyCollectionReport(request.query);
      const exported = await ReportExportService.exportReport("MONTHLY_COLLECTION", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 4. Billing vs Collection Report
  fastify.get<{
    Querystring: {
      year?: string;
    };
  }>(
    "/reports/billing-vs-collection",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate billing vs collection efficiency report across billing cycles",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const year = request.query.year ? parseInt(request.query.year, 10) : undefined;
      const data = await ReportsService.getBillingVsCollectionReport({ year });
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      year?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/billing-vs-collection/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export billing vs collection report to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const year = request.query.year ? parseInt(request.query.year, 10) : undefined;
      const reportData = await ReportsService.getBillingVsCollectionReport({ year });
      const exported = await ReportExportService.exportReport("BILLING_VS_COLLECTION", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 5. AR Aging Report Summary
  fastify.get<{
    Querystring: {
      asOfDate?: string;
      collectionAreaId?: string;
    };
  }>(
    "/reports/aging",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate comprehensive accounts receivable aging report",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const data = await ReportsService.getAgingReport(request.query);
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      asOfDate?: string;
      collectionAreaId?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/aging/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export accounts receivable aging report to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const reportData = await ReportsService.getAgingReport(request.query);
      const exported = await ReportExportService.exportReport("AR_AGING", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 6. Statement of Account (SOA)
  fastify.get<{
    Params: { subscriberId: string };
    Querystring: { asOfDate?: string };
  }>(
    "/reports/soa/:subscriberId",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate official printable Subscriber Statement of Account (SOA)",
        tags: ["Reports & Dashboard"],
        params: {
          type: "object",
          required: ["subscriberId"],
          properties: {
            subscriberId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const { subscriberId } = request.params;
      const { asOfDate } = request.query;
      const data = await ReportsService.getSubscriberSOA(subscriberId, asOfDate);
      return reply.send(data);
    }
  );

  fastify.get<{
    Params: { subscriberId: string };
    Querystring: { asOfDate?: string; format?: "pdf" | "xlsx" };
  }>(
    "/reports/soa/:subscriberId/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export official Subscriber Statement of Account (SOA) to PDF or XLSX",
        tags: ["Reports & Dashboard"],
        params: {
          type: "object",
          required: ["subscriberId"],
          properties: {
            subscriberId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const { subscriberId } = request.params;
      const { asOfDate, format = "pdf" } = request.query;
      const data = await ReportsService.getSubscriberSOA(subscriberId, asOfDate);
      const exported = await ReportExportService.exportReport("SOA", format, data);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 7. Collector Performance Report
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      collectorId?: string;
    };
  }>(
    "/reports/collector-performance",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate collector performance, collection, and remittance accuracy report",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const data = await ReportsService.getCollectorPerformanceReport(request.query);
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      collectorId?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/collector-performance/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export collector performance report to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const reportData = await ReportsService.getCollectorPerformanceReport(request.query);
      const exported = await ReportExportService.exportReport("COLLECTOR_PERFORMANCE", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 8. Payment Method Summary
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>(
    "/reports/payment-methods",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate payment method distribution summary",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const data = await ReportsService.getPaymentMethodSummary(request.query);
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/payment-methods/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export payment method summary to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const reportData = await ReportsService.getPaymentMethodSummary(request.query);
      const exported = await ReportExportService.exportReport("PAYMENT_METHOD_SUMMARY", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 9. Subscriber Master List
  fastify.get<{
    Querystring: {
      status?: string;
      collectionAreaId?: string;
      search?: string;
      page?: string;
      limit?: string;
    };
  }>(
    "/reports/subscribers-master",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate subscriber master list directory report",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const page = request.query.page ? parseInt(request.query.page, 10) : 1;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const data = await ReportsService.getSubscriberMasterList({
        ...request.query,
        page,
        limit,
      });
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      status?: string;
      collectionAreaId?: string;
      search?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/subscribers-master/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export subscriber master list directory to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const reportData = await ReportsService.getSubscriberMasterList({
        ...request.query,
        page: 1,
        limit: 10000,
      });
      const exported = await ReportExportService.exportReport("SUBSCRIBER_MASTER_LIST", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 10. Payment Reversal / Void Report
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>(
    "/reports/payment-reversals",
    {
      preHandler: [authenticate, requirePermission("report.view")],
      schema: {
        description: "Generate audited payment reversals and void transactions report",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const data = await ReportsService.getPaymentReversalsReport(request.query);
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/payment-reversals/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export payment reversals report to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const reportData = await ReportsService.getPaymentReversalsReport(request.query);
      const exported = await ReportExportService.exportReport("PAYMENT_REVERSALS", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );

  // 11. Audit Activity Report
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      actorUserId?: string;
      entityType?: string;
      action?: string;
      page?: string;
      limit?: string;
    };
  }>(
    "/reports/audit-activity",
    {
      preHandler: [authenticate, requirePermission("audit.view")],
      schema: {
        description: "Generate immutable system audit activity trail report",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const page = request.query.page ? parseInt(request.query.page, 10) : 1;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const data = await ReportsService.getAuditActivityReport({
        ...request.query,
        page,
        limit,
      });
      return reply.send(data);
    }
  );

  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      actorUserId?: string;
      entityType?: string;
      action?: string;
      format?: "csv" | "xlsx" | "pdf";
    };
  }>(
    "/reports/audit-activity/export",
    {
      preHandler: [authenticate, requirePermission("report.export")],
      schema: {
        description: "Export audit activity trail report to CSV, XLSX, or PDF",
        tags: ["Reports & Dashboard"],
      },
    },
    async (request, reply) => {
      const format = request.query.format || "xlsx";
      const reportData = await ReportsService.getAuditActivityReport({
        ...request.query,
        page: 1,
        limit: 10000,
      });
      const exported = await ReportExportService.exportReport("AUDIT_ACTIVITY", format, reportData);

      return reply
        .header("Content-Type", exported.mimeType)
        .header("Content-Disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.buffer);
    }
  );
};
