import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import { Download, MessageCircle, CreditCard, Receipt } from 'lucide-react';
import { getCurrency } from '../services/settings';

const statusColor = {
  'Unpaid': 'bg-red-100 text-red-700 border-red-200',
  'Partially Paid': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Paid': 'bg-green-100 text-green-700 border-green-200',
  'Cancelled': 'bg-gray-100 text-gray-500 border-gray-200',
};

const InvoiceDetails = () => {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_method: 'Cash' });
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [currency, setCurrency] = useState('AED');

  useEffect(() => { getCurrency().then(setCurrency); }, []);

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/invoices/${id}`);
      setInvoice(res.data.data);
    } catch (error) {
      console.error('Failed to fetch invoice', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const handleDownloadPDF = async () => {
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invoice.invoice_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to download PDF');
    }
  };

  const handleWhatsApp = async () => {
    setWhatsappLoading(true);
    try {
      const res = await api.get(`/invoices/${id}/whatsapp`);
      const { whatsapp_url } = res.data.data;
      window.open(whatsapp_url, '_blank');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to generate WhatsApp link');
    }
    setWhatsappLoading(false);
  };

  const handleDownloadReceipt = async (paymentId) => {
    try {
      const res = await api.get(`/invoices/${id}/payments/${paymentId}/receipt`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `receipt-${paymentId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download receipt');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/invoices/${id}/payments`, paymentForm);
      setIsPaymentModalOpen(false);
      setPaymentForm({ amount: '', payment_method: 'Cash' });
      fetchInvoice();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to record payment');
    }
  };

  if (loading) return <div className="py-8 text-center text-gray-400">Loading invoice...</div>;
  if (!invoice) return <div className="py-8 text-center text-red-500">Invoice not found</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-bold">{invoice.invoice_number}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {new Date(invoice.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold border ${statusColor[invoice.payment_status] || ''}`}>
            {invoice.payment_status}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            <Download size={16} /> Download PDF
          </button>
          <button onClick={handleWhatsApp} disabled={whatsappLoading} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50">
            <MessageCircle size={16} /> {whatsappLoading ? 'Opening...' : 'Send via WhatsApp'}
          </button>
          {invoice.payment_status !== 'Paid' && (
            <button onClick={() => setIsPaymentModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium">
              <CreditCard size={16} /> Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Customer + Vehicle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Bill To</h3>
          <p className="font-bold text-lg">{invoice.customer_name}</p>
          <p className="text-gray-600">{invoice.mobile_number}</p>
          {invoice.customer_email && <p className="text-gray-600">{invoice.customer_email}</p>}
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Vehicle</h3>
          <div className="bg-yellow-400 inline-block px-4 py-1 rounded font-bold text-lg tracking-wider mb-2">{invoice.registration_number}</div>
          <p className="text-gray-700">{invoice.make} {invoice.model} {invoice.year && `(${invoice.year})`}</p>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm">Type</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm">Description</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm text-center">Qty</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm text-right">Unit Price</th>
              <th className="px-6 py-3 text-gray-500 font-medium text-sm text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoice.items?.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${item.item_type === 'labour' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {item.item_type}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-800">{item.description}</td>
                <td className="px-6 py-3 text-center text-gray-600">{item.quantity}</td>
                <td className="px-6 py-3 text-right text-gray-600">{currency} {parseFloat(item.unit_price).toFixed(2)}</td>
                <td className="px-6 py-3 text-right font-semibold">{currency} {parseFloat(item.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t bg-gray-50 px-6 py-4 space-y-2">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{currency} {parseFloat(invoice.subtotal).toFixed(2)}</span>
          </div>
          {parseFloat(invoice.discount) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Discount</span>
              <span className="text-red-600">- {currency} {parseFloat(invoice.discount).toFixed(2)}</span>
            </div>
          )}
          {parseFloat(invoice.tax) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Tax / VAT</span>
              <span>{currency} {parseFloat(invoice.tax).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg border-t pt-2">
            <span>Grand Total</span>
            <span>{currency} {parseFloat(invoice.grand_total).toFixed(2)}</span>
          </div>
          {invoice.amount_paid > 0 && (
            <>
              <div className="flex justify-between text-green-600 font-medium">
                <span>Amount Paid</span>
                <span>{currency} {parseFloat(invoice.amount_paid).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-red-600">
                <span>Balance Due</span>
                <span>{currency} {parseFloat(invoice.balance_due).toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment History */}
      {invoice.payments && invoice.payments.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Payment History</h3>
          <div className="space-y-3">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex justify-between items-center bg-gray-50 p-3 rounded border">
                <div>
                  <p className="font-medium text-gray-800">{currency} {parseFloat(p.amount).toFixed(2)}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {p.payment_method && ` • ${p.payment_method}`}
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadReceipt(p.id)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                >
                  <Receipt size={14} /> Receipt
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Record Payment">
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ({currency}) *</label>
            <input
              required type="number" step="0.01" min="0.01"
              className="w-full border rounded p-2"
              placeholder={`Balance: ${currency} ${parseFloat(invoice.balance_due || invoice.grand_total).toFixed(2)}`}
              value={paymentForm.amount}
              onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select className="w-full border rounded p-2" value={paymentForm.payment_method} onChange={e => setPaymentForm({...paymentForm, payment_method: e.target.value})}>
              <option value="Cash">Cash</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Debit Card">Debit Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Record Payment</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InvoiceDetails;

