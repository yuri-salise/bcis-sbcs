import { describe, it, expect } from "vitest";
import { AuthService } from "./auth.service.js";

describe("AuthService Unit Tests", () => {
  it("hashes password with Argon2id and verifies correctly", async () => {
    const password = "SecurePassword123!";
    const hash = await AuthService.hashPassword(password);

    expect(hash).toContain("$argon2id$");
    const isValid = await AuthService.verifyPassword(hash, password);
    expect(isValid).toBe(true);

    const isInvalid = await AuthService.verifyPassword(hash, "WrongPassword");
    expect(isInvalid).toBe(false);
  });

  it("hashes tokens reproducibly using SHA-256", () => {
    const token = "test-token-1234567890";
    const hash1 = AuthService.hashToken(token);
    const hash2 = AuthService.hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});
