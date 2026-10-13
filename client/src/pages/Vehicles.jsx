import { useState, useEffect } from 'react';
import api from '../services/api';
import { Search, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';

const Vehicles = () => {
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [formData, setFormData] = useState({ 
    customer_id: '', registration_number: '', make: '', model: '', year: '', colour: '', vehicle_type: '', vin: '', odometer: '', notes: '' 
  });

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (search) params.set('search', search);
      const res = await api.get(`/vehicles?${params.toString()}`);
      setVehicles(res.data.data);
      if (res.data.pagination) setTotalPages(res.data.pagination.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch vehicles', error);
    }
    setLoading(false);
  };

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res.data.data);
    } catch (error) {
      console.error('Failed to fetch customers', error);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchCustomers(); // For the dropdown (unpaginated)
  }, [search, page]);

  useEffect(() => { setPage(1); }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/vehicles', formData);
      setIsModalOpen(false);
      setFormData({ customer_id: '', registration_number: '', make: '', model: '', year: '', colour: '', vehicle_type: '', vin: '', odometer: '', notes: '' });
      fetchVehicles();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to register vehicle');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative w-96">
          <input
            type="text"
            placeholder="Search by plate, owner name, or phone..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg uppercase placeholder:normal-case placeholder:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Register Vehicle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <p>Loading...</p>
        ) : vehicles.length === 0 ? (
          <p className="text-gray-500">No vehicles found</p>
        ) : (
          vehicles.map(v => (
            <Link to={`/vehicles/${v.id}`} key={v.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-100 overflow-hidden block">
              <div className="bg-yellow-400 p-3 text-center border-b-4 border-yellow-500">
                <span className="text-2xl font-bold tracking-widest text-gray-900">{v.registration_number}</span>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg">{v.make} {v.model}</h3>
                  <span className="text-sm text-gray-500">{v.year}</span>
                </div>
                <div className="text-sm text-gray-600">
                  <p><span className="font-medium text-gray-700">Owner:</span> {v.owner_name}</p>
                  <p><span className="font-medium text-gray-700">Phone:</span> {v.mobile_number}</p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Previous</button>
          <span className="text-gray-600">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Register New Vehicle">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner (Customer) *</label>
            <select required className="w-full border rounded p-2" value={formData.customer_id} onChange={e => setFormData({...formData, customer_id: e.target.value})}>
              <option value="">Select an owner...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.mobile_number})</option>)}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number Plate *</label>
              <input required type="text" className="w-full border rounded p-2 uppercase" placeholder="DXB-12345" value={formData.registration_number} onChange={e => setFormData({...formData, registration_number: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VIN / Chassis</label>
              <input type="text" className="w-full border rounded p-2 uppercase" value={formData.vin} onChange={e => setFormData({...formData, vin: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Make *</label>
              <input required type="text" className="w-full border rounded p-2" placeholder="Toyota" value={formData.make} onChange={e => setFormData({...formData, make: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model *</label>
              <input required type="text" className="w-full border rounded p-2" placeholder="Camry" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <input type="number" className="w-full border rounded p-2" value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colour</label>
              <input type="text" className="w-full border rounded p-2" value={formData.colour} onChange={e => setFormData({...formData, colour: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Register Vehicle</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Vehicles;

