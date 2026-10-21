import { useState, useEffect } from 'react';
import api from '../services/api';
import { Package, Plus, Search, AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';

const Parts = () => {
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lowCount, setLowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ part_number: '', name: '', cost_price: 0, sell_price: 0, qty_in_stock: 0, low_stock_threshold: 5 });

  const fetchParts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search) params.set('search', search);
      if (lowOnly) params.set('low_stock', '1');
      const res = await api.get(`/parts?${params.toString()}`);
      setParts(res.data.data);
      if (res.data.pagination) setTotalPages(res.data.pagination.totalPages || 1);
      // Low-stock badge must count the WHOLE catalog, not just this page
      const lowRes = await api.get('/parts?low_stock=1&limit=1');
      setLowCount(lowRes.data.pagination ? lowRes.data.pagination.total : lowRes.data.data.length);
    } catch (error) {
      console.error('Failed to fetch parts', error);
    }
    setLoading(false);
  };

  useEffect(() => { fetchParts(); }, [search, lowOnly, page]);

  useEffect(() => { setPage(1); }, [search, lowOnly]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ part_number: '', name: '', cost_price: 0, sell_price: 0, qty_in_stock: 0, low_stock_threshold: 5 });
    setIsModalOpen(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({
      part_number: p.part_number, name: p.name,
      cost_price: p.cost_price, sell_price: p.sell_price,
      qty_in_stock: p.qty_in_stock, low_stock_threshold: p.low_stock_threshold
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/parts/${editingId}`, form);
      } else {
        await api.post('/parts', form);
      }
      setIsModalOpen(false);
      setMessage(null);
      fetchParts();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to save part' });
    }
  };

  const handleDelete = async (p) => {
    if (!confirm(`Delete "${p.name}" (${p.part_number}) from the catalog?`)) return;
    try {
      await api.delete(`/parts/${p.id}`);
      fetchParts();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete part');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <Package size={28} className="text-blue-600" />
          <h2 className="text-2xl font-bold">Parts Catalog</h2>
          {lowCount > 0 && (
            <span className="flex items-center gap-1 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-semibold">
              <AlertTriangle size={14} /> {lowCount} low stock
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <input
              type="text" placeholder="Search name or part #..."
              className="pl-10 pr-4 py-2 border rounded-lg"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          </div>
          <button
            onClick={() => setLowOnly(!lowOnly)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${lowOnly ? 'bg-orange-500 text-ink border-orange-500' : 'bg-surface text-gray-600 border-gray-300 hover:bg-gray-50'}`}
          >
            Low stock only
          </button>
          <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors">
            <Plus size={20} /> Add Part
          </button>
        </div>
      </div>

      {message && <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{message.text}</div>}

      <div className="bg-surface rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-gray-500 font-medium">Part Number</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Name</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-right">Cost</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-right">Sell Price</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-center">In Stock</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : parts.length === 0 ? (
              <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">No parts found. Add your first part.</td></tr>
            ) : parts.map(p => {
              const isLow = Number(p.qty_in_stock) <= Number(p.low_stock_threshold);
              return (
                <tr key={p.id} className={`hover:bg-gray-50 ${isLow ? 'bg-orange-50/50' : ''}`}>
                  <td className="px-6 py-4 font-mono text-sm font-semibold text-gray-700">{p.part_number}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{p.name}</td>
                  <td className="px-6 py-4 text-right text-gray-600">AED {parseFloat(p.cost_price).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">AED {parseFloat(p.sell_price).toFixed(2)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {p.qty_in_stock}{isLow ? ` (min ${p.low_stock_threshold})` : ''}
                    </span>
                  </td>
                  <td className="px-6 py-4 space-x-3 text-sm">
                    <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => handleDelete(p)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {parts.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t bg-gray-50 text-sm text-gray-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100">Previous</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100">Next</button>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Edit Part' : 'Add Catalog Part'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Part Number *</label>
              <input required type="text" className="w-full border rounded p-2" value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input required type="text" className="w-full border rounded p-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (AED)</label>
              <input type="number" step="0.01" min="0" className="w-full border rounded p-2" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sell Price (AED)</label>
              <input type="number" step="0.01" min="0" className="w-full border rounded p-2" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qty in Stock</label>
              <input type="number" min="0" className="w-full border rounded p-2" value={form.qty_in_stock} onChange={e => setForm({ ...form, qty_in_stock: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert At</label>
              <input type="number" min="0" className="w-full border rounded p-2" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{editingId ? 'Save Part' : 'Add Part'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Parts;
