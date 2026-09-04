import React, { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../store/authContext';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
}

export const ForgotPassword: React.FC<ForgotPasswordPageProps> = ({ onBackToLogin }) => {
  const { resetPassword, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    const result = await resetPassword(email);

    if (result.success) {
      setSuccess(true);
      setEmail('');
    } else {
      setError(result.error || 'Failed to send reset email');
    }
  };

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.blobContainer}>
          <div style={styles.blob1} />
          <div style={styles.blob2} />
          <div style={styles.blob3} />
        </div>

        <div style={styles.wrapper}>
          <div style={styles.card}>
            <div style={styles.successIcon}>
              <CheckCircle size={48} color="#10b981" />
            </div>

            <h2 style={styles.successTitle}>Check your email</h2>
            <p style={styles.successMessage}>
              We've sent a password reset link to <strong>{email}</strong>. Click the link to create a new password.
            </p>

            <p style={styles.resendText}>
              Didn't receive it? Check your spam folder or{' '}
              <button
                onClick={() => setSuccess(false)}
                style={styles.resendLink}
              >
                try again
              </button>
            </p>

            <button
              onClick={onBackToLogin}
              style={styles.backBtn}
            >
              <ArrowLeft size={16} />
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.blobContainer}>
        <div style={styles.blob1} />
        <div style={styles.blob2} />
        <div style={styles.blob3} />
      </div>

      <div style={styles.wrapper}>
        <div style={styles.card}>
          <button
            onClick={onBackToLogin}
            style={styles.backLink}
          >
            <ArrowLeft size={16} />
            Back to login
          </button>

          <div style={styles.header}>
            <h1 style={styles.title}>Reset your password</h1>
            <p style={styles.subtitle}>Enter your email and we'll send you a link to reset your password</p>
          </div>

          {error && (
            <div style={styles.errorBanner}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address</label>
              <div style={styles.inputWrapper}>
                <Mail size={18} style={styles.inputIcon} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                ...styles.submitBtn,
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'var(--bg-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 100
  },
  blobContainer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none'
  },
  blob1: {
    position: 'absolute',
    width: '600px',
    height: '600px',
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)',
    borderRadius: '50%',
    top: '-200px',
    right: '-200px',
    animation: 'floatBlob 20s ease-in-out infinite'
  },
  blob2: {
    position: 'absolute',
    width: '500px',
    height: '500px',
    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
    borderRadius: '50%',
    bottom: '-150px',
    left: '-150px',
    animation: 'floatBlob 25s ease-in-out infinite'
  },
  blob3: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)',
    borderRadius: '50%',
    top: '50%',
    left: '10%',
    animation: 'floatBlob 30s ease-in-out infinite'
  },
  wrapper: {
    position: 'relative',
    zIndex: 10,
    width: '100%',
    maxWidth: '420px',
    padding: '20px'
  },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '48px 40px',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '24px',
    padding: 0,
    transition: 'color 0.2s'
  },
  header: {
    marginBottom: '32px',
    textAlign: 'center'
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    fontFamily: 'var(--font-heading)',
    color: 'var(--text-primary)',
    marginBottom: '8px'
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    marginBottom: '24px',
    color: '#ef4444',
    fontSize: '13px',
    lineHeight: 1.4
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px'
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  },
  inputWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center'
  },
  input: {
    width: '100%',
    padding: '12px 12px 12px 44px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'all 0.2s ease',
    boxSizing: 'border-box'
  },
  inputIcon: {
    position: 'absolute' as const,
    left: '12px',
    color: 'var(--text-tertiary)',
    pointerEvents: 'none'
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 24px',
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: '8px'
  },
  // Success state styles
  successIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px'
  },
  successTitle: {
    fontSize: '24px',
    fontWeight: 700,
    fontFamily: 'var(--font-heading)',
    color: 'var(--text-primary)',
    marginBottom: '12px',
    textAlign: 'center'
  },
  successMessage: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: '20px',
    textAlign: 'center'
  },
  resendText: {
    fontSize: '13px',
    color: 'var(--text-tertiary)',
    textAlign: 'center',
    marginBottom: '24px'
  },
  resendLink: {
    background: 'none',
    border: 'none',
    color: 'var(--primary)',
    cursor: 'pointer',
    fontWeight: 500,
    padding: 0,
    textDecoration: 'underline'
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px 24px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  }
};
