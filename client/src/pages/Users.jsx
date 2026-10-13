import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Plus, ShieldCheck, Wrench } from 'lucide-react';
import Modal from '../components/Modal';

const Users = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // user object or null for create
  const [message, setMessage] = useState(null);

  const [form, setForm] = useState({ username: '', password: '', role: 'mechanic', full_name: '', phone_number: '' });
  const [editForm, setEditForm] = useState({ role: '', is_active: true, full_name: '', phone_number: '', new_password: '' });

  const issueResetCode = async (u) => {
    try {
      const res = await api.post(`/users/${u.id}/reset-code`);
      const { code, expires_in_minutes } = res.data.data;
      setMessage({
        type: 'success',
        text: `Reset code for "${u.username}": ${code} — share it with them, valid ${expires_in_minutes} min. They redeem it on the login page via "Forgot password?".`
      });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to issue reset code' });
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/users?page=${page}&limit=10`);
      setUsers(res.data.data);
      if (res.data.pagination) setTotalPages(res.data.pagination.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [page]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', form);
      setIsModalOpen(false);
      setForm({ username: '', password: '', role: 'mechanic', full_name: '', phone_number: '' });
      setMessage({ type: 'success', text: `User "${form.username}" created.` });
      fetchUsers();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to create user' });
    }
  };

  const openEdit = (u) => {
    setEditing(u);
    setEditForm({
      role: u.role,
      is_active: u.is_active === 1,
      full_name: u.full_name || '',
      phone_number: u.phone_number || '',
      new_password: ''
    });
    setIsModalOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...editForm };
      if (!payload.new_password) delete payload.new_password;
      await api.put(`/users/${editing.id}`, payload);
      setIsModalOpen(false);
      setEditing(null);
      setMessage({ type: 'success', text: `User "${editing.username}" updated.` });
      fetchUsers();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update user' });
    }
  };

  const toggleActive = async (u) => {
    if (u.id === me.id) {
      setMessage({ type: 'error', text: 'You cannot deactivate your own account.' });
      return;
    }
    const confirmMsg = u.is_active === 1
      ? `Deactivate "${u.username}"? They will no longer be able to log in.`
      : `Reactivate "${u.username}"?`;
    if (!confirm(confirmMsg)) return;
    try {
      await api.put(`/users/${u.id}`, { is_active: u.is_active !== 1 });
      fetchUsers();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update user' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <KeyRound size={28} className="text-blue-600" />
          <h2 className="text-2xl font-bold">User Management</h2>
        </div>
        <button
          onClick={() => { setEditing(null); setForm({ username: '', password: '', role: 'mechanic', full_name: '', phone_number: '' }); setIsModalOpen(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} /> New User
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-gray-500 font-medium">Username</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Name</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Role</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Phone</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Status</th>
              <th className="px-6 py-3 text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 ${u.is_active === 0 ? 'opacity-60' : ''}`}>
                <td className="px-6 py-4 font-medium text-gray-900">{u.username}</td>
                <td className="px-6 py-4 text-gray-600">{u.full_name || '-'}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {u.role === 'admin' ? <ShieldCheck size={12} /> : <Wrench size={12} />}
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600">{u.phone_number || '-'}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.is_active === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.is_active === 1 ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 space-x-3 text-sm">
                  <button onClick={() => openEdit(u)} className="text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => issueResetCode(u)} className="text-amber-600 hover:underline">Reset code</button>
                  {u.id !== me.id && (
                    <button
                      onClick={() => toggleActive(u)}
                      className={u.is_active === 1 ? 'text-red-600 hover:underline' : 'text-green-600 hover:underline'}
                    >
                      {u.is_active === 1 ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t bg-gray-50 text-sm text-gray-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100">Previous</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal isOpen={isModalOpen && !editing} onClose={() => setIsModalOpen(false)} title="Create New User">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input required type="text" className="w-full border rounded p-2" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password * (min 6)</label>
              <input required type="password" minLength={6} className="w-full border rounded p-2" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select className="w-full border rounded p-2" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="mechanic">Mechanic</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" className="w-full border rounded p-2" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="text" className="w-full border rounded p-2" value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create User</button>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal isOpen={isModalOpen && !!editing} onClose={() => { setIsModalOpen(false); setEditing(null); }} title={`Edit User: ${editing?.username || ''}`}>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select className="w-full border rounded p-2" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                <option value="mechanic">Mechanic</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="w-full border rounded p-2" value={editForm.is_active ? '1' : '0'} onChange={e => setEditForm({ ...editForm, is_active: e.target.value === '1' })}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" className="w-full border rounded p-2" value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="text" className="w-full border rounded p-2" value={editForm.phone_number} onChange={e => setEditForm({ ...editForm, phone_number: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reset Password (leave blank to keep current)</label>
              <input type="password" minLength={6} className="w-full border rounded p-2" value={editForm.new_password} onChange={e => setEditForm({ ...editForm, new_password: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => { setIsModalOpen(false); setEditing(null); }} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Changes</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Users;
