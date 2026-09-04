import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Database, BrainCircuit, Calendar, ListTodo, FolderGit, Compass, Users, BellRing } from 'lucide-react';

interface LandingProps {
  onStartOnboarding: () => void;
  onSkipToDashboard: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onStartOnboarding, onSkipToDashboard }) => {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    { title: 'EVENT SOURCE', desc: 'Paste event links, upload rules PDF, or import guidelines from email.', icon: Database },
    { title: 'AI UNDERSTANDING', desc: 'NLP scans content and builds verified event metadata mappings.', icon: BrainCircuit },
    { title: 'DEADLINES', desc: 'Extracts official target dates and syncs them to the calendar.', icon: Calendar },
    { title: 'REQUIREMENTS', desc: 'Compiles organizer submission guidelines into interactive criteria checklists.', icon: ListTodo },
    { title: 'RESOURCES', desc: 'Catalogs PPT templates, rules, and repository links.', icon: FolderGit },
    { title: 'PREPARATION PLAN', desc: 'Determines complexity and structures phase-by-phase prep sequences.', icon: Compass },
    { title: 'TEAM TASKS', desc: 'Assigns tasks to teammate roles and balances workload capacities.', icon: Users },
    { title: 'SMART NOTIFICATIONS', desc: 'Dispatches progress-aware reminder alerts to prevent crunch periods.', icon: BellRing }
  ];

  // Auto-cycle the active node to show real-time product workflow
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % 8);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        backgroundColor: '#050508',
        minHeight: '100vh',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden'
      }}
      className="dots-grid"
    >
      {/* Background glowing gradients */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        left: '20%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.07) 0%, rgba(0,0,0,0) 70%)',
        zIndex: 0,
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '5%',
        right: '10%',
        width: '700px',
        height: '700px',
        background: 'radial-gradient(circle, rgba(14, 165, 233, 0.05) 0%, rgba(0,0,0,0) 70%)',
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      {/* Landing Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem 3rem',
          borderBottom: '1px solid rgba(255,255,255,0.03)',
          position: 'relative',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={20} color="var(--primary)" />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
            EventPilot
          </span>
        </div>

        <button 
          onClick={onSkipToDashboard}
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'color 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.color = '#fff'}
          onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
          Enter Command Center →
        </button>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5rem 2rem', position: 'relative', zIndex: 10 }}>
        {/* Title Section */}
        <div style={{ textAlign: 'center', maxWidth: '850px', marginBottom: '4.5rem' }}>
          <div 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(99, 102, 241, 0.06)',
              border: '1px solid rgba(99, 102, 241, 0.15)',
              padding: '0.45rem 1rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--primary)',
              marginBottom: '1.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em'
            }}
          >
            <Sparkles size={12} />
            <span>Give it the event. We handle the rest.</span>
          </div>

          <h1 
            className="shine-text"
            style={{ 
              fontFamily: 'var(--font-heading)', 
              fontSize: '4.75rem', 
              fontWeight: 800, 
              lineHeight: '1.05', 
              letterSpacing: '-0.03em', 
              marginBottom: '1.75rem'
            }}
          >
            Your Events.<br/>On Autopilot.
          </h1>

          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', lineHeight: '1.6', maxWidth: '620px', margin: '0 auto 2.75rem auto' }}>
            Add an event once. EventPilot extracts deadlines, requirements, resources, schedule, and team — then keeps everything on track automatically.
          </p>

          <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center' }}>
            <button 
              onClick={onStartOnboarding}
              className="btn btn-primary"
              style={{ padding: '0.9rem 2.2rem', fontSize: '0.95rem', borderRadius: '8px', fontWeight: 600 }}
            >
              Add Your First Event <ArrowRight size={18} />
            </button>
            
            <button 
              onClick={() => {
                const element = document.getElementById('demo-pipeline');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="btn btn-secondary"
              style={{ padding: '0.9rem 2.2rem', fontSize: '0.95rem', borderRadius: '8px' }}
            >
              See How It Works
            </button>
          </div>
        </div>

        {/* Hero Product Animation Chain (8 Steps Connected Flow) */}
        <section
          id="demo-pipeline"
          className="premium-card glowing-card"
          style={{
            width: '100%',
            maxWidth: '1000px',
            backgroundColor: 'rgba(11, 11, 14, 0.45)',
            border: '1px solid rgba(255,255,255,0.03)',
            borderRadius: '16px',
            padding: '3rem 2.5rem',
            textAlign: 'center',
            boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
            position: 'relative'
          }}
        >
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>
              Core Operations Pipeline
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Watch how messy source data materializes into dynamic coordination
            </p>
          </div>

          {/* Connected Grid Flow (4 Nodes Row 1 ➔ 4 Nodes Row 2) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {/* ROW 1: Steps 1-4 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
              {steps.slice(0, 4).map((s, idx) => {
                const globalIdx = idx;
                const isActive = activeStep === globalIdx;
                const Icon = s.icon;
                
                return (
                  <React.Fragment key={globalIdx}>
                    <div 
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: '110px',
                        zIndex: 2,
                        opacity: isActive ? 1 : 0.4,
                        transform: isActive ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                    >
                      <div 
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '12px',
                          backgroundColor: isActive ? 'var(--primary-glow)' : 'var(--bg-tertiary)',
                          border: `2px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                          boxShadow: isActive ? '0 0 20px rgba(99, 102, 241, 0.3)' : 'none',
                          marginBottom: '0.5rem',
                          transition: 'all 0.4s'
                        }}
                      >
                        <Icon size={20} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', color: isActive ? '#fff' : 'var(--text-secondary)' }}>
                        {s.title}
                      </span>
                    </div>

                    {idx < 3 && (
                      <div 
                        style={{
                          flex: 1,
                          height: '2px',
                          background: activeStep > globalIdx ? 'var(--primary)' : 'var(--border-color)',
                          boxShadow: activeStep > globalIdx ? '0 0 8px var(--primary)' : 'none',
                          margin: '0 -10px',
                          marginBottom: '20px',
                          transition: 'all 0.4s'
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* ROW CONNECTOR: Vertically scrolling arrow between row 1 and row 2 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '45px', margin: '-1.5rem 0' }}>
              <div 
                style={{
                  width: '2px',
                  height: '40px',
                  background: activeStep >= 4 ? 'var(--primary)' : 'var(--border-color)',
                  boxShadow: activeStep >= 4 ? '0 0 8px var(--primary)' : 'none',
                  transition: 'all 0.4s'
                }}
              />
            </div>

            {/* ROW 2: Steps 5-8 (Flooded Backwards Right-to-Left or standard Left-to-Right loop. Let's do Standard L-to-R for readability) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
              {steps.slice(4, 8).map((s, idx) => {
                const globalIdx = idx + 4;
                const isActive = activeStep === globalIdx;
                const Icon = s.icon;
                
                return (
                  <React.Fragment key={globalIdx}>
                    <div 
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: '110px',
                        zIndex: 2,
                        opacity: isActive ? 1 : 0.4,
                        transform: isActive ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                    >
                      <div 
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '12px',
                          backgroundColor: isActive ? 'var(--primary-glow)' : 'var(--bg-tertiary)',
                          border: `2px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                          boxShadow: isActive ? '0 0 20px rgba(99, 102, 241, 0.3)' : 'none',
                          marginBottom: '0.5rem',
                          transition: 'all 0.4s'
                        }}
                      >
                        <Icon size={20} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', color: isActive ? '#fff' : 'var(--text-secondary)' }}>
                        {s.title}
                      </span>
                    </div>

                    {idx < 3 && (
                      <div 
                        style={{
                          flex: 1,
                          height: '2px',
                          background: activeStep > globalIdx ? 'var(--primary)' : 'var(--border-color)',
                          boxShadow: activeStep > globalIdx ? '0 0 8px var(--primary)' : 'none',
                          margin: '0 -10px',
                          marginBottom: '20px',
                          transition: 'all 0.4s'
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Active Step Details text box (dynamic information reveal) */}
          <div 
            style={{
              marginTop: '3.5rem',
              backgroundColor: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-color)',
              padding: '1.25rem 2rem',
              borderRadius: '10px',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              animation: 'fadeIn 0.3s ease'
            }}
          >
            <div style={{
              backgroundColor: 'var(--primary-glow)',
              color: 'var(--primary)',
              padding: '0.6rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {React.createElement(steps[activeStep].icon, { size: 24 })}
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
                STAGE 0{activeStep + 1} • ACTIVE RUNTIME SCANNERS
              </span>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', marginTop: '0.1rem' }}>
                {steps[activeStep].title}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {steps[activeStep].desc}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Landing Footer */}
      <footer style={{ padding: '2rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem', color: 'var(--text-tertiary)', position: 'relative', zIndex: 10 }}>
        © 2026 EventPilot Inc. Designed for premium deadline operations coordination.
      </footer>
    </div>
  );
};

const BotBadge: React.FC = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096M9 21h7.5M12 3v13m0-13a9 9 0 019 9v1.5a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 16.5V12a9 9 0 019-9z" />
  </svg>
);
