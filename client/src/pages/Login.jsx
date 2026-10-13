import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import api from '../services/api';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [garageCode, setGarageCode] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'reset'
  const [resetForm, setResetForm] = useState({ username: '', garage_code: '', code: '', new_password: '' });
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const userData = await login(username, password, garageCode);
      // Super admins land directly on the garage management panel
      navigate(userData?.role === 'super_admin' ? '/garages' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setResetError('');
    try {
      await api.post('/auth/reset-password', resetForm);
      setResetDone(true);
      setMode('login');
      setResetForm({ username: '', garage_code: '', code: '', new_password: '' });
    } catch (err) {
      setResetError(err.response?.data?.message || 'Password reset failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <Wrench className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white">GMS Login</h2>
          <p className="text-gray-400 mt-2">Sign in to your account</p>
        </div>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {resetDone && (
          <div className="bg-green-500/10 border border-green-500 text-green-400 px-4 py-3 rounded mb-6">
            Password reset. Sign in with your new password.
          </div>
        )}

        {mode === 'reset' ? (
        <form onSubmit={handleReset} className="space-y-6">
          <p className="text-gray-400 text-sm">
            Ask your garage admin for a reset code (Users → Reset code), then
            enter it below. Codes expire after 15 minutes.
          </p>
          {resetError && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded">
              {resetError}
            </div>
          )}
          <div>
            <label htmlFor="reset-username" className="block text-sm font-medium text-gray-300">Username</label>
            <input
              id="reset-username"
              type="text"
              value={resetForm.username}
              onChange={(e) => setResetForm({ ...resetForm, username: e.target.value })}
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="reset-garage-code" className="block text-sm font-medium text-gray-300">Garage Code</label>
            <input
              id="reset-garage-code"
              type="text"
              value={resetForm.garage_code}
              onChange={(e) => setResetForm({ ...resetForm, garage_code: e.target.value.toUpperCase() })}
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="reset-code" className="block text-sm font-medium text-gray-300">Reset Code</label>
            <input
              id="reset-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={resetForm.code}
              onChange={(e) => setResetForm({ ...resetForm, code: e.target.value.replace(/\D/g, '') })}
              placeholder="6 digits"
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white placeholder-gray-500 tracking-widest focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="reset-password" className="block text-sm font-medium text-gray-300">New Password (min 6)</label>
            <input
              id="reset-password"
              type="password"
              minLength={6}
              value={resetForm.new_password}
              onChange={(e) => setResetForm({ ...resetForm, new_password: e.target.value })}
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setMode('login'); setResetError(''); }}
              className="flex-1 py-2 px-4 border border-gray-600 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Reset Password
            </button>
          </div>
        </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="login-username" className="block text-sm font-medium text-gray-300">Username</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-300">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="login-garage-code" className="block text-sm font-medium text-gray-300">Garage Code</label>
            <input
              id="login-garage-code"
              type="text"
              value={garageCode}
              onChange={(e) => setGarageCode(e.target.value.toUpperCase())}
              placeholder=""
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('reset'); setError(''); setResetDone(false); }}
            className="w-full text-sm text-gray-400 hover:text-blue-400 underline"
          >
            Forgot password?
          </button>
        </form>
        )}
      </div>
    </div>
  );
};

export default Login;

