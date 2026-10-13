import { useState, useEffect } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import { getCurrency } from '../services/settings';

const statusColor = {
  'Unpaid': 'bg-red-100 text-red-700',
  'Partially Paid': 'bg-yellow-100 text-yellow-700',
  'Paid': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
};

const Invoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { getCurrency().then(setCurrency); }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (filter) params.set('payment_status', filter);
      const res = await api.get(`/invoices?${params.toString()}`);
      setInvoices(res.data.data);
      if (res.data.pagination) setTotalPages(res.data.pagination.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch invoices', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
  }, [filter, page]);

  useEffect(() => { setPage(1); }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Invoices</h2>
        <div className="flex gap-2">
          {['', 'Unpaid', 'Partially Paid', 'Paid'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm">Invoice #</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm">Date</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm">Vehicle</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm">Customer</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm text-right">Total</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm">Status</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-400">No invoices found</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono font-semibold text-blue-700">{inv.invoice_number}</td>
                  <td className="px-6 py-4 text-gray-600 text-sm">
                    {new Date(inv.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-sm bg-yellow-300 px-2 py-0.5 rounded">{inv.registration_number}</span>
                    <span className="text-gray-500 text-xs ml-2">{inv.make} {inv.model}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{inv.customer_name}</td>
                  <td className="px-6 py-4 text-right font-semibold">{currency} {parseFloat(inv.grand_total).toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor[inv.payment_status] || ''}`}>
                      {inv.payment_status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/invoices/${inv.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Previous</button>
          <span className="text-gray-600">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
        </div>
      )}
    </div>
  );
};

export default Invoices;

