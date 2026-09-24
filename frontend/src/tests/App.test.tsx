import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../app/App";
import { api } from "../api/client";

describe("BCIS Desktop App Shell", () => {
  beforeEach(() => {
    localStorage.clear();
    api.setToken(null);
  });

  it("renders login page when unauthenticated", () => {
    render(<App />);

    expect(screen.getByText("Sign In to Terminal")).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders desktop shell navigation and status when authenticated", async () => {
    api.setToken("mock-token-abc");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Maria Santos (Super Admin)")).toBeInTheDocument();
      expect(screen.getByText("BCIS BILLING")).toBeInTheDocument();
      expect(screen.getByText("Desktop Operations Client")).toBeInTheDocument();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Fastify API Server")).toBeInTheDocument();
      expect(screen.getByText("PostgreSQL 17")).toBeInTheDocument();
    });
  });
});
