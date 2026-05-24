import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../utils/api';
import './JudgePanel.css';

const ACTIONS = [
  { id: 'punch_body', label: 'Puño Peto', short: 'PÑ', points: 1 },
  { id: 'kick_body', label: 'Patada Peto', short: 'PT', points: 2 },
  { id: 'kick_head', label: 'Patada Cabeza', short: 'CB', points: 3 },
  { id: 'spinning_kick_body', label: 'Giro Peto', short: 'GP', points: 4 },
  { id: 'spinning_kick_head', label: 'Giro Cabeza', short: 'GC', points: 5 }
];

const DEFAULT_MAPPING = {
  // Face buttons — izquierda=azul, abajo=rojo
  0: { team: 'red',  action: 'punch_body' },  // A (Xbox) / Cross (PS)
  1: { team: 'red',  action: 'gam_jeom' },     // B (Xbox) / Circle (PS)
  2: { team: 'blue', action: 'punch_body' },   // X (Xbox) / Square (PS)
  3: { team: 'blue', action: 'gam_jeom' },     // Y (Xbox) / Triangle (PS)
  // Bumpers (arriba) — patada cabeza
  4: { team: 'blue', action: 'kick_head' },    // LB / L1
  5: { team: 'red',  action: 'kick_head' },    // RB / R1
  // Triggers (abajo) — patada peto
  6: { team: 'blue', action: 'kick_body' },    // LT / L2
  7: { team: 'red',  action: 'kick_body' },    // RT / R2
};

const ANTI_SPAM_MS = 300;

export default function JudgePanel() {
  const { fightId } = useParams();
  const [searchParams] = useSearchParams();
  const judgeId = parseInt(searchParams.get('judgeId') || '1');
  const { socket, connected } = useSocket();

  const defaultName = searchParams.get('judgeName') || localStorage.getItem(`judgeName_${judgeId}`) || `Juez ${judgeId}`;
  const [judgeName, setJudgeName] = useState(defaultName);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(defaultName);

  const [fight, setFight] = useState(null);
  const [config, setConfig] = useState(null);
  const [timer, setTimer] = useState({ remainingMs: 0, round: 1, running: false });
  const [scoreRed, setScoreRed] = useState(0);
  const [scoreBlue, setScoreBlue] = useState(0);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [configMode, setConfigMode] = useState(false);
  const [mapping, setMapping] = useState(() => {
    try {
      const saved = localStorage.getItem('judgeGamepadMapping');
      return saved ? JSON.parse(saved) : DEFAULT_MAPPING;
    } catch { return DEFAULT_MAPPING; }
  });
  const [configuringButton, setConfiguringButton] = useState(null);
  const [lastInputs, setLastInputs] = useState([]);
  const [feedback, setFeedback] = useState(null);

  const lastButtonPress = useRef({});
  const gamepadRef = useRef(null);
  const animFrameRef = useRef(null);
  const fightIdRef = useRef(fightId);
  fightIdRef.current = fightId;

  // Load initial state
  useEffect(() => {
    if (!fightId) return;
    api.getScoringState(fightId).then(data => {
      setFight(data.fight);
      setConfig(data.config);
      setScoreRed(data.fight.score_red || 0);
      setScoreBlue(data.fight.score_blue || 0);
      setTimer(data.timer);
    }).catch(err => console.error('Error loading:', err));
  }, [fightId]);

  // Socket handlers
  useEffect(() => {
    if (!socket) return;
    socket.emit('join-judge', { judgeId, fightId });

    const onTick = (d) => {
      if (String(d.fightId) !== String(fightIdRef.current)) return;
      setTimer({ remainingMs: d.remainingMs, round: d.round, running: d.running });
    };
    const onScore = (d) => {
      if (String(d.fightId) !== String(fightIdRef.current)) return;
      setScoreRed(d.scoreRed);
      setScoreBlue(d.scoreBlue);
    };
    const onGamJeom = (d) => {
      if (String(d.fightId) !== String(fightIdRef.current)) return;
      setScoreRed(d.scoreRed);
      setScoreBlue(d.scoreBlue);
    };

    socket.on('timer:tick', onTick);
    socket.on('timer:started', (d) => {
      if (String(d.fightId) !== String(fightIdRef.current)) return;
      setTimer(prev => ({ ...prev, running: true }));
    });
    socket.on('timer:stopped', (d) => {
      if (String(d.fightId) !== String(fightIdRef.current)) return;
      setTimer(prev => ({ ...prev, running: false, remainingMs: d.remainingMs }));
    });
    socket.on('score:awarded', onScore);
    socket.on('score:edited', onScore);
    socket.on('gam_jeom:added', onGamJeom);

    return () => {
      socket.off('timer:tick', onTick);
      socket.off('timer:started');
      socket.off('timer:stopped');
      socket.off('score:awarded', onScore);
      socket.off('score:edited', onScore);
      socket.off('gam_jeom:added', onGamJeom);
    };
  }, [socket, fightId, judgeId]);

  // Send input via WebSocket
  const judgeNameRef = useRef(judgeName);
  judgeNameRef.current = judgeName;

  const sendInput = useCallback((team, action) => {
    if (!socket || !fightId) return;
    const key = `${team}-${action}`;
    const now = Date.now();
    if (lastButtonPress.current[key] && (now - lastButtonPress.current[key]) < ANTI_SPAM_MS) return;
    lastButtonPress.current[key] = now;

    socket.emit('judge:input', { fightId: parseInt(fightId), judgeId, judgeName: judgeNameRef.current, team, action });

    // Visual feedback
    const entry = { team, action, time: now };
    setLastInputs(prev => [entry, ...prev].slice(0, 8));
    setFeedback({ team, action });
    setTimeout(() => setFeedback(null), 300);
  }, [socket, fightId, judgeId]);

  // Gamepad polling
  useEffect(() => {
    const handleConnect = (e) => {
      gamepadRef.current = e.gamepad;
      setGamepadConnected(true);
    };
    const handleDisconnect = () => {
      gamepadRef.current = null;
      setGamepadConnected(false);
    };

    window.addEventListener('gamepadconnected', handleConnect);
    window.addEventListener('gamepaddisconnected', handleDisconnect);

    const prevButtons = {};

    const poll = () => {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];
      if (!gp) {
        animFrameRef.current = requestAnimationFrame(poll);
        return;
      }

      if (!gamepadRef.current) {
        gamepadRef.current = gp;
        setGamepadConnected(true);
      }

      for (let i = 0; i < gp.buttons.length; i++) {
        const pressed = gp.buttons[i].pressed;
        const wasPressed = prevButtons[i] || false;

        if (pressed && !wasPressed) {
          // Button just pressed
          if (configMode && configuringButton !== null) {
            // We're configuring — assign this gamepad button to the configuring slot
            // configuringButton is { team, action }
            const newMapping = { ...mapping };
            // Remove old mapping for this button if exists
            newMapping[i] = { team: configuringButton.team, action: configuringButton.action };
            setMapping(newMapping);
            localStorage.setItem('judgeGamepadMapping', JSON.stringify(newMapping));
            setConfiguringButton(null);
          } else if (!configMode) {
            const mapped = mapping[i];
            if (mapped) {
              sendInput(mapped.team, mapped.action);
            }
          }
        }
        prevButtons[i] = pressed;
      }

      animFrameRef.current = requestAnimationFrame(poll);
    };

    animFrameRef.current = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener('gamepadconnected', handleConnect);
      window.removeEventListener('gamepaddisconnected', handleDisconnect);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [mapping, configMode, configuringButton, sendInput]);

  function formatTime(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  if (!fight) {
    return <div className="judge-loading"><div className="spinner"></div><p>Cargando...</p></div>;
  }

  const actionLabel = (a) => ACTIONS.find(x => x.id === a)?.label || a;

  return (
    <div className="judge-panel">
      {/* Header */}
      <div className="jp-header">
        <div className="jp-judge-id" style={{ cursor: 'pointer' }} onDoubleClick={() => { setNameInput(judgeName); setEditingName(true); }} title="Doble clic para editar nombre">
        {editingName ? (
          <form style={{ display: 'inline' }} onSubmit={(e) => { e.preventDefault(); const n = nameInput.trim() || `Juez ${judgeId}`; setJudgeName(n); localStorage.setItem(`judgeName_${judgeId}`, n); setEditingName(false); }}>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={() => { const n = nameInput.trim() || `Juez ${judgeId}`; setJudgeName(n); localStorage.setItem(`judgeName_${judgeId}`, n); setEditingName(false); }}
              style={{ width: '100px', fontSize: 'inherit', fontWeight: 'inherit', background: '#333', color: '#fff', border: '1px solid #aaa', borderRadius: 4, padding: '0 4px' }}
            />
          </form>
        ) : judgeName}
      </div>
        <div className="jp-timer">
          <span className={timer.running ? 'jp-timer-live' : 'jp-timer-paused'}>
            {formatTime(timer.remainingMs)}
          </span>
          <span className="jp-round">R{timer.round}</span>
        </div>
        <div className="jp-scores-mini">
          <span className="jp-mini-blue">{scoreBlue}</span>
          <span className="jp-mini-sep">-</span>
          <span className="jp-mini-red">{scoreRed}</span>
        </div>
        <div className="jp-status">
          <span className={`jp-dot ${connected ? 'jp-dot-ok' : 'jp-dot-off'}`}></span>
          {gamepadConnected && <span className="jp-gamepad-icon">🎮</span>}
        </div>
      </div>

      {/* Config toggle */}
      <div className="jp-config-bar">
        <button className={`jp-config-btn ${configMode ? 'active' : ''}`} onClick={() => { setConfigMode(!configMode); setConfiguringButton(null); }}>
          {configMode ? '✓ Listo' : '⚙ Config Gamepad'}
        </button>
        {configMode && (
          <button className="jp-reset-btn" onClick={() => { setMapping(DEFAULT_MAPPING); localStorage.setItem('judgeGamepadMapping', JSON.stringify(DEFAULT_MAPPING)); }}>
            Resetear Mapping
          </button>
        )}
      </div>

      {/* Config mode Panels */}
      {configMode ? (
        <div className="jp-config-panel">
          <p className="jp-config-hint">
            {configuringButton
              ? `Presiona un botón del gamepad para asignar: ${configuringButton.team.toUpperCase()} — ${actionLabel(configuringButton.action)}`
              : 'Selecciona una acción y luego presiona el botón del gamepad que quieras asignar'}
          </p>
          {['blue', 'red'].map(team => (
            <div key={team} className={`jp-config-team jp-config-${team}`}>
              <h3>{team === 'blue' ? '🔵 AZUL' : '🔴 ROJO'}</h3>
              {ACTIONS.map(a => {
                const assignedBtn = Object.entries(mapping).find(([, v]) => v.team === team && v.action === a.id);
                const isConfiguring = configuringButton?.team === team && configuringButton?.action === a.id;
                return (
                  <div key={a.id} className={`jp-config-row ${isConfiguring ? 'configuring' : ''}`}
                       onClick={() => setConfiguringButton({ team, action: a.id })}>
                    <span>{a.label} (+{a.points})</span>
                    <span className="jp-config-key">
                      {assignedBtn ? `Botón ${assignedBtn[0]}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Action buttons */}
          <div className="jp-actions">
            {/* Blue side */}
            <div className="jp-team jp-team-blue">
              <div className="jp-team-header">
                <span className="jp-team-name">{fight.competitor_blue}</span>
                <span className="jp-team-label">AZUL</span>
              </div>
              {ACTIONS.map(a => (
                <button
                  key={a.id}
                  className={`jp-action-btn jp-btn-blue ${feedback?.team === 'blue' && feedback?.action === a.id ? 'jp-btn-flash' : ''}`}
                  onPointerDown={() => sendInput('blue', a.id)}
                >
                  <span className="jp-btn-label">{a.label}</span>
                  <span className="jp-btn-points">+{a.points}</span>
                </button>
              ))}
            </div>

            {/* Red side */}
            <div className="jp-team jp-team-red">
              <div className="jp-team-header">
                <span className="jp-team-name">{fight.competitor_red}</span>
                <span className="jp-team-label">ROJO</span>
              </div>
              {ACTIONS.map(a => (
                <button
                  key={a.id}
                  className={`jp-action-btn jp-btn-red ${feedback?.team === 'red' && feedback?.action === a.id ? 'jp-btn-flash' : ''}`}
                  onPointerDown={() => sendInput('red', a.id)}
                >
                  <span className="jp-btn-label">{a.label}</span>
                  <span className="jp-btn-points">+{a.points}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Input log */}
          <div className="jp-log">
            {lastInputs.map((inp, i) => (
              <span key={i} className={`jp-log-item jp-log-${inp.team}`}>
                {inp.team === 'blue' ? 'AZ' : 'RJ'} {ACTIONS.find(a => a.id === inp.action)?.short || '?'}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
