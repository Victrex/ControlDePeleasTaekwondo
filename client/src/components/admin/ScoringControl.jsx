import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSocket } from '../../contexts/SocketContext';
import { Monitor, Scale, Trophy, Circle, RefreshCw, Gamepad2, Crown, AlertTriangle, Target, RotateCcw, Sparkles, Play, Pause, Timer, X, SkipForward, Eraser, Zap, Activity, Check } from 'lucide-react';
import api from '../../utils/api';
import './ScoringControl.css';

const ACTION_LABELS = {
  punch_body: 'Puño Peto',
  kick_body: 'Patada Peto',
  kick_head: 'Patada Cabeza',
  spinning_kick_body: 'Giro Peto',
  spinning_kick_head: 'Giro Cabeza',
  gam_jeom: 'Gam-jeom'
};

const GAMEPAD_MAPPING = {
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

function vibrateGamepad(gp, strongMagnitude = 0.6, weakMagnitude = 0.3, duration = 150) {
  if (!gp?.vibrationActuator) return;
  gp.vibrationActuator.playEffect('dual-rumble', {
    startDelay: 0, duration, weakMagnitude, strongMagnitude,
  }).catch(() => {});
}

function formatTime(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ScoringControl() {
  const { fightId } = useParams();
  const { socket, connected } = useSocket();

  const [fight, setFight] = useState(null);
  const [config, setConfig] = useState(null);
  const [timer, setTimer] = useState({ remainingMs: 0, round: 1, running: false });
  const [scoreRed, setScoreRed] = useState(0);
  const [scoreBlue, setScoreBlue] = useState(0);
  const [gamJeomRed, setGamJeomRed] = useState(0);
  const [gamJeomBlue, setGamJeomBlue] = useState(0);
  const [breakdown, setBreakdown] = useState(null);
  const [roundWinners, setRoundWinners] = useState({});
  const [customTime, setCustomTime] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');
  const [customSeconds, setCustomSeconds] = useState('');
  const [editScoreBlue, setEditScoreBlue] = useState('');
  const [editScoreRed, setEditScoreRed] = useState('');
  const [loading, setLoading] = useState(false);
  const [kyeShieActive, setKyeShieActive] = useState(false);
  // Next fight modal
  const [showNextFightModal, setShowNextFightModal] = useState(false);
  const [pendingFights, setPendingFights] = useState([]);
  const [filterCurrentPista, setFilterCurrentPista] = useState(true);
  const [loadingFights, setLoadingFights] = useState(false);
  const [startingFightId, setStartingFightId] = useState(null);

  const navigate = useNavigate();

  // Gamepad / Judge management
  const [detectedGamepads, setDetectedGamepads] = useState([]); // [{index, id, name}]
  const [assignedJudges, setAssignedJudges] = useState({}); // {gamepadIndex: judgeId}
  const [judgeNames, setJudgeNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sc_judgeNames') || '{}'); } catch { return {}; }
  }); // {judgeId: name}
  const [judgeLastInput, setJudgeLastInput] = useState({}); // {judgeId: {team, action, time}}
  const [gamJeomByRound, setGamJeomByRound] = useState({}); // {round: {red: n, blue: n}}
  const [mainGamepad, setMainGamepad] = useState(null); // gamepad index designated as main controller
  const [gamJeomGamepads, setGamJeomGamepads] = useState({}); // {gamepadIndex: true} — can add gam-jeoms
  const lastButtonPress = useRef({}); // anti-spam per gamepad+button
  const prevButtonStates = useRef({}); // track previous button states per gamepad
  const animFrameRef = useRef(null);

  const fightIdRef = useRef(fightId);
  fightIdRef.current = fightId;
  const assignedJudgesRef = useRef(assignedJudges);
  assignedJudgesRef.current = assignedJudges;
  const judgeNamesRef = useRef(judgeNames);
  judgeNamesRef.current = judgeNames;
  const gamJeomGamepadsRef = useRef(gamJeomGamepads);
  gamJeomGamepadsRef.current = gamJeomGamepads;
  const mainGamepadRef = useRef(mainGamepad);
  mainGamepadRef.current = mainGamepad;
  const timerRunningRef = useRef(timer.running);
  timerRunningRef.current = timer.running;
  const timerRemainingRef = useRef(timer.remainingMs);
  timerRemainingRef.current = timer.remainingMs;
  const lastPulsedSecond = useRef(-1);
  // Load initial state
  useEffect(() => {
    if (!fightId) return;
    loadState();
  }, [fightId]);

  async function loadState() {
    try {
      const data = await api.getScoringState(fightId);
      setFight(data.fight);
      setConfig(data.config);
      setScoreRed(data.fight.score_red || 0);
      setScoreBlue(data.fight.score_blue || 0);
      setGamJeomRed(data.fight.gam_jeom_red || 0);
      setGamJeomBlue(data.fight.gam_jeom_blue || 0);
      setTimer(data.timer);
      setBreakdown(data.breakdown);
      if (data.gamJeomByRound) setGamJeomByRound(data.gamJeomByRound);
      setRoundWinners({
        1: data.fight.round_1_winner,
        2: data.fight.round_2_winner,
        3: data.fight.round_3_winner
      });
    } catch (err) {
      console.error('Error loading scoring state:', err);
    }
  }

  // ——— Gamepad detection & multi-gamepad polling ———
  useEffect(() => {
    function scanGamepads() {
      const gps = navigator.getGamepads();
      const found = [];
      for (let i = 0; i < gps.length; i++) {
        if (gps[i]) {
          found.push({ index: gps[i].index, id: gps[i].id, name: gps[i].id.split('(')[0].trim() || `Mando ${gps[i].index}` });
        }
      }
      setDetectedGamepads(prev => {
        if (prev.length !== found.length || prev.some((p, idx) => p.index !== found[idx]?.index)) return found;
        return prev;
      });
    }

    const handleConnect = () => scanGamepads();
    const handleDisconnect = (e) => {
      scanGamepads();
      // Remove assignment if gamepad disconnected
      setAssignedJudges(prev => {
        const next = { ...prev };
        delete next[e.gamepad.index];
        return next;
      });
      setGamJeomGamepads(prev => {
        const next = { ...prev };
        delete next[e.gamepad.index];
        return next;
      });
    };

    window.addEventListener('gamepadconnected', handleConnect);
    window.addEventListener('gamepaddisconnected', handleDisconnect);

    // Poll gamepads for inputs + periodic detection
    const prevBtns = prevButtonStates.current;

    const poll = () => {
      const gps = navigator.getGamepads();
      // Periodic detection (every ~60 frames it updates via state anyway)
      const found = [];
      for (let i = 0; i < gps.length; i++) {
        if (gps[i]) found.push({ index: gps[i].index, id: gps[i].id, name: gps[i].id.split('(')[0].trim() || `Mando ${gps[i].index}` });
      }
      setDetectedGamepads(prev => {
        if (prev.length !== found.length || prev.some((p, idx) => p.index !== found[idx]?.index)) return found;
        return prev;
      });

      const assigned = assignedJudgesRef.current;
      const gamJeomCtrl = gamJeomGamepadsRef.current;
      const mainGpIdx = mainGamepadRef.current;
      const now = Date.now();

      for (let gi = 0; gi < gps.length; gi++) {
        const gp = gps[gi];
        if (!gp) continue;

        if (!prevBtns[gp.index]) prevBtns[gp.index] = {};

        // Main gamepad: Options button (9) toggles timer start/stop
        if (gp.index === mainGpIdx) {
          const optPressed = gp.buttons[9]?.pressed;
          const optWas = prevBtns[gp.index][9] || false;
          if (optPressed && !optWas) {
            const spamKey = `${gp.index}-9`;
            if (!lastButtonPress.current[spamKey] || (now - lastButtonPress.current[spamKey]) >= 500) {
              lastButtonPress.current[spamKey] = now;
              if (timerRunningRef.current) {
                api.stopTimer(fightIdRef.current).catch(() => {});
                vibrateGamepad(gp, 1.0, 1.0, 350);
              } else {
                api.startTimer(fightIdRef.current).catch(() => {});
                vibrateGamepad(gp, 1.0, 1.0, 250);
              }
            }
          }
          prevBtns[gp.index][9] = optPressed;
        }

        const judgeId = assigned[gp.index];
        const isGamJeomCtrl = !!gamJeomCtrl[gp.index];

        // Skip if this gamepad has no active role
        if (!judgeId && !isGamJeomCtrl) continue;

        for (let bi = 0; bi < gp.buttons.length; bi++) {
          const pressed = gp.buttons[bi].pressed;
          const wasPressed = prevBtns[gp.index][bi] || false;

          if (pressed && !wasPressed) {
            const mapped = GAMEPAD_MAPPING[bi];
            if (mapped) {
              const spamKey = `${gp.index}-${bi}`;
              if (!lastButtonPress.current[spamKey] || (now - lastButtonPress.current[spamKey]) >= ANTI_SPAM_MS) {
                lastButtonPress.current[spamKey] = now;
                if (mapped.action === 'gam_jeom') {
                  // Only gamepads with GAM role can add gam-jeoms, and only when timer is paused
                  if (isGamJeomCtrl && !timerRunningRef.current) {
                    api.addGamJeom(fightIdRef.current, mapped.team).catch(() => {});
                  }
                } else if (judgeId && socket) {
                  // Scoring actions go through judge consensus
                  socket.emit('judge:input', {
                    fightId: parseInt(fightIdRef.current),
                    judgeId,
                    judgeName: judgeNamesRef.current[judgeId] || `Juez ${judgeId}`,
                    team: mapped.team,
                    action: mapped.action
                  });
                }
                if (judgeId) {
                  setJudgeLastInput(prev => ({
                    ...prev,
                    [judgeId]: { team: mapped.team, action: mapped.action, time: now }
                  }));
                }
              }
            }
          }
          prevBtns[gp.index][bi] = pressed;
        }
      }

      // 10-second countdown: one intense pulse per second on all active gamepads
      if (timerRunningRef.current && timerRemainingRef.current > 0 && timerRemainingRef.current <= 10000) {
        const currentSec = Math.ceil(timerRemainingRef.current / 1000);
        if (currentSec !== lastPulsedSecond.current) {
          lastPulsedSecond.current = currentSec;
          const allGps = navigator.getGamepads();
          for (let i = 0; i < allGps.length; i++) {
            if (allGps[i]) vibrateGamepad(allGps[i], 1.0, 1.0, 300);
          }
        }
      } else if (!timerRunningRef.current || timerRemainingRef.current > 10000) {
        lastPulsedSecond.current = -1;
      }

      animFrameRef.current = requestAnimationFrame(poll);
    };

    animFrameRef.current = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener('gamepadconnected', handleConnect);
      window.removeEventListener('gamepaddisconnected', handleDisconnect);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [socket]);

  // Assign/unassign a gamepad as a judge
  function toggleJudgeAssignment(gamepadIndex) {
    setAssignedJudges(prev => {
      const next = { ...prev };
      if (next[gamepadIndex]) {
        delete next[gamepadIndex];
      } else {
        // Assign next available judgeId
        const usedIds = new Set(Object.values(next));
        let newId = 1;
        while (usedIds.has(newId)) newId++;
        next[gamepadIndex] = newId;
      }
      return next;
    });
  }

  const numAssignedJudges = Object.keys(assignedJudges).length;
  const requiredJudges = config?.num_judges || 3;

  // Socket events
  useEffect(() => {
    if (!socket) return;
    socket.emit('join-admin');

    const fid = () => fightIdRef.current;

    const handlers = {
      'score:awarded': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setScoreRed(d.scoreRed);
        setScoreBlue(d.scoreBlue);
        loadBreakdown();
      },
      'score:edited': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setScoreRed(d.scoreRed);
        setScoreBlue(d.scoreBlue);
        loadBreakdown();
      },
      'gam_jeom:added': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setGamJeomRed(d.gamJeomRed);
        setGamJeomBlue(d.gamJeomBlue);
        setScoreRed(d.scoreRed);
        setScoreBlue(d.scoreBlue);
        // Update per-round gam-jeom using the server count (already correct after setRound clears DB)
        if (d.round && d.roundGamJeom !== undefined) {
          setGamJeomByRound(prev => ({
            ...prev,
            [d.round]: {
              ...prev[d.round],
              [d.team]: d.roundGamJeom
            }
          }));
        }
        loadBreakdown();
      },
      'timer:tick': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setTimer({ remainingMs: d.remainingMs, round: d.round, running: d.running });
      },
      'timer:started': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setTimer(prev => ({ ...prev, running: true, remainingMs: d.remainingMs, round: d.round }));
      },
      'timer:stopped': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setTimer(prev => ({ ...prev, running: false, remainingMs: d.remainingMs }));
      },
      'round:ended': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setTimer(prev => ({ ...prev, running: false, remainingMs: 0 }));
        setGamJeomRed(0);
        setGamJeomBlue(0);
        setGamJeomByRound(prevState => ({
          ...prevState,
          [d.round]: { red: 0, blue: 0 }
        }));
        loadBreakdown();
      },
      'fight:gap_point_win': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        alert(`¡Round ganado por diferencia de puntos! Ganador del round: ${d.winner.toUpperCase()}`);
      },
      'fight:punitive_win': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        alert(`¡Round ganado por límite de Gam-jeom! Ganador del round: ${d.winner.toUpperCase()}`);
      },
      'kye_shie:started': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setKyeShieActive(true);
      },
      'kye_shie:ended': (d) => {
        if (String(d.fightId) !== String(fid())) return;
        setKyeShieActive(false);
      },
      'fight:updated': (d) => {
        if (String(d.id) !== String(fid())) return;
        setFight(d);
        setScoreRed(d.score_red ?? 0);
        setScoreBlue(d.score_blue ?? 0);
        setGamJeomRed(d.gam_jeom_red ?? 0);
        setGamJeomBlue(d.gam_jeom_blue ?? 0);
        setRoundWinners({
          1: d.round_1_winner,
          2: d.round_2_winner,
          3: d.round_3_winner,
        });
        loadBreakdown();
      }
    };

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event, handler);
    }
    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event, handler);
      }
    };
  }, [socket, fightId]);

  async function loadBreakdown() {
    try {
      const bd = await api.getScoringBreakdown(fightIdRef.current);
      setBreakdown(bd);
    } catch (e) {}
  }

  // Timer controls
  async function handleStartTimer() {
    try { await api.startTimer(fightId); } catch (e) { alert(e.message); }
  }
  async function handleStopTimer() {
    try { await api.stopTimer(fightId); } catch (e) { alert(e.message); }
  }
  async function handleResetTimer() {
    try {
      const seconds = customTime ? parseInt(customTime) : undefined;
      await api.resetTimer(fightId, seconds);
    } catch (e) { alert(e.message); }
  }

  // Admin manual score
  async function handleAdminAddScore(team, action) {
    try { await api.addAdminScore(fightId, team, action); } catch (e) { alert(e.message); }
  }

  // Set exact score
  async function handleSetScore(team) {
    const val = team === 'blue' ? editScoreBlue : editScoreRed;
    const num = parseInt(val);
    if (isNaN(num) || num < 0) { alert('Valor inválido'); return; }
    try {
      await api.setScore(fightId, team, num);
      if (team === 'blue') setEditScoreBlue('');
      else setEditScoreRed('');
    } catch (e) { alert(e.message); }
  }

  // Set round
  async function handleSetRound(round) {
    try {
      await api.setRound(fightId, round);
      // Server deletes all gam-jeom records for this round and emits fight:updated with zeros
      setGamJeomByRound(prev => ({ ...prev, [round]: { red: 0, blue: 0 } }));
    } catch (e) { alert(e.message); }
  }

  // Set exact timer
  async function handleSetTimer() {
    const m = parseInt(customMinutes) || 0;
    const s = parseInt(customSeconds) || 0;
    if (m === 0 && s === 0) { alert('Ingresa un tiempo válido'); return; }
    try {
      await api.setTimerValue(fightId, m, s);
      setCustomMinutes('');
      setCustomSeconds('');
    } catch (e) { alert(e.message); }
  }

  // Gam-jeom
  async function handleGamJeom(team) {
    if (timer.running) return;
    try { await api.addGamJeom(fightId, team); } catch (e) { alert(e.message); }
  }
  async function handleRemoveGamJeom(team) {
    try { await api.removeGamJeom(fightId, team); } catch (e) { alert(e.message); }
  }

  // Round winner
  async function handleRoundWinner(round, winner) {
    try {
      await api.setRoundWinner(fightId, round, winner);
      setRoundWinners(prev => ({ ...prev, [round]: winner }));
    } catch (e) { alert(e.message); }
  }

  // Delete score
  async function handleDeleteScore(scoreId) {
    if (timer.running) { alert('Detén el timer primero'); return; }
    try { await api.deleteScore(fightId, scoreId); loadBreakdown(); loadState(); } catch (e) { alert(e.message); }
  }

  // End round manually
  async function handleEndRound() {
    try { await api.endRound(fightId); } catch (e) { alert(e.message); }
  }

  // Kye Shie
  async function handleKyeShie() {
    try {
      if (kyeShieActive) {
        await api.cancelKyeShie(fightId);
      } else {
        await api.startKyeShie(fightId);
      }
    } catch (e) { alert(e.message); }
  }

  async function handleClearCurrentScore() {
    if (timer.running) {
      alert('Detén el timer primero');
      return;
    }
    if (!window.confirm('¿Limpiar todo el score y gam-jeom del round actual?')) return;

    try {
      await api.clearCurrentRoundScore(fightId);
      await loadBreakdown();
      await loadState();
    } catch (e) {
      alert(e.message);
    }
  }

  async function openNextFightModal() {
    if (!fight) return;
    setShowNextFightModal(true);
    setLoadingFights(true);
    try {
      const all = await api.getFights(fight.tournament_id);
      const pending = all
        .filter((f) => f.status === 'pending')
        .sort((a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999));
      setPendingFights(pending);
    } catch (e) {
      console.error('Error cargando peleas:', e);
    } finally {
      setLoadingFights(false);
    }
  }

  async function handleStartNextFight(selectedFight) {
    if (startingFightId) return;
    setStartingFightId(selectedFight.id);
    try {
      if (selectedFight.pista !== fight.pista) {
        await api.updateFight(selectedFight.id, { pista: fight.pista });
      }
      await api.setCurrentFight(selectedFight.id, fight.tournament_id);
      setShowNextFightModal(false);
      navigate(`/admin/scoring/${selectedFight.id}`);
    } catch (e) {
      alert('Error iniciando pelea: ' + e.message);
    } finally {
      setStartingFightId(null);
    }
  }

  async function handleRepeatFight() {
    if (!fight) return;
    if (!window.confirm('¿Repetir esta pelea? Se resetearán todos los puntajes y rondas.')) return;
    try {
      await api.repeatFight(fight.id, fight.tournament_id);
      await loadState();
    } catch (e) {
      alert('Error repitiendo pelea: ' + e.message);
    }
  }

  if (!fight) {
    return <div className="sc-loading"><div className="spinner"></div><p>Cargando...</p></div>;
  }

  const numRounds = config?.num_rounds || 3;

  return (
    <div className="scoring-control">
      {/* Header */}
      <div className="sc-header">
        <Link to="/admin" className="sc-back">← Admin</Link>
        <h2>Control de Mesa — Combate #{fight.fight_number}</h2>
        <div className="sc-links">
          <Link to={`/scoreboard/${fightId}`} target="_blank" className="sc-link"><Monitor size={13} /> Scoreboard</Link>
          <Link to={`/judge/${fightId}?judgeId=1`} target="_blank" className="sc-link"><Scale size={13} /> Juez externo</Link>
        </div>
      </div>

      {/* Banner: pelea terminada */}
      {fight.status === 'completed' && fight.final_winner && (
        <div style={{ background: '#2d6a4f', color: 'white', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderBottom: '3px solid #1b4332' }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
            <Trophy size={16} /> Pelea finalizada — Ganador:{' '}
            <span style={{ textTransform: 'uppercase' }}>
              {fight.final_winner === 'red' ? <><Circle size={10} fill="#ef4444" color="#ef4444" /> Rojo</> : <><Circle size={10} fill="#3b82f6" color="#3b82f6" /> Azul</>}
            </span>
            {fight.victory_type && <span style={{ marginLeft: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>({fight.victory_type})</span>}
          </div>
          <button
            onClick={handleRepeatFight}
            style={{ background: '#e67e22', color: 'white', border: 'none', borderRadius: '6px', padding: '0.4rem 1rem', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
          >
            <RefreshCw size={13} /> Repetir pelea
          </button>
        </div>
      )}

      {/* Judges / Gamepads panel */}
      <div className="sc-judges-panel">
        <div className="sc-judges-header">
          <h3><Scale size={15} /> Jueces (Mandos)</h3>
          <div className={`sc-judges-status ${numAssignedJudges >= requiredJudges ? 'sc-judges-ready' : 'sc-judges-warning'}`}>
            {numAssignedJudges} / {requiredJudges} asignados
            {numAssignedJudges >= requiredJudges && <Check size={12} />}
          </div>
        </div>

        {detectedGamepads.length === 0 ? (
          <div className="sc-judges-empty">
            <Gamepad2 size={16} /> No se detectan mandos. Conecta un mando USB/Bluetooth y presiona un botón.
          </div>
        ) : (
          <div className="sc-gamepads-list">
            {detectedGamepads.map(gp => {
              const judgeId = assignedJudges[gp.index];
              const lastInput = judgeId ? judgeLastInput[judgeId] : null;
              const isRecent = lastInput && (Date.now() - lastInput.time) < 3000;
              return (
                <div key={gp.index} className={`sc-gamepad-item ${judgeId ? 'sc-gp-assigned' : ''}`}>
                  <div className="sc-gp-info">
                    <span className="sc-gp-icon"><Gamepad2 size={18} /></span>
                    <div className="sc-gp-details">
                      <span className="sc-gp-name">{gp.name}</span>
                      <span className="sc-gp-idx">Slot #{gp.index}</span>
                    </div>
                  </div>
                  {judgeId && (
                    <input
                      className="sc-gp-judge-name-input"
                      value={judgeNames[judgeId] || ''}
                      placeholder={`Juez ${judgeId}`}
                      onChange={e => {
                        const val = e.target.value;
                        setJudgeNames(prev => {
                          const next = { ...prev, [judgeId]: val };
                          localStorage.setItem('sc_judgeNames', JSON.stringify(next));
                          return next;
                        });
                      }}
                      title="Nombre del juez (se muestra en el marcador)"
                    />
                  )}
                  <div className="sc-gp-status">
                    {judgeId && lastInput && isRecent && (
                      <span className={`sc-gp-last-input sc-gp-input-${lastInput.team}`}>
                        {lastInput.team === 'blue' ? <Circle size={8} fill="#3b82f6" color="#3b82f6" /> : <Circle size={8} fill="#ef4444" color="#ef4444" />} {ACTION_LABELS[lastInput.action]}
                      </span>
                    )}
                  </div>
                  <button
                    className={`sc-gp-assign-btn ${judgeId ? 'sc-gp-unassign' : 'sc-gp-assign'}`}
                    onClick={() => toggleJudgeAssignment(gp.index)}
                  >
                    {judgeId ? `Juez ${judgeId} ` : 'Asignar'}{judgeId && <X size={11} />}
                  </button>
                  <button
                    className={`sc-gp-main-btn ${mainGamepad === gp.index ? 'sc-gp-main-active' : ''}`}
                    onClick={() => setMainGamepad(prev => prev === gp.index ? null : gp.index)}
                    title="Mando principal (Options = Shi-jak/Galyo)"
                  >
                    {mainGamepad === gp.index ? <><Crown size={12} /> Main</> : <><Gamepad2 size={12} /> Main</>}
                  </button>
                  <button
                    className={`sc-gp-gam-btn ${gamJeomGamepads[gp.index] ? 'sc-gp-gam-active' : ''}`}
                    onClick={() => setGamJeomGamepads(prev => {
                      const next = { ...prev };
                      if (next[gp.index]) delete next[gp.index];
                      else next[gp.index] = true;
                      return next;
                    })}
                    title="Activar para que B/Y agreguen Gam-jeom"
                  >
                    GAM
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {numAssignedJudges > 0 && numAssignedJudges < requiredJudges && (
          <div className="sc-judges-warn-msg">
            <AlertTriangle size={13} /> Se necesitan {requiredJudges} jueces para consenso de mayoría. Actualmente {numAssignedJudges} asignados.
          </div>
        )}
      </div>

      {/* Competitors + Scores */}
      <div className="sc-scores">
        <div className="sc-side sc-side-blue">
          <div className="sc-comp-name">{fight.competitor_blue}</div>
          <div className="sc-comp-academy">{fight.academy_blue || ''}</div>
          <div className="sc-comp-score">{scoreBlue}</div>
          <div className="sc-score-edit">
            <input
              type="number"
              className="sc-score-input"
              placeholder="Score"
              value={editScoreBlue}
              onChange={e => setEditScoreBlue(e.target.value)}
              min="0"
            />
            <button className="sc-score-set-btn" onClick={() => handleSetScore('blue')}>Set</button>
          </div>
          <div className="sc-gamjeom-area">
            <span className="sc-gj-label">
              Gam-jeom R{timer.round}: {gamJeomByRound[timer.round]?.blue || 0} / {config?.max_gam_jeom || 5}
            </span>
            <span className="sc-gj-total">(Total: {gamJeomBlue})</span>
            <div className="sc-gj-btns">
              <button className="sc-gj-btn sc-gj-add" onClick={() => handleGamJeom('blue')}>+</button>
              <button className="sc-gj-btn sc-gj-sub" onClick={() => handleRemoveGamJeom('blue')}>−</button>
            </div>
          </div>
        </div>

        <div className="sc-center-info">
          <div className={`sc-timer-display ${timer.running ? 'sc-timer-live' : 'sc-timer-stopped'}`}>
            {formatTime(timer.remainingMs)}
          </div>
          <div className="sc-round-display">Round {timer.round} / {numRounds}</div>
        </div>

        <div className="sc-side sc-side-red">
          <div className="sc-comp-name">{fight.competitor_red}</div>
          <div className="sc-comp-academy">{fight.academy_red || ''}</div>
          <div className="sc-comp-score">{scoreRed}</div>
          <div className="sc-score-edit">
            <input
              type="number"
              className="sc-score-input"
              placeholder="Score"
              value={editScoreRed}
              onChange={e => setEditScoreRed(e.target.value)}
              min="0"
            />
            <button className="sc-score-set-btn" onClick={() => handleSetScore('red')}>Set</button>
          </div>
          <div className="sc-gamjeom-area">
            <span className="sc-gj-label">
              Gam-jeom R{timer.round}: {gamJeomByRound[timer.round]?.red || 0} / {config?.max_gam_jeom || 5}
            </span>
            <span className="sc-gj-total">(Total: {gamJeomRed})</span>
            <div className="sc-gj-btns">
              <button className="sc-gj-btn sc-gj-add" onClick={() => handleGamJeom('red')}>+</button>
              <button className="sc-gj-btn sc-gj-sub" onClick={() => handleRemoveGamJeom('red')}>−</button>
            </div>
          </div>
        </div>
      </div>

      {/* Manual scoring buttons */}
      <div className="sc-manual-scoring">
        <h3>Puntuación Manual</h3>
        <div className="sc-manual-grid">
          <div className="sc-manual-col sc-manual-blue">
            <span className="sc-manual-team-label"><Circle size={10} fill="#3b82f6" color="#3b82f6" /> Azul</span>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('blue', 'punch_body')}><Zap size={13} /> Puño</button>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('blue', 'kick_body')}><Activity size={13} /> Peto</button>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('blue', 'kick_head')}><Target size={13} /> Cabeza</button>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('blue', 'spinning_kick_body')}><RotateCcw size={13} /> Giro P</button>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('blue', 'spinning_kick_head')}><Sparkles size={13} /> Giro C</button>
          </div>
          <div className="sc-manual-col sc-manual-red">
            <span className="sc-manual-team-label"><Circle size={10} fill="#ef4444" color="#ef4444" /> Rojo</span>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('red', 'punch_body')}><Zap size={13} /> Puño</button>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('red', 'kick_body')}><Activity size={13} /> Peto</button>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('red', 'kick_head')}><Target size={13} /> Cabeza</button>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('red', 'spinning_kick_body')}><RotateCcw size={13} /> Giro P</button>
            <button className="sc-ms-btn" onClick={() => handleAdminAddScore('red', 'spinning_kick_head')}><Sparkles size={13} /> Giro C</button>
          </div>
        </div>
      </div>

      {/* Timer & Round controls */}
      <div className="sc-timer-controls">
        <div className="sc-timer-row">
          <button className="sc-btn sc-btn-start" onClick={handleStartTimer} disabled={timer.running}>
            <Play size={13} /> Shi-jak
          </button>
          <button className="sc-btn sc-btn-stop" onClick={handleStopTimer} disabled={!timer.running}>
            <Pause size={13} /> Galyo
          </button>
          <button className="sc-btn sc-btn-reset" onClick={handleResetTimer}>
            ↺ Reset
          </button>
          <button className="sc-btn sc-btn-endround" onClick={handleEndRound}>
            Fin Round
          </button>
          <button
            className={`sc-btn sc-btn-kye-shie ${kyeShieActive ? 'sc-btn-kye-shie-active' : ''}`}
            onClick={handleKyeShie}
            title="Kye-shi: tiempo de descuento (1 min) por lesión"
          >
            {kyeShieActive ? <><X size={12} /> Kye-shi</> : <><Timer size={13} /> Kye-shi</>}
          </button>
          <button
            className="sc-btn sc-btn-clear"
            onClick={handleClearCurrentScore}
            disabled={timer.running}
            title="Limpia score y gam-jeom del round actual"
          >
            <Eraser size={13} /> Limpiar Score Actual
          </button>
          <button
            className="sc-btn sc-btn-next-fight"
            onClick={openNextFightModal}
            title="Seleccionar siguiente pelea para esta pista"
          >
            <SkipForward size={13} /> Siguiente Pelea
          </button>
        </div>
        <div className="sc-timer-row">
          <div className="sc-set-timer-group">
            <span className="sc-set-label">Timer:</span>
            <input
              type="number"
              className="sc-time-input"
              placeholder="Min"
              value={customMinutes}
              onChange={e => setCustomMinutes(e.target.value)}
              min="0"
              max="99"
            />
            <span className="sc-time-sep">:</span>
            <input
              type="number"
              className="sc-time-input"
              placeholder="Seg"
              value={customSeconds}
              onChange={e => setCustomSeconds(e.target.value)}
              min="0"
              max="59"
            />
            <button className="sc-btn sc-btn-set" onClick={handleSetTimer}>
              Poner
            </button>
          </div>
          <div className="sc-round-nav">
            <span className="sc-set-label">Round:</span>
            {Array.from({ length: numRounds }, (_, i) => i + 1).map(r => (
              <button
                key={r}
                className={`sc-btn sc-btn-round ${timer.round === r ? 'sc-btn-round-active' : ''}`}
                onClick={() => handleSetRound(r)}
                disabled={timer.running}
              >
                R{r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Round winners */}
      <div className="sc-round-winners">
        <h3>Ganador por Round</h3>
        <div className="sc-rounds-grid">
          {Array.from({ length: numRounds }, (_, i) => i + 1).map(r => (
            <div key={r} className="sc-round-row">
              <span className="sc-round-label">R{r}</span>
              <button
                className={`sc-rw-btn sc-rw-blue ${roundWinners[r] === 'blue' ? 'active' : ''}`}
                onClick={() => handleRoundWinner(r, 'blue')}
              >Azul</button>
              <button
                className={`sc-rw-btn sc-rw-red ${roundWinners[r] === 'red' ? 'active' : ''}`}
                onClick={() => handleRoundWinner(r, 'red')}
              >Rojo</button>
            </div>
          ))}
        </div>
      </div>

      {/* Score events */}
      <div className="sc-breakdown">
        <h3>Eventos de Puntuación</h3>
        {breakdown && Object.entries(breakdown.rounds).map(([roundNum, rd]) => (
          <div key={roundNum} className="sc-bd-round">
            <h4>Round {roundNum} — Azul: {rd.blue} | Rojo: {rd.red}</h4>
            <table className="sc-bd-table">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Acción</th>
                  <th>Pts</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rd.events.map(ev => (
                  <tr key={ev.id} className={`sc-bd-row-${ev.team}`}>
                    <td>{ev.team === 'red' ? <Circle size={9} fill="#ef4444" color="#ef4444" /> : <Circle size={9} fill="#3b82f6" color="#3b82f6" />}</td>
                    <td>{ACTION_LABELS[ev.action] || ev.action}</td>
                    <td>{ev.points}</td>
                    <td>
                      <button
                        className="sc-bd-del"
                        onClick={() => handleDeleteScore(ev.id)}
                        disabled={timer.running}
                        title="Eliminar"
                      ><X size={11} /></button>
                    </td>
                  </tr>
                ))}
                {rd.events.length === 0 && (
                  <tr><td colSpan="4" style={{textAlign:'center',color:'#666'}}>Sin eventos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
        {(!breakdown || Object.keys(breakdown.rounds).length === 0) && (
          <p style={{color:'#666',textAlign:'center'}}>Sin puntuaciones aún</p>
        )}
      </div>

      {/* Next Fight Modal */}
      {showNextFightModal && (
        <div className="sb-modal-overlay" onClick={() => setShowNextFightModal(false)}>
          <div className="sb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sb-modal-header">
              <h2>Siguiente Pelea — Pista {fight.pista || 1}</h2>
              <button className="sb-modal-close" onClick={() => setShowNextFightModal(false)}><X size={14} /></button>
            </div>
            <div className="sb-modal-filter">
              <label className="sb-modal-filter-label">
                <input
                  type="checkbox"
                  checked={filterCurrentPista}
                  onChange={(e) => setFilterCurrentPista(e.target.checked)}
                />
                Solo Pista {fight.pista || 1}
              </label>
              <span className="sb-modal-count">
                {pendingFights.filter((f) => !filterCurrentPista || f.pista === fight.pista).length} peleas pendientes
              </span>
            </div>
            {loadingFights ? (
              <div className="sb-modal-loading">Cargando peleas...</div>
            ) : (
              <div className="sb-modal-list">
                {pendingFights
                  .filter((f) => !filterCurrentPista || f.pista === fight.pista)
                  .map((f, idx) => (
                    <div key={f.id} className={`sb-modal-fight-row ${f.pista !== fight.pista ? 'sb-modal-other-pista' : ''}`}>
                      <div className="sb-modal-fight-order">{idx + 1}</div>
                      <div className="sb-modal-fight-pista">Pista {f.pista || 1}</div>
                      <div className="sb-modal-fight-red">{f.competitor_red}</div>
                      <div className="sb-modal-fight-vs">vs</div>
                      <div className="sb-modal-fight-blue">{f.competitor_blue}</div>
                      {f.bracket_round && (
                        <div className="sb-modal-fight-round">{f.bracket_round}</div>
                      )}
                      <button
                        className="sb-modal-start-btn"
                        disabled={startingFightId === f.id}
                        onClick={() => handleStartNextFight(f)}
                      >
                        {startingFightId === f.id ? '...' : 'Iniciar'}
                      </button>
                    </div>
                  ))}
                {pendingFights.filter((f) => !filterCurrentPista || f.pista === fight.pista).length === 0 && (
                  <div className="sb-modal-empty">
                    No hay peleas pendientes{filterCurrentPista ? ` en Pista ${fight.pista || 1}` : ''}.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
