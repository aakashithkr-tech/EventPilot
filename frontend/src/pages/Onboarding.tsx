import React, { useState } from 'react';
import { Upload, Mail, Sparkles, AlertTriangle, ArrowLeft, Calendar, FileText, CheckCircle2, User, Plus } from 'lucide-react';
import { eventAnalysisService, AIAnalysisResult } from '../services/eventAnalysisService';
import { useStore } from '../store/storeContext';

interface OnboardingProps {
  onBack: () => void;
  onFinish: (eventId: string) => void;
}

interface ScanStep {
  label: string;
  status: 'pending' | 'scanning' | 'done';
  result?: string;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onBack, onFinish }) => {
  const { addEvent } = useStore();
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<'input' | 'manual' | 'scanning' | 'error' | 'confirm'>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [showEmailConnect, setShowEmailConnect] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Manual entry form state
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState<'hackathon' | 'competition' | 'conference' | 'workshop'>('hackathon');
  const [manualDeadline, setManualDeadline] = useState('2026-09-15');
  const [manualTeamSize, setManualTeamSize] = useState(3);
  
  // Scanning State
  const [scanSteps, setScanSteps] = useState<ScanStep[]>([
    { label: 'Understanding event source...', status: 'pending' },
    { label: 'Extracting important deadlines...', status: 'pending' },
    { label: 'Reading submission requirements...', status: 'pending' },
    { label: 'Organizing resources & files...', status: 'pending' },
    { label: 'Analyzing team requirements...', status: 'pending' },
    { label: 'Building automated preparation plan...', status: 'pending' }
  ]);
  
  // Confirmed Data State
  const [parsedData, setParsedData] = useState<AIAnalysisResult | null>(null);

  // Form edit states
  const [eventName, setEventName] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [deadlines, setDeadlines] = useState<AIAnalysisResult['deadlines']>([]);
  const [requirements, setRequirements] = useState<AIAnalysisResult['requirements']>([]);
  const [resources, setResources] = useState<AIAnalysisResult['resources']>([]);
  const [teamSize, setTeamSize] = useState(3);
  // Bounds the AI detected from the event's own rules (e.g. "teams of 2-4").
  // Defaults are permissive until an analysis result narrows them.
  const [teamSizeMin, setTeamSizeMin] = useState(1);
  const [teamSizeMax, setTeamSizeMax] = useState(10);

  const resetScanSteps = () => {
    setScanSteps(prev => prev.map(step => ({ ...step, status: 'pending', result: undefined })));
  };

  const startScan = async (overrideText?: string) => {
    const source = overrideText ?? inputText;
    if (!source.trim()) return;
    setErrorMessage(null);
    setMode('scanning');
    resetScanSteps();

    try {
      // The animation now reflects a real backend analysis request. We do not
      // claim a step succeeded until the server has returned actual data.
      setScanSteps(prev => prev.map((step, idx) => idx === 0
        ? { ...step, status: 'scanning' }
        : step));

      const result = await eventAnalysisService.analyze(source);

      const stepResults = [
        `✓ ${result.sourceType === 'url' ? 'Event page fetched' : 'Event description understood'}`,
        `✓ ${result.deadlines.length} deadline${result.deadlines.length === 1 ? '' : 's'} found`,
        `✓ ${result.requirements.length} requirement${result.requirements.length === 1 ? '' : 's'} found`,
        `✓ ${result.resources.length} resource${result.resources.length === 1 ? '' : 's'} found`,
        `✓ Team size ${result.event.teamSize} detected`,
        `✓ ${result.confidence.overall} confidence · plan inputs ready`,
      ];

      setScanSteps(prev => prev.map((step, idx) => ({
        ...step,
        status: 'done',
        result: stepResults[idx],
      })));

      setParsedData(result);
      setEventName(result.event.name);
      setEventDesc(result.event.description);
      setDeadlines(result.deadlines);
      setRequirements(result.requirements);
      setResources(result.resources);
      // Clamp to the range the event itself specifies (e.g. "teams of 2-4")
      // so the slider can never be dragged to a size the event doesn't allow.
      const min = result.event.teamSizeMin ?? 1;
      const max = Math.max(min, result.event.teamSizeMax ?? result.event.teamSize ?? min);
      setTeamSizeMin(min);
      setTeamSizeMax(max);
      setTeamSize(Math.min(Math.max(result.event.teamSize, min), max));
      setMode('confirm');
    } catch (err) {
      setScanSteps(prev => prev.map((step, idx) => idx === 0
        ? { ...step, status: 'done', result: '⚠ Analysis could not be completed' }
        : step));
      setErrorMessage(err instanceof Error ? err.message : 'I could not analyze that event source. Try a specific event URL or use Add Manually.');
      setMode('error');
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setErrorMessage('PDF upload is selected, but document extraction is not connected yet. Use the event page URL or Add Manually for this version.');
    setMode('error');
  };

  const handleEmailDemoImport = () => {
    setShowEmailConnect(false);
    setErrorMessage('Create the event first, then open Workspace → Sources to connect the real Gmail account for this event. EventPilot will keep that source event-scoped.');
    setMode('error');
  };

  const handleManualSubmit = () => {
    if (!manualName.trim()) return;
    setMode('scanning');
    setScanSteps(prev => prev.map((step, idx) => idx === 0
      ? { ...step, status: 'done', result: '✓ Manual entry received' }
      : step));

    // Manual entries skip AI extraction — build parsedData directly from form input.
    
    const result: AIAnalysisResult = {
      
      event: {
        name: manualName,
        type: manualType,
        description: `Manually added ${manualType}. Fill in deadlines, requirements, and resources as details become available.`,
        status: 'on-track',
        finalDeadline: manualDeadline,
        progress: 0,
        healthScore: 100,
        teamSize: manualTeamSize,
        nextAction: 'Define your first milestone'
        
      },
      deadlines: [
        { title: 'Final Submission', date: manualDeadline, type: 'official', verified: true }
      ],
      requirements: [],
      resources: [],
      teamMembers: Array.from({ length: manualTeamSize }, (_, i) => ({
        userId: i === 0 ? 'u1' : `u-team-${i}`,
        name: i === 0 ? 'You' : `Teammate ${i + 1}`,
        role: i === 0 ? 'Lead' : 'Member',
        workload: 0
      })),
       sourceType: 'text',
      confidence: {
        overall: 'high',
        event: 'high',
        deadlines: 'high',
        requirements: 'high',
        resources: 'high'
      },
      warnings: []
    }
    ;
    
    

    setTimeout(() => {
      setParsedData(result);
      setEventName(result.event.name);
      setEventDesc(result.event.description);
      setDeadlines(result.deadlines);
      setRequirements(result.requirements);
      setResources(result.resources);
      // Manual entries have no detected rules to enforce, so keep the
      // confirm-screen slider generously wide around the chosen size.
      setTeamSizeMin(1);
      setTeamSizeMax(Math.max(10, manualTeamSize));
      setTeamSize(manualTeamSize);
      setMode('confirm');
    }, 500);
  };

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateWorkspace = async () => {
    if (!parsedData || isCreating) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const newEventId = await addEvent(
        {
          name: eventName,
          type: parsedData.event.type,
          description: eventDesc,
          status: 'on-track',
          finalDeadline: parsedData.event.finalDeadline,
          progress: 0,
          healthScore: 100,
          teamSize,
          nextAction: 'Complete kickoff presentation draft'
        },
        deadlines,
        requirements,
        resources,
        parsedData.teamMembers // Use defaults from mock parser
      );

      onFinish(newEventId);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Could not create the event workspace. Please try again.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const updateDeadlineDate = (index: number, newDate: string) => {
    setDeadlines(prev => prev.map((d, i) => i === index ? { ...d, date: newDate } : d));
  };

  const toggleReqVerified = (index: number) => {
    setRequirements(prev => prev.map((r, i) => i === index ? { ...r, verified: !r.verified } : r));
  };

  return (
    <div
      style={{
        backgroundColor: '#0a0a0c',
        minHeight: '100vh',
        color: '#f4f4f7',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: mode === 'confirm' ? '850px' : '600px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '2.5rem',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
          position: 'relative',
          transition: 'width 0.4s ease'
        }}
      >
        {/* Back Button */}
        {mode === 'input' && (
          <button 
            onClick={onBack}
            className="btn-icon" 
            style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', border: 'none' }}
          >
            <ArrowLeft size={16} />
          </button>
        )}

        {/* 1. INPUT INTERFACE */}
        {mode === 'input' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'inline-flex', padding: '0.4rem', backgroundColor: 'var(--primary-glow)', borderRadius: '8px', color: 'var(--primary)', marginBottom: '1rem' }}>
                <Sparkles size={20} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Let’s get your events under control.
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Add any competition link, workshop overview, or PDF rules.
              </p>
            </div>

            {/* Input area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <textarea
                className="input-field"
                placeholder="Paste an event link (e.g. devpost.com/hackathon) or describe your event requirements..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                style={{ minHeight: '120px', resize: 'none', lineHeight: '1.5' }}
              />
              <button
                onClick={() => startScan()}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontWeight: 600 }}
                disabled={!inputText.trim()}
              >
                Start AI Analysis
              </button>
            </div>

            {/* Hidden native file input for real PDF picking */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelected}
              style={{ display: 'none' }}
            />

            {/* Options icons grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={optionBtnStyle}
              >
                <Upload size={16} color="var(--primary)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Upload PDF</span>
              </button>

              <button
                onClick={() => setMode('manual')}
                style={optionBtnStyle}
              >
                <Plus size={16} color="var(--status-attention)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Add Manually</span>
              </button>

              <button
                onClick={() => setShowEmailConnect(true)}
                style={optionBtnStyle}
              >
                <Mail size={16} color="var(--status-info)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Import from Email</span>
              </button>
            </div>

            {uploadedFileName && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.75rem', textAlign: 'center' }}>
                Last uploaded: {uploadedFileName}
              </p>
            )}

            {/* Import from Email — inline connect notice (no real inbox integration yet) */}
            {showEmailConnect && (
              <div style={{
                marginTop: '1.25rem',
                padding: '1rem',
                borderRadius: '10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Mail size={16} style={{ color: 'var(--status-info)' }} />
                  <strong style={{ fontSize: '0.85rem' }}>Import from Email</strong>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Inbox connection isn't set up yet — no email account is linked in this preview.
                  You can try it with a sample forwarded organizer email instead.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleEmailDemoImport} className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}>
                    Try with Sample Email
                  </button>
                  <button onClick={() => setShowEmailConnect(false)} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 1b. MANUAL ADD FORM */}
        {mode === 'manual' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'inline-flex', padding: '0.4rem', backgroundColor: 'var(--primary-glow)', borderRadius: '8px', color: 'var(--primary)', marginBottom: '1rem' }}>
                <Plus size={20} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Add event manually
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                No link or document handy? Set up the basics yourself — you can fill in deadlines and requirements afterward.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={labelFormStyle}>Event Name</label>
                <input
                  className="input-field"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. Campus Robotics Challenge"
                />
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelFormStyle}>Event Type</label>
                  <select
                    className="input-field"
                    value={manualType}
                    onChange={e => setManualType(e.target.value as typeof manualType)}
                  >
                    <option value="hackathon">Hackathon</option>
                    <option value="competition">Competition</option>
                    <option value="conference">Conference</option>
                    <option value="workshop">Workshop</option>
                  </select>
                </div>
                <div>
                  <label style={labelFormStyle}>Team Size</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className="input-field"
                    value={manualTeamSize}
                    onChange={e => setManualTeamSize(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>

              <div>
                <label style={labelFormStyle}>Final Deadline</label>
                <input
                  type="date"
                  className="input-field"
                  value={manualDeadline}
                  onChange={e => setManualDeadline(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button onClick={() => setMode('input')} className="btn btn-secondary" style={{ flex: 1, padding: '0.7rem' }}>
                  Back
                </button>
                <button
                  onClick={handleManualSubmit}
                  disabled={!manualName.trim()}
                  className="btn btn-primary"
                  style={{ flex: 2, padding: '0.7rem', fontWeight: 600 }}
                >
                  Create Workspace
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. PROGRESSIVE SCAN LOADING */}
        {mode === 'scanning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div className="spinner-glow" style={{
                width: '40px',
                height: '40px',
                border: '2px solid rgba(99, 102, 241, 0.2)',
                borderTopColor: 'var(--primary)',
                borderRadius: '50%',
                margin: '0 auto 1rem auto',
                animation: 'scanLine 1s linear infinite'
              }} />
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem' }}>AI Reading Source...</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Extracting deadlines, guidelines, and resource template schemas.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'var(--bg-tertiary)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              {scanSteps.map((step, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: step.status === 'pending' ? 0.35 : 1, transition: 'all 0.2s' }}>
                  <span style={{ fontSize: '0.85rem', color: step.status === 'scanning' ? 'var(--primary)' : 'var(--text-primary)' }}>
                    {step.label}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: step.status === 'done' ? 'var(--status-ontrack)' : step.status === 'scanning' ? 'var(--primary)' : 'var(--text-tertiary)'
                  }}>
                    {step.status === 'scanning' ? 'Analyzing...' : step.result || 'Queue'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2b. ERROR / LOW-CONFIDENCE STATE */}
        {mode === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--status-atrisk-bg)', borderRadius: '50%', color: 'var(--status-atrisk)' }}>
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 700 }}>
              Couldn't confidently read that source
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
              {errorMessage}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => { resetScanSteps(); setMode('input'); }}
                className="btn btn-secondary"
                style={{ padding: '0.6rem 1.1rem' }}
              >
                Edit &amp; Try Again
              </button>
              <button
                onClick={() => { resetScanSteps(); setMode('manual'); }}
                className="btn btn-primary"
                style={{ padding: '0.6rem 1.1rem' }}
              >
                Add Manually Instead
              </button>
            </div>
          </div>
        )}

        {/* 3. CONFIRMATION SCREEN */}
        {mode === 'confirm' && parsedData && (
          <div>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700 }}>
                Here's what I found.
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                I extracted these fields from the event source. Review and edit anything before creating your workspace.
              </p>
              <div style={{
                marginTop: '0.75rem',
                padding: '0.7rem 0.85rem',
                borderRadius: '8px',
                background: parsedData.confidence.overall === 'high' ? 'rgba(34,197,94,0.08)' : 'rgba(234,179,8,0.08)',
                border: `1px solid ${parsedData.confidence.overall === 'high' ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)'}`,
                fontSize: '0.75rem',
                color: 'var(--text-secondary)'
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>Source analysis: {parsedData.confidence.overall} confidence</strong>
                {parsedData.warnings.length > 0 && (
                  <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {parsedData.warnings.map((warning, idx) => <span key={idx}>⚠ {warning}</span>)}
                  </div>
                )}
              </div>
            </div>

            {/* Editing grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
              {/* Event Name */}
              <div>
                <label style={labelFormStyle}>Event Title</label>
                <input
                  type="text"
                  className="input-field"
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                />
              </div>

              {/* Event description */}
              <div>
                <label style={labelFormStyle}>Brief Summary</label>
                <textarea
                  className="input-field"
                  value={eventDesc}
                  onChange={e => setEventDesc(e.target.value)}
                  style={{ minHeight: '60px', resize: 'none' }}
                />
              </div>

              {/* Deadlines Table */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={labelFormStyle}>Extracted Dates</label>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Editable fields</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {deadlines.map((d, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <Calendar size={14} style={{ color: 'var(--primary)' }} />
                      <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 500 }}>{d.title}</span>
                      <input
                        type="date"
                        value={d.date}
                        onChange={e => updateDeadlineDate(idx, e.target.value)}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          color: '#fff',
                          padding: '0.2rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          outline: 'none'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Requirements & Resources columns */}
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                
                {/* Requirements checklist */}
                <div>
                  <label style={labelFormStyle}>Submission Checklist</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {requirements.map((r, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.01)', padding: '0.4rem', borderRadius: '4px' }}>
                        <input
                          type="checkbox"
                          checked={r.completed}
                          onChange={() => {
                            setRequirements(prev => prev.map((req, i) => i === idx ? { ...req, completed: !req.completed } : req));
                          }}
                        />
                        <span style={{ flex: 1, fontSize: '0.75rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.title}</span>
                        {!r.verified && (
                          <span 
                            onClick={() => toggleReqVerified(idx)}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.1rem', fontSize: '0.65rem', color: 'var(--status-attention)', background: 'var(--status-attention-bg)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}
                            title="Low NLP confidence. Tap to verify."
                          >
                            <AlertTriangle size={10} />
                            <span>Verify</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resources list */}
                <div>
                  <label style={labelFormStyle}>Extracted Templates & Guides</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {resources.map((res, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.01)', padding: '0.4rem', borderRadius: '4px' }}>
                        <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
                        <span style={{ flex: 1, fontSize: '0.75rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{res.name}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{res.fileType}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Team Settings */}
              <div>
                <label style={labelFormStyle}>Number of Members</label>
                {parsedData.event.participationDetails && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: '0.15rem 0 0.5rem' }}>
                    Detected from source: {parsedData.event.participationDetails}
                    {' '}(allowed: {teamSizeMin === teamSizeMax ? `${teamSizeMin} only` : `${teamSizeMin}–${teamSizeMax}`})
                  </p>
                )}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  {/* Stepper: locked to the range the event itself specifies, so it can
                      never go below teamSizeMin or above teamSizeMax. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.4rem 0.6rem' }}>
                    <button
                      type="button"
                      onClick={() => setTeamSize(prev => Math.max(teamSizeMin, prev - 1))}
                      disabled={teamSize <= teamSizeMin}
                      className="btn-icon"
                      style={{
                        width: '28px',
                        height: '28px',
                        border: '1px solid var(--border-color)',
                        opacity: teamSize <= teamSizeMin ? 0.4 : 1,
                        cursor: teamSize <= teamSizeMin ? 'not-allowed' : 'pointer',
                      }}
                      aria-label="Decrease member count"
                    >
                      −
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '90px', justifyContent: 'center' }}>
                      <User size={14} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{teamSize}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        member{teamSize === 1 ? '' : 's'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTeamSize(prev => Math.min(teamSizeMax, prev + 1))}
                      disabled={teamSize >= teamSizeMax}
                      className="btn-icon"
                      style={{
                        width: '28px',
                        height: '28px',
                        border: '1px solid var(--border-color)',
                        opacity: teamSize >= teamSizeMax ? 0.4 : 1,
                        cursor: teamSize >= teamSizeMax ? 'not-allowed' : 'pointer',
                      }}
                      aria-label="Increase member count"
                    >
                      +
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                    Min {teamSizeMin} · Max {teamSizeMax}
                  </span>
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
              {createError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: '0.85rem',
                    alignSelf: 'flex-end'
                  }}
                >
                  <AlertTriangle size={14} />
                  {createError}
                </div>
              )}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setMode('input')}
                  className="btn btn-secondary"
                  disabled={isCreating}
                >
                  Re-analyze Source
                </button>
                <button
                  onClick={handleCreateWorkspace}
                  className="btn btn-primary"
                  style={{ gap: '0.5rem', opacity: isCreating ? 0.7 : 1, cursor: isCreating ? 'wait' : 'pointer' }}
                  disabled={isCreating}
                >
                  <CheckCircle2 size={16} />
                  {isCreating ? 'Creating Workspace…' : 'Create Event Workspace'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const optionBtnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.5rem',
  background: 'rgba(255,255,255,0.01)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '0.85rem 0.5rem',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  transition: 'all 0.2s',
  textAlign: 'center'
};

const labelFormStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '0.4rem',
  letterSpacing: '0.03em'
};
