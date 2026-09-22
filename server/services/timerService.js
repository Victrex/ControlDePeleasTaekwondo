import db from '../config/database.js';
import { ScoringConfig } from '../models/ScoringConfig.js';
import { emitTo, emitEvents } from '../config/socket.js';
import { FightService } from './fightService.js';

/**
 * Modelo basado en timestamp:
 *  - El servidor guarda startedAt + durationMs y programa UN setTimeout para el fin del round.
 *  - No hay ticks: los clientes calculan remaining = durationMs - (now - startedAt).
 *  - SQLite sólo se escribe en cambios de estado (start/stop/reset/round/fin).
 *
 * In-memory timer state: Map<fightId, TimerState>
 * TimerState = { fightId, tournamentId, round, running, remainingMs, startedAt, durationMs, endTimeout }
 */
const timers = new Map();

// Kye Shie state: Map<fightId, { startedAt, durationMs, endTimeout }>
const kyeShieTimers = new Map();

const KYE_SHIE_DURATION_MS = 60000; // 1 minute per regulations

function resolveTieForRound(fightId, round, config) {
  // Phase 1: Points without gam-jeom
  const redPure = db.prepare(`SELECT COALESCE(SUM(points), 0) as t FROM fight_scores WHERE fight_id = ? AND round = ? AND team = 'red' AND action != 'gam_jeom'`).get(fightId, round).t;
  const bluePure = db.prepare(`SELECT COALESCE(SUM(points), 0) as t FROM fight_scores WHERE fight_id = ? AND round = ? AND team = 'blue' AND action != 'gam_jeom'`).get(fightId, round).t;
  if (redPure !== bluePure) {
    return { winner: redPure > bluePure ? 'red' : 'blue', reason: 'tiebreak_phase1' };
  }

  // Phase 2: kick_head count
  const redHeads = db.prepare(`SELECT COUNT(*) as c FROM fight_scores WHERE fight_id = ? AND round = ? AND team = 'red' AND action = 'kick_head'`).get(fightId, round).c;
  const blueHeads = db.prepare(`SELECT COUNT(*) as c FROM fight_scores WHERE fight_id = ? AND round = ? AND team = 'blue' AND action = 'kick_head'`).get(fightId, round).c;
  if (redHeads !== blueHeads) {
    return { winner: redHeads > blueHeads ? 'red' : 'blue', reason: 'tiebreak_phase2' };
  }

  // Phase 3: Missed vote points (judge_inputs with processed=2)
  const missed = db.prepare(`SELECT team, action FROM judge_inputs WHERE fight_id = ? AND round = ? AND processed = 2`).all(fightId, round);
  const sumMissed = (team) => missed
    .filter(i => i.team === team)
    .reduce((s, i) => s + (ScoringConfig.getPointsForAction(config, i.action) || 0), 0);
  const redMissed = sumMissed('red');
  const blueMissed = sumMissed('blue');
  if (redMissed !== blueMissed) {
    return { winner: redMissed > blueMissed ? 'red' : 'blue', reason: 'tiebreak_phase3' };
  }

  return null; // Genuine tie — admin decides
}

// Statements preparados (se reutilizan; evita recompilar SQL en cada operación)
const stmts = {
  getFight: db.prepare('SELECT * FROM fights WHERE id = ?'),
  setRunning: db.prepare('UPDATE fights SET timer_running = 1, timer_remaining_ms = ? WHERE id = ?'),
  setStopped: db.prepare('UPDATE fights SET timer_running = 0, timer_remaining_ms = ? WHERE id = ?'),
  setRoundAndTime: db.prepare('UPDATE fights SET current_round = ?, timer_remaining_ms = ?, timer_running = 0 WHERE id = ?'),
  resetRoundScores: db.prepare('UPDATE fights SET score_red = 0, score_blue = 0, gam_jeom_red = 0, gam_jeom_blue = 0 WHERE id = ?'),
  // final_winner se guarda manteniendo status='current' para que completeAndAdvance valide
  setFinalWinner: db.prepare('UPDATE fights SET final_winner = ? WHERE id = ?'),
  deleteRoundScores: db.prepare('DELETE FROM fight_scores WHERE fight_id = ? AND round = ?'),
  deleteRoundInputs: db.prepare('DELETE FROM judge_inputs WHERE fight_id = ? AND round = ?'),
  setRoundFull: db.prepare('UPDATE fights SET current_round = ?, timer_remaining_ms = ?, timer_running = 0, score_red = 0, score_blue = 0, gam_jeom_red = 0, gam_jeom_blue = 0 WHERE id = ?')
};

function computeRemaining(state) {
  if (!state) return 0;
  if (!state.running) return Math.max(0, state.remainingMs);
  return Math.max(0, state.durationMs - (Date.now() - state.startedAt));
}

function clearEndTimeout(state) {
  if (state?.endTimeout) {
    clearTimeout(state.endTimeout);
    state.endTimeout = null;
  }
}

function createState(fight, remainingMs, round) {
  return {
    fightId: fight.id,
    tournamentId: fight.tournament_id,
    round: round ?? (fight.current_round || 1),
    running: false,
    remainingMs,
    startedAt: null,
    durationMs: remainingMs,
    endTimeout: null
  };
}

// Payload común para todos los eventos de timer (clientes calculan localmente)
function timerPayload(state) {
  return {
    fightId: state.fightId,
    round: state.round,
    running: state.running,
    remainingMs: computeRemaining(state),
    startedAt: state.running ? state.startedAt : null,
    durationMs: state.running ? state.durationMs : null,
    serverNow: Date.now()
  };
}

function emitTimer(event, state) {
  emitTo.fight(state.fightId, event, timerPayload(state));
}

export const timerService = {
  getState(fightId) {
    const state = timers.get(fightId);
    if (!state) return null;
    return {
      fightId: state.fightId,
      round: state.round,
      running: state.running,
      remainingMs: computeRemaining(state),
      startedAt: state.running ? state.startedAt : null,
      durationMs: state.running ? state.durationMs : null
    };
  },

  // Payload serializable para GET /scoring/:id/state
  getPublicState(fightId, fight, config) {
    const state = this.getState(fightId);
    if (state) {
      return { ...state, serverNow: Date.now() };
    }
    return {
      fightId,
      remainingMs: fight.timer_remaining_ms || config.round_time_seconds * 1000,
      round: fight.current_round || 1,
      running: false,
      startedAt: null,
      durationMs: null,
      serverNow: Date.now()
    };
  },

  start(fightId) {
    const fight = stmts.getFight.get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    let state = timers.get(fightId);

    if (!state) {
      const remainingMs = fight.timer_remaining_ms || config.round_time_seconds * 1000;
      state = createState(fight, remainingMs, fight.current_round || 1);
      timers.set(fightId, state);
    }

    if (state.running) return state;
    if (state.remainingMs <= 0) {
      // Round agotado: no hay nada que correr, sólo re-sincronizar clientes
      emitTimer('timer:sync', state);
      return state;
    }

    state.running = true;
    state.startedAt = Date.now();
    state.durationMs = state.remainingMs;

    // Única escritura al iniciar: estado + tiempo restante al momento de arrancar
    stmts.setRunning.run(state.remainingMs, fightId);

    clearEndTimeout(state);
    state.endTimeout = setTimeout(() => {
      state.endTimeout = null;
      try {
        this.endRound(fightId);
      } catch (error) {
        console.error('Error finalizando round automáticamente:', error.message);
      }
    }, state.durationMs);

    emitTimer('timer:started', state);
    return state;
  },

  stop(fightId) {
    const state = timers.get(fightId);
    if (!state) return null;

    if (state.running) {
      state.remainingMs = computeRemaining(state);
      state.running = false;
      state.startedAt = null;
      clearEndTimeout(state);
      stmts.setStopped.run(state.remainingMs, fightId);
    }

    emitTimer('timer:stopped', state);
    return state;
  },

  reset(fightId, seconds) {
    const fight = stmts.getFight.get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    const ms = (seconds || config.round_time_seconds) * 1000;

    let state = timers.get(fightId);
    if (!state) {
      state = createState(fight, ms);
      timers.set(fightId, state);
    } else {
      clearEndTimeout(state);
      state.remainingMs = ms;
      state.durationMs = ms;
      state.running = false;
      state.startedAt = null;
    }

    stmts.setStopped.run(ms, fightId);

    emitTimer('timer:sync', state);
    return state;
  },

  endRound(fightId, options = {}) {
    let state = timers.get(fightId);

    const fight = stmts.getFight.get(fightId);
    if (!fight) return;

    if (!state) {
      state = createState(fight, fight.timer_remaining_ms || 0);
      timers.set(fightId, state);
    }

    clearEndTimeout(state);
    state.running = false;
    state.startedAt = null;
    state.remainingMs = 0;

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    const round = state.round;
    let { roundWinner = null, reason = null } = options;

    // Auto-determine round winner by score when not explicitly provided (e.g. timer ran out)
    if (!roundWinner) {
      if (fight.score_red > fight.score_blue) roundWinner = 'red';
      else if (fight.score_blue > fight.score_red) roundWinner = 'blue';
      else {
        // Scores tied — run 3-phase tiebreaker
        const tieResult = resolveTieForRound(fightId, round, config);
        if (tieResult) {
          roundWinner = tieResult.winner;
          reason = tieResult.reason;
        } else {
          reason = 'tie_unresolved'; // Admin decides manually
        }
      }
    }

    // Una sola transacción: detener timer + ganador/razón del round + reset de contadores
    const roundFight = db.transaction(() => {
      stmts.setStopped.run(0, fightId);
      const roundReasonColumn = `round_${round}_reason`;
      if (roundWinner) {
        db.prepare(`UPDATE fights SET round_${round}_winner = ?, ${roundReasonColumn} = ? WHERE id = ?`).run(roundWinner, reason, fightId);
      } else if (reason === 'tie_unresolved') {
        db.prepare(`UPDATE fights SET ${roundReasonColumn} = ? WHERE id = ?`).run(reason, fightId);
      }
      const snapshot = stmts.getFight.get(fightId);
      stmts.resetRoundScores.run(fightId);
      return snapshot;
    })();

    emitTo.fight(fightId, 'round:ended', {
      fightId,
      round,
      scoreRed: roundFight.score_red,
      scoreBlue: roundFight.score_blue,
      winner: roundWinner,
      reason
    });

    const resetFight = stmts.getFight.get(fightId);
    emitEvents.fightUpdated(resetFight);

    // Check for fight winner — best of N (first to ceil(numRounds/2) rounds)
    if (roundWinner) {
      const needed = Math.ceil(config.num_rounds / 2);
      let redWins = 0, blueWins = 0;
      for (let r = 1; r <= config.num_rounds; r++) {
        const w = resetFight[`round_${r}_winner`];
        if (w === 'red') redWins++;
        if (w === 'blue') blueWins++;
      }
      if (redWins >= needed || blueWins >= needed) {
        const finalWinner = redWins >= needed ? 'red' : 'blue';
        stmts.setFinalWinner.run(finalWinner, fightId);
        const finalFight = stmts.getFight.get(fightId);
        emitEvents.resultRegistered(finalFight);
        emitEvents.fightUpdated(finalFight);
        // Complete fight, update bracket, and advance to next fight
        try {
          FightService.completeAndAdvance(fightId, state.tournamentId);
        } catch (err) {
          console.error('Error en completeAndAdvance desde timerService:', err.message);
        }
        return; // Fight is over — do not advance to next round
      }
    }

    // Check if there are more rounds
    if (state.round < config.num_rounds) {
      state.round += 1;
      state.remainingMs = config.round_time_seconds * 1000;
      state.durationMs = state.remainingMs;
      stmts.setRoundAndTime.run(state.round, state.remainingMs, fightId);

      // Notify clients of the new round so scoreboard auto-advances
      emitTimer('timer:sync', state);
    }
    // If all rounds done, the admin decides manually (no auto-end)
  },

  advanceRound(fightId) {
    const state = timers.get(fightId);
    if (!state) return null;

    const fight = stmts.getFight.get(fightId);
    if (!fight) return null;

    const config = ScoringConfig.getByTournament(fight.tournament_id);

    if (state.running) this.stop(fightId);

    state.round = Math.min(state.round + 1, config.num_rounds);
    state.remainingMs = config.round_time_seconds * 1000;
    state.durationMs = state.remainingMs;

    stmts.setRoundAndTime.run(state.round, state.remainingMs, fightId);

    emitTimer('timer:sync', state);
    return state;
  },

  setRound(fightId, round) {
    const fight = stmts.getFight.get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    if (round < 1 || round > config.num_rounds) throw new Error('Round inválido');

    let state = timers.get(fightId);
    if (state && state.running) this.stop(fightId);

    const ms = config.round_time_seconds * 1000;

    if (!state) {
      state = createState(fight, ms, round);
      timers.set(fightId, state);
    } else {
      state.round = round;
      state.remainingMs = ms;
      state.durationMs = ms;
      state.running = false;
      state.startedAt = null;
    }

    // Delete all fight_scores (including gam-jeoms) for this round, reset totals,
    // and clear round winners for this round and all subsequent rounds, plus the fight winner
    const setClauses = [];
    for (let r = round; r <= config.num_rounds; r++) {
      setClauses.push(`round_${r}_winner = NULL`);
    }
    setClauses.push('final_winner = NULL');

    db.transaction(() => {
      stmts.deleteRoundScores.run(fightId, round);
      stmts.deleteRoundInputs.run(fightId, round);
      stmts.setRoundFull.run(round, ms, fightId);
      db.prepare(`UPDATE fights SET ${setClauses.join(', ')} WHERE id = ?`).run(fightId);
    })();

    const updatedFight = stmts.getFight.get(fightId);
    emitEvents.fightUpdated(updatedFight);

    emitTimer('timer:sync', state);
    return state;
  },

  setTime(fightId, ms) {
    const fight = stmts.getFight.get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    let state = timers.get(fightId);
    if (state && state.running) this.stop(fightId);

    if (!state) {
      state = createState(fight, ms);
      timers.set(fightId, state);
    } else {
      state.remainingMs = ms;
      state.durationMs = ms;
      state.running = false;
      state.startedAt = null;
    }

    stmts.setStopped.run(ms, fightId);

    emitTimer('timer:sync', state);
    return state;
  },

  kyeShie(fightId) {
    // Stop the fight timer first
    const fightState = timers.get(fightId);
    if (fightState && fightState.running) {
      this.stop(fightId);
    }

    // Cancel any existing Kye Shie for this fight
    const existing = kyeShieTimers.get(fightId);
    if (existing?.endTimeout) clearTimeout(existing.endTimeout);

    const startedAt = Date.now();
    const ksState = { startedAt, durationMs: KYE_SHIE_DURATION_MS, endTimeout: null, active: true, remainingMs: KYE_SHIE_DURATION_MS };
    kyeShieTimers.set(fightId, ksState);

    emitTo.fight(fightId, 'kye_shie:started', {
      fightId,
      remainingMs: KYE_SHIE_DURATION_MS,
      startedAt,
      durationMs: KYE_SHIE_DURATION_MS,
      serverNow: startedAt
    });

    // Un único timeout en lugar de ticks cada 200ms
    ksState.endTimeout = setTimeout(() => {
      ksState.endTimeout = null;
      ksState.active = false;
      kyeShieTimers.delete(fightId);
      emitTo.fight(fightId, 'kye_shie:ended', { fightId });
    }, KYE_SHIE_DURATION_MS);

    return ksState;
  },

  cancelKyeShie(fightId) {
    const ksState = kyeShieTimers.get(fightId);
    if (!ksState) return;

    if (ksState.endTimeout) {
      clearTimeout(ksState.endTimeout);
      ksState.endTimeout = null;
    }
    ksState.active = false;
    kyeShieTimers.delete(fightId);

    emitTo.fight(fightId, 'kye_shie:ended', { fightId });
  },

  getKyeShieState(fightId) {
    const ks = kyeShieTimers.get(fightId);
    if (!ks) return null;
    return {
      active: true,
      startedAt: ks.startedAt,
      durationMs: ks.durationMs,
      remainingMs: Math.max(0, ks.durationMs - (Date.now() - ks.startedAt))
    };
  },

  cleanup(fightId) {
    const state = timers.get(fightId);
    clearEndTimeout(state);
    timers.delete(fightId);

    const ksState = kyeShieTimers.get(fightId);
    if (ksState?.endTimeout) clearTimeout(ksState.endTimeout);
    kyeShieTimers.delete(fightId);
  }
};
