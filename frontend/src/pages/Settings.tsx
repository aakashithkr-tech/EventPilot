import React, { useState } from 'react';
import { Settings as SettingsIcon, Link2, Shield, Bell, Key, Cpu } from 'lucide-react';

export const Settings: React.FC = () => {
  const [notiSlack, setNotiSlack] = useState(true);
  const [notiEmail, setNotiEmail] = useState(true);

  // Future API structure endpoints list
  const endpoints = [
    { method: 'GET', url: '/api/events', desc: 'Fetch all active event workspaces' },
    { method: 'POST', url: '/api/events/analyze', desc: 'Perform NLP parsing on event link or PDF payload' },
    { method: 'GET', url: '/api/events/:id/requirements', desc: 'Fetch verified checklist guideline parameters' },
    { method: 'POST', url: '/api/events/:id/tasks', desc: 'Append teammate task item to event workspace' },
    { method: 'PATCH', url: '/api/tasks/:id', desc: 'Advance task state (Todo / In Progress / Done)' },
    { method: 'POST', url: '/api/events/:id/recalculate-plan', desc: 'Trigger AI timeline recalculations on deadline adjustment' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '850px' }}>
      
      {/* Title */}
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700 }}>
          System Settings & Architectures
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Manage workspace integrations and inspect developer routing schemas.
        </p>
      </div>

      {/* Integration controls */}
      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        
        {/* Sync Settings */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
            <Bell size={18} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Sync Channels</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Slack Operations Hook</span>
              <input type="checkbox" checked={notiSlack} onChange={() => setNotiSlack(!notiSlack)} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Email Daily Digests</span>
              <input type="checkbox" checked={notiEmail} onChange={() => setNotiEmail(!notiEmail)} />
            </label>
          </div>
        </div>

        {/* Security Settings */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--status-ontrack)' }}>
            <Shield size={18} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Decoupled API Credentials</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>Sensitive tokens are cached locally in protected storage. Permissions can be disconnected anytime.</span>
            <button 
              onClick={() => alert('Mocking integration detach action...')}
              className="btn btn-secondary" 
              style={{ width: 'fit-content', padding: '0.3rem 0.6rem', fontSize: '0.75rem', marginTop: '0.25rem' }}
            >
              Reset Cached Store
            </button>
          </div>
        </div>

      </div>

      {/* Backend API mapping tables */}
      <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <Cpu size={18} style={{ color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Architecture Ready API Mapping</h3>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
          The frontend is structured to communicate directly with standard endpoints. When connecting a backend layer, update the service functions in <code>src/services/</code> to dispatch calls to the endpoints mapped below.
        </p>

        {/* Endpoints listing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {endpoints.map((ep, i) => (
            <div 
              key={i} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem', 
                background: 'var(--bg-tertiary)', 
                border: '1px solid var(--border-color)', 
                padding: '0.75rem 1rem', 
                borderRadius: '6px',
                fontSize: '0.8rem'
              }}
            >
              <span style={{
                color: ep.method === 'GET' ? 'var(--status-ontrack)' : ep.method === 'POST' ? 'var(--status-info)' : 'var(--status-attention)',
                fontWeight: 700,
                width: '60px',
                fontFamily: 'monospace'
              }}>
                {ep.method}
              </span>
              <span style={{ flex: 1, fontFamily: 'monospace', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {ep.url}
              </span>
              <span style={{ color: 'var(--text-secondary)', maxWidth: '300px', textAlign: 'right' }}>
                {ep.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
