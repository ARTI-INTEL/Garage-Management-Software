import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InvoiceDetails from '../pages/InvoiceDetails';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() } },
  },
}));

vi.mock('../services/settings', () => ({
  getCurrency: vi.fn().mockResolvedValue('AED'),
  getSettings: vi.fn().mockResolvedValue({ currency: 'AED' }),
}));

import api from '../services/api';

const invoice = {
  id: 1,
  invoice_number: 'INV-2026-0001',
  invoice_date: '2026-01-15T10:00:00Z',
  payment_status: 'Unpaid',
  customer_name: 'John Doe',
  mobile_number: '+971501234567',
  registration_number: 'DXB-12345',
  make: 'Toyota',
  model: 'Camry',
  year: 2020,
  subtotal: '400.00',
  discount: '10.00',
  tax: '0.00',
  grand_total: '390.00',
  amount_paid: 0,
  balance_due: 390,
  items: [
    { id: 1, item_type: 'labour', description: 'Brake pads - Labour', quantity: 1, unit_price: '250.00', total: '250.00' },
    { id: 2, item_type: 'part', description: 'Brake Pads', quantity: 2, unit_price: '75.00', total: '150.00' },
  ],
  payments: [],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/invoices/1']}>
      <Routes>
        <Route path="/invoices/:id" element={<InvoiceDetails />} />
      </Routes>
    </MemoryRouter>
  );

describe('InvoiceDetails page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/invoices/1') return Promise.resolve({ data: { data: invoice } });
      return Promise.resolve({ data: { data: null } });
    });
  });

  it('renders invoice number, totals, and line items', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
    });
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('DXB-12345')).toBeInTheDocument();
    expect(screen.getByText('Brake pads - Labour')).toBeInTheDocument();
    // totals rendered with configured currency
    expect(screen.getByText('AED 390.00')).toBeInTheDocument();
    // discount row visible since discount > 0
    expect(screen.getByText(/- AED 10.00/)).toBeInTheDocument();
  });

  it('posts a payment and refreshes the invoice', async () => {
    api.post.mockResolvedValue({ data: { status: 'success', data: { payment_status: 'Paid' } } });

    renderPage();
    await waitFor(() => expect(screen.getByText('INV-2026-0001')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /record payment/i }));
    const amountInput = await screen.findByPlaceholderText(/balance/i);
    await userEvent.type(amountInput, '390');
    // Header button opens the modal; the modal's submit lives inside the <form>
    const submitBtn = screen
      .getAllByRole('button', { name: /^record payment$/i })
      .find((b) => b.closest('form'));
    expect(submitBtn).toBeDefined();
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/invoices/1/payments', {
        amount: '390',
        payment_method: 'Cash',
      });
    });
    // refetch after payment
    expect(api.get).toHaveBeenCalledWith('/invoices/1');
  });
});
