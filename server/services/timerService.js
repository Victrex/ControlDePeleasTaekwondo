import db from '../config/database.js';
import { ScoringConfig } from '../models/ScoringConfig.js';
import { getIO } from '../config/socket.js';
import { FightService } from './fightService.js';

// In-memory timer state: Map<fightId, { interval, remainingMs, round, running }>
const timers = new Map();

// Kye Shie state: Map<fightId, { interval, remainingMs, active }>
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

export const timerService = {
  getState(fightId) {
    return timers.get(fightId) || null;
  },

  start(fightId) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    let state = timers.get(fightId);

    if (!state) {
      // First start — initialize from fight data or config defaults
      const remainingMs = fight.timer_remaining_ms || config.round_time_seconds * 1000;
      state = {
        interval: null,
        remainingMs,
        round: fight.current_round || 1,
        running: false,
        fightId,
        tournamentId: fight.tournament_id
      };
      timers.set(fightId, state);
    }

    if (state.running) return state;

    state.running = true;
    state.lastTick = Date.now();

    // Persist timer_running state
    db.prepare('UPDATE fights SET timer_running = 1 WHERE id = ?').run(fightId);

    const io = getIO();

    const tick = () => {
      const now = Date.now();
      const elapsed = now - state.lastTick;
      state.lastTick = now;
      state.remainingMs = Math.max(0, state.remainingMs - elapsed);

      // Persist remaining time every tick
      db.prepare('UPDATE fights SET timer_remaining_ms = ? WHERE id = ?').run(state.remainingMs, fightId);

      io.emit('timer:tick', {
        fightId,
        remainingMs: state.remainingMs,
        round: state.round,
        running: true
      });

      // Switch to fast interval when under 10 seconds
      if (state.remainingMs <= 10000 && state.tickRate !== 50) {
        state.tickRate = 50;
        clearInterval(state.interval);
        state.interval = setInterval(tick, 50);
      }

      if (state.remainingMs <= 0) {
        this.endRound(fightId);
      }
    };

    state.tickRate = state.remainingMs <= 10000 ? 50 : 1000;
    state.interval = setInterval(tick, state.tickRate);

    io.emit('timer:started', { fightId, remainingMs: state.remainingMs, round: state.round });
    return state;
  },

  stop(fightId) {
    const state = timers.get(fightId);
    if (!state) return null;

    if (state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
    state.running = false;

    db.prepare('UPDATE fights SET timer_running = 0, timer_remaining_ms = ? WHERE id = ?').run(state.remainingMs, fightId);

    const io = getIO();
    io.emit('timer:stopped', { fightId, remainingMs: state.remainingMs, round: state.round });
    return state;
  },

  reset(fightId, seconds) {
    let state = timers.get(fightId);
    if (state && state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }

    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    const ms = (seconds || config.round_time_seconds) * 1000;

    if (!state) {
      state = {
        interval: null,
        remainingMs: ms,
        round: fight.current_round || 1,
        running: false,
        fightId,
        tournamentId: fight.tournament_id
      };
      timers.set(fightId, state);
    } else {
      state.remainingMs = ms;
      state.running = false;
    }

    db.prepare('UPDATE fights SET timer_running = 0, timer_remaining_ms = ? WHERE id = ?').run(ms, fightId);

    const io = getIO();
    io.emit('timer:tick', { fightId, remainingMs: ms, round: state.round, running: false });
    return state;
  },

  endRound(fightId, options = {}) {
    let state = timers.get(fightId);

    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) return;

    if (!state) {
      state = {
        interval: null,
        remainingMs: fight.timer_remaining_ms || 0,
        round: fight.current_round || 1,
        running: false,
        fightId,
        tournamentId: fight.tournament_id
      };
      timers.set(fightId, state);
    }

    // Stop the interval
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
    state.running = false;
    state.remainingMs = 0;

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    const round = state.round;
    let { roundWinner = null, reason = null } = options;

    db.prepare('UPDATE fights SET timer_running = 0, timer_remaining_ms = 0 WHERE id = ?').run(fightId);

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

    if (roundWinner) {
      const roundWinnerColumn = `round_${round}_winner`;
      const roundReasonColumn = `round_${round}_reason`;
      db.prepare(`UPDATE fights SET ${roundWinnerColumn} = ?, ${roundReasonColumn} = ? WHERE id = ?`).run(roundWinner, reason, fightId);
    } else if (reason === 'tie_unresolved') {
      const roundReasonColumn = `round_${round}_reason`;
      db.prepare(`UPDATE fights SET ${roundReasonColumn} = ? WHERE id = ?`).run(reason, fightId);
    }

    const roundFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

    const io = getIO();
    io.emit('round:ended', {
      fightId,
      round,
      scoreRed: roundFight.score_red,
      scoreBlue: roundFight.score_blue,
      winner: roundWinner,
      reason
    });

    // Reset scores and gam-jeoms to 0 for the next round (per-round counters)
    db.prepare('UPDATE fights SET score_red = 0, score_blue = 0, gam_jeom_red = 0, gam_jeom_blue = 0 WHERE id = ?').run(fightId);
    const resetFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    io.emit('fight:updated', resetFight);

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
        // Save final_winner but keep status='current' so completeAndAdvance validation passes
        db.prepare('UPDATE fights SET final_winner = ? WHERE id = ?').run(finalWinner, fightId);
        const finalFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
        io.emit('fight:result-registered', finalFight);
        io.emit('fight:updated', finalFight);
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
      db.prepare('UPDATE fights SET current_round = ?, timer_remaining_ms = ? WHERE id = ?').run(state.round, state.remainingMs, fightId);

      // Notify clients of the new round so scoreboard auto-advances
      io.emit('timer:tick', {
        fightId,
        remainingMs: state.remainingMs,
        round: state.round,
        running: false
      });
    }
    // If all rounds done, the admin decides manually (no auto-end)
  },

  advanceRound(fightId) {
    const state = timers.get(fightId);
    if (!state) return null;

    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) return null;

    const config = ScoringConfig.getByTournament(fight.tournament_id);

    if (state.running) this.stop(fightId);

    state.round = Math.min(state.round + 1, config.num_rounds);
    state.remainingMs = config.round_time_seconds * 1000;

    db.prepare('UPDATE fights SET current_round = ?, timer_remaining_ms = ? WHERE id = ?').run(state.round, state.remainingMs, fightId);

    const io = getIO();
    io.emit('timer:tick', { fightId, remainingMs: state.remainingMs, round: state.round, running: false });
    return state;
  },

  setRound(fightId, round) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    if (round < 1 || round > config.num_rounds) throw new Error('Round inválido');

    let state = timers.get(fightId);
    if (state && state.running) this.stop(fightId);

    const ms = config.round_time_seconds * 1000;

    if (!state) {
      state = {
        interval: null,
        remainingMs: ms,
        round,
        running: false,
        fightId,
        tournamentId: fight.tournament_id
      };
      timers.set(fightId, state);
    } else {
      state.round = round;
      state.remainingMs = ms;
      state.running = false;
    }

    // Delete all fight_scores (including gam-jeoms) for this round and reset totals
    db.prepare('DELETE FROM fight_scores WHERE fight_id = ? AND round = ?').run(fightId, round);
    db.prepare('DELETE FROM judge_inputs WHERE fight_id = ? AND round = ?').run(fightId, round);
    db.prepare('UPDATE fights SET current_round = ?, timer_remaining_ms = ?, timer_running = 0, score_red = 0, score_blue = 0, gam_jeom_red = 0, gam_jeom_blue = 0 WHERE id = ?').run(round, ms, fightId);

    // Clear round winners for this round and all subsequent rounds, plus the fight winner
    const io = getIO();
    const setClauses = [];
    for (let r = round; r <= config.num_rounds; r++) {
      setClauses.push(`round_${r}_winner = NULL`);
    }
    setClauses.push('final_winner = NULL');
    db.prepare(`UPDATE fights SET ${setClauses.join(', ')} WHERE id = ?`).run(fightId);
    const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    io.emit('fight:updated', updatedFight);

    io.emit('timer:tick', { fightId, remainingMs: ms, round, running: false });
    return state;
  },

  setTime(fightId, ms) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    let state = timers.get(fightId);
    if (state && state.running) this.stop(fightId);

    if (!state) {
      state = {
        interval: null,
        remainingMs: ms,
        round: fight.current_round || 1,
        running: false,
        fightId,
        tournamentId: fight.tournament_id
      };
      timers.set(fightId, state);
    } else {
      state.remainingMs = ms;
      state.running = false;
    }

    db.prepare('UPDATE fights SET timer_remaining_ms = ?, timer_running = 0 WHERE id = ?').run(ms, fightId);

    const io = getIO();
    io.emit('timer:tick', { fightId, remainingMs: ms, round: state.round, running: false });
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
    if (existing && existing.interval) {
      clearInterval(existing.interval);
    }

    const io = getIO();
    let remainingMs = KYE_SHIE_DURATION_MS;
    const ksState = { interval: null, remainingMs, active: true };
    kyeShieTimers.set(fightId, ksState);

    io.emit('kye_shie:started', { fightId, remainingMs });

    const startTime = Date.now();
    ksState.interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      ksState.remainingMs = Math.max(0, KYE_SHIE_DURATION_MS - elapsed);

      io.emit('kye_shie:tick', { fightId, remainingMs: ksState.remainingMs });

      if (ksState.remainingMs <= 0) {
        clearInterval(ksState.interval);
        ksState.interval = null;
        ksState.active = false;
        kyeShieTimers.delete(fightId);
        io.emit('kye_shie:ended', { fightId });
      }
    }, 200);

    return ksState;
  },

  cancelKyeShie(fightId) {
    const ksState = kyeShieTimers.get(fightId);
    if (!ksState) return;

    if (ksState.interval) {
      clearInterval(ksState.interval);
      ksState.interval = null;
    }
    ksState.active = false;
    kyeShieTimers.delete(fightId);

    const io = getIO();
    io.emit('kye_shie:ended', { fightId });
  },

  getKyeShieState(fightId) {
    return kyeShieTimers.get(fightId) || null;
  },

  cleanup(fightId) {
    const state = timers.get(fightId);
    if (state && state.interval) {
      clearInterval(state.interval);
    }
    timers.delete(fightId);

    const ksState = kyeShieTimers.get(fightId);
    if (ksState && ksState.interval) {
      clearInterval(ksState.interval);
    }
    kyeShieTimers.delete(fightId);
  }
};
