import React from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  error: string | null;
  loading: boolean;
  submitLabel: string;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Shared terminal chrome for the three auth screens (Login, Register,
 * ChooseUsername). They differ only in fields and copy — duplicating the
 * shell three times guarantees it drifts.
 */
export function AuthForm({
  title, error, loading, submitLabel, onSubmit, children, footer,
}: Props): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black font-mono text-gray-100">
      <div className="w-96 px-4">
        <Link to="/" className="mb-6 block text-center text-xl uppercase tracking-widest text-yellow-400">
          Galactic Empire
        </Link>
        <p className="mb-4 text-center text-sm text-gray-500">{title}</p>
        <form onSubmit={onSubmit}>
          {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
          {children}
          <button
            type="submit"
            disabled={loading}
            className="w-full border border-yellow-600 py-1 text-yellow-400 hover:bg-yellow-900 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </form>
        {footer && <div className="mt-4 text-center text-xs text-gray-600">{footer}</div>}
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
}

export function Field({
  id, label, type, value, onChange, autoComplete, hint,
}: FieldProps): React.JSX.Element {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full border border-gray-600 bg-black px-2 py-1 text-gray-100"
      />
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
    </div>
  );
}
