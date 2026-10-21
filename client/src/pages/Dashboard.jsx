import { useState, useEffect } from 'react';
import api from '../services/api';
import { Car, Users, Wrench, CheckCircle, Clock, AlertCircle, TrendingUp, Wallet } from 'lucide-react';
import { getCurrency } from '../services/settings';

const statusColors = {
  'Awaiting Diagnosis': 'bg-gray-400',
  'Diagnosed': 'bg-blue-400',
  'Awaiting Approval': 'bg-yellow-400',
  'Awaiting Repair': 'bg-orange-400',
  'In Progress': 'bg-indigo-500',
  'Fixed': 'bg-green-500',
  'Unable to Fix': 'bg-red-500',
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('AED');
  const [lowStock, setLowStock] = useState([]);

  useEffect(() => { getCurrency().then(setCurrency); }, []);

  useEffect(() => {
    // Low-stock alert (admin only route; silently skip for mechanics)
    api.get('/parts?low_stock=1')
      .then(res => setLowStock(res.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/dashboard/stats');
        setStats(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard stats');
      }
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading) return <div className="py-8 text-center text-gray-400">Loading dashboard...</div>;
  if (error) return <div className="py-8 text-center text-red-500">{error}</div>;
  if (!stats) return null;

  const cards = [
    { label: 'Total Vehicles', value: stats.totalVehicles, icon: Car, color: 'text-blue-600 bg-blue-50' },
    { label: 'Total Customers', value: stats.totalCustomers, icon: Users, color: 'text-purple-600 bg-purple-50' },
    { label: 'Jobs in Progress', value: stats.jobsInProgress, icon: Wrench, color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Ready for Collection', value: stats.readyForCollection, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { label: 'Awaiting Diagnosis', value: stats.awaitingDiagnosis, icon: Clock, color: 'text-orange-600 bg-orange-50' },
    { label: 'Unpaid Invoices', value: stats.unpaidInvoices, icon: AlertCircle, color: 'text-red-600 bg-red-50' },
  ];

  const maxStatusCount = Math.max(1, ...stats.statusBreakdown.map(s => Number(s.count)));
  const maxMonthly = Math.max(1, ...stats.monthlyRevenue.map(m => Number(m.total)));

  const monthLabel = (ym) => {
    const [y, m] = ym.split('-');
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">Dashboard Overview</h2>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-surface p-6 rounded-lg shadow flex items-center gap-4">
              <div className={`p-3 rounded-lg ${c.color}`}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="text-3xl font-bold text-gray-900">{c.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-orange-700 font-semibold mb-2">
            <AlertCircle size={18} /> Low stock alert — {lowStock.length} part{lowStock.length > 1 ? 's' : ''} below threshold
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.slice(0, 8).map(p => (
              <span key={p.id} className="bg-elevated border border-gray-300 text-orange-800 text-xs font-medium px-2 py-1 rounded">
                {p.part_number} — {p.name} ({p.qty_in_stock} left)
              </span>
            ))}
            {lowStock.length > 8 && <span className="text-xs text-orange-700 self-center">+{lowStock.length - 8} more…</span>}
          </div>
        </div>
      )}

      {/* Revenue cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <Wallet size={18} />
            <span className="text-sm font-medium uppercase tracking-wider">Collected This Month</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{currency} {stats.paidTotalThisMonth.toFixed(2)}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <TrendingUp size={18} />
            <span className="text-sm font-medium uppercase tracking-wider">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{currency} {stats.totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg shadow border-l-4 border-red-500">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <AlertCircle size={18} />
            <span className="text-sm font-medium uppercase tracking-wider">Outstanding</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{currency} {stats.unpaidTotal.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Status Chart */}
        <div className="bg-surface p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Jobs by Status</h3>
          {stats.statusBreakdown.length === 0 ? (
            <p className="text-gray-400 text-sm">No jobs yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.statusBreakdown.map((s) => (
                <div key={s.status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{s.status}</span>
                    <span className="font-semibold text-gray-800">{s.count}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${statusColors[s.status] || 'bg-blue-500'}`}
                      style={{ width: `${(Number(s.count) / maxStatusCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue Chart */}
        <div className="bg-surface p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Revenue (Last 6 Months)</h3>
          {stats.monthlyRevenue.length === 0 ? (
            <p className="text-gray-400 text-sm">No payments recorded yet.</p>
          ) : (
            <div className="flex items-end justify-between gap-3 h-48">
              {stats.monthlyRevenue.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-xs font-semibold text-gray-700">
                    {Number(m.total).toFixed(0)}
                  </span>
                  <div
                    className="w-full bg-blue-500 rounded-t-md"
                    style={{ height: `${(Number(m.total) / maxMonthly) * 100}%`, minHeight: '4px' }}
                  />
                  <span className="text-xs text-gray-500">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
