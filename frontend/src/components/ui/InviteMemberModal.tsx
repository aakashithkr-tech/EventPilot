import React, { useState } from 'react';
import { X, Mail, Users, AlertCircle } from 'lucide-react';
import { membershipService } from '../../services/membershipService';
import { MembershipRole } from '../../types/index';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  onSuccess?: () => void;
}

const ROLE_OPTIONS: { value: MembershipRole; label: string; description: string }[] = [
  { value: 'lead', label: 'Lead', description: 'Full access, can manage team' },
  { value: 'admin', label: 'Admin', description: 'Admin privileges' },
  { value: 'developer', label: 'Developer', description: 'Can create and edit tasks' },
  { value: 'member', label: 'Member', description: 'Can view and complete tasks' }
];

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventName,
  onSuccess
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('member');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Invalid email address');
      return;
    }

    setIsLoading(true);
    try {
      const result = await membershipService.inviteUser(eventId, email, role);

      if (result.success) {
        setSuccess(true);
        setEmail('');
        setRole('member');

        // Auto-close after 2 seconds
        setTimeout(() => {
          onClose();
          setSuccess(false);
          if (onSuccess) onSuccess();
        }, 2000);
      } else {
        setError(result.error || 'Could not send the invitation. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)'
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          width: '90%',
          maxWidth: '420px',
          padding: '32px',
          maxHeight: '90vh',
          overflow: 'auto',
          zIndex: 2001
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Invite Member
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Send an in-app team request for <strong>{eventName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '8px',
            color: '#10b981',
            fontSize: '13px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            ✓ Invitation sent to {email}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '13px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Email Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Account Email
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Mail size={16} style={{
                position: 'absolute',
                left: '12px',
                color: 'var(--text-tertiary)',
                pointerEvents: 'none'
              }} />
              <input
                type="email"
                placeholder="member@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 40px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontFamily: 'var(--font-body)',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Role Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Role
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {ROLE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    background: role === opt.value ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-tertiary)',
                    border: role === opt.value ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={role === opt.value}
                    onChange={(e) => setRole(e.target.value as MembershipRole)}
                    style={{ marginTop: '2px', cursor: 'pointer' }}
                    disabled={isLoading}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {opt.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.2s',
                opacity: isLoading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Users size={14} />
              {isLoading ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>

          {/* Info Text */}
          <p style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            textAlign: 'center',
            marginTop: '8px'
          }}>
            The invitation will expire in 7 days if not accepted.
          </p>
        </form>
      </div>
    </div>
  );
};
