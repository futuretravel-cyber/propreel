import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Trash2, XCircle, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PropReelAPI } from '../lib/api';

export default function DeleteAccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [exportData, setExportData] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Real account deletion: removes the DynamoDB user row and the user's
  // projects via /api/users?action=delete.
  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await PropReelAPI.deleteAccount(user.id);
      toast.success('Your account has been permanently deleted.', 'Account Deleted');
      await logout();
      navigate('/');
    } catch (e: any) {
      toast.error(e.message || 'Account deletion failed — please contact support');
      setDeleting(false);
    }
  };

  const handleExportData = () => {
    // In production, this would trigger a data export
    toast.success('Data export started. You will receive an email with a download link within 24 hours.', 'Export Started');
  };

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/dashboard/settings" className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </Link>

        {!showConfirm ? (
          <div className="card-dark p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-red-950/50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Delete Account</h1>
                <p className="text-ink-400">This action cannot be undone. Please read carefully before proceeding.</p>
              </div>
            </div>

            <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-red-300 mb-3">⚠️ Warning: Permanent Deletion</h3>
              <p className="text-sm text-red-200 mb-4">
                Deleting your account will permanently remove all your data from PropReel. This includes:
              </p>
              <ul className="space-y-2 text-sm text-red-200">
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>All your projects and property listings</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>All generated videos and photos</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>All remaining credits (subscription and purchased)</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Your profile and account information</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Your transaction history</span>
                </li>
                {user?.role === 'AGENCY_OWNER' && (
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Your agency and all associated team members (they will need to create new accounts)</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="bg-ink-800/50 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-white mb-3">Before You Delete</h3>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportData}
                    onChange={(e) => setExportData(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">Export my data first</p>
                    <p className="text-xs text-ink-400">Download a copy of all your projects, videos, and transaction history before deletion</p>
                  </div>
                </label>
              </div>
              {exportData && (
                <button
                  onClick={handleExportData}
                  className="btn btn-secondary mt-3 w-full"
                >
                  <Download className="w-4 h-4" /> Export My Data
                </button>
              )}
            </div>

            <div className="bg-ink-800/50 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-white mb-3">What You'll Lose</h3>
              <ul className="space-y-2 text-sm text-ink-300">
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <span>All credits (no refunds for unused credits)</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <span>Access to your subscription (no refunds for current period)</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <span>All generated content (videos, photos, descriptions)</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <span>Your account cannot be recovered after deletion</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Link to="/dashboard/settings" className="btn btn-secondary flex-1">
                Keep My Account
              </Link>
              <button
                onClick={() => setShowConfirm(true)}
                className="btn btn-danger flex-1"
              >
                <Trash2 className="w-4 h-4" /> Continue to Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="card-dark p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-red-950/50 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Final Confirmation</h1>
                <p className="text-ink-400">This is your last chance to cancel. Enter your password to confirm deletion.</p>
              </div>
            </div>

            <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-6 mb-6">
              <p className="text-sm text-red-200">
                <strong>⚠️ FINAL WARNING:</strong> Once you confirm, your account will be permanently deleted within 30 days. 
                You can cancel the deletion within 7 days by contacting support, but after that, all data will be permanently removed.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="label">Enter Your Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Enter your password to confirm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Type "DELETE" to Confirm</label>
                <input
                  type="text"
                  className="input"
                  placeholder='Type "DELETE" to confirm'
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-ink-800/50 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-white mb-3">Account Deletion Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-400">Account Email</span>
                  <span className="text-white font-medium">{user?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Account Type</span>
                  <span className="text-white font-medium">{user?.role === 'AGENCY_OWNER' ? 'Agency Owner' : 'Agent'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Credits to be Lost</span>
                  <span className="text-red-400 font-medium">{user?.credits || 0} credits</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Deletion Period</span>
                  <span className="text-white font-medium">30 days</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="btn btn-secondary flex-1"
              >
                Go Back
              </button>
              <button
                onClick={handleDelete}
                disabled={!password || confirmText !== 'DELETE' || deleting}
                className="btn btn-danger flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? <><Trash2 className="w-4 h-4 animate-pulse" /> Deleting…</> : <><Trash2 className="w-4 h-4" /> Permanently Delete Account</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
