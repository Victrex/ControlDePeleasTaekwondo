import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../../contexts/SocketContext";
import { RotateCcw, Sparkles, Zap, Pause, SkipForward } from 'lucide-react';
import api from "../../utils/api";
import "./Scoreboard.css";
import peto from "../../../public/SVG/peto_white.svg";
import casco from "../../../public/SVG/casco_white.svg";
import punch from "../../../public/SVG/punch_white.svg";
import logo_ath from "../../../public/logo_ath.png";
const ACTION_LABELS = {
  punch_body: "Puño",
  kick_body: "Peto",
  kick_head: "Cabeza",
  spinning_kick_body: "Giro",
  spinning_kick_head: "Giro Cab.",
  gam_jeom: "Gam-jeom",
};

const ACTION_ICONS = {
  punch_body: <img src={punch} alt="Puño" />,
  kick_body: <img src={peto} alt="Peto" />,
  kick_head: <img src={casco} alt="Casco" />,
  spinning_kick_body: <RotateCcw size={14} />,
  spinning_kick_head: <Sparkles size={14} />,
};

function formatTime(ms) {
  const clamped = Math.max(0, ms);
  if (clamped > 0 && clamped <= 10000) {
    const sec = Math.floor(clamped / 1000);
    const millis = Math.floor((clamped % 1000) / 10);
    return `${sec}.${millis.toString().padStart(2, "0")}`;
  }
  const totalSec = Math.max(0, Math.ceil(clamped / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function Scoreboard() {
  const { fightId } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();

  const [fight, setFight] = useState(null);
  const [config, setConfig] = useState(null);
  const [timer, setTimer] = useState({
    remainingMs: 0,
    round: 1,
    running: false,
  });
  const [scoreRed, setScoreRed] = useState(0);
  const [scoreBlue, setScoreBlue] = useState(0);
  const [gamJeomRed, setGamJeomRed] = useState(0);
  const [gamJeomBlue, setGamJeomBlue] = useState(0);
  const [round, setRound] = useState(1);
  const [lastAction, setLastAction] = useState(null);
  const [roundEnded, setRoundEnded] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [roundWinners, setRoundWinners] = useState({});
  const [fightResult, setFightResult] = useState(null);
  // Judge vote visualization
  const [judgeVote, setJudgeVote] = useState(null); // {team, action, judgeCount, needed, awarded}
  // Rest timer
  const [restMs, setRestMs] = useState(0);
  const [showingRest, setShowingRest] = useState(false);
  // Kye Shie
  const [kyeShieMs, setKyeShieMs] = useState(60000);
  const [kyeShieActive, setKyeShieActive] = useState(false);

  const [currentFightModal, setCurrentFightModal] = useState(null); // null | { message, fightId }

  const fightIdRef = useRef(fightId);
  fightIdRef.current = fightId;
  const configRef = useRef(config);
  configRef.current = config;
  const judgeVoteTimer = useRef(null);
  const roundEndTimerRef = useRef(null);
  const roundResultTimerRef = useRef(null);
  const restIntervalRef = useRef(null);

  function playSound(src) {
    const audio = new Audio(src);
    audio.play().catch((e) => console.warn('Audio error:', e));
  }

  // Load initial state
  useEffect(() => {
    if (!fightId) return;

    api
      .getScoringState(fightId)
      .then((data) => {
        setFight(data.fight);
        setConfig(data.config);
        setScoreRed(data.fight.score_red || 0);
        setScoreBlue(data.fight.score_blue || 0);
        setGamJeomRed(data.fight.gam_jeom_red || 0);
        setGamJeomBlue(data.fight.gam_jeom_blue || 0);
        setRound(data.timer.round);
        setTimer(data.timer);
        setRoundWinners({
          1: data.fight.round_1_winner,
          2: data.fight.round_2_winner,
          3: data.fight.round_3_winner,
        });
        if (data.fight.final_winner) {
          setFightResult({ winner: data.fight.final_winner });
        }
      })
      .catch((err) => console.error("Error loading scoring state:", err));
  }, [fightId]);

  // Socket events
  useEffect(() => {
    if (!socket) return;

    socket.emit("join-scoreboard", { fightId });

    const handleScoreAwarded = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setScoreRed(data.scoreRed);
      setScoreBlue(data.scoreBlue);
      setLastAction({
        team: data.team,
        action: data.action,
        points: data.points,
      });
      setTimeout(() => setLastAction(null), 2000);
      // Show awarded vote as green
      showJudgeVote(data.team, data.action, -1, -1, true);
    };

    const handleScoreEdited = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setScoreRed(data.scoreRed);
      setScoreBlue(data.scoreBlue);
    };

    const handleGamJeom = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setGamJeomRed(data.gamJeomRed);
      setGamJeomBlue(data.gamJeomBlue);
      setScoreRed(data.scoreRed);
      setScoreBlue(data.scoreBlue);
      playSound('/gamyeom.mp3');
    };

    const handleTimerTick = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setTimer({
        remainingMs: data.remainingMs,
        round: data.round,
        running: data.running,
      });
      setRound(data.round);
    };

    const handleTimerStarted = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setTimer((prev) => ({
        ...prev,
        running: true,
        remainingMs: data.remainingMs,
        round: data.round,
      }));
      setRoundEnded(false);
      setRoundResult(null);
      setShowingRest(false);
      if (roundEndTimerRef.current) {
        clearTimeout(roundEndTimerRef.current);
        roundEndTimerRef.current = null;
      }
      if (roundResultTimerRef.current) {
        clearTimeout(roundResultTimerRef.current);
        roundResultTimerRef.current = null;
      }
      if (restIntervalRef.current) {
        clearInterval(restIntervalRef.current);
        restIntervalRef.current = null;
      }
    };

    const handleTimerStopped = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setTimer((prev) => ({
        ...prev,
        running: false,
        remainingMs: data.remainingMs,
      }));
    };

    const handleRoundEnded = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      playSound('/bell.mp3');
      setRoundEnded(true);
      setGamJeomRed(0);
      setGamJeomBlue(0);
      setTimer((prev) => ({
        ...prev,
        running: false,
        remainingMs: 0,
      }));
      setShowingRest(false);
      setRound(data.round);
      setRoundResult({
        round: data.round,
        winner: data.winner || null,
        reason: data.reason || null,
        scoreRed: data.scoreRed,
        scoreBlue: data.scoreBlue,
      });

      // After 5 seconds, dismiss overlay and start rest countdown
      if (roundEndTimerRef.current) clearTimeout(roundEndTimerRef.current);
      if (roundResultTimerRef.current) clearTimeout(roundResultTimerRef.current);
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);

      roundResultTimerRef.current = setTimeout(() => {
        setRoundResult(null);
      }, 5000);

      roundEndTimerRef.current = setTimeout(() => {
        setRoundEnded(false);
        // Start rest countdown
        const restSeconds = configRef.current?.rest_time_seconds || 60;
        let remaining = restSeconds * 1000;
        setRestMs(remaining);
        setShowingRest(true);
        const startTime = Date.now();
        restIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          remaining = Math.max(0, restSeconds * 1000 - elapsed);
          setRestMs(remaining);
          if (remaining <= 0) {
            clearInterval(restIntervalRef.current);
            restIntervalRef.current = null;
            setShowingRest(false);
          }
        }, 50);
      }, 5000);
    };

    const handleFightUpdated = (data) => {
      if (String(data.id) !== String(fightIdRef.current)) return;
      setFight(data);
      setScoreRed(data.score_red ?? 0);
      setScoreBlue(data.score_blue ?? 0);
      setGamJeomRed(data.gam_jeom_red ?? 0);
      setGamJeomBlue(data.gam_jeom_blue ?? 0);
      setRoundWinners({
        1: data.round_1_winner,
        2: data.round_2_winner,
        3: data.round_3_winner,
      });
      // Sync fight winner overlay — clear it if final_winner was removed
      setFightResult(data.final_winner ? { winner: data.final_winner } : null);
    };

    // Judge vote visualization
    const handleJudgeVoted = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      showJudgeVote(
        data.team,
        data.action,
        data.judgeCount,
        data.needed,
        false,
      );
    };

    const handleFightResultRegistered = (data) => {
      if (String(data.id) !== String(fightIdRef.current)) return;
      playSound('/bell.mp3');
      setFightResult({ winner: data.final_winner });
    };

    const handleKyeShieStarted = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setKyeShieActive(true);
      setKyeShieMs(data.remainingMs);
    };

    const handleKyeShieTick = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setKyeShieMs(data.remainingMs);
    };

    const handleKyeShieEnded = (data) => {
      if (String(data.fightId) !== String(fightIdRef.current)) return;
      setKyeShieActive(false);
      setKyeShieMs(60000);
    };

    socket.on("score:awarded", handleScoreAwarded);
    socket.on("score:edited", handleScoreEdited);
    socket.on("gam_jeom:added", handleGamJeom);
    socket.on("timer:tick", handleTimerTick);
    socket.on("timer:started", handleTimerStarted);
    socket.on("timer:stopped", handleTimerStopped);
    socket.on("round:ended", handleRoundEnded);
    socket.on("fight:updated", handleFightUpdated);
    socket.on("judge:voted", handleJudgeVoted);
    socket.on("kye_shie:started", handleKyeShieStarted);
    socket.on("kye_shie:tick", handleKyeShieTick);
    socket.on("kye_shie:ended", handleKyeShieEnded);
    socket.on("fight:result-registered", handleFightResultRegistered);

    return () => {
      socket.off("score:awarded", handleScoreAwarded);
      socket.off("score:edited", handleScoreEdited);
      socket.off("gam_jeom:added", handleGamJeom);
      socket.off("timer:tick", handleTimerTick);
      socket.off("timer:started", handleTimerStarted);
      socket.off("timer:stopped", handleTimerStopped);
      socket.off("round:ended", handleRoundEnded);
      socket.off("fight:updated", handleFightUpdated);
      socket.off("judge:voted", handleJudgeVoted);
      socket.off("kye_shie:started", handleKyeShieStarted);
      socket.off("kye_shie:tick", handleKyeShieTick);
      socket.off("kye_shie:ended", handleKyeShieEnded);
      socket.off("fight:result-registered", handleFightResultRegistered);
      if (roundEndTimerRef.current) clearTimeout(roundEndTimerRef.current);
      if (roundResultTimerRef.current) clearTimeout(roundResultTimerRef.current);
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, [socket, fightId]);

  const roundResultReasonLabel =
    roundResult?.reason === "gap_point"
      ? "Victoria por diferencia de puntos"
      : roundResult?.reason === "gam_jeom_limit"
        ? `Victoria punitiva (Gam-jeom R${roundResult.round})`
        : "";

  async function goToCurrentFightOnPista() {
    if (!fight) return;
    try {
      const current = await api.getCurrentFight(fight.tournament_id, fight.pista);
      if (!current || !current.id) {
        setCurrentFightModal({ message: `No hay pelea actual configurada en Pista ${fight.pista || 1}.`, fightId: null });
        return;
      }
      if (String(current.id) === String(fightId)) {
        setCurrentFightModal({ message: `Ya estás en la pelea actual de Pista ${fight.pista || 1}.`, fightId: null });
        return;
      }
      setCurrentFightModal({
        message: `¿Ir a la pelea actual de Pista ${fight.pista || 1}?\n${current.competitor_red || '?'} vs ${current.competitor_blue || '?'}`,
        fightId: current.id,
      });
    } catch (e) {
      console.error("Error buscando pelea actual:", e);
      setCurrentFightModal({ message: `Error al buscar la pelea actual: ${e.message}`, fightId: null });
    }
  }

  function showJudgeVote(team, action, judgeCount, needed, awarded) {
    if (judgeVoteTimer.current) clearTimeout(judgeVoteTimer.current);
    setJudgeVote({ team, action, judgeCount, needed, awarded });
    judgeVoteTimer.current = setTimeout(
      () => setJudgeVote(null),
      awarded ? 2500 : 1800,
    );
  }

  if (!fight) {
    return (
      <div className="scoreboard-loading">
        <div className="spinner"></div>
        <p>Cargando combate...</p>
      </div>
    );
  }

  const numRounds = config?.num_rounds || 3;
  const bracketRoundLabel = fight.bracket_round || "";
  const matchLabel = fight.fight_number ? `MATCH ${fight.fight_number}` : "";
  const timerLow = timer.remainingMs <= 30000 && timer.remainingMs > 0;
  const timerCritical = timer.remainingMs <= 10000 && timer.remainingMs > 0;

  return (
    <div className="scoreboard">
      {/* Fight winner overlay — permanent, highest priority */}
      {fightResult?.winner && (
        <div className={`scoreboard-winner-overlay winner-${fightResult.winner}`} style={{ zIndex: 2000 }}>
          <div className="winner-content">
            <h1>GANADOR DEL COMBATE</h1>
            <h2>
              {fightResult.winner === "red"
                ? fight.competitor_red
                : fight.competitor_blue}
            </h2>
            <p>Victoria por rounds</p>
          </div>
        </div>
      )}

      {/* Round winner overlay — 5 seconds */}
      {!fightResult?.winner && roundResult?.winner && (
        <div className={`scoreboard-winner-overlay winner-${roundResult.winner}`}>
          <div className="winner-content">
            <h1>GANADOR DEL ROUND</h1>
            <h2 className={`winner-name-${roundResult.winner}`}>
              {roundResult.winner === "red"
                ? fight.competitor_red
                : fight.competitor_blue}
            </h2>
            <p>{roundResultReasonLabel}</p>
            <div className="winner-score">
              <span className="ws-blue">{roundResult.scoreBlue}</span>
              <span className="ws-separator"> — </span>
              <span className="ws-red">{roundResult.scoreRed}</span>
            </div>
          </div>
        </div>
      )}

      {/* Round end overlay (tie — no winner) */}
      {!fightResult?.winner && roundEnded && !roundResult?.winner && roundResult && (
        <div className="scoreboard-round-overlay">
          <div className="round-end-content">
            <h2>FIN DEL ROUND {roundResult.round}</h2>
            <div className="round-end-scores">
              <span className="res-blue">{roundResult.scoreBlue}</span>
              <span className="res-sep"> — </span>
              <span className="res-red">{roundResult.scoreRed}</span>
            </div>
          </div>
        </div>
      )}

      {/* Kye Shie overlay */}
      {!fightResult?.winner && kyeShieActive && !roundResult?.winner && (
        <div className="scoreboard-kye-shie-overlay">
          <div className="kye-shie-content">
            <div className="kye-shie-label">KYE-SHI</div>
            <div className="kye-shie-sublabel">Tiempo de descuento</div>
            <div
              className={`kye-shie-timer ${kyeShieMs <= 10000 && kyeShieMs > 0 ? "kye-shie-critical" : ""}`}
            >
              {formatTime(kyeShieMs)}
            </div>
          </div>
        </div>
      )}

      {/* Rest countdown overlay */}
      {!fightResult?.winner && showingRest && !roundResult?.winner && !roundEnded && (
        <div className="scoreboard-rest-overlay">
          <div className="rest-content">
            <h2>DESCANSO</h2>
            <div
              className={`rest-timer ${restMs <= 10000 && restMs > 0 ? "rest-timer-critical" : ""}`}
            >
              {formatTime(restMs)}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="scoreboard-header">
        <div>
          <img src={logo_ath} alt="ATHH Logo" className="sb-logo" />
        </div>
        <div className="sb-connection">
          <span
            className={`conn-dot ${connected ? "conn-ok" : "conn-off"}`}
          ></span>
          <h1 className="sb-title">ASOCIACIÓN DE TAEKWONDO HONDURAS</h1>
        </div>
        <div className="sb-header-right">
          {ACTION_ICONS?.["kick_head"]}
          {ACTION_ICONS?.["kick_body"]}
        </div>
      </div>

      {/* Main scoreboard area */}
      <div className="scoreboard-main">
        {/* Red side */}
        <div className="sb-side sb-red">
          <div className="sb-competitor-info">
            <div className="sb-name">{fight.competitor_red}</div>
            <div className="sb-academy">{fight.academy_red || ""}</div>
          </div>
          <div className="sb-score-area">
            <div
              className={`sb-score ${lastAction?.team === "red" ? "sb-score-flash" : ""}`}
            >
              {scoreRed}
            </div>
          </div>
          <div className="sb-bottom-info">
            <div className="sb-gamjeom">
              {Array.from({ length: gamJeomRed }, (_, i) => (
                <span key={i} className="gj-mark">
                  ●
                </span>
              ))}
              {gamJeomRed > 0 && <span className="gj-count">{gamJeomRed}</span>}
            </div>
            <div className="sb-rounds-won">
              {Array.from({ length: numRounds }, (_, i) => i + 1).map((r) => (
                <span
                  key={r}
                  className={`sb-round-dot ${roundWinners[r] === "red" ? "sb-dot-won" : ""}`}
                />
              ))}
            </div>
          </div>
          {/* Judge vote indicator - red side */}
          {judgeVote && judgeVote.team === "red" && (
            <div
              className={`sb-judge-vote ${judgeVote.awarded ? "sb-vote-awarded" : "sb-vote-pending"}`}
            >
              <span className="sb-vote-icon">
                {ACTION_ICONS[judgeVote.action] || <Zap size={14} />}
              </span>
              {judgeVote.awarded ? (
                <span className="sb-vote-plus">+</span>
              ) : (
                <span className="sb-vote-count">{judgeVote.judgeCount}</span>
              )}
            </div>
          )}
        </div>
        {/* Center timer */}
        <div className="sb-center">
          <div className="sb-center-items">
            <div className="sb-category">
              {fight.bracket_round && (
                <span className="sb-phase">{bracketRoundLabel}</span>
              )}
              {matchLabel && <span className="sb-match">{matchLabel}</span>}
            </div>
            <div
              className={`sb-timer ${timer.running ? "timer-running" : "timer-stopped"} ${timerCritical ? "timer-critical" : timerLow ? "timer-low" : ""}`}
            >
              {formatTime(timer.remainingMs)}
            </div>
            {/* Last action flash */}
            {lastAction && (
              <div className={`sb-last-action action-${lastAction.team}`}>
                +{lastAction.points}{" "}
                {ACTION_LABELS[lastAction.action] || lastAction.action}
              </div>
            )}

            <div className="sb-round-info">
              <span>ROUND</span>
              <span>
                {round}
                {config ? ` / ${numRounds}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Blue side */}
        <div className="sb-side sb-blue">
          <div className="sb-competitor-info">
            <div className="sb-name">{fight.competitor_blue}</div>
            <div className="sb-academy">{fight.academy_blue || ""}</div>
          </div>
          <div className="sb-score-area">
            <div
              className={`sb-score ${lastAction?.team === "blue" ? "sb-score-flash" : ""}`}
            >
              {scoreBlue}
            </div>
          </div>
          <div className="sb-bottom-info">
            <div className="sb-gamjeom">
              {Array.from({ length: gamJeomBlue }, (_, i) => (
                <span key={i} className="gj-mark">
                  ●
                </span>
              ))}
              {gamJeomBlue > 0 && (
                <span className="gj-count">{gamJeomBlue}</span>
              )}
            </div>
            <div className="sb-rounds-won">
              {Array.from({ length: numRounds }, (_, i) => i + 1).map((r) => (
                <span
                  key={r}
                  className={`sb-round-dot ${roundWinners[r] === "blue" ? "sb-dot-won" : ""}`}
                />
              ))}
            </div>
          </div>
          {/* Judge vote indicator - blue side */}
          {judgeVote && judgeVote.team === "blue" && (
            <div
              className={`sb-judge-vote ${judgeVote.awarded ? "sb-vote-awarded" : "sb-vote-pending"}`}
            >
              <span className="sb-vote-icon">
                {ACTION_ICONS[judgeVote.action] || <Zap size={14} />}
              </span>
              {judgeVote.awarded ? (
                <span className="sb-vote-plus">+</span>
              ) : (
                <span className="sb-vote-count">{judgeVote.judgeCount}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: ir a pelea actual */}
      {currentFightModal && (
        <div
          className="sb-modal-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}
          onClick={() => setCurrentFightModal(null)}
        >
          <div
            className="sb-modal-box"
            style={{ background: '#1a1a2e', border: '2px solid #fff', borderRadius: 12, padding: '2rem 2.5rem', minWidth: 320, maxWidth: 480, textAlign: 'center', color: '#fff' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: '1.15rem', marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>{currentFightModal.message}</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              {currentFightModal.fightId && (
                <button
                  style={{ padding: '0.6rem 1.4rem', background: '#00c853', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
                  onClick={() => { setCurrentFightModal(null); navigate(`/scoreboard/${currentFightModal.fightId}`); }}
                >
                  Ir
                </button>
              )}
              <button
                style={{ padding: '0.6rem 1.4rem', background: '#555', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
                onClick={() => setCurrentFightModal(null)}
              >
                {currentFightModal.fightId ? 'Cancelar' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="scoreboard-footer" style={{ zIndex: 9000 }}>
        <span>Pista {fight.pista || 1}</span>
        <span>{timer.running ? "● EN VIVO" : <><Pause size={11} /> PAUSADO</>}</span>
        <button className="sb-next-fight-btn" onClick={goToCurrentFightOnPista}>
          <SkipForward size={14} /> Ir a pelea actual
        </button>
      </div>
    </div>
  );
}
