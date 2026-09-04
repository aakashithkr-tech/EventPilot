import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../store/authContext';

interface LoginPageProps {
  onSuccessfulLogin: () => void;
  onNavigateToSignup: () => void;
  onNavigateToForgotPassword: () => void;
}

export const Login: React.FC<LoginPageProps> = ({ onSuccessfulLogin, onNavigateToSignup, onNavigateToForgotPassword }) => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    const result = await login(email, password);

    if (result.success) {
      onSuccessfulLogin();
    } else {
      setError(result.error || 'Login failed');
    }
  };

  return (
    <div style={styles.container}>
      {/* Background Elements */}
      <div style={styles.blobContainer}>
        <div style={styles.blob1} />
        <div style={styles.blob2} />
        <div style={styles.blob3} />
      </div>

      {/* Main Content */}
      <div style={styles.wrapper}>
        <div style={styles.card}>
          {/* Header */}
          <div style={styles.header}>
            <h1 style={styles.title}>Welcome back</h1>
            <p style={styles.subtitle}>Log in to your EventPilot workspace</p>
          </div>

          {/* Error Message */}
          {error && (
            <div style={styles.errorBanner}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={styles.form}>
            {/* Email Input */}
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

            {/* Password Input */}
            <div style={styles.formGroup}>
              <div style={styles.labelRow}>
                <label style={styles.label}>Password</label>
                <button
                  type="button"
                  onClick={() => onNavigateToForgotPassword()}
                  style={styles.forgotLink}
                >
                  Forgot?
                </button>
              </div>
              <div style={styles.inputWrapper}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.showPasswordBtn}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                ...styles.submitBtn,
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? 'Logging in...' : 'Log in'}
              {!isLoading && <ArrowRight size={16} style={{ marginLeft: '8px' }} />}
            </button>
          </form>

          {/* OAuth Option */}
          <div style={styles.divider}>
            <span style={styles.dividerText}>OR</span>
          </div>

          <button style={styles.oauthBtn}>
            <span style={styles.googleIcon}>🔵</span>
            Continue with Google
          </button>

          {/* Sign Up Link */}
          <div style={styles.footer}>
            <span style={styles.footerText}>Don't have an account?</span>
            <button
              type="button"
              onClick={() => onNavigateToSignup()}
              style={styles.footerLink}
            >
              Create one
            </button>
          </div>
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
    gap: '20px',
    marginBottom: '24px'
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
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
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
  showPasswordBtn: {
    position: 'absolute' as const,
    right: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px'
  },
  forgotLink: {
    background: 'none',
    border: 'none',
    color: 'var(--primary)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    padding: 0,
    transition: 'opacity 0.2s'
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
    marginTop: '4px'
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    margin: '24px 0',
    color: 'var(--text-tertiary)',
    fontSize: '12px'
  },
  dividerText: {
    flex: 1,
    textAlign: 'center' as const,
    opacity: 0.5
  },
  oauthBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px 24px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  googleIcon: {
    fontSize: '16px'
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '24px',
    fontSize: '13px',
    color: 'var(--text-secondary)'
  },
  footerText: {
    color: 'var(--text-secondary)'
  },
  footerLink: {
    background: 'none',
    border: 'none',
    color: 'var(--primary)',
    cursor: 'pointer',
    fontWeight: 600,
    padding: 0,
    textDecoration: 'underline'
  }
};
