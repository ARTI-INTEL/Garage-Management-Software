import { useState, useEffect } from 'react';
import api from '../services/api';
import { ClipboardList, Download, MessageCircle, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const statusColor = {
  'Draft': 'bg-gray-100 text-gray-600',
  'Sent': 'bg-blue-100 text-blue-400',
  'Approved': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
  'Expired': 'bg-gray-100 text-gray-500',
};

const Quotations = () => {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/quotes?page=${page}&limit=10`);
      setQuotes(res.data.data);
      if (res.data.pagination) setTotalPages(res.data.pagination.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch quotes', error);
    }
    setLoading(false);
  };

  useEffect(() => { fetchQuotes(); }, [page]);

  const downloadPDF = async (id, number) => {
    try {
      const res = await api.get(`/quotes/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download PDF');
    }
  };

  const sendWhatsApp = async (id) => {
    try {
      const res = await api.get(`/quotes/${id}/whatsapp`);
      window.open(res.data.data.whatsapp_url, '_blank');
      fetchQuotes();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to generate WhatsApp link');
    }
  };

  const setStatus = async (id, status) => {
    try {
      await api.put(`/quotes/${id}/status`, { status });
      setMessage({ type: 'success', text: `Quotation marked ${status}. Job status updated.` });
      fetchQuotes();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update status' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <ClipboardList size={28} className="text-blue-600" />
        <h2 className="text-2xl font-bold">Quotations</h2>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-surface rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-gray-500 font-medium">Quote #</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Date</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Job</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Vehicle</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Customer</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-right">Total</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Status</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : quotes.length === 0 ? (
              <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-400">
                No quotations yet. Open a vehicle and click "Request Quote" on a job.
              </td></tr>
            ) : quotes.map(q => (
              <tr key={q.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono font-semibold text-blue-400">{q.quote_number}</td>
                <td className="px-6 py-4 text-gray-600 text-sm">
                  {new Date(q.quote_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-6 py-4 text-gray-700 text-sm">{q.job_title}</td>
                <td className="px-6 py-4">
                  <Link to={`/vehicles/${q.vehicle_id}`} className="font-bold text-sm bg-yellow-300 text-ink px-2 py-0.5 rounded hover:underline">
                    {q.registration_number}
                  </Link>
                </td>
                <td className="px-6 py-4 text-gray-700">{q.customer_name}</td>
                <td className="px-6 py-4 text-right font-semibold">AED {parseFloat(q.grand_total).toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor[q.status] || ''}`}>{q.status}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    <button onClick={() => downloadPDF(q.id, q.quote_number)} className="text-blue-600 hover:underline flex items-center gap-1">
                      <Download size={12} /> PDF
                    </button>
                    <button onClick={() => sendWhatsApp(q.id)} className="text-green-600 hover:underline flex items-center gap-1">
                      <MessageCircle size={12} /> Send
                    </button>
                    {q.status !== 'Approved' && (
                      <button onClick={() => setStatus(q.id, 'Approved')} className="text-green-700 hover:underline flex items-center gap-1">
                        <Check size={12} /> Approve
                      </button>
                    )}
                    {q.status !== 'Rejected' && (
                      <button onClick={() => setStatus(q.id, 'Rejected')} className="text-red-600 hover:underline flex items-center gap-1">
                        <X size={12} /> Reject
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {quotes.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t bg-gray-50 text-sm text-gray-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100">Previous</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Quotations;
