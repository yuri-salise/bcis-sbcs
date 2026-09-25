import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  RefreshCw,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Clock,
  ExternalLink,
  ShieldAlert,
  Eye,
  X,
  FileCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Receipt,
} from "lucide-react";
import {
  api,
  type GcashProofItem,
  type GcashProofDetail,
  type GcashVerificationStatus,
  type Subscriber,
  type PaymentAllocationPreviewResult,
  type VerifyGcashProofResponse,
} from "../../api/client";
import { useAuth } from "../auth/AuthContext";
import { cn, formatMoney } from "../../lib/utils";

export function GcashVerificationPage() {
  const { hasPermission } = useAuth();
  const canVerify = hasPermission("gcash.verify");
  const canSubmit = hasPermission("payment.create") || canVerify;

  // Queue State
  const [queueItems, setQueueItems] = useState<GcashProofItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Selected Detail State
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null);
  const [selectedProof, setSelectedProof] = useState<GcashProofDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Verify Modal State
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState("");
  const [selectedServiceAccountId, setSelectedServiceAccountId] = useState("");
  const [allocationPreview, setAllocationPreview] = useState<PaymentAllocationPreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submittingVerify, setSubmittingVerify] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccessResult, setVerifySuccessResult] = useState<VerifyGcashProofResponse | null>(null);

  // Reject Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Submit Proof Modal State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitSubSearch, setSubmitSubSearch] = useState("");
  const [subscribersList, setSubscribersList] = useState<Subscriber[]>([]);
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [searchingSubs, setSearchingSubs] = useState(false);
  const [submitRefNumber, setSubmitRefNumber] = useState("");
  const [submitAmount, setSubmitAmount] = useState("");
  const [submitDate, setSubmitDate] = useState(() => (new Date().toISOString().split("T")[0] as string));
  const [submitSenderName, setSubmitSenderName] = useState("");
  const [submitSenderMobile, setSubmitSenderMobile] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>("");
  const [submittingProof, setSubmittingProof] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState(false);

  // Fetch Queue
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listGcashQueue({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        search: search.trim() || undefined,
        page,
        limit: 15,
      });
      setQueueItems(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);

      // Select first item if nothing selected or current selection missing
      if (res.data.length > 0) {
        if (!selectedProofId || !res.data.some((i: GcashProofItem) => i.id === selectedProofId)) {
          setSelectedProofId(res.data[0]!.id);
        }
      } else {
        setSelectedProofId(null);
        setSelectedProof(null);
      }
    } catch (err: any) {
      console.error("Failed to load GCash queue:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page, selectedProofId]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Fetch Single Proof Details
  useEffect(() => {
    if (!selectedProofId) {
      setSelectedProof(null);
      setImageBlobUrl(null);
      return;
    }

    let isMounted = true;
    setLoadingDetail(true);
    setImageLoadError(false);

    api
      .getGcashProof(selectedProofId)
      .then((detail) => {
        if (!isMounted) return;
        setSelectedProof(detail);
        setSelectedServiceAccountId(detail.serviceAccountId || "");
      })
      .catch((err) => {
        console.error("Failed to load proof details:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingDetail(false);
      });

    // Load file blob
    setLoadingImage(true);
    api
      .getGcashProofFileBlob(selectedProofId)
      .then((blob) => {
        if (!isMounted) return;
        const objectUrl = URL.createObjectURL(blob);
        setImageBlobUrl(objectUrl);
      })
      .catch((err) => {
        console.error("Failed to load proof file blob:", err);
        if (isMounted) setImageLoadError(true);
      })
      .finally(() => {
        if (isMounted) setLoadingImage(false);
      });

    return () => {
      isMounted = false;
      if (imageBlobUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(imageBlobUrl);
      }
    };
  }, [selectedProofId]);

  // Search subscribers for submit modal
  useEffect(() => {
    if (!submitSubSearch.trim()) {
      setSubscribersList([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingSubs(true);
      try {
        const res = await api.listSubscribers({ search: submitSubSearch.trim(), limit: 5 });
        setSubscribersList(res.data);
      } catch (err) {
        console.error("Subscriber search failed:", err);
      } finally {
        setSearchingSubs(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [submitSubSearch]);

  // Handle File Selection in Submit Modal
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setSubmitError("File size exceeds the 5MB limit.");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setSubmitError("Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed.");
      return;
    }

    setSelectedFile(file);
    setSubmitError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(",")[1];
      if (base64String) setFileBase64(base64String);
    };
    reader.readAsDataURL(file);
  };

  // Submit Proof Action
  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubscriber) {
      setSubmitError("Please select a subscriber.");
      return;
    }
    if (!submitRefNumber.trim()) {
      setSubmitError("GCash reference number is required.");
      return;
    }
    if (!submitAmount || Number(submitAmount) <= 0) {
      setSubmitError("Please enter a valid amount greater than zero.");
      return;
    }
    if (!selectedFile || !fileBase64) {
      setSubmitError("Please attach a proof screenshot or document.");
      return;
    }

    setSubmittingProof(true);
    setSubmitError(null);

    try {
      const res = await api.submitGcashProof({
        subscriberId: selectedSubscriber.id,
        referenceNumber: submitRefNumber.trim(),
        amount: Number(submitAmount).toFixed(2),
        transactionDate: submitDate,
        senderName: submitSenderName.trim() || undefined,
        senderMobile: submitSenderMobile.trim() || undefined,
        notes: submitNotes.trim() || undefined,
        originalFilename: selectedFile.name,
        mimeType: selectedFile.type,
        fileBase64,
      });

      setShowSubmitModal(false);
      // Reset form
      setSelectedSubscriber(null);
      setSubmitSubSearch("");
      setSubmitRefNumber("");
      setSubmitAmount("");
      setSubmitSenderName("");
      setSubmitSenderMobile("");
      setSubmitNotes("");
      setSelectedFile(null);
      setFileBase64("");

      // Refresh queue and select new item
      await fetchQueue();
      if (res.proof?.id) {
        setSelectedProofId(res.proof.id);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit GCash proof.");
    } finally {
      setSubmittingProof(false);
    }
  };

  // Open Verify Modal & load preview
  const handleOpenVerifyModal = async () => {
    if (!selectedProof) return;
    setShowVerifyModal(true);
    setVerifyError(null);
    setVerifySuccessResult(null);
    setVerifyNotes("");
    setLoadingPreview(true);

    try {
      const preview = await api.previewPaymentAllocation({
        subscriberId: selectedProof.subscriberId,
        serviceAccountId: selectedServiceAccountId || undefined,
        amount: selectedProof.amount,
      });
      setAllocationPreview(preview);
    } catch (err: any) {
      setVerifyError(err.message || "Failed to preview allocation.");
    } finally {
      setLoadingPreview(false);
    }
  };

  // Confirm Verification Action
  const handleConfirmVerify = async () => {
    if (!selectedProof) return;
    setSubmittingVerify(true);
    setVerifyError(null);

    try {
      const res = await api.verifyGcashProof(selectedProof.id, {
        notes: verifyNotes.trim() || undefined,
        serviceAccountId: selectedServiceAccountId || undefined,
      });

      setVerifySuccessResult(res);
      await fetchQueue();
    } catch (err: any) {
      setVerifyError(err.message || "Verification failed.");
    } finally {
      setSubmittingVerify(false);
    }
  };

  // Confirm Rejection Action
  const handleConfirmReject = async () => {
    if (!selectedProof) return;
    if (!rejectReason || rejectReason.trim().length < 5) {
      setRejectError("Rejection reason must be at least 5 characters.");
      return;
    }

    setSubmittingReject(true);
    setRejectError(null);

    try {
      await api.rejectGcashProof(selectedProof.id, {
        reason: rejectReason.trim(),
      });
      setShowRejectModal(false);
      setRejectReason("");
      await fetchQueue();
    } catch (err: any) {
      setRejectError(err.message || "Rejection failed.");
    } finally {
      setSubmittingReject(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const statusBadge = (status: GcashVerificationStatus) => {
    switch (status) {
      case "VERIFIED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
          </span>
        );
      case "FLAGGED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3 mr-1" /> Flagged
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400">
            <XCircle className="w-3 h-3 mr-1" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">
            <Clock className="w-3 h-3 mr-1" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-6 space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileCheck className="w-7 h-7 text-primary" />
            GCash Proof Verification
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Two-pane verification queue for customer mobile payments, duplicate prevention, and oldest-first posting
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchQueue()}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>

          {canSubmit && (
            <button
              onClick={() => {
                setShowSubmitModal(true);
                setSubmitError(null);
              }}
              className="inline-flex items-center justify-center px-3.5 py-2 text-sm font-medium rounded-lg text-primary-foreground bg-primary hover:bg-primary/90 transition-colors shadow-sm"
            >
              <UploadCloud className="w-4 h-4 mr-2" />
              Submit Proof
            </button>
          )}
        </div>
      </div>

      {/* Two-Pane Workspace (PRODUCT.md Section 14.4) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Left Pane: Queue Table (5 columns on large screen) */}
        <div className="lg:col-span-5 flex flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Filters & Search Header */}
          <div className="p-3 border-b border-border bg-muted/40 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search ref #, name, account..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-background rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 text-xs bg-background rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="PENDING">Pending</option>
                <option value="FLAGGED">Flagged (Duplicates)</option>
                <option value="VERIFIED">Verified</option>
                <option value="REJECTED">Rejected</option>
                <option value="ALL">All Statuses</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Queue: {totalCount} proofs</span>
              {statusFilter === "PENDING" && <span className="text-amber-600 font-medium">Awaiting Review</span>}
            </div>
          </div>

          {/* Queue List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {loading && queueItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                <p className="text-xs">Loading verification queue...</p>
              </div>
            ) : queueItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <FileCheck className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium text-foreground">No payment proofs found</p>
                <p className="text-xs mt-1">Change filter or submit a new proof to populate queue.</p>
              </div>
            ) : (
              queueItems.map((item) => {
                const isSelected = item.id === selectedProofId;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedProofId(item.id)}
                    className={cn(
                      "w-full text-left p-3.5 transition-all hover:bg-muted/50 flex flex-col gap-1.5 relative group",
                      isSelected && "bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-foreground tracking-tight group-hover:text-primary">
                        {item.referenceNumber}
                      </span>
                      {statusBadge(item.verificationStatus)}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground font-medium truncate max-w-[200px]">
                        {item.subscriberDisplayName}
                      </span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(item.amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Acc: {item.subscriberAccountNumber}</span>
                      <span>{item.transactionDate}</span>
                    </div>

                    {item.duplicateDetected && (
                      <div className="mt-1 flex items-center text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/50">
                        <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span className="truncate">{item.duplicateWarning || "Duplicate reference detected"}</span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded border border-border disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded border border-border disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Pane: Proof Details + Image Preview + Actions (7 columns) */}
        <div className="lg:col-span-7 flex flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {loadingDetail ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <RefreshCw className="w-8 h-8 mb-2 animate-spin text-primary" />
              <p className="text-xs">Loading proof details...</p>
            </div>
          ) : !selectedProof ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <Eye className="w-12 h-12 mb-3 opacity-25" />
              <p className="text-base font-semibold text-foreground">No Proof Selected</p>
              <p className="text-sm mt-1 max-w-sm">
                Select a payment proof from the left queue to inspect attachment, check duplicate flags, and post payment.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Proof Header Banner */}
              <div className="p-4 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-foreground">
                      {selectedProof.referenceNumber}
                    </span>
                    {statusBadge(selectedProof.verificationStatus)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Submitted on {new Date(selectedProof.submittedAt).toLocaleString()}
                  </p>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2">
                  {canVerify && selectedProof.verificationStatus !== "VERIFIED" && selectedProof.verificationStatus !== "REJECTED" && (
                    <>
                      <button
                        onClick={() => {
                          setShowRejectModal(true);
                          setRejectError(null);
                        }}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                        Reject Proof
                      </button>

                      <button
                        onClick={handleOpenVerifyModal}
                        className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Verify & Post Payment
                      </button>
                    </>
                  )}

                  {selectedProof.receiptNumber && (
                    <span className="inline-flex items-center px-3 py-1 text-xs font-medium bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800">
                      <Receipt className="w-3.5 h-3.5 mr-1.5" />
                      Receipt #{selectedProof.receiptNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Duplicate Reference Warning Card (AT-05) */}
              {selectedProof.duplicateDetection.isDuplicate && (
                <div className="m-4 p-4 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-300 flex items-start gap-3 shadow-sm">
                  <ShieldAlert className="w-6 h-6 flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <h4 className="font-bold text-sm text-red-800 dark:text-red-200 flex items-center gap-1.5">
                      DUPLICATE REFERENCE DETECTED (AT-05)
                    </h4>
                    <p>{selectedProof.duplicateDetection.duplicateWarning}</p>
                    {selectedProof.duplicateDetection.matchedPayment && (
                      <div className="mt-2 bg-background/80 dark:bg-black/30 p-2.5 rounded-lg border border-red-200 dark:border-red-800/50 font-mono text-[11px] space-y-0.5">
                        <div>Matched Receipt: #{selectedProof.duplicateDetection.matchedPayment.receiptNumber}</div>
                        <div>Amount Posted: {formatMoney(selectedProof.duplicateDetection.matchedPayment.amountPaid)}</div>
                        <div>Payment Date: {selectedProof.duplicateDetection.matchedPayment.paymentDate}</div>
                      </div>
                    )}
                    <p className="text-[11px] text-red-700 dark:text-red-400 font-medium pt-1">
                      System policy blocks double-posting of identical GCash references. Do not approve without supervisor clearance.
                    </p>
                  </div>
                </div>
              )}

              {/* If Rejected: Show Rejection Callout */}
              {selectedProof.verificationStatus === "REJECTED" && (
                <div className="m-4 p-3.5 rounded-xl border border-rose-200 bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    Proof Rejected on {selectedProof.verifiedAt ? new Date(selectedProof.verifiedAt).toLocaleString() : "N/A"}
                  </div>
                  <p className="font-medium">Reason: {selectedProof.rejectionReason || "No reason specified"}</p>
                  <p className="text-[11px] text-muted-foreground">Original uploaded file is retained for audit compliance.</p>
                </div>
              )}

              <div className="p-4 space-y-6">
                {/* Proof Image / Document Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>Uploaded Proof Attachment</span>
                    {imageBlobUrl && (
                      <a
                        href={imageBlobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" /> Open Full File
                      </a>
                    )}
                  </div>

                  <div className="bg-muted/40 rounded-xl border border-border p-3 flex flex-col items-center justify-center min-h-[260px] max-h-[380px] overflow-hidden">
                    {loadingImage ? (
                      <div className="flex flex-col items-center justify-center text-muted-foreground p-8">
                        <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                        <span className="text-xs">Streaming proof preview...</span>
                      </div>
                    ) : imageLoadError ? (
                      <div className="flex flex-col items-center justify-center text-rose-500 p-8 text-center">
                        <AlertTriangle className="w-8 h-8 mb-2" />
                        <span className="text-xs font-medium">Failed to preview file attachment</span>
                      </div>
                    ) : selectedProof.mimeType === "application/pdf" ? (
                      <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                        <FileText className="w-16 h-16 text-rose-500" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{selectedProof.originalFilename}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            PDF Document ({(selectedProof.fileSize / 1024).toFixed(1)} KB)
                          </p>
                        </div>
                        {imageBlobUrl && (
                          <a
                            href={imageBlobUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View PDF
                          </a>
                        )}
                      </div>
                    ) : imageBlobUrl ? (
                      <img
                        src={imageBlobUrl}
                        alt="GCash Proof Preview"
                        className="max-h-[350px] max-w-full object-contain rounded shadow-sm border border-border"
                      />
                    ) : null}
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Financial & Sender Info */}
                  <div className="p-3.5 bg-muted/20 rounded-xl border border-border space-y-2.5">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Transaction Info
                    </h5>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Declared Amount:</span>
                        <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                          {formatMoney(selectedProof.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Transaction Date:</span>
                        <span className="font-medium text-foreground">{selectedProof.transactionDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sender Name:</span>
                        <span className="font-medium text-foreground">{selectedProof.senderName || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sender Mobile:</span>
                        <span className="font-mono text-foreground">{selectedProof.senderMobile || "—"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Subscriber & Account Info */}
                  <div className="p-3.5 bg-muted/20 rounded-xl border border-border space-y-2.5">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Subscriber Profile
                    </h5>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subscriber:</span>
                        <span className="font-medium text-foreground">{selectedProof.subscriberDisplayName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Account #:</span>
                        <span className="font-mono text-foreground">{selectedProof.subscriberAccountNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Service Account:</span>
                        <span className="font-mono text-foreground">
                          {selectedProof.serviceAccountNumber || "Default account"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contact:</span>
                        <span className="font-mono text-foreground">{selectedProof.subscriberMobile || "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Audit & File Security Card */}
                <div className="p-3 bg-muted/10 rounded-lg border border-border/60 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between text-muted-foreground">
                    <span>File: {selectedProof.originalFilename} ({(selectedProof.fileSize / 1024).toFixed(1)} KB)</span>
                    <button
                      onClick={() => copyToClipboard(selectedProof.sha256)}
                      className="inline-flex items-center gap-1 hover:text-foreground font-mono text-[11px]"
                    >
                      SHA256: {selectedProof.sha256.substring(0, 16)}...
                      {copiedSha ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  {selectedProof.notes && (
                    <div className="text-muted-foreground italic pt-1 border-t border-border/40">
                      Staff Notes: {selectedProof.notes}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Verify & Post Modal */}
      {showVerifyModal && selectedProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Verify & Post Payment</h3>
                  <p className="text-xs text-muted-foreground">Mint authoritative Official Receipt & allocate oldest-first</p>
                </div>
              </div>
              <button
                onClick={() => setShowVerifyModal(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {verifySuccessResult ? (
                <div className="space-y-4 py-2 text-center">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-foreground">Official Receipt Issued</h4>
                    <p className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {verifySuccessResult.receiptNumber}
                    </p>
                    <p className="text-xs text-muted-foreground pt-1">
                      {verifySuccessResult.message}
                    </p>
                  </div>

                  <div className="bg-muted/40 p-3 rounded-xl border border-border text-left space-y-1">
                    <div className="font-medium text-foreground">Allocation Summary:</div>
                    {verifySuccessResult.allocations.map((alloc) => (
                      <div key={alloc.invoiceId} className="flex justify-between text-muted-foreground">
                        <span>Inv #{alloc.invoiceNumber}</span>
                        <span className="font-semibold text-foreground">{formatMoney(alloc.allocatedAmount)}</span>
                      </div>
                    ))}
                    {Number(verifySuccessResult.advanceCredit) > 0 && (
                      <div className="flex justify-between text-blue-600 dark:text-blue-400 font-medium pt-1 border-t border-border">
                        <span>Advance Overpayment Credit</span>
                        <span>{formatMoney(verifySuccessResult.advanceCredit)}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setShowVerifyModal(false);
                      setVerifySuccessResult(null);
                    }}
                    className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {verifyError && (
                    <div className="p-3 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900 text-xs">
                      {verifyError}
                    </div>
                  )}

                  {/* Summary Card */}
                  <div className="bg-muted/30 p-3 rounded-xl border border-border space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subscriber:</span>
                      <span className="font-semibold text-foreground">{selectedProof.subscriberDisplayName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GCash Reference:</span>
                      <span className="font-mono font-semibold text-foreground">{selectedProof.referenceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Amount:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                        {formatMoney(selectedProof.amount)}
                      </span>
                    </div>
                  </div>

                  {/* Live Allocation Preview */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground block">
                      Automatic Oldest-First Allocation Preview:
                    </label>
                    {loadingPreview ? (
                      <div className="p-4 text-center text-muted-foreground bg-muted/20 rounded-lg">
                        <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                        Computing allocation...
                      </div>
                    ) : allocationPreview ? (
                      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden bg-background">
                        {allocationPreview.invoiceAllocations.length === 0 ? (
                          <div className="p-3 text-center text-muted-foreground">
                            No open invoices. Entire payment of {formatMoney(selectedProof.amount)} will post as advance credit.
                          </div>
                        ) : (
                          allocationPreview.invoiceAllocations.map((inv) => (
                            <div key={inv.invoiceId} className="p-2.5 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-semibold text-foreground">{inv.invoiceNumber}</span>
                                <span className="text-muted-foreground ml-2">Due: {inv.dueDate}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatMoney(inv.allocatedAmount)}
                                </span>
                                <span className="text-[11px] text-muted-foreground ml-1">
                                  ({inv.resultingStatus})
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                        {Number(allocationPreview.advanceCredit) > 0 && (
                          <div className="p-2.5 bg-blue-50/50 dark:bg-blue-950/30 flex justify-between text-xs text-blue-700 dark:text-blue-300 font-medium">
                            <span>Advance Credit Overpayment:</span>
                            <span>{formatMoney(allocationPreview.advanceCredit)}</span>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {/* Cashier Notes */}
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground block">Verification Notes (Optional):</label>
                    <textarea
                      value={verifyNotes}
                      onChange={(e) => setVerifyNotes(e.target.value)}
                      placeholder="e.g., Confirmed with GCash merchant SMS alert..."
                      rows={2}
                      className="w-full p-2 text-xs bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowVerifyModal(false)}
                      className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted text-foreground font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={submittingVerify}
                      onClick={handleConfirmVerify}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {submittingVerify ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Posting...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Confirm & Issue Receipt
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-rose-50/40 dark:bg-rose-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Reject Payment Proof</h3>
                  <p className="text-xs text-muted-foreground">Preserve evidence without altering financial records</p>
                </div>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {rejectError && (
                <div className="p-3 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                  {rejectError}
                </div>
              )}

              <p className="text-muted-foreground">
                You are rejecting GCash submission with Ref #{selectedProof.referenceNumber} for subscriber{" "}
                <span className="font-semibold text-foreground">{selectedProof.subscriberDisplayName}</span>.
              </p>

              <div className="space-y-1">
                <label className="font-semibold text-foreground block">
                  Mandatory Rejection Reason: <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Unreadable screenshot, fake transaction ID, amount mismatch..."
                  rows={3}
                  className="w-full p-2.5 text-xs bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <span className="text-[11px] text-muted-foreground">Minimum 5 characters required for audit trail.</span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted text-foreground font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingReject || rejectReason.trim().length < 5}
                  onClick={handleConfirmReject}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingReject ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      Reject Proof
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit Proof Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-xl rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Submit GCash Proof</h3>
                  <p className="text-xs text-muted-foreground">Upload customer mobile payment screenshot for verification</p>
                </div>
              </div>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitProof} className="p-5 overflow-y-auto space-y-4 text-xs">
              {submitError && (
                <div className="p-3 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                  {submitError}
                </div>
              )}

              {/* Subscriber Selector */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground block">
                  Select Subscriber: <span className="text-rose-500">*</span>
                </label>
                {selectedSubscriber ? (
                  <div className="p-2.5 rounded-lg border border-border bg-muted/30 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-foreground">
                        {selectedSubscriber.businessName || `${selectedSubscriber.firstName} ${selectedSubscriber.lastName}`}
                      </span>
                      <span className="text-muted-foreground font-mono ml-2">({selectedSubscriber.accountNumber})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSubscriber(null)}
                      className="text-xs text-muted-foreground hover:text-rose-500"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <input
                      type="text"
                      placeholder="Type subscriber name or account number..."
                      value={submitSubSearch}
                      onChange={(e) => setSubmitSubSearch(e.target.value)}
                      className="w-full p-2 bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {searchingSubs && <p className="text-[11px] text-muted-foreground">Searching...</p>}
                    {subscribersList.length > 0 && (
                      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden bg-background shadow-md">
                        {subscribersList.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              setSelectedSubscriber(sub);
                              setSubmitSubSearch("");
                              setSubscribersList([]);
                            }}
                            className="w-full text-left p-2 hover:bg-muted text-xs flex justify-between"
                          >
                            <span className="font-medium text-foreground">
                              {sub.businessName || `${sub.firstName} ${sub.lastName}`}
                            </span>
                            <span className="font-mono text-muted-foreground">{sub.accountNumber}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Reference Number & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground block">
                    GCash Reference Number: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 100234857219"
                    value={submitRefNumber}
                    onChange={(e) => setSubmitRefNumber(e.target.value)}
                    className="w-full p-2 font-mono bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground block">
                    Amount Paid (₱): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="0.00"
                    value={submitAmount}
                    onChange={(e) => setSubmitAmount(e.target.value)}
                    className="w-full p-2 font-bold bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Transaction Date & Sender Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground block">
                    Transaction Date: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={submitDate}
                    onChange={(e) => setSubmitDate(e.target.value)}
                    className="w-full p-2 bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground block">Sender Name (Optional):</label>
                  <input
                    type="text"
                    placeholder="e.g. Maria Clara"
                    value={submitSenderName}
                    onChange={(e) => setSubmitSenderName(e.target.value)}
                    className="w-full p-2 bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Sender Mobile */}
              <div className="space-y-1">
                <label className="font-semibold text-foreground block">Sender Mobile Number (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g. 09171234567"
                  value={submitSenderMobile}
                  onChange={(e) => setSubmitSenderMobile(e.target.value)}
                  className="w-full p-2 font-mono bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* File Upload Dropzone */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground block">
                  Proof File Screenshot (JPEG, PNG, WebP, PDF &lt;= 5MB): <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                />
                {selectedFile && (
                  <p className="text-[11px] text-muted-foreground">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {/* Staff Notes */}
              <div className="space-y-1">
                <label className="font-semibold text-foreground block">Internal Notes (Optional):</label>
                <textarea
                  placeholder="Add notes about submission..."
                  value={submitNotes}
                  onChange={(e) => setSubmitNotes(e.target.value)}
                  rows={2}
                  className="w-full p-2 text-xs bg-background rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted text-foreground font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProof || !selectedFile || !selectedSubscriber}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingProof ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      Submit for Verification
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
