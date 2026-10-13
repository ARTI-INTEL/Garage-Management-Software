import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Garages from '../pages/Garages';
import { AuthProvider } from '../context/AuthContext';

// Mock the axios API layer
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import api from '../services/api';

const garages = [
  {
    id: 1,
    garage_name: 'Main Workshop',
    garage_code: 'ADMIN',
    phone: '+971500000001',
    address: '123 Mechanic Street',
    user_count: 3,
    customer_count: 10,
    vehicle_count: 5,
    created_at: '2026-01-01T00:00:00.000Z',
    is_active: 1,
  },
  {
    id: 2,
    garage_name: 'Downtown Branch',
    garage_code: 'DTOWN',
    phone: '',
    address: '',
    user_count: 1,
    customer_count: 0,
    vehicle_count: 0,
    created_at: '2026-02-01T00:00:00.000Z',
    is_active: 0,
  },
];

const rowFor = (name) => screen.getByText(name).closest('tr');

const renderGarages = () =>
  render(
    <AuthProvider>
      <Garages />
    </AuthProvider>
  );

describe('Super admin Garages page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('token');
    api.get.mockImplementation((url) =>
      url === '/garages'
        ? Promise.resolve({ data: { data: garages } })
        : Promise.reject(new Error('unexpected call'))
    );
  });

  it('shows a status badge and Edit / Disable / Delete actions per garage', async () => {
    renderGarages();

    await screen.findByText('Main Workshop');
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();

    const activeRow = rowFor('Main Workshop');
    expect(within(activeRow).getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(within(activeRow).getByRole('button', { name: /disable/i })).toBeInTheDocument();
    expect(within(activeRow).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(within(activeRow).getByText('Active')).toBeInTheDocument();

    // Disabled garage flips the toggle to Enable
    const disabledRow = rowFor('Downtown Branch');
    expect(within(disabledRow).getByText('Disabled')).toBeInTheDocument();
    expect(within(disabledRow).getByRole('button', { name: /enable/i })).toBeInTheDocument();
  });

  it('opens the edit modal and saves the garage info with PUT', async () => {
    api.put.mockResolvedValue({ data: { status: 'success', message: 'Garage "Main Workshop" updated' } });
    renderGarages();

    await screen.findByText('Main Workshop');
    await userEvent.click(within(rowFor('Main Workshop')).getByRole('button', { name: /edit/i }));

    // The create modal is closed, so these labels/buttons belong to the edit modal
    expect(screen.getByRole('heading', { name: 'Edit Garage' })).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Garage Name');
    expect(nameInput).toHaveValue('Main Workshop');

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Main Workshop Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/garages/1', {
        garage_name: 'Main Workshop Renamed',
        garage_code: 'ADMIN',
        phone: '+971500000001',
        address: '123 Mechanic Street',
      });
    });
    expect(await screen.findByText(/Garage "Main Workshop" updated/)).toBeInTheDocument();
    // list is refetched so the new name shows up
    expect(api.get).toHaveBeenCalledWith('/garages');
  });

  it('confirms before temporarily disabling, then PATCHes the status without deleting', async () => {
    api.patch.mockResolvedValue({
      data: { status: 'success', message: 'Garage "Main Workshop" disabled — its users are blocked, no data was deleted' },
    });
    renderGarages();

    await screen.findByText('Main Workshop');
    await userEvent.click(within(rowFor('Main Workshop')).getByRole('button', { name: /disable/i }));

    // Confirmation spells out that nothing is deleted
    expect(screen.getByRole('heading', { name: 'Temporarily Disable Garage' })).toBeInTheDocument();
    expect(screen.getByText(/no data is deleted/i)).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /temporarily disable/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/garages/1/status', { is_active: false });
    });
    // Delete is never touched by the disable flow
    expect(api.delete).not.toHaveBeenCalled();
    expect(await screen.findByText(/no data was deleted/)).toBeInTheDocument();
  });

  it('re-enables a disabled garage with a single PATCH', async () => {
    api.patch.mockResolvedValue({
      data: { status: 'success', message: 'Garage "Downtown Branch" enabled — its users can sign in again' },
    });
    renderGarages();

    await screen.findByText('Downtown Branch');
    await userEvent.click(within(rowFor('Downtown Branch')).getByRole('button', { name: /enable/i }));

    expect(screen.getByRole('heading', { name: 'Enable Garage' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /enable garage/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/garages/2/status', { is_active: true });
    });
  });
});
