'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAdminToken, getAdminAuthHeaders, getAdminToken } from '@/lib/admin-auth';
import { ApiError, fetchApiJson, getApiUrl, type PaymentDisplay, type PaymentSubmission, type Poem } from '@/lib/api';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';
type ManagementStatus = 'idle' | 'saving' | 'deleting' | 'success' | 'error';
type UploadField = 'coverImage' | 'backgroundMusic' | 'poemPdf';
type ActiveTab = 'upload' | 'poems' | 'payments' | 'paymentQr';
type FeedbackTone = 'success' | 'error';

type PoemFormValues = {
  title: string;
  price: string;
  description: string;
  freePages: string;
  poemContent: string;
};

const priceFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

const createEmptyForm = (): PoemFormValues => ({
  title: '',
  price: '',
  description: '',
  freePages: '2',
  poemContent: '',
});

const formFromPoem = (poem: Poem): PoemFormValues => ({
  title: poem.title,
  price: String(poem.price ?? ''),
  description: poem.description || '',
  freePages: String(poem.free_pages || 2),
  poemContent: '',
});

const getFeedbackClassName = (tone: FeedbackTone) =>
  tone === 'success'
    ? 'border border-green-200 bg-green-50 text-green-700'
    : 'border border-red-200 bg-red-50 text-red-700';

const getPaymentBadgeClassName = (status: PaymentSubmission['status']) => {
  if (status === 'verified') {
    return 'bg-green-50 text-green-700 border border-green-200';
  }

  if (status === 'rejected') {
    return 'bg-red-50 text-red-700 border border-red-200';
  }

  return 'bg-[#f7f3ec] text-[#8a735c] border border-[#e8dfd5]';
};

const isAdminSessionError = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

const getErrorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const ProgressBar = ({ progress, label }: { progress: number; label: string }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-[#8a725c]">
      <span>{label}</span>
      <span>{Math.round(progress)}%</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#e8dfd5]">
      <div
        className="h-full bg-[#8a725c] transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>
);

export default function AdminPanel() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [managementStatus, setManagementStatus] = useState<ManagementStatus>('idle');
  const [managementMessage, setManagementMessage] = useState('');
  const [poems, setPoems] = useState<Poem[]>([]);
  const [isLoadingPoems, setIsLoadingPoems] = useState(true);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [paymentFeedback, setPaymentFeedback] = useState<{ tone: FeedbackTone; message: string } | null>(null);
  const [paymentActionId, setPaymentActionId] = useState<number | null>(null);
  const [editingPoemId, setEditingPoemId] = useState<number | null>(null);
  const [formValues, setFormValues] = useState<PoemFormValues>(createEmptyForm);
  const [editValues, setEditValues] = useState<PoemFormValues>(createEmptyForm);
  const [selectedFiles, setSelectedFiles] = useState<{
    coverImage: File | null;
    backgroundMusic: File | null;
    poemPdf: File | null;
  }>({
    coverImage: null,
    backgroundMusic: null,
    poemPdf: null,
  });
  const [paymentDisplay, setPaymentDisplay] = useState<PaymentDisplay | null>(null);
  const [paymentUpiId, setPaymentUpiId] = useState('');
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);
  const [paymentDisplayStatus, setPaymentDisplayStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [paymentDisplayMessage, setPaymentDisplayMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [managementProgress, setManagementProgress] = useState(0);
  const [editFiles, setEditFiles] = useState<{
    coverImage: File | null;
    backgroundMusic: File | null;
    poemPdf: File | null;
  }>({
    coverImage: null,
    backgroundMusic: null,
    poemPdf: null,
  });

  const redirectToLogin = (message?: string) => {
    clearAdminToken();

    if (message) {
      setPaymentFeedback({ tone: 'error', message });
      setManagementStatus('error');
      setManagementMessage(message);
      setUploadStatus('error');
      setUploadMessage(message);
    }

    router.replace('/admin/login');
  };

  const loadPoems = async () => {
    setIsLoadingPoems(true);
    setManagementMessage((currentMessage) =>
      managementStatus === 'error' && currentMessage === 'Unable to load poems'
        ? ''
        : currentMessage,
    );

    try {
      const poemList = await fetchApiJson<Poem[]>('/api/poems', { fallback: [] });
      setPoems(poemList);
    } catch (error) {
      setPoems([]);
      setManagementStatus('error');
      setManagementMessage(getErrorMessage(error, 'Unable to load poems'));
    } finally {
      setIsLoadingPoems(false);
    }
  };

  const loadPayments = async () => {
    setIsLoadingPayments(true);
    setPaymentFeedback(null);

    const token = getAdminToken();

    if (!token) {
      setIsLoadingPayments(false);
      redirectToLogin();
      return;
    }

    try {
      const paymentList = await fetchApiJson<PaymentSubmission[]>('/api/payments', {
        headers: getAdminAuthHeaders(),
      });

      setPayments(paymentList);
    } catch (error) {
      if (isAdminSessionError(error)) {
        redirectToLogin('Admin session expired. Please login again.');
        return;
      }

      setPayments([]);
      setPaymentFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Unable to load payment submissions'),
      });
    } finally {
      setIsLoadingPayments(false);
    }
  };

  useEffect(() => {
    const token = getAdminToken();

    if (!token) {
      setIsCheckingAuth(false);
      router.replace('/admin/login');
      return;
    }

    let isMounted = true;

    const loadInitialData = async () => {
      try {
        await Promise.allSettled([loadPoems(), loadPayments()]);
      } finally {
        if (isMounted) {
          setIsCheckingAuth(false);
        }
      }
    };

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const logout = () => {
    clearAdminToken();
    router.replace('/admin/login');
  };

  const updateFile = (field: UploadField, file: File | null) => {
    setSelectedFiles((prev) => ({ ...prev, [field]: file }));
  };

  const updateEditFile = (field: UploadField, file: File | null) => {
    setEditFiles((prev) => ({ ...prev, [field]: file }));
  };

  const resetUploadForm = () => {
    setFormValues(createEmptyForm());
    setSelectedFiles({
      coverImage: null,
      backgroundMusic: null,
      poemPdf: null,
    });
  };

  const resetEditState = () => {
    setEditingPoemId(null);
    setEditValues(createEmptyForm());
    setEditFiles({
      coverImage: null,
      backgroundMusic: null,
      poemPdf: null,
    });
    setManagementProgress(0);
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setUploadStatus('uploading');
    setUploadMessage('');
    setUploadProgress(0);

    if (!formValues.poemContent.trim() && !selectedFiles.poemPdf) {
      setUploadStatus('error');
      setUploadMessage('Enter poem text or upload a PDF file.');
      return;
    }

    const payload = new FormData();
    payload.append('title', formValues.title);
    payload.append('price', formValues.price);
    payload.append('description', formValues.description);
    payload.append('freePages', formValues.freePages);
    payload.append('poemContent', formValues.poemContent);

    if (selectedFiles.coverImage) {
      payload.append('coverImage', selectedFiles.coverImage);
    }

    if (selectedFiles.backgroundMusic) {
      payload.append('backgroundMusic', selectedFiles.backgroundMusic);
    }

    if (selectedFiles.poemPdf) {
      payload.append('poemPdf', selectedFiles.poemPdf);
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', getApiUrl('/api/poems'));
        
        const token = getAdminToken();
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const data = JSON.parse(xhr.responseText) as { error?: string };
              reject(new ApiError(xhr.status, data.error || 'Upload failed'));
            } catch {
              reject(new ApiError(xhr.status, 'Upload failed'));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(payload);
      });

      setUploadStatus('success');
      setUploadMessage('Poem published successfully.');
      form.reset();
      resetUploadForm();
      await loadPoems();
    } catch (error) {
      if (isAdminSessionError(error)) {
        redirectToLogin('Admin session expired. Please login again.');
        return;
      }

      setUploadStatus('error');
      setUploadMessage(getErrorMessage(error, 'Unable to upload poem'));
    }
  };

  const loadPaymentDisplay = async () => {
    setPaymentDisplayMessage('');
    try {
      const d = await fetchApiJson<PaymentDisplay>('/api/payment-display');
      setPaymentDisplay(d);
      setPaymentUpiId(d.upi_id || '');
      setPaymentQrFile(null);
      setPaymentDisplayStatus('idle');
    } catch (error) {
      setPaymentDisplayStatus('error');
      setPaymentDisplayMessage(getErrorMessage(error, 'Unable to load payment display'));
    }
  };

  const handleSavePaymentDisplay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const token = getAdminToken();

    if (!token) {
      redirectToLogin();
      return;
    }

    setPaymentDisplayStatus('saving');
    setPaymentDisplayMessage('');

    const fd = new FormData();
    fd.append('upiId', paymentUpiId);
    if (paymentQrFile) {
      fd.append('paymentQr', paymentQrFile);
    }

    try {
      const response = await fetch(getApiUrl('/api/admin/payment-display'), {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: fd,
      });

      const data = (await response.json()) as {
        error?: string;
        message?: string;
        payment_display?: PaymentDisplay;
      };

      if (!response.ok) {
        throw new ApiError(response.status, data.error || 'Unable to save payment display');
      }

      if (data.payment_display) {
        setPaymentDisplay(data.payment_display);
        setPaymentUpiId(data.payment_display.upi_id || '');
      }

      setPaymentQrFile(null);
      setPaymentDisplayStatus('success');
      setPaymentDisplayMessage(data.message || 'Payment QR and UPI ID saved.');
    } catch (error) {
      if (isAdminSessionError(error)) {
        redirectToLogin('Admin session expired. Please login again.');
        return;
      }

      setPaymentDisplayStatus('error');
      setPaymentDisplayMessage(getErrorMessage(error, 'Unable to save payment display'));
    }
  };

  const startEditing = async (poem: Poem) => {
    setManagementStatus('saving');
    setManagementMessage('');

    try {
      const readData = await fetchApiJson<{ pages: Array<{ content?: string }> }>(`/api/admin/poems/${poem.id}/content`, {
        headers: getAdminAuthHeaders(),
      });

      const poemContent = readData.pages
        .map((page: { content?: string }) => page.content || '')
        .filter(Boolean)
        .join('\n\n---PAGE---\n\n');

      setEditingPoemId(poem.id);
      setEditValues({
        ...formFromPoem(poem),
        poemContent,
      });
      setManagementStatus('idle');
      setManagementMessage('');
    } catch (error) {
      if (isAdminSessionError(error)) {
        redirectToLogin('Admin session expired. Please login again.');
        return;
      }

      setManagementStatus('error');
      setManagementMessage(getErrorMessage(error, 'Unable to load poem for editing'));
    }
  };

  const handleUpdatePoem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!editingPoemId) {
      return;
    }

    setManagementStatus('saving');
    setManagementMessage('');
    setManagementProgress(0);

    const payload = new FormData();
    payload.append('title', editValues.title);
    payload.append('description', editValues.description);
    payload.append('price', editValues.price);
    payload.append('freePages', editValues.freePages);
    payload.append('poemContent', editValues.poemContent);

    if (editFiles.coverImage) {
      payload.append('coverImage', editFiles.coverImage);
    }

    if (editFiles.backgroundMusic) {
      payload.append('backgroundMusic', editFiles.backgroundMusic);
    }

    if (editFiles.poemPdf) {
      payload.append('poemPdf', editFiles.poemPdf);
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', getApiUrl(`/api/poems/${editingPoemId}`));

        const token = getAdminToken();
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            setManagementProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const data = JSON.parse(xhr.responseText) as { error?: string };
              reject(new ApiError(xhr.status, data.error || 'Update failed'));
            } catch {
              reject(new ApiError(xhr.status, 'Update failed'));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during update'));
        xhr.send(payload);
      });

      setManagementStatus('success');
      setManagementMessage('Poem updated successfully.');
      resetEditState();
      await loadPoems();
    } catch (error) {
      if (isAdminSessionError(error)) {
        redirectToLogin('Admin session expired. Please login again.');
        return;
      }

      setManagementStatus('error');
      setManagementMessage(getErrorMessage(error, 'Unable to update poem'));
    }
  };

  const handleDeletePoem = async (poem: Poem) => {
    const shouldDelete = window.confirm(`Delete "${poem.title}"? This will also remove related preview pages.`);

    if (!shouldDelete) {
      return;
    }

    setManagementStatus('deleting');
    setManagementMessage('');

    try {
      const response = await fetch(getApiUrl(`/api/poems/${poem.id}`), {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new ApiError(response.status, data.error || 'Unable to delete poem');
      }

      if (editingPoemId === poem.id) {
        resetEditState();
      }

      setManagementStatus('success');
      setManagementMessage(`Deleted "${poem.title}" successfully.`);
      await loadPoems();
    } catch (error) {
      if (isAdminSessionError(error)) {
        redirectToLogin('Admin session expired. Please login again.');
        return;
      }

      setManagementStatus('error');
      setManagementMessage(getErrorMessage(error, 'Unable to delete poem'));
    }
  };

  const updatePaymentStatus = async (paymentId: number, status: PaymentSubmission['status']) => {
    setPaymentActionId(paymentId);
    setPaymentFeedback(null);

    try {
      const response = await fetch(getApiUrl(`/api/payments/${paymentId}/status`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ status }),
      });

      const data = (await response.json()) as {
        error?: string;
        message?: string;
        payment?: PaymentSubmission;
      };

      if (!response.ok || !data.payment) {
        throw new ApiError(response.status, data.error || 'Unable to update payment status');
      }

      setPayments((currentPayments) =>
        currentPayments.map((payment) => (payment.id === paymentId ? data.payment! : payment)),
      );
      setPaymentFeedback({
        tone: 'success',
        message: data.message || `Payment marked as ${status}`,
      });
    } catch (error) {
      if (isAdminSessionError(error)) {
        redirectToLogin('Admin session expired. Please login again.');
        return;
      }

      setPaymentFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Unable to update payment status'),
      });
    } finally {
      setPaymentActionId(null);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#f7f3ec] flex items-center justify-center px-6 text-[#8a735c] font-sans">
        Checking admin session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f3ec] text-[#4a3f35] font-serif flex flex-col">
      <header className="bg-white/80 backdrop-blur-md border-b border-[#e8dfd5] sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="rounded-full border border-[#e8dfd5] px-4 py-2 text-sm font-bold uppercase tracking-widest text-[#8a735c] transition-colors hover:bg-[#f7f3ec]"
            >
              Home
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-[#6b5846]">Admin Panel</h1>
          </div>
          <nav className="flex gap-4 items-center">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'upload' ? 'bg-[#8a735c] text-white' : 'hover:bg-[#e8dfd5]'
              }`}
            >
              Add Poem
            </button>
            <button
              onClick={() => {
                setActiveTab('poems');
                void loadPoems();
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'poems' ? 'bg-[#8a735c] text-white' : 'hover:bg-[#e8dfd5]'
              }`}
            >
              Manage Poems
            </button>
            <button
              onClick={() => {
                setActiveTab('payments');
                void loadPayments();
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'payments' ? 'bg-[#8a735c] text-white' : 'hover:bg-[#e8dfd5]'
              }`}
            >
              Verify Payments
            </button>
            <button
              onClick={() => {
                setActiveTab('paymentQr');
                void loadPaymentDisplay();
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'paymentQr' ? 'bg-[#8a735c] text-white' : 'hover:bg-[#e8dfd5]'
              }`}
            >
              Payment QR
            </button>
            <button
              onClick={logout}
              className="rounded-full border border-[#e8dfd5] px-4 py-2 text-sm font-bold uppercase tracking-widest text-[#8a735c] transition-colors hover:bg-[#f7f3ec]"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 w-full space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-3xl border border-[#e8dfd5] bg-white px-6 py-6 shadow-sm">
            <p className="text-xs font-sans uppercase tracking-[0.3em] text-[#8a735c]">Total Poems</p>
            <p className="mt-4 text-4xl font-bold text-[#5a4838]">{poems.length}</p>
            <p className="mt-2 text-sm font-sans text-[#8a735c]">
              {isLoadingPoems ? 'Refreshing collection...' : 'All published poems available to manage.'}
            </p>
          </div>

          <div className="rounded-3xl border border-[#e8dfd5] bg-white px-6 py-6 shadow-sm">
            <p className="text-xs font-sans uppercase tracking-[0.3em] text-[#8a735c]">Current Focus</p>
            <p className="mt-4 text-2xl font-bold text-[#5a4838]">
              {activeTab === 'upload'
                ? 'Publishing'
                : activeTab === 'poems'
                  ? 'Editing'
                  : activeTab === 'payments'
                    ? 'Payments'
                    : 'Checkout'}
            </p>
            <p className="mt-2 text-sm font-sans text-[#8a735c]">
              {activeTab === 'poems'
                ? 'Review, update, or remove existing poems.'
                : activeTab === 'upload'
                  ? 'Add a fresh poem to the library.'
                  : activeTab === 'paymentQr'
                    ? 'Set the UPI QR image and ID shown on the customer payment page.'
                    : 'Review incoming payment requests and update their status.'}
            </p>
          </div>

          <div className="rounded-3xl border border-[#e8dfd5] bg-white px-6 py-6 shadow-sm">
            <p className="text-xs font-sans uppercase tracking-[0.3em] text-[#8a735c]">Editable Records</p>
            <p className="mt-4 text-2xl font-bold text-[#5a4838]">{poems.length > 0 ? 'Ready' : 'Empty'}</p>
            <p className="mt-2 text-sm font-sans text-[#8a735c]">
              Every poem in the collection can now be updated or deleted from this panel.
            </p>
          </div>
        </section>

        {activeTab === 'upload' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#e8dfd5] max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold font-serif mb-8 text-[#5a4838]">Upload New Poem</h2>

            <form onSubmit={handleUpload} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[#6b5846]">Poem Title</label>
                  <input
                    required
                    type="text"
                    value={formValues.title}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none"
                    placeholder="e.g. Sunehri Yaado Ke Moti"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[#6b5846]">Price (Rs)</label>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={formValues.price}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, price: e.target.value }))}
                    className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none"
                    placeholder="50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[#6b5846]">Description</label>
                <textarea
                  rows={3}
                  value={formValues.description}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none"
                  placeholder="Brief description of the poem..."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[#6b5846]">Free Pages</label>
                <input
                  required
                  min="1"
                  type="number"
                  value={formValues.freePages}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, freePages: e.target.value }))}
                  className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[#6b5846]">
                  Poem Text{' '}
                  <span className="font-sans text-xs font-normal text-[#8a735c]">
                    (or upload a PDF below—each PDF page becomes one reader page after the title screen)
                  </span>
                </label>
                <textarea
                  rows={10}
                  value={formValues.poemContent}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, poemContent: e.target.value }))}
                  className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none font-sans leading-7"
                  placeholder={`Type your poem here.\n\nUse ---PAGE--- on a new line to split multiple pages.\n\nLeave empty if you upload a PDF instead.`}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[#6b5846]">Poem PDF (optional)</label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex min-h-[7rem] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#e8dfd5] bg-[#fdfcfb] px-4 py-4 transition-colors hover:bg-[#f7f3ec]">
                    <span className="mb-1 text-2xl font-bold text-[#8a735c]">PDF</span>
                    <p className="mb-1 text-center text-sm text-[#8a735c]">
                      <span className="font-semibold">
                        {selectedFiles.poemPdf?.name || 'Click to upload a .pdf'}
                      </span>
                    </p>
                    <p className="max-w-md text-center text-xs text-[#a89684]">
                      Text-based PDFs work best. If you upload a PDF, it overrides poem text for page content.
                    </p>
                    <input
                      type="file"
                      className="hidden"
                      accept="application/pdf,.pdf"
                      onChange={(e) => updateFile('poemPdf', e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>

              <div className="border-t border-[#e8dfd5] pt-6 grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-bold text-[#6b5846] mb-2">
                    Cover Image (First Page Background)
                  </label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-[#e8dfd5] border-dashed rounded-xl cursor-pointer bg-[#fdfcfb] hover:bg-[#f7f3ec] transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <span className="text-3xl mb-2">IMG</span>
                        <p className="mb-2 text-sm text-[#8a735c]">
                          <span className="font-semibold">
                            {selectedFiles.coverImage?.name || 'Click to upload image'}
                          </span>
                        </p>
                      </div>
                      <input
                        required
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => updateFile('coverImage', e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#6b5846] mb-2">Background Music (MP3)</label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-[#e8dfd5] border-dashed rounded-xl cursor-pointer bg-[#fdfcfb] hover:bg-[#f7f3ec] transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <span className="text-3xl mb-2">MP3</span>
                        <p className="mb-2 text-sm text-[#8a735c]">
                          <span className="font-semibold">
                            {selectedFiles.backgroundMusic?.name || 'Click to upload audio'}
                          </span>
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="audio/*"
                        onChange={(e) => updateFile('backgroundMusic', e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {uploadStatus === 'uploading' && (
                <div className="mt-4">
                  <ProgressBar progress={uploadProgress} label="Uploading Poem Contents..." />
                </div>
              )}

              {uploadStatus !== 'idle' && uploadMessage && (
                <p
                  className={`rounded-xl px-4 py-3 text-sm font-medium ${
                    uploadStatus === 'success'
                      ? 'border border-green-200 bg-green-50 text-green-700'
                      : uploadStatus === 'error'
                        ? 'border border-red-200 bg-red-50 text-red-700'
                        : 'border border-[#e8dfd5] bg-[#fdfcfb] text-[#8a735c]'
                  }`}
                >
                  {uploadMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={uploadStatus === 'uploading'}
                className="w-full mt-6 bg-[#8a735c] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#6b5846] transition-colors shadow-lg active:scale-[0.98] flex justify-center items-center gap-2"
              >
                {uploadStatus === 'uploading'
                  ? 'Uploading...'
                  : uploadStatus === 'success'
                    ? 'Uploaded Successfully'
                    : 'Publish Poem'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'poems' && (
          <section className="space-y-6">
            <div className="rounded-3xl border border-[#e8dfd5] bg-white p-8 shadow-sm">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-bold text-[#5a4838]">Manage Poems</h2>
                  <p className="mt-3 text-sm font-sans text-[#8a735c]">
                    Total poems in library: <strong>{poems.length}</strong>
                  </p>
                </div>

                <button
                  onClick={() => void loadPoems()}
                  className="rounded-full border border-[#e8dfd5] px-4 py-2 text-sm font-bold font-sans uppercase tracking-widest text-[#8a735c] transition-colors hover:bg-[#f7f3ec]"
                >
                  Refresh
                </button>
              </div>

              {managementStatus !== 'idle' && managementMessage && (
                <p
                  className={`mt-6 rounded-xl px-4 py-3 text-sm font-medium ${
                    managementStatus === 'success'
                      ? 'border border-green-200 bg-green-50 text-green-700'
                      : managementStatus === 'error'
                        ? 'border border-red-200 bg-red-50 text-red-700'
                        : 'border border-[#e8dfd5] bg-[#fdfcfb] text-[#8a735c]'
                  }`}
                >
                  {managementMessage ||
                    (managementStatus === 'saving'
                      ? 'Saving changes...'
                      : managementStatus === 'deleting'
                        ? 'Deleting poem...'
                        : '')}
                </p>
              )}
            </div>

            {editingPoemId && (
              <div className="rounded-3xl border border-[#e8dfd5] bg-white p-8 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-[#5a4838]">Edit Poem</h3>
                    <p className="mt-2 text-sm font-sans text-[#8a735c]">
                      Update the selected poem details and save them back to the collection.
                    </p>
                  </div>

                  <button
                    onClick={resetEditState}
                    className="rounded-full border border-[#e8dfd5] px-4 py-2 text-sm font-bold font-sans uppercase tracking-widest text-[#8a735c] transition-colors hover:bg-[#f7f3ec]"
                  >
                    Cancel
                  </button>
                </div>

                <form onSubmit={handleUpdatePoem} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[#6b5846]">Poem Title</label>
                      <input
                        required
                        type="text"
                        value={editValues.title}
                        onChange={(e) => setEditValues((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[#6b5846]">Price (Rs)</label>
                      <input
                        required
                        min="0"
                        step="0.01"
                        type="number"
                        value={editValues.price}
                        onChange={(e) => setEditValues((prev) => ({ ...prev, price: e.target.value }))}
                        className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#6b5846]">Description</label>
                    <textarea
                      rows={4}
                      value={editValues.description}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, description: e.target.value }))}
                      className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#6b5846]">Free Pages</label>
                    <input
                      required
                      min="1"
                      type="number"
                      value={editValues.freePages}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, freePages: e.target.value }))}
                      className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#6b5846]">Poem Text</label>
                    <textarea
                      required
                      rows={12}
                      value={editValues.poemContent}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, poemContent: e.target.value }))}
                      className="w-full px-4 py-3 bg-[#fdfcfb] border border-[#e8dfd5] rounded-xl focus:ring-2 focus:ring-[#8a735c] outline-none font-sans leading-7"
                      placeholder={`Type your poem here.\n\nUse ---PAGE--- on a new line to split multiple pages.`}
                    />
                  </div>

                  <div className="space-y-4 border-t border-[#e8dfd5] pt-6">
                    <h4 className="text-sm font-bold text-[#6b5846]">Update Assets (Optional)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[#8a735c] uppercase">Cover Image</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => updateEditFile('coverImage', e.target.files?.[0] || null)}
                          className="w-full text-xs text-[#8a735c] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#e8dfd5] file:text-[#8a735c] hover:file:bg-[#d8cbb8] cursor-pointer"
                        />
                        {editFiles.coverImage && <p className="text-[10px] text-green-600 truncate">{editFiles.coverImage.name}</p>}
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[#8a735c] uppercase">Background Music</label>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => updateEditFile('backgroundMusic', e.target.files?.[0] || null)}
                          className="w-full text-xs text-[#8a735c] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#e8dfd5] file:text-[#8a735c] hover:file:bg-[#d8cbb8] cursor-pointer"
                        />
                        {editFiles.backgroundMusic && <p className="text-[10px] text-green-600 truncate">{editFiles.backgroundMusic.name}</p>}
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[#8a735c] uppercase">Poem PDF</label>
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={(e) => updateEditFile('poemPdf', e.target.files?.[0] || null)}
                          className="w-full text-xs text-[#8a735c] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#e8dfd5] file:text-[#8a735c] hover:file:bg-[#d8cbb8] cursor-pointer"
                        />
                        {editFiles.poemPdf && <p className="text-[10px] text-green-600 truncate">{editFiles.poemPdf.name}</p>}
                      </div>
                    </div>
                  </div>

                  {managementStatus === 'saving' && (
                    <div className="mt-4">
                      <ProgressBar progress={managementProgress} label="Saving Changes..." />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={managementStatus === 'saving'}
                    className="rounded-xl bg-[#8a735c] px-6 py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#6b5846] w-full md:w-auto"
                  >
                    {managementStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </div>
            )}

            <div className="space-y-4">
              {isLoadingPoems ? (
                <div className="rounded-3xl border border-[#e8dfd5] bg-white px-8 py-12 text-center shadow-sm">
                  <p className="text-sm font-sans text-[#8a735c]">Loading poems...</p>
                </div>
              ) : poems.length === 0 ? (
                <div className="rounded-3xl border border-[#e8dfd5] bg-white px-8 py-12 text-center shadow-sm">
                  <h3 className="text-2xl font-bold text-[#5a4838]">No poems yet</h3>
                  <p className="mt-3 text-sm font-sans text-[#8a735c]">
                    Publish your first poem from the Add Poem tab.
                  </p>
                </div>
              ) : (
                poems.map((poem) => (
                  <article
                    key={poem.id}
                    className="rounded-3xl border border-[#e8dfd5] bg-white p-6 shadow-sm md:p-8"
                  >
                    <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-5">
                        <div className="h-24 w-24 overflow-hidden rounded-2xl border border-[#e8dfd5] bg-[#fdfcfb] p-2 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              poem.cover_image_url ||
                              'https://via.placeholder.com/300x300/f5efe6/6b5846?text=Poetry+Hub'
                            }
                            alt={poem.title}
                            className="h-full w-full rounded-xl object-cover"
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-2xl font-bold text-[#5a4838]">{poem.title}</h3>
                            <span className="rounded-full bg-[#f7f3ec] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#8a735c]">
                              ID {poem.id}
                            </span>
                          </div>

                          <p className="max-w-3xl text-sm font-sans leading-relaxed text-[#6b5846]">
                            {poem.description || 'No description added yet.'}
                          </p>

                          <div className="flex flex-wrap gap-4 text-sm font-sans text-[#8a735c]">
                            <span>Price: Rs {priceFormatter.format(Number(poem.price) || 0)}</span>
                            <span>Free pages: {poem.free_pages}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 md:justify-end">
                        <button
                          onClick={() => void startEditing(poem)}
                          className="rounded-full bg-[#8a735c] px-5 py-2.5 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#6b5846]"
                        >
                          Update
                        </button>
                        <button
                          onClick={() => void handleDeletePoem(poem)}
                          className="rounded-full border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-bold uppercase tracking-widest text-red-700 transition-colors hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === 'payments' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#e8dfd5]">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold font-serif text-[#5a4838]">Verify Payments</h2>
                <p className="mt-2 text-sm font-sans text-[#8a735c]">
                  Payment submissions from the Unlock Poem form appear here automatically and can be marked verified or rejected.
                </p>
              </div>
              <button
                onClick={() => void loadPayments()}
                className="rounded-full border border-[#e8dfd5] px-4 py-2 text-sm font-bold font-sans uppercase tracking-widest text-[#8a735c] transition-colors hover:bg-[#f7f3ec]"
              >
                Refresh
              </button>
            </div>

            {paymentFeedback && (
              <p className={`mb-6 rounded-xl px-4 py-3 text-sm font-medium ${getFeedbackClassName(paymentFeedback.tone)}`}>
                {paymentFeedback.message}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#e8dfd5] text-[#8a735c]">
                    <th className="p-4 font-bold">User</th>
                    <th className="p-4 font-bold">Poem</th>
                    <th className="p-4 font-bold">UPI Ref ID</th>
                    <th className="p-4 font-bold">Submitted</th>
                    <th className="p-4 font-bold">Status</th>
                    <th className="p-4 font-bold">Screenshot</th>
                    <th className="p-4 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingPayments ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-sm font-sans text-[#8a735c]">
                        Loading payment submissions...
                      </td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-sm font-sans text-[#8a735c]">
                        No payment submissions yet.
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-[#e8dfd5] hover:bg-[#fdfcfb]">
                        <td className="p-4 font-sans text-sm">{payment.user_name}</td>
                        <td className="p-4 font-serif">{payment.poem_title}</td>
                        <td className="p-4 font-mono text-sm">{payment.upi_ref_id}</td>
                        <td className="p-4 font-sans text-sm text-[#6b5846]">
                          {new Date(payment.created_at).toLocaleString('en-IN')}
                        </td>
                        <td className="p-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${getPaymentBadgeClassName(payment.status)}`}
                          >
                            {payment.status}
                          </span>
                        </td>
                        <td className="p-4">
                          {payment.screenshot_url ? (
                            <a
                              href={payment.screenshot_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-bold text-[#8a735c] hover:text-[#6b5846]"
                            >
                              View File
                            </a>
                          ) : (
                            <span className="text-sm font-sans text-[#8a735c]">Not attached</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => void updatePaymentStatus(payment.id, 'verified')}
                              disabled={paymentActionId === payment.id || payment.status === 'verified'}
                              className="rounded-full border border-green-200 bg-green-50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {paymentActionId === payment.id ? 'Saving...' : 'Verify'}
                            </button>
                            <button
                              onClick={() => void updatePaymentStatus(payment.id, 'rejected')}
                              disabled={paymentActionId === payment.id || payment.status === 'rejected'}
                              className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {paymentActionId === payment.id ? 'Saving...' : 'Reject'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'paymentQr' && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-[#e8dfd5] bg-white p-8 shadow-sm">
            <h2 className="mb-2 font-serif text-3xl font-bold text-[#5a4838]">Payment QR and UPI</h2>
            <p className="mb-8 font-sans text-sm text-[#8a735c]">
              This is shown to customers on the Unlock Poem payment page. Upload a QR image and set your UPI ID.
            </p>

            {paymentDisplayMessage ? (
              <p
                className={`mb-6 rounded-xl px-4 py-3 text-sm font-medium ${
                  paymentDisplayStatus === 'success'
                    ? 'border border-green-200 bg-green-50 text-green-700'
                    : paymentDisplayStatus === 'error'
                      ? 'border border-red-200 bg-red-50 text-red-700'
                      : 'border border-[#e8dfd5] bg-[#f7f3ec] text-[#6b5846]'
                }`}
              >
                {paymentDisplayMessage}
              </p>
            ) : null}

            <form onSubmit={handleSavePaymentDisplay} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-bold text-[#6b5846]">UPI ID</label>
                  <input
                    type="text"
                    value={paymentUpiId}
                    onChange={(e) => setPaymentUpiId(e.target.value)}
                    placeholder="yourname@upi"
                    className="w-full rounded-xl border border-[#e8dfd5] bg-[#fdfcfb] px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-[#8a735c]"
                  />
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border border-[#e8dfd5] bg-[#fdfcfb] p-4">
                  <span className="mb-2 text-xs font-bold uppercase tracking-widest text-[#8a735c]">Current QR</span>
                  {paymentDisplay?.qr_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={paymentDisplay.qr_image_url} alt="Payment QR" className="h-36 w-36 object-contain" />
                  ) : (
                    <span className="text-xs text-[#8a735c]">None uploaded yet</span>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-[#6b5846]">Replace QR image</label>
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#e8dfd5] bg-[#fdfcfb] transition-colors hover:bg-[#f7f3ec]">
                  <span className="text-sm text-[#8a735c]">{paymentQrFile?.name || 'Choose image (PNG, JPG, WebP)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setPaymentQrFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={paymentDisplayStatus === 'saving'}
                className="w-full rounded-xl bg-[#8a725c] py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#6b5846] disabled:opacity-60"
              >
                {paymentDisplayStatus === 'saving' ? 'Saving...' : 'Save payment display'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
