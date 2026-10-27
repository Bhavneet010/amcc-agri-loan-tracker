'use client';
import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import Modal from './Modal';
import { request } from '../../lib/types';
export default function AdminLogin({ onClose, onLogin }: { onClose: () => void; onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/api/admin/session', { method: 'POST', body: JSON.stringify({ password }) });
      onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="AMCC admin access"
      subtitle="Review applications across all thirteen branches."
      icon={<LockKeyhole size={22} />}
      onClose={busy ? undefined : onClose}
    >
      <form className="form-stack" onSubmit={login}>
        <label>
          Admin password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            maxLength={256}
            autoFocus
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button primary wide" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in as admin'}
        </button>
      </form>
    </Modal>
  );
}
