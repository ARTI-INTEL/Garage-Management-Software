import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Building2, Plus, Trash2, Pencil, Ban, Play } from 'lucide-react';
import Modal from '../components/Modal';

const Garages = () => {
  const { user: me } = useAuth();
  const [garages, setGarages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState(null); // garage being deleted
  const [deleteCode, setDeleteCode] = useState('');
  const [editing, setEditing] = useState(null); // garage being edited
  const [toggling, setToggling] = useState(null); // garage being disabled/enabled
  const [message, setMessage] = useState(null);

  const [editForm, setEditForm] = useState({
    garage_name: '',
    garage_code: '',
    phone: '',
    address: ''
  });

  const [form, setForm] = useState({
    garage_name: '',
    garage_code: '',
    username: '',
    password: '',
    phone: ''
  });

  const fetchGarages = async () => {
    setLoading(true);
    try {
      const res = await api.get('/garages');
      setGarages(res.data.data);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to fetch garages' });
    }
    setLoading(false);
  };

  useEffect(() => { fetchGarages(); }, []);

  // A garage is usable unless the super admin temporarily disabled it.
  const isActive = (g) => Number(g.is_active ?? 1) !== 0;

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/garages', form);
      setIsCreateOpen(false);
      setForm({ garage_name: '', garage_code: '', username: '', password: '', phone: '' });
      setMessage({ type: 'success', text: `Garage "${form.garage_name}" created.` });
      fetchGarages();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to create garage' });
    }
  };

  const openEdit = (g) => {
    setEditing(g);
    setEditForm({
      garage_name: g.garage_name || '',
      garage_code: g.garage_code || '',
      phone: g.phone || '',
      address: g.address || ''
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put(`/garages/${editing.id}`, editForm);
      setMessage({ type: 'success', text: res.data.message || 'Garage updated' });
      setEditing(null);
      fetchGarages();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update garage' });
    }
  };

  const handleToggleStatus = async () => {
    const enabling = Number(toggling.is_active) === 0;
    try {
      const res = await api.patch(`/garages/${toggling.id}/status`, { is_active: enabling });
      setMessage({ type: 'success', text: res.data.message || 'Garage status updated' });
      setToggling(null);
      fetchGarages();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update garage status' });
    }
  };

  const openDelete = (g) => {
    setDeleting(g);
    setDeleteCode('');
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    try {
      const res = await api.delete(`/garages/${deleting.id}`, {
        params: { confirm_code: deleteCode.toUpperCase().trim() }
      });
      setMessage({ type: 'success', text: res.data.message || 'Garage deleted' });
      setDeleting(null);
      fetchGarages();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to delete garage' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Building2 size={28} className="text-blue-600" />
          <h2 className="text-2xl font-bold">Garage Management</h2>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} /> New Garage
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading garages...</p>
      ) : (
        <div className="bg-surface rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Garage</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Users</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicles</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {garages.map((g) => (
                <tr key={g.id} className={g.id === me?.garage?.id ? 'bg-blue-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                    {g.garage_name}
                    {g.id === me?.garage?.id && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-400 px-2 py-0.5 rounded-full">Your garage</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-mono">{g.garage_code}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{g.user_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{g.customer_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{g.vehicle_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                    {g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {isActive(g) ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Disabled</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-4">
                      <button
                        onClick={() => openEdit(g)}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        title="Edit garage info"
                      >
                        <Pencil size={16} /> Edit
                      </button>
                      {g.id === me?.garage?.id ? (
                        <span className="text-xs text-gray-400" title="You cannot disable or delete the garage you belong to">—</span>
                      ) : (
                        <>
                          <button
                            onClick={() => setToggling(g)}
                            className={`${isActive(g)
                              ? 'text-amber-600 hover:text-amber-800'
                              : 'text-green-600 hover:text-green-800'} flex items-center gap-1`}
                            title={isActive(g) ? 'Temporarily disable all access (no data is deleted)' : 'Re-enable this garage'}
                          >
                            {isActive(g) ? <><Ban size={16} /> Disable</> : <><Play size={16} /> Enable</>}
                          </button>
                          <button
                            onClick={() => openDelete(g)}
                            className="text-red-600 hover:text-red-800 flex items-center gap-1"
                            title="Delete the garage and ALL of its data"
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {garages.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">No garages found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create garage modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Garage">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="g-name" className="block text-sm font-medium text-gray-700">Garage Name</label>
            <input
              id="g-name"
              type="text"
              value={form.garage_name}
              onChange={(e) => setForm({ ...form, garage_name: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="g-code" className="block text-sm font-medium text-gray-700">Garage Code</label>
            <input
              id="g-code"
              type="text"
              value={form.garage_code}
              onChange={(e) => setForm({ ...form, garage_code: e.target.value.toUpperCase() })}
              placeholder="Short unique code, e.g. AUTOX"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="g-username" className="block text-sm font-medium text-gray-700">Admin Username</label>
              <input
                id="g-username"
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="g-password" className="block text-sm font-medium text-gray-700">Admin Password</label>
              <input
                id="g-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="g-phone" className="block text-sm font-medium text-gray-700">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              id="g-phone"
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Create Garage
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit garage modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Garage">
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label htmlFor="e-name" className="block text-sm font-medium text-gray-700">Garage Name</label>
            <input
              id="e-name"
              type="text"
              value={editForm.garage_name}
              onChange={(e) => setEditForm({ ...editForm, garage_name: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="e-code" className="block text-sm font-medium text-gray-700">Garage Code</label>
              <input
                id="e-code"
                type="text"
                value={editForm.garage_code}
                onChange={(e) => setEditForm({ ...editForm, garage_code: e.target.value.toUpperCase() })}
                placeholder="Short unique code, e.g. AUTOX"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Users need this code to sign in. Changing it affects future logins only — no data is lost.</p>
            </div>
            <div>
              <label htmlFor="e-phone" className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                id="e-phone"
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="e-address" className="block text-sm font-medium text-gray-700">Address</label>
            <textarea
              id="e-address"
              rows={3}
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Disable / enable confirmation modal */}
      <Modal
        isOpen={!!toggling}
        onClose={() => setToggling(null)}
        title={toggling && isActive(toggling) ? 'Temporarily Disable Garage' : 'Enable Garage'}
      >
        <div className="space-y-4">
          {toggling && isActive(toggling) ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded">
              <p className="font-semibold">Disable "{toggling.garage_name}"? All of its users are signed out and blocked from logging in.</p>
              <p className="text-sm mt-1">No data is deleted — customers, vehicles, jobs, invoices, parts and users all stay in the database. You can re-enable the garage at any time.</p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <p className="font-semibold">Enable "{toggling?.garage_name}"?</p>
              <p className="text-sm mt-1">Its users will be able to sign in and use the app again.</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setToggling(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleToggleStatus}
              className={`px-4 py-2 text-ink rounded-md ${toggling && isActive(toggling)
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-green-600 hover:bg-green-700'}`}
            >
              {toggling && isActive(toggling) ? 'Temporarily Disable' : 'Enable Garage'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete Garage">
        <form onSubmit={handleDelete} className="space-y-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <p className="font-semibold">This permanently deletes "{deleting?.garage_name}" and ALL of its data —</p>
            <p className="text-sm mt-1">customers, vehicles, jobs, invoices, payments, parts and users. This cannot be undone.</p>
          </div>
          <div>
            <label htmlFor="g-confirm" className="block text-sm font-medium text-gray-700">
              Type the garage code <span className="font-mono font-bold">{deleting?.garage_code}</span> to confirm
            </label>
            <input
              id="g-confirm"
              type="text"
              value={deleteCode}
              onChange={(e) => setDeleteCode(e.target.value.toUpperCase())}
              placeholder={deleting?.garage_code}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setDeleting(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleteCode.toUpperCase().trim() !== deleting?.garage_code}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete Forever
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Garages;
