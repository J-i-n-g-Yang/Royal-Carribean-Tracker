import React, { useState } from 'react';
import { Mail, Loader2, Send, Eye, CheckCircle, XCircle } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5050';

/**
 * Preview/send UI for digest mode (see backend/digest.py). This hits the
 * SAME notify pipeline as the daily price-drop alerts and the "Send Test
 * Notification" button elsewhere in the app — it doesn't add a second
 * notification system, just a different message shape (a rollup instead of
 * a single event).
 *
 * The actual weekly schedule lives in .github/workflows/weekly-digest.yml,
 * not in this component — this UI is for previewing what that would send,
 * and for firing an ad-hoc digest on demand.
 */
export default function DigestSettings({ dark }) {
  const d = (l, dk) => (dark ? dk : l);
  const [days, setDays] = useState(7);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sendLoading, setSendLoading] = useState(false);

  const fetchPreview = async () => {
    setPreviewLoading(true);
    setSendResult(null);
    try {
      const res = await fetch(`${API_URL}/api/digest/preview?days=${days}`);
      const data = await res.json();
      setPreview(data);
    } catch (err) {
      setPreview({ text: `Failed to load preview: ${err.message}`, run_count: 0, hit_count: 0 });
    } finally {
      setPreviewLoading(false);
    }
  };

  const sendNow = async () => {
    setSendLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/digest/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      setSendResult(data);
      if (data.digest) setPreview(data.digest);
    } catch (err) {
      setSendResult({ success: false, error: err.message });
    } finally {
      setSendLoading(false);
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5 ${d('bg-gray-50 text-gray-600 border-b border-gray-200', 'bg-gray-800 text-gray-300 border-b border-gray-700')}`}>
        <Mail className="w-3.5 h-3.5" /> Digest Mode
      </div>
      <div className="p-4 space-y-3">
        <p className={`text-xs ${d('text-gray-600', 'text-gray-400')}`}>
          A weekly rollup — price hits, savings, and upcoming final payments — sent through the
          same notification URLs as your daily alerts, instead of one message per event.
          Runs automatically every Monday via <code className={`px-1 rounded ${d('bg-gray-100', 'bg-gray-800')}`}>weekly-digest.yml</code>,
          or trigger one manually below.
        </p>

        <div className="flex items-center gap-2">
          <label className={`text-xs font-medium ${d('text-gray-600', 'text-gray-300')}`}>Days to summarize</label>
          <input
            type="number" min={1} max={30} value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
            className={`w-16 text-xs rounded-md border px-2 py-1 ${d('border-gray-300 bg-white', 'border-gray-600 bg-gray-800 text-gray-100')}`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={fetchPreview} disabled={previewLoading}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${d('bg-gray-100 hover:bg-gray-200 text-gray-700', 'bg-gray-800 hover:bg-gray-700 text-gray-200')}`}
          >
            {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Preview
          </button>
          <button
            onClick={sendNow} disabled={sendLoading}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${d('bg-blue-600 hover:bg-blue-700 text-white', 'bg-blue-700 hover:bg-blue-600 text-white')}`}
          >
            {sendLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send Now
          </button>
        </div>

        {sendResult && (
          <div className={`flex items-center gap-1.5 text-xs font-medium ${sendResult.success ? d('text-green-700', 'text-green-400') : d('text-red-700', 'text-red-400')}`}>
            {sendResult.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {sendResult.success ? 'Digest sent.' : `Not sent: ${sendResult.error}`}
          </div>
        )}

        {preview && (
          <pre className={`text-xs whitespace-pre-wrap rounded-lg p-3 max-h-64 overflow-y-auto ${d('bg-gray-50 text-gray-700', 'bg-gray-800/70 text-gray-300')}`}>
            {preview.text}
          </pre>
        )}
      </div>
    </div>
  );
}
