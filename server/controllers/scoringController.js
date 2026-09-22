import db from '../config/database.js';
import { scoringService } from '../services/scoringService.js';
import { timerService } from '../services/timerService.js';
import { ScoringConfig } from '../models/ScoringConfig.js';
import { Score } from '../models/Score.js';
import { emitEvents } from '../config/socket.js';

export const scoringController = {
  // Timer controls
  startTimer(req, res) {
    try {
      const state = timerService.start(parseInt(req.params.fightId));
      res.json({ success: true, remainingMs: state.remainingMs, round: state.round });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  stopTimer(req, res) {
    try {
      const state = timerService.stop(parseInt(req.params.fightId));
      if (!state) return res.status(404).json({ error: 'Timer no encontrado' });
      res.json({ success: true, remainingMs: state.remainingMs, round: state.round });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  resetTimer(req, res) {
    try {
      const { seconds } = req.body;
      const state = timerService.reset(parseInt(req.params.fightId), seconds);
      res.json({ success: true, remainingMs: state.remainingMs, round: state.round });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Kye Shie (1-minute medical timeout)
  startKyeShie(req, res) {
    try {
      const state = timerService.kyeShie(parseInt(req.params.fightId));
      res.json({ success: true, remainingMs: state.remainingMs });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  cancelKyeShie(req, res) {
    try {
      timerService.cancelKyeShie(parseInt(req.params.fightId));
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Gam-jeom
  addGamJeom(req, res) {
    try {
      const { team } = req.body;
      if (!['red', 'blue'].includes(team)) return res.status(400).json({ error: 'Team inválido' });
      const fight = scoringService.addGamJeom(parseInt(req.params.fightId), team);
      res.json({ success: true, fight });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  removeGamJeom(req, res) {
    try {
      const { team } = req.body;
      if (!['red', 'blue'].includes(team)) return res.status(400).json({ error: 'Team inválido' });
      const fight = scoringService.removeGamJeom(parseInt(req.params.fightId), team);
      res.json({ success: true, fight });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Admin direct score
  adminAddScore(req, res) {
    try {
      const { team, action } = req.body;
      if (!['red', 'blue'].includes(team)) return res.status(400).json({ error: 'Team inválido' });
      const validActions = ['punch_body', 'kick_body', 'kick_head', 'spinning_kick_body', 'spinning_kick_head'];
      if (!validActions.includes(action)) return res.status(400).json({ error: 'Acción inválida' });
      const fight = scoringService.adminAddScore(parseInt(req.params.fightId), team, action);
      res.json({ success: true, fight });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Set exact score for a team
  setScore(req, res) {
    try {
      const { team, score } = req.body;
      if (!['red', 'blue'].includes(team)) return res.status(400).json({ error: 'Team inválido' });
      if (typeof score !== 'number' || score < 0) return res.status(400).json({ error: 'Score inválido' });
      const fight = scoringService.setScore(parseInt(req.params.fightId), team, score);
      res.json({ success: true, fight });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Set round
  setRound(req, res) {
    try {
      const { round } = req.body;
      if (typeof round !== 'number' || round < 1) return res.status(400).json({ error: 'Round inválido' });
      const state = timerService.setRound(parseInt(req.params.fightId), round);
      res.json({ success: true, round: state.round, remainingMs: state.remainingMs });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Set exact timer value
  setTimer(req, res) {
    try {
      const { minutes, seconds } = req.body;
      const m = parseInt(minutes) || 0;
      const s = parseInt(seconds) || 0;
      const ms = (m * 60 + s) * 1000;
      if (ms < 0) return res.status(400).json({ error: 'Tiempo inválido' });
      const state = timerService.setTime(parseInt(req.params.fightId), ms);
      res.json({ success: true, remainingMs: state.remainingMs, round: state.round });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Score editing
  editScore(req, res) {
    try {
      const { scoreId, points } = req.body;
      const fight = scoringService.editScore(parseInt(req.params.fightId), scoreId, points);
      res.json({ success: true, fight });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  deleteScore(req, res) {
    try {
      const fight = scoringService.deleteScore(parseInt(req.params.fightId), parseInt(req.params.scoreId));
      res.json({ success: true, fight });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  clearCurrentRoundScore(req, res) {
    try {
      const fight = scoringService.clearCurrentRoundScore(parseInt(req.params.fightId));
      res.json({ success: true, fight });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Score breakdown
  getBreakdown(req, res) {
    try {
      const breakdown = scoringService.getBreakdown(parseInt(req.params.fightId));
      res.json(breakdown);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Round management
  endRound(req, res) {
    try {
      timerService.endRound(parseInt(req.params.fightId));
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  setRoundWinner(req, res) {
    try {
      const fightId = parseInt(req.params.fightId);
      const { round, winner } = req.body;
      if (!['red', 'blue'].includes(winner)) return res.status(400).json({ error: 'Winner inválido' });
      if (![1, 2, 3].includes(round)) return res.status(400).json({ error: 'Round inválido' });

      const col = `round_${round}_winner`;
      const reasonCol = `round_${round}_reason`;
      // If this round was tie_unresolved, mark it as referee_decision now that admin chose
      const existingFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
      const existingReason = existingFight ? existingFight[reasonCol] : null;
      if (existingReason === 'tie_unresolved') {
        db.prepare(`UPDATE fights SET ${col} = ?, ${reasonCol} = 'referee_decision' WHERE id = ?`).run(winner, fightId);
      } else {
        db.prepare(`UPDATE fights SET ${col} = ? WHERE id = ?`).run(winner, fightId);
      }

      let fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

      // Emit round winner update so /public refreshes dots
      emitEvents.fightUpdated(fight);

      // Check if someone won majority of rounds (2 of 3)
      const config = ScoringConfig.getByTournament(fight.tournament_id);
      const numRounds = config.num_rounds || 3;
      const needed = Math.ceil(numRounds / 2);

      let redWins = 0, blueWins = 0;
      for (let r = 1; r <= numRounds; r++) {
        const w = fight[`round_${r}_winner`];
        if (w === 'red') redWins++;
        if (w === 'blue') blueWins++;
      }

      if (redWins >= needed || blueWins >= needed) {
        const finalWinner = redWins >= needed ? 'red' : 'blue';
        db.prepare("UPDATE fights SET final_winner = ?, status = 'completed' WHERE id = ?").run(finalWinner, fightId);
        fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
        emitEvents.resultRegistered(fight);
        emitEvents.fightUpdated(fight);
      }

      res.json({ success: true, fight });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Scoring config
  getConfig(req, res) {
    try {
      const config = ScoringConfig.getByTournament(parseInt(req.params.tournamentId));
      res.json(config);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  updateConfig(req, res) {
    try {
      const config = ScoringConfig.upsert(parseInt(req.params.tournamentId), req.body);
      res.json({ success: true, config });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Get fight scoring state (timer + scores for initial load)
  getFightScoringState(req, res) {
    try {
      const fightId = parseInt(req.params.fightId);
      const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
      if (!fight) return res.status(404).json({ error: 'Pelea no encontrada' });

      const config = ScoringConfig.getByTournament(fight.tournament_id);
      const breakdown = Score.getBreakdown(fightId);

      // Per-round gam-jeom counts (una sola consulta agrupada en lugar de 2 por round)
      const gamJeomByRound = {};
      for (let r = 1; r <= config.num_rounds; r++) gamJeomByRound[r] = { red: 0, blue: 0 };
      const gjRows = db.prepare(`
        SELECT round, team, COUNT(*) as cnt FROM fight_scores
        WHERE fight_id = ? AND action = 'gam_jeom'
        GROUP BY round, team
      `).all(fightId);
      for (const row of gjRows) {
        if (!gamJeomByRound[row.round]) gamJeomByRound[row.round] = { red: 0, blue: 0 };
        // gam_jeom events are scored for the OPPONENT: points awarded to blue = red's fouls
        if (row.team === 'blue') gamJeomByRound[row.round].red = row.cnt;
        else gamJeomByRound[row.round].blue = row.cnt;
      }

      res.json({
        fight,
        config,
        breakdown,
        gamJeomByRound,
        timer: timerService.getPublicState(fightId, fight, config),
        kyeShie: timerService.getKyeShieState(fightId),
        serverNow: Date.now()
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};
