import React, { useState } from "react";
import { Save, AlertCircle } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { api, type ServicePlan } from "../../api/client";

interface AddServicePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (plan: ServicePlan) => void;
}

export const AddServicePlanModal: React.FC<AddServicePlanModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    serviceTypeCode: "INTERNET",
    code: "",
    name: "",
    description: "",
    monthlyPrice: "",
    installationFee: "1500.00",
    reconnectionFee: "300.00",
    speedMbps: "",
    channelCount: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        speedMbps: formData.speedMbps ? parseInt(formData.speedMbps) : undefined,
        channelCount: formData.channelCount ? parseInt(formData.channelCount) : undefined,
      };
      const plan = await api.createServicePlan(payload);
      onSuccess(plan);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create service plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Service Plan">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md flex items-start gap-2 text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Service Type <span className="text-rose-500">*</span></label>
              <select
                name="serviceTypeCode"
                value={formData.serviceTypeCode}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="INTERNET">Fiber Internet</option>
                <option value="CABLE">Cable TV</option>
                <option value="COMBO">Combo (Internet + TV)</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Plan Code <span className="text-rose-500">*</span></label>
              <input
                type="text"
                name="code"
                required
                placeholder="e.g. PLAN-FIBER-100"
                value={formData.code}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1 col-span-2">
              <label className="text-xs font-semibold text-slate-700">Plan Name <span className="text-rose-500">*</span></label>
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. Fiber 100 Mbps Home"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1 col-span-2">
              <label className="text-xs font-semibold text-slate-700">Description</label>
              <textarea
                name="description"
                rows={2}
                value={formData.description}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Monthly Price (₱) <span className="text-rose-500">*</span></label>
              <input
                type="number"
                step="0.01"
                name="monthlyPrice"
                required
                value={formData.monthlyPrice}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Installation Fee (₱)</label>
              <input
                type="number"
                step="0.01"
                name="installationFee"
                value={formData.installationFee}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Reconnection Fee (₱)</label>
              <input
                type="number"
                step="0.01"
                name="reconnectionFee"
                value={formData.reconnectionFee}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {(formData.serviceTypeCode === "INTERNET" || formData.serviceTypeCode === "COMBO") && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Speed (Mbps)</label>
                <input
                  type="number"
                  name="speedMbps"
                  value={formData.speedMbps}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {(formData.serviceTypeCode === "CABLE" || formData.serviceTypeCode === "COMBO") && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Channel Count</label>
                <input
                  type="number"
                  name="channelCount"
                  value={formData.channelCount}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {loading ? "Saving..." : "Save Plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
