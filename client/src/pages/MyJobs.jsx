import { useState, useEffect } from 'react';
import api from '../services/api';
import { Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';

const MyJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/jobs/my-jobs');
      setJobs(res.data.data);
    } catch (error) {
      console.error('Failed to fetch jobs', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const updateJobStatus = async (jobId, newStatus) => {
    try {
      await api.put(`/jobs/${jobId}`, { status: newStatus });
      fetchJobs();
    } catch (error) {
      alert('Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <Wrench size={28} className="text-blue-600" />
        <h2 className="text-2xl font-bold">My Assigned Jobs</h2>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : jobs.length === 0 ? (
        <div className="bg-surface p-8 rounded-lg shadow text-center">
          <p className="text-gray-500">You currently have no jobs assigned.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {jobs.map(job => (
            <div key={job.id} className="bg-surface rounded-lg shadow border-t-4 border-blue-500 overflow-hidden">
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{job.title}</h3>
                    <Link to={`/vehicles/${job.vehicle_id}`} className="text-blue-600 font-semibold hover:underline mt-1 block">
                      {job.registration_number} - {job.make} {job.model}
                    </Link>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-500 mb-1">Status</p>
                    <select 
                      value={job.status}
                      onChange={(e) => updateJobStatus(job.id, e.target.value)}
                      className="bg-gray-50 border rounded-md p-1 text-sm font-semibold text-blue-400 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Awaiting Diagnosis">Awaiting Diagnosis</option>
                      <option value="Diagnosed">Diagnosed</option>
                      <option value="Awaiting Approval">Awaiting Approval</option>
                      <option value="Awaiting Repair">Awaiting Repair</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Fixed">Fixed</option>
                      <option value="Unable to Fix">Unable to Fix</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 mt-4 bg-gray-50 p-4 rounded-md">
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Description</span>
                    <p className="text-sm text-gray-800 mt-1">{job.description}</p>
                  </div>
                  {job.diagnosis_notes && (
                    <div className="pt-2 border-t mt-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notes</span>
                      <p className="text-sm text-gray-800 mt-1">{job.diagnosis_notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyJobs;

