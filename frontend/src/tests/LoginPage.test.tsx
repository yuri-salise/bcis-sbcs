import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoginPage } from "../features/auth/LoginPage";
import { AuthProvider } from "../features/auth/AuthContext";

describe("LoginPage Component", () => {
  it("renders login form with branding, inputs, and submit button", () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    expect(screen.getByText("BCIS BILLING")).toBeInTheDocument();
    expect(screen.getByText("Sign In to Terminal")).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /authenticate & launch/i })).toBeInTheDocument();
  });

  it("populates inputs when quick-fill button is clicked", () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    const cashierQuickBtn = screen.getByRole("button", { name: "Cashier" });
    fireEvent.click(cashierQuickBtn);

    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

    expect(usernameInput.value).toBe("cashier");
    expect(passwordInput.value).toBe("Password123!");
  });
});
