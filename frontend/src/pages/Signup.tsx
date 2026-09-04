import React, { useState } from 'react';
import { User, Mail, Lock, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../store/authContext';

interface SignupPageProps {
  onSuccessfulSignup: () => void;
  onNavigateToLogin: () => void;
}

const getPasswordStrength = (password: string): { strength: 'weak' | 'fair' | 'good' | 'strong'; percent: number } => {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[!@#$%^&*]/.test(password)) strength++;

  if (strength <= 1) return { strength: 'weak', percent: 25 };
  if (strength <= 2) return { strength: 'fair', percent: 50 };
  if (strength <= 3) return { strength: 'good', percent: 75 };
  return { strength: 'strong', percent: 100 };
};

const getStrengthColor = (strength: string): string => {
  switch (strength) {
    case 'weak': return '#ef4444';
    case 'fair': return '#f59e0b';
    case 'good': return '#3b82f6';
    case 'strong': return '#10b981';
    default: return 'var(--text-tertiary)';
  }
};

export const Signup: React.FC<SignupPageProps> = ({ onSuccessfulSignup, onNavigateToLogin }) => {
  const { signup, isLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const passwordStrength = getPasswordStrength(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (!agreedToTerms) {
      setError('You must agree to the terms');
      return;
    }

    const result = await signup(name, email, password, confirmPassword);

    if (result.success) {
      onSuccessfulSignup();
    } else {
      setError(result.error || 'Signup failed');
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
            <h1 style={styles.title}>Create your account</h1>
            <p style={styles.subtitle}>Join EventPilot and manage your events smarter</p>
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
            {/* Name Input */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Full Name</label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.inputIcon} />
                <input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={styles.input}
                  disabled={isLoading}
                />
              </div>
            </div>

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
              <label style={styles.label}>Password</label>
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

              {/* Password Strength Indicator */}
              {password && (
                <div style={styles.strengthContainer}>
                  <div style={styles.strengthLabel}>
                    <span>Strength: {passwordStrength.strength}</span>
                    <div style={styles.strengthBar}>
                      <div
                        style={{
                          ...styles.strengthFill,
                          width: `${passwordStrength.percent}%`,
                          backgroundColor: getStrengthColor(passwordStrength.strength)
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password Input */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Confirm Password</label>
              <div style={styles.inputWrapper}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    ...styles.input,
                    borderColor: confirmPassword && !passwordsMatch ? '#ef4444' : 'var(--border-color)',
                    background: confirmPassword && passwordsMatch ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-tertiary)'
                  }}
                  disabled={isLoading}
                />
                {confirmPassword && (
                  <div style={{ position: 'absolute', right: '12px' }}>
                    {passwordsMatch ? (
                      <CheckCircle size={18} color="#10b981" />
                    ) : (
                      <AlertCircle size={18} color="#ef4444" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Terms Checkbox */}
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                style={styles.checkbox}
                disabled={isLoading}
              />
              <span>I agree to the Terms of Service and Privacy Policy</span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !agreedToTerms}
              style={{
                ...styles.submitBtn,
                opacity: isLoading || !agreedToTerms ? 0.7 : 1
              }}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
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

          {/* Login Link */}
          <div style={styles.footer}>
            <span style={styles.footerText}>Already have an account?</span>
            <button
              type="button"
              onClick={() => onNavigateToLogin()}
              style={styles.footerLink}
            >
              Log in
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
    overflow: 'auto',
    zIndex: 100,
    padding: '20px'
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
    margin: '40px auto'
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
    gap: '16px',
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
  strengthContainer: {
    marginTop: '4px'
  },
  strengthLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text-secondary)'
  },
  strengthBar: {
    flex: 1,
    height: '4px',
    background: 'var(--bg-tertiary)',
    borderRadius: '2px',
    overflow: 'hidden'
  },
  strengthFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    marginTop: '8px'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
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
    marginTop: '12px'
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
