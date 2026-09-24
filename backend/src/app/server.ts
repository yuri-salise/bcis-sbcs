import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./config/env.js";
import { AppError } from "./errors/app-error.js";
import { healthRoutes } from "../modules/health/health.routes.js";

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  });

  // Sensible defaults
  server.register(sensible);

  // CORS configuration
  server.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // OpenAPI / Swagger Documentation
  server.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "BCIS Subscription Billing and Collection System API",
        description: "Official REST API for the BCIS Subscription Billing and Collection System",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://localhost:${env.PORT}`,
          description: "Local development server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      tags: [
        { name: "System", description: "Health, readiness, and system status" },
        { name: "Auth", description: "Authentication and session management" },
        { name: "Subscribers", description: "Subscriber profile and account management" },
        { name: "Billing", description: "Invoices, billing cycles, and ledger" },
        { name: "Payments", description: "Payment processing and allocation" },
        { name: "Collections", description: "Collector batches and remittances" },
        { name: "Receivables", description: "AR aging and overdue tracking" },
        { name: "Reports", description: "Financial and operational reports" },
      ],
    },
  });

  server.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  // Global Error Handler
  server.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    const fastifyErr = error as FastifyError;

    // Fastify validation errors
    if (fastifyErr.validation) {
      return reply.status(422).send({
        statusCode: 422,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: fastifyErr.validation,
      });
    }

    // Default 500 error
    request.log.error(error);
    const statusCode = fastifyErr.statusCode ?? 500;
    return reply.status(statusCode).send({
      statusCode,
      code: "INTERNAL_SERVER_ERROR",
      message: env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  });

  // Register Core Routes
  server.register(healthRoutes);
  server.register(healthRoutes, { prefix: "/api/v1" });

  return server;
}
