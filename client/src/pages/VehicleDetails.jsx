import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { User, Phone, Mail, Hash, MapPin, Calendar, Wrench, Plus, Check, FileText, History, MessageCircle, ClipboardList, Trash2, Gauge } from 'lucide-react';
import Modal from '../components/Modal';
import { getCurrency } from '../services/settings';

const VehicleDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isPartModalOpen, setIsPartModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [services, setServices] = useState([]);
  const [catalogParts, setCatalogParts] = useState([]);
  const [historyCache, setHistoryCache] = useState({}); // jobId -> array
  const [expandedJob, setExpandedJob] = useState(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ discount: 0, notes: '' });

  // Form states
  const [jobForm, setJobForm] = useState({ title: '', description: '', diagnosis_notes: '', labour_cost: 0, mechanic_id: '', priority: 'medium' });
  const [partForm, setPartForm] = useState({ part_name: '', part_number: '', quantity: 1, unit_price: 0, notes: '', catalog_part_id: null });
  const [currency, setCurrency] = useState('AED');

  useEffect(() => { getCurrency().then(setCurrency); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vehicleRes, jobsRes, mechanicsRes, invoicesRes, servicesRes, partsRes] = await Promise.all([
        api.get(`/vehicles/${id}`),
        api.get(`/jobs/vehicle/${id}`),
        user?.role === 'admin' ? api.get('/users/mechanics') : Promise.resolve({ data: { data: [] } }),
        api.get(`/invoices/vehicle/${id}`),
        api.get(`/vehicles/${id}/services`),
        api.get('/parts')
      ]);
      setVehicle(vehicleRes.data.data);
      setJobs(jobsRes.data.data);
      setMechanics(mechanicsRes.data.data);
      setInvoices(invoicesRes.data.data);
      setServices(servicesRes.data.data);
      setCatalogParts(partsRes.data.data);
    } catch (error) {
      console.error('Failed to fetch data', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id, user?.role]);

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      await api.post('/jobs', { ...jobForm, vehicle_id: id });
      setIsJobModalOpen(false);
      setJobForm({ title: '', description: '', diagnosis_notes: '', labour_cost: 0, mechanic_id: '', priority: 'medium' });
      fetchData();
    } catch (error) {
      alert('Failed to create diagnosis');
    }
  };

  const handleAddPart = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/jobs/${selectedJobId}/parts`, partForm);
      setIsPartModalOpen(false);
      setPartForm({ part_name: '', part_number: '', quantity: 1, unit_price: 0, notes: '', catalog_part_id: null });
      fetchData();
    } catch (error) {
      alert('Failed to add part');
    }
  };

  // Auto-suggest: pick a catalog part, fill fields + link for stock deduction
  const selectCatalogPart = (value) => {
    const match = catalogParts.find(p => `${p.part_number} — ${p.name}` === value);
    if (match) {
      setPartForm(f => ({
        ...f,
        part_name: match.name,
        part_number: match.part_number,
        unit_price: match.sell_price,
        catalog_part_id: match.id
      }));
    }
  };

  const handleRemovePart = async (jobId, partId) => {
    if (!confirm('Remove this part? Stock will be returned to inventory if applicable.')) return;
    try {
      await api.delete(`/jobs/${jobId}/parts/${partId}`);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to remove part');
    }
  };

  const toggleHistory = async (jobId) => {
    if (expandedJob === jobId) { setExpandedJob(null); return; }
    setExpandedJob(jobId);
    if (!historyCache[jobId]) {
      try {
        const res = await api.get(`/jobs/${jobId}/history`);
        setHistoryCache(c => ({ ...c, [jobId]: res.data.data }));
      } catch (error) {
        console.error('Failed to fetch history', error);
      }
    }
  };

  const handleGenerateQuote = async (job) => {
    if (!confirm(`Generate a quotation for "${job.title}"? This will move the job to "Awaiting Approval".`)) return;
    try {
      const res = await api.post('/quotes/generate', { repair_job_id: job.id });
      alert(`Quotation ${res.data.data.quote_number} created! Find it under Quotations to send via WhatsApp.`);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to generate quotation');
    }
  };

  const handleNotifyWhatsApp = async (jobId) => {
    try {
      const res = await api.get(`/jobs/${jobId}/notify-whatsapp`);
      window.open(res.data.data.whatsapp_url, '_blank');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to build WhatsApp message');
    }
  };

  const handleGenerateInvoice = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/invoices/generate', { vehicle_id: id, discount: invoiceForm.discount, notes: invoiceForm.notes });
      alert(`Invoice ${res.data.data.invoice_number} generated!`);
      setIsInvoiceModalOpen(false);
      setInvoiceForm({ discount: 0, notes: '' });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to generate invoice');
    }
  };

  const updateJobStatus = async (jobId, newStatus) => {
    try {
      await api.put(`/jobs/${jobId}`, { status: newStatus });
      fetchData();
    } catch (error) {
      alert('Failed to update status');
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!vehicle) return <div>Vehicle not found</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Number Plate Header */}
      <div className="bg-white rounded-lg shadow p-6 flex justify-between items-center border-l-4 border-blue-500">
        <div>
          <h2 className="text-3xl font-bold uppercase">{vehicle.make} {vehicle.model}</h2>
          <p className="text-gray-500">{vehicle.year} • {vehicle.colour}</p>
        </div>
        <div className="bg-yellow-400 px-6 py-2 rounded shadow-inner border-2 border-yellow-500">
          <span className="text-3xl font-bold tracking-widest">{vehicle.registration_number}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold border-b pb-2 mb-4 flex items-center gap-2">
            <CarIcon className="text-gray-500"/> Vehicle Information
          </h3>
          <div className="space-y-3 text-sm">
            <InfoRow icon={Hash} label="VIN / Chassis" value={vehicle.vin || '-'} />
            <InfoRow icon={Hash} label="Odometer" value={vehicle.odometer ? `${vehicle.odometer} km` : '-'} />
            <InfoRow icon={CarIcon} label="Vehicle Type" value={vehicle.vehicle_type || '-'} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold border-b pb-2 mb-4 flex items-center gap-2">
            <User className="text-gray-500"/> Owner Information
          </h3>
          <div className="space-y-3 text-sm">
            <InfoRow icon={User} label="Name" value={vehicle.owner_name} />
            <InfoRow icon={Phone} label="Mobile" value={vehicle.mobile_number} />
            <InfoRow icon={Phone} label="WhatsApp" value={vehicle.whatsapp_number || '-'} className="text-green-600" />
          </div>
        </div>
      </div>

      {/* Diagnosis and Repairs */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center border-b pb-2 mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="text-gray-500"/> Diagnosis and Repair Jobs
          </h3>
          {user?.role === 'admin' && (
            <button 
              onClick={() => setIsJobModalOpen(true)}
              className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded border border-blue-200 hover:bg-blue-100 flex items-center gap-1"
            >
              <Plus size={16} /> Add Diagnosis
            </button>
          )}
        </div>
        
        {jobs.length === 0 ? (
          <p className="text-gray-500 text-center py-8 text-sm">No repair jobs recorded.</p>
        ) : (
          <div className="space-y-6">
            {jobs.map(job => (
              <div key={job.id} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 p-4 border-b flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-lg">{job.title}</h4>
                    <p className="text-sm text-gray-500">Status: <span className="font-semibold text-blue-600">{job.status}</span> • Mechanic: {job.mechanic_username || 'Unassigned'}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-gray-700">Labour: {currency} {job.labour_cost}</p>
                    <div className="flex flex-wrap justify-end gap-2 mt-2">
                      {user?.role === 'admin' && ['Awaiting Diagnosis', 'Diagnosed'].includes(job.status) && (
                        <button onClick={() => handleGenerateQuote(job)} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-200 hover:bg-purple-100 flex items-center gap-1">
                          <ClipboardList size={12} /> Request Quote
                        </button>
                      )}
                      {(job.status === 'Fixed' || job.status === 'Unable to Fix') && (
                        <button onClick={() => handleNotifyWhatsApp(job.id)} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200 hover:bg-green-100 flex items-center gap-1">
                          <MessageCircle size={12} /> Notify Customer
                        </button>
                      )}
                      <button onClick={() => toggleHistory(job.id)} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 hover:bg-gray-200 flex items-center gap-1">
                        <History size={12} /> History
                      </button>
                    </div>
                    {user?.role === 'admin' && (
                      <select 
                        value={job.status}
                        onChange={(e) => updateJobStatus(job.id, e.target.value)}
                        className="mt-2 text-xs border rounded p-1"
                      >
                        <option value="Awaiting Diagnosis">Awaiting Diagnosis</option>
                        <option value="Diagnosed">Diagnosed</option>
                        <option value="Awaiting Approval">Awaiting Approval</option>
                        <option value="Awaiting Repair">Awaiting Repair</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Fixed">Fixed</option>
                        <option value="Unable to Fix">Unable to Fix</option>
                      </select>
                    )}
                  </div>
                </div>
                <div className="p-4 text-sm text-gray-700">
                  <p><span className="font-semibold">Description:</span> {job.description}</p>
                  <p className="mt-1"><span className="font-semibold">Notes:</span> {job.diagnosis_notes || '-'}</p>
                  
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="font-semibold text-gray-800">Parts Required</h5>
                      {user?.role === 'admin' && (
                        <button 
                          onClick={() => { setSelectedJobId(job.id); setIsPartModalOpen(true); }}
                          className="text-xs text-blue-600 hover:underline flex items-center"
                        >
                          <Plus size={14}/> Add Part
                        </button>
                      )}
                    </div>
                    {job.parts.length === 0 ? (
                      <p className="text-gray-500 text-xs">No parts listed.</p>
                    ) : (
                      <ul className="list-disc list-inside text-xs space-y-1">
                        {job.parts.map(p => (
                          <li key={p.id} className="flex justify-between items-center">
                            <span>{p.quantity}x {p.part_name} - {currency} {p.unit_price * p.quantity}</span>
                            {user?.role === 'admin' && (
                              <button onClick={() => handleRemovePart(job.id, p.id)} className="text-red-500 hover:text-red-700 ml-2" title="Remove part">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Status history timeline */}
                  {expandedJob === job.id && (
                    <div className="mt-4 border-t pt-3">
                      <h5 className="font-semibold text-gray-800 text-xs uppercase tracking-wider mb-2">Status History</h5>
                      {!historyCache[job.id] ? (
                        <p className="text-gray-400 text-xs">Loading history...</p>
                      ) : historyCache[job.id].length === 0 ? (
                        <p className="text-gray-400 text-xs">No status changes recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {historyCache[job.id].map(h => (
                            <li key={h.id} className="flex items-start gap-2 text-xs">
                              <span className="mt-1 w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                              <span className="text-gray-600">
                                <span className="font-medium text-gray-800">{h.from_status || 'Created'}</span>{' '}→{' '}
                                <span className="font-medium text-blue-700">{h.to_status}</span>
                                <span className="text-gray-400"> — {h.changed_by_name || 'system'} · {new Date(h.changed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoice Section */}
      {user?.role === 'admin' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="text-gray-500"/> Invoices
            </h3>
            <button
              onClick={() => setIsInvoiceModalOpen(true)}
              className="text-sm bg-green-50 text-green-700 px-3 py-1 rounded border border-green-200 hover:bg-green-100 flex items-center gap-1"
            >
              <Plus size={16} /> Generate Invoice
            </button>
          </div>

          {invoices.length === 0 ? (
            <p className="text-gray-500 text-center py-4 text-sm">No invoices generated yet.</p>
          ) : (
            <div className="space-y-3">
              {invoices.map(inv => (
                <Link to={`/invoices/${inv.id}`} key={inv.id} className="flex justify-between items-center p-4 border rounded-lg hover:bg-gray-50 transition-colors block">
                  <div>
                    <span className="font-mono font-semibold text-blue-700">{inv.invoice_number}</span>
                    <span className="text-gray-400 text-sm ml-3">
                      {new Date(inv.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold">{currency} {parseFloat(inv.grand_total).toFixed(2)}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      inv.payment_status === 'Paid' ? 'bg-green-100 text-green-700' :
                      inv.payment_status === 'Partially Paid' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {inv.payment_status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Service History (odometer tracking) */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center border-b pb-2 mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Gauge className="text-gray-500"/> Service History
          </h3>
          {services.length > 0 && (
            <span className="text-xs text-gray-500">
              Last serviced at <span className="font-bold text-blue-700">{services[0].odometer != null ? `${services[0].odometer} km` : 'unknown km'}</span> on {new Date(services[0].service_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        {services.length === 0 ? (
          <p className="text-gray-500 text-center py-4 text-sm">No service records yet. Records are created automatically when jobs are marked Fixed.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-400 border-b text-xs uppercase tracking-wider">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Odometer</th>
                <th className="py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {services.map(s => (
                <tr key={s.id}>
                  <td className="py-2 text-gray-700">{new Date(s.service_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="py-2 font-semibold text-blue-700">{s.odometer != null ? `${s.odometer} km` : '-'}</td>
                  <td className="py-2 text-gray-700">{s.description || s.job_title || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Job Modal */}
      <Modal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} title="Add Diagnosis / Job">
        <form onSubmit={handleCreateJob} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input required type="text" className="w-full border rounded p-2" placeholder="e.g. Brake Pad Replacement" value={jobForm.title} onChange={e => setJobForm({...jobForm, title: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea className="w-full border rounded p-2" rows="2" value={jobForm.description} onChange={e => setJobForm({...jobForm, description: e.target.value})}></textarea>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Labour Cost (AED)</label>
              <input type="number" className="w-full border rounded p-2" value={jobForm.labour_cost} onChange={e => setJobForm({...jobForm, labour_cost: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Assign Mechanic</label>
              <select className="w-full border rounded p-2" value={jobForm.mechanic_id} onChange={e => setJobForm({...jobForm, mechanic_id: e.target.value})}>
                <option value="">Unassigned</option>
                {mechanics.map(m => <option key={m.id} value={m.id}>{m.username}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setIsJobModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Job</button>
          </div>
        </form>
      </Modal>

      {/* Add Part Modal */}
      <Modal isOpen={isPartModalOpen} onClose={() => setIsPartModalOpen(false)} title="Add Part">
        <form onSubmit={handleAddPart} className="space-y-4">
          {catalogParts.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Pick from Catalog (optional)</label>
              <input
                type="text" list="catalog-parts" className="w-full border rounded p-2"
                placeholder="Search catalog part number or name..."
                onChange={e => selectCatalogPart(e.target.value)}
              />
              <datalist id="catalog-parts">
                {catalogParts.map(p => (
                  <option key={p.id} value={`${p.part_number} — ${p.name}`}>stock: {p.qty_in_stock}</option>
                ))}
              </datalist>
              <p className="text-xs text-gray-400 mt-1">Catalog parts deduct stock when added.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Part Name *</label>
            <input required type="text" className="w-full border rounded p-2" value={partForm.part_name} onChange={e => setPartForm({...partForm, part_name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Quantity</label>
              <input type="number" min="1" className="w-full border rounded p-2" value={partForm.quantity} onChange={e => setPartForm({...partForm, quantity: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Unit Price (AED)</label>
              <input type="number" step="0.01" className="w-full border rounded p-2" value={partForm.unit_price} onChange={e => setPartForm({...partForm, unit_price: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setIsPartModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Add Part</button>
          </div>
        </form>
      </Modal>

      {/* Generate Invoice Modal (with discount) */}
      <Modal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} title="Generate Invoice">
        <form onSubmit={handleGenerateInvoice} className="space-y-4">
          <p className="text-sm text-gray-600">
            This creates an invoice from all repair jobs for <span className="font-bold bg-yellow-300 px-1 rounded">{vehicle.registration_number}</span>,
            including labour and parts. Tax is applied from Settings.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount ({currency})</label>
            <input
              type="number" step="0.01" min="0" className="w-full border rounded p-2"
              value={invoiceForm.discount}
              onChange={e => setInvoiceForm({ ...invoiceForm, discount: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (printed on invoice)</label>
            <textarea
              className="w-full border rounded p-2" rows="2"
              value={invoiceForm.notes}
              onChange={e => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setIsInvoiceModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Generate Invoice</button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

const CarIcon = (props) => (
  <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
);

const InfoRow = ({ icon: Icon, label, value, className = '' }) => (
  <div className="flex items-start gap-3">
    <Icon size={18} className="text-gray-400 mt-0.5" />
    <div>
      <p className="text-gray-500 text-xs uppercase tracking-wider">{label}</p>
      <p className={`font-medium text-gray-800 ${className}`}>{value}</p>
    </div>
  </div>
);

export default VehicleDetails;
