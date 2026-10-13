import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login';
import { AuthProvider } from '../context/AuthContext';

// Mock the axios API layer
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() } },
  },
}));

import api from '../services/api';

const renderLogin = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // AuthContext's checkAuth on mount: no token -> no API call needed
    api.get.mockRejectedValue(new Error('no token'));
  });

  it('shows an error message on failed login', async () => {
    api.post.mockRejectedValue({
      response: { data: { message: 'Invalid credentials' } },
    });

    renderLogin();
    await userEvent.type(screen.getByLabelText(/username/i), 'admin');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.type(screen.getByLabelText(/garage code/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      username: 'admin',
      password: 'wrong',
      garage_code: 'ADMIN',
    });
  });

  it('stores the token and navigates on successful login', async () => {
    api.post.mockResolvedValue({
      data: { data: { id: 1, username: 'admin', role: 'admin', token: 'jwt-token-123' } },
    });

    renderLogin();
    await userEvent.type(screen.getByLabelText(/username/i), 'admin');
    await userEvent.type(screen.getByLabelText(/password/i), 'admin123');
    await userEvent.type(screen.getByLabelText(/garage code/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe('jwt-token-123');
    });
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      username: 'admin',
      password: 'admin123',
      garage_code: 'ADMIN',
    });
  });
});
