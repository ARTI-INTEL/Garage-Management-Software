import { useState, useEffect } from 'react';
import api from '../services/api';
import { BarChart3 } from 'lucide-react';

const Reports = () => {
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await api.get('/reports');
        setReports(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load reports');
      }
      setLoading(false);
    };
    fetchReports();
  }, []);

  if (loading) return <div className="py-8 text-center text-gray-400">Loading reports...</div>;
  if (error) return <div className="py-8 text-center text-red-500">{error}</div>;
  if (!reports) return null;

  const maxRev = Math.max(1, ...reports.revenueByMonth.map(r => Number(r.total)));
  const monthLabel = (ym) => {
    const [y, m] = ym.split('-');
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 border-b pb-4">
        <BarChart3 size={28} className="text-blue-600" />
        <h2 className="text-2xl font-bold">Reports</h2>
      </div>

      {/* VAT summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-lg shadow border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Invoices Issued</p>
          <p className="text-2xl font-bold mt-1">{reports.vat.invoice_count}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Subtotal</p>
          <p className="text-2xl font-bold mt-1">AED {parseFloat(reports.vat.total_subtotal).toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 uppercase tracking-wider">VAT / Tax Collected</p>
          <p className="text-2xl font-bold mt-1">AED {parseFloat(reports.vat.total_tax).toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase tracking-wider">VAT This Month</p>
          <p className="text-2xl font-bold mt-1">AED {parseFloat(reports.vat.tax_this_month).toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by month */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Revenue by Month (Last 12)</h3>
          {reports.revenueByMonth.length === 0 ? (
            <p className="text-gray-400 text-sm">No payments recorded yet.</p>
          ) : (
            <div className="flex items-end gap-2 h-52">
              {reports.revenueByMonth.map((r) => (
                <div key={r.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-xs font-semibold text-gray-700">{Number(r.total).toFixed(0)}</span>
                  <div className="w-full bg-green-500 rounded-t-md" style={{ height: `${(Number(r.total) / maxRev) * 100}%`, minHeight: '4px' }} />
                  <span className="text-xs text-gray-500">{monthLabel(r.month)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mechanic performance */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Mechanic Performance</h3>
          {reports.mechanicPerformance.length === 0 ? (
            <p className="text-gray-400 text-sm">No completed jobs yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-400 border-b">
                  <th className="py-2 font-medium">Mechanic</th>
                  <th className="py-2 font-medium text-center">Jobs Done</th>
                  <th className="py-2 font-medium text-right">Avg Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reports.mechanicPerformance.map((m, i) => (
                  <tr key={i}>
                    <td className="py-2 font-medium text-gray-800">{m.full_name || m.username}</td>
                    <td className="py-2 text-center font-bold text-blue-600">{m.jobs_completed}</td>
                    <td className="py-2 text-right text-gray-600">{m.avg_hours ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top customers */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Top Customers</h3>
          {reports.topCustomers.length === 0 ? (
            <p className="text-gray-400 text-sm">No invoices yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-400 border-b">
                  <th className="py-2 font-medium">Customer</th>
                  <th className="py-2 font-medium text-center">Invoices</th>
                  <th className="py-2 font-medium text-right">Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reports.topCustomers.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 font-medium text-gray-800">{c.full_name}</td>
                    <td className="py-2 text-center text-gray-600">{c.invoices}</td>
                    <td className="py-2 text-right font-semibold">AED {parseFloat(c.total_billed).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Payment methods */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Payments by Method</h3>
          {reports.paymentMethods.length === 0 ? (
            <p className="text-gray-400 text-sm">No payments yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-400 border-b">
                  <th className="py-2 font-medium">Method</th>
                  <th className="py-2 font-medium text-center">Count</th>
                  <th className="py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reports.paymentMethods.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 font-medium text-gray-800">{p.payment_method || 'Unspecified'}</td>
                    <td className="py-2 text-center text-gray-600">{p.count}</td>
                    <td className="py-2 text-right font-semibold">AED {parseFloat(p.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
