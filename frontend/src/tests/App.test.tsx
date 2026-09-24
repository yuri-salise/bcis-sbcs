import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../app/App";

describe("BCIS Desktop App Shell", () => {
  it("renders desktop shell navigation and branding", () => {
    render(<App />);

    expect(screen.getByText("BCIS BILLING")).toBeInTheDocument();
    expect(screen.getByText("Desktop Operations Client")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Subscribers")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("Collections")).toBeInTheDocument();
    expect(screen.getByText("Receivables")).toBeInTheDocument();
  });

  it("checks and displays API server and database connection", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Fastify API Server")).toBeInTheDocument();
      expect(screen.getByText("PostgreSQL 17")).toBeInTheDocument();
      expect(screen.getByText("Security Boundary")).toBeInTheDocument();
    });
  });
});
