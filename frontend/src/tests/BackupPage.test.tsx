import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BackupPage } from "../features/system/BackupPage.js";
import { AuthContext } from "../features/auth/AuthContext.js";
import { api } from "../api/client.js";

const mockAdminAuth = {
  user: {
    id: "user-123",
    username: "admin",
    displayName: "Maria Santos (Super Admin)",
    email: "admin@bcis.local",
  },
  roles: ["SUPER_ADMIN"],
  permissions: ["backup.restore", "user.manage", "report.view"],
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  hasRole: vi.fn().mockReturnValue(true),
  hasPermission: (perm: string) => ["backup.restore", "user.manage", "report.view"].includes(perm),
};

const mockCashierAuth = {
  user: {
    id: "user-456",
    username: "cashier",
    displayName: "Pedro Cashier",
    email: "cashier@bcis.local",
  },
  roles: ["CASHIER"],
  permissions: ["subscriber.view"],
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  hasRole: vi.fn().mockReturnValue(false),
  hasPermission: (perm: string) => ["subscriber.view"].includes(perm),
};

function renderWithAdmin(ui: React.ReactNode) {
  return render(<AuthContext.Provider value={mockAdminAuth}>{ui}</AuthContext.Provider>);
}

function renderWithCashier(ui: React.ReactNode) {
  return render(<AuthContext.Provider value={mockCashierAuth}>{ui}</AuthContext.Provider>);
}

describe("BackupPage Component (Phase 9 - Security, Hardening & AT-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header, 3-PC LAN networking card, and database integrity diagnostics", async () => {
    renderWithAdmin(<BackupPage />);

    expect(screen.getByText("System & Backup Administration")).toBeInTheDocument();
    expect(screen.getByText("3-PC LAN Deployment Endpoint")).toBeInTheDocument();
    expect(screen.getByText("Database Integrity Diagnostics")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("HEALTHY [PASSED]")).toBeInTheDocument();
    });
  });

  it("displays historical backups table with filenames, statuses, and checksums", async () => {
    renderWithAdmin(<BackupPage />);

    await waitFor(() => {
      expect(
        screen.getByText("bcis_backup_database_only_2026-09-26T01-00-00-000Z.json")
      ).toBeInTheDocument();
    });

    expect(screen.getByText("DATABASE_ONLY")).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("VERIFIED")).toBeInTheDocument();
  });

  it("opens Create Backup modal and submits new database snapshot request", async () => {
    const createBackupSpy = vi.spyOn(api, "createBackup").mockResolvedValueOnce({
      id: "backup-2",
      backupType: "DATABASE_ONLY",
      fileName: "bcis_backup_database_only_2026-09-26T02-00-00-000Z.json",
      filePath: "backups/bcis_backup_database_only_2026-09-26T02-00-00-000Z.json",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: "COMPLETED",
      fileSizeBytes: 2048000,
      sha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      tableCounts: { subscribers: 27 },
      createdBy: "user-123",
      verifiedAt: null,
      verificationStatus: "PENDING",
      verificationNotes: null,
      notes: "Manual snapshot",
      createdAt: new Date().toISOString(),
    });

    renderWithAdmin(<BackupPage />);

    const createBtn = screen.getByRole("button", { name: /create backup/i });
    fireEvent.click(createBtn);

    expect(screen.getByText("Create System Backup")).toBeInTheDocument();

    const notesInput = screen.getByPlaceholderText(/Optional operator notes/i);
    fireEvent.change(notesInput, { target: { value: "Pre-maintenance backup test" } });

    const submitBtn = screen.getByRole("button", { name: /generate snapshot/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createBackupSpy).toHaveBeenCalledWith({
        type: "DATABASE_ONLY",
        notes: "Pre-maintenance backup test",
      });
    });
  });

  it("triggers checksum verification on existing backup and updates message banner", async () => {
    const verifySpy = vi.spyOn(api, "verifyBackup").mockResolvedValueOnce({
      id: "backup-1",
      fileName: "bcis_backup_database_only_2026-09-26T01-00-00-000Z.json",
      verified: true,
      status: "VERIFIED",
      sha256: "3ca503c8e3f3c435edb93b6ba7593c5615d77a38e1eec01c2284d8c53816dbc9",
    });

    renderWithAdmin(<BackupPage />);

    await waitFor(() => {
      expect(screen.getByText("Verify Checksum")).toBeInTheDocument();
    });

    const verifyBtn = screen.getByText("Verify Checksum");
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledWith("backup-1");
    });
  });

  it("AT-12: opens restore modal, requires typing RESTORE, and executes restore operation", async () => {
    const restoreSpy = vi.spyOn(api, "restoreBackup").mockResolvedValueOnce({
      success: true,
      backupId: "backup-1",
      fileName: "bcis_backup_database_only_2026-09-26T01-00-00-000Z.json",
      status: "RESTORE_TESTED",
      tableCounts: { subscribers: 27 },
      restoredAt: new Date().toISOString(),
    });

    renderWithAdmin(<BackupPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    });

    // 1. Open Restore modal
    const restoreRowBtn = screen.getByRole("button", { name: "Restore" });
    fireEvent.click(restoreRowBtn);

    expect(screen.getByText("Database Restore (AT-12)")).toBeInTheDocument();
    expect(screen.getByText(/CRITICAL WARNING: Destructive Rollback Operation/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /confirm & restore database/i });
    expect(confirmBtn).toBeDisabled();

    // 2. Type wrong text -> button remains disabled
    const textInput = screen.getByPlaceholderText("Type RESTORE to proceed");
    fireEvent.change(textInput, { target: { value: "restor" } });
    expect(confirmBtn).toBeDisabled();

    // 3. Type "RESTORE" -> button becomes enabled
    fireEvent.change(textInput, { target: { value: "RESTORE" } });
    expect(confirmBtn).not.toBeDisabled();

    // 4. Click confirm
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith("backup-1");
    });

    await waitFor(() => {
      expect(screen.getByText(/Acceptance Test AT-12 Verified/i)).toBeInTheDocument();
    });
  });

  it("enforces RBAC: displays access restricted message when user lacks backup.restore", () => {
    renderWithCashier(<BackupPage />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(
      screen.getByText(/You do not have the.*permission required/i)
    ).toBeInTheDocument();
  });
});
