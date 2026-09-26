import "fastify";

declare module "fastify" {
  interface FastifySchema {
    tags?: readonly string[];
    description?: string;
    summary?: string;
    consumes?: readonly string[];
    produces?: readonly string[];
    hide?: boolean;
    deprecated?: boolean;
    operationId?: string;
  }

  interface FastifyRequest {
    isMultipart: () => boolean;
    parts: (options?: any) => AsyncIterableIterator<any>;
  }
}
