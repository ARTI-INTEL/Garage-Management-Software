import { useState, useEffect } from 'react';
import api from '../services/api';
import { Settings as SettingsIcon, Save } from 'lucide-react';

const Settings = () => {
  const [form, setForm] = useState({
    garage_name: '', address: '', phone: '', logo_url: '', currency: 'AED', tax_rate: 0, whatsapp_template: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '' });
  const [pwMessage, setPwMessage] = useState(null);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMessage(null);
    try {
      await api.put('/users/me/password', pwForm);
      setPwForm({ current_password: '', new_password: '' });
      setPwMessage({ type: 'success', text: 'Password updated successfully.' });
    } catch (error) {
      setPwMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update password' });
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/settings');
        if (res.data.data) {
          setForm({
            garage_name: res.data.data.garage_name || '',
            address: res.data.data.address || '',
            phone: res.data.data.phone || '',
            logo_url: res.data.data.logo_url || '',
            currency: res.data.data.currency || 'AED',
            tax_rate: res.data.data.tax_rate || 0,
            whatsapp_template: res.data.data.whatsapp_template || ''
          });
        }
      } catch (error) {
        console.error('Failed to fetch settings', error);
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.put('/settings', form);
      setForm({
        garage_name: res.data.data.garage_name || '',
        address: res.data.data.address || '',
        phone: res.data.data.phone || '',
        logo_url: res.data.data.logo_url || '',
        currency: res.data.data.currency || 'AED',
        tax_rate: res.data.data.tax_rate || 0,
        whatsapp_template: res.data.data.whatsapp_template || ''
      });
      setMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to save settings' });
    }
    setSaving(false);
  };

  if (loading) return <div className="py-8 text-center text-gray-400">Loading settings...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <SettingsIcon size={28} className="text-blue-600" />
        <h2 className="text-2xl font-bold">Garage Settings</h2>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-surface rounded-lg shadow p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Garage Name *</label>
            <input
              required type="text" className="w-full border rounded-lg p-2"
              value={form.garage_name}
              onChange={e => setForm({ ...form, garage_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="text" className="w-full border rounded-lg p-2"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input
            type="text" className="w-full border rounded-lg p-2"
            value={form.address}
            onChange={e => setForm({ ...form, address: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
          <input
            type="text" className="w-full border rounded-lg p-2" placeholder="https://..."
            value={form.logo_url}
            onChange={e => setForm({ ...form, logo_url: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <input
              type="text" className="w-full border rounded-lg p-2" placeholder="AED"
              value={form.currency}
              onChange={e => setForm({ ...form, currency: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax / VAT Rate (%)</label>
            <input
              type="number" step="0.01" min="0" max="100" className="w-full border rounded-lg p-2"
              value={form.tax_rate}
              onChange={e => setForm({ ...form, tax_rate: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Message Template</label>
          <textarea
            className="w-full border rounded-lg p-2" rows="4"
            placeholder="Hello {name}, your invoice {invoice_number} for vehicle {vehicle} is ready..."
            value={form.whatsapp_template}
            onChange={e => setForm({ ...form, whatsapp_template: e.target.value })}
          />
          <p className="text-xs text-gray-400 mt-1">
            Available variables: {'{name}'}, {'{invoice_number}'}, {'{vehicle}'}, {'{total}'}, {'{currency}'}, {'{status}'}, {'{pdf_link}'} (invoice PDF link; appended to the end if omitted)
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Change own password */}
      <div className="bg-surface rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Change My Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password *</label>
              <input required type="password" className="w-full border rounded-lg p-2" value={pwForm.current_password} onChange={e => setPwForm({ ...pwForm, current_password: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password * (min 6)</label>
              <input required type="password" minLength={6} className="w-full border rounded-lg p-2" value={pwForm.new_password} onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })} />
            </div>
          </div>
          {pwMessage && (
            <div className={`px-4 py-2 rounded text-sm ${pwMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{pwMessage.text}</div>
          )}
          <div className="flex justify-end">
            <button type="submit" className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm">Update Password</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
