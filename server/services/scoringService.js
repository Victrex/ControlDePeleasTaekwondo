import db from '../config/database.js';
import { Score } from '../models/Score.js';
import { ScoringConfig } from '../models/ScoringConfig.js';
import { getIO } from '../config/socket.js';
import { timerService } from './timerService.js';

export const scoringService = {

  processJudgeInput(fightId, judgeId, team, action, timestamp) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');
    if (fight.status !== 'current') throw new Error('La pelea no está en curso');
    if (!fight.timer_running) throw new Error('El timer no está corriendo');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    const round = fight.current_round;

    // Save raw judge input
    Score.addJudgeInput({ fight_id: fightId, judge_id: judgeId, round, team, action, timestamp });

    // Clean expired inputs
    const windowStart = timestamp - config.judge_window_ms;
    Score.cleanExpiredInputs(fightId, windowStart);

    // Check for majority within the temporal window
    const inputs = Score.getUnprocessedInputs(fightId, round, team, action, windowStart);

    // Get unique judges
    const uniqueJudges = new Set(inputs.map(i => i.judge_id));
    // min_judges_agree: 0 = auto majority, otherwise use the configured value
    const majority = config.min_judges_agree > 0
      ? config.min_judges_agree
      : Math.ceil(config.num_judges / 2);

    const io = getIO();

    // Emit judge:voted so scoreboard shows partial votes in real-time
    io.emit('judge:voted', {
      fightId,
      team,
      action,
      judgeCount: uniqueJudges.size,
      needed: majority,
      round
    });

    if (uniqueJudges.size >= majority) {
      // Mark these inputs as processed
      const inputIds = inputs.map(i => i.id);
      Score.markInputsProcessed(inputIds);

      // Award points
      const points = ScoringConfig.getPointsForAction(config, action);
      const score = Score.create({
        fight_id: fightId,
        round,
        team,
        action,
        points,
        timestamp
      });

      // Update fight totals
      const col = team === 'red' ? 'score_red' : 'score_blue';
      db.prepare(`UPDATE fights SET ${col} = ${col} + ? WHERE id = ?`).run(points, fightId);

      const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

      const io = getIO();
      io.emit('score:awarded', {
        fightId,
        team,
        action,
        points,
        scoreRed: updatedFight.score_red,
        scoreBlue: updatedFight.score_blue,
        round,
        scoreId: score.id
      });
      io.emit('fight:updated', updatedFight);

      // Check gap point rule: this wins the round and ends it immediately
      const diff = Math.abs(updatedFight.score_red - updatedFight.score_blue);
      if (diff >= config.gap_point) {
        const winner = updatedFight.score_red > updatedFight.score_blue ? 'red' : 'blue';
        io.emit('fight:gap_point_win', {
          fightId,
          winner,
          round,
          scoreRed: updatedFight.score_red,
          scoreBlue: updatedFight.score_blue
        });
        timerService.endRound(fightId, { roundWinner: winner, reason: 'gap_point' });
      }

      return { awarded: true, score, fight: updatedFight };
    }

    return { awarded: false, pendingJudges: uniqueJudges.size, needed: majority };
  },

  addGamJeom(fightId, team) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    const round = fight.current_round;

    // Increment gam-jeom for the offending team (total counter)
    const gamCol = team === 'red' ? 'gam_jeom_red' : 'gam_jeom_blue';
    db.prepare(`UPDATE fights SET ${gamCol} = ${gamCol} + 1 WHERE id = ?`).run(fightId);

    // Award point to the OPPONENT
    const opponentTeam = team === 'red' ? 'blue' : 'red';
    const scoreCol = opponentTeam === 'red' ? 'score_red' : 'score_blue';
    db.prepare(`UPDATE fights SET ${scoreCol} = ${scoreCol} + ? WHERE id = ?`).run(config.gam_jeom_points, fightId);

    // Record as a score event (opponent gets the point, action = gam_jeom)
    Score.create({
      fight_id: fightId,
      round,
      team: opponentTeam,
      action: 'gam_jeom',
      points: config.gam_jeom_points,
      timestamp: Date.now()
    });

    const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

    // Count per-round gam-jeom for the offending team
    // gam_jeom events are recorded for the OPPONENT team, so to count fouls
    // committed by 'team' in this round, count gam_jeom events awarded to opponent
    const roundGamJeom = db.prepare(`
      SELECT COUNT(*) as cnt FROM fight_scores
      WHERE fight_id = ? AND round = ? AND team = ? AND action = 'gam_jeom'
    `).get(fightId, round, opponentTeam).cnt;

    const io = getIO();
    io.emit('gam_jeom:added', {
      fightId,
      team,
      gamJeomRed: updatedFight.gam_jeom_red,
      gamJeomBlue: updatedFight.gam_jeom_blue,
      scoreRed: updatedFight.score_red,
      scoreBlue: updatedFight.score_blue,
      round,
      roundGamJeom // number of gam-jeoms the offending team has THIS round
    });
    io.emit('fight:updated', updatedFight);

    // Punitive loss: per-round check. Reaching the max gam-jeom loses the round.
    if (roundGamJeom >= config.max_gam_jeom) {
      const winner = team === 'red' ? 'blue' : 'red';
      io.emit('fight:punitive_win', {
        fightId,
        winner,
        reason: 'gam_jeom_limit',
        round,
        scoreRed: updatedFight.score_red,
        scoreBlue: updatedFight.score_blue
      });
      timerService.endRound(fightId, { roundWinner: winner, reason: 'gam_jeom_limit' });
      return updatedFight;
    }

    // Check gap point: this wins the round and ends it immediately
    const diff = Math.abs(updatedFight.score_red - updatedFight.score_blue);
    if (diff >= config.gap_point) {
      const winner = updatedFight.score_red > updatedFight.score_blue ? 'red' : 'blue';
      io.emit('fight:gap_point_win', {
        fightId,
        winner,
        round,
        scoreRed: updatedFight.score_red,
        scoreBlue: updatedFight.score_blue
      });
      timerService.endRound(fightId, { roundWinner: winner, reason: 'gap_point' });
    }

    return updatedFight;
  },

  removeGamJeom(fightId, team) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    const currentGamJeom = team === 'red' ? fight.gam_jeom_red : fight.gam_jeom_blue;
    if (currentGamJeom <= 0) return fight;

    // Decrement gam-jeom
    const gamCol = team === 'red' ? 'gam_jeom_red' : 'gam_jeom_blue';
    db.prepare(`UPDATE fights SET ${gamCol} = ${gamCol} - 1 WHERE id = ?`).run(fightId);

    // Remove point from opponent
    const opponentTeam = team === 'red' ? 'blue' : 'red';
    const scoreCol = opponentTeam === 'red' ? 'score_red' : 'score_blue';
    db.prepare(`UPDATE fights SET ${scoreCol} = MAX(0, ${scoreCol} - ?) WHERE id = ?`).run(config.gam_jeom_points, fightId);

    // Remove last gam_jeom score event for this fight
    const lastGamJeomScore = db.prepare(`
      SELECT id FROM fight_scores 
      WHERE fight_id = ? AND team = ? AND action = 'gam_jeom'
      ORDER BY id DESC LIMIT 1
    `).get(fightId, opponentTeam);
    if (lastGamJeomScore) {
      db.prepare('DELETE FROM fight_scores WHERE id = ?').run(lastGamJeomScore.id);
    }

    const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

    const io = getIO();
    io.emit('gam_jeom:added', {
      fightId,
      team,
      gamJeomRed: updatedFight.gam_jeom_red,
      gamJeomBlue: updatedFight.gam_jeom_blue,
      scoreRed: updatedFight.score_red,
      scoreBlue: updatedFight.score_blue,
      round: fight.current_round
    });

    return updatedFight;
  },

  adminAddScore(fightId, team, action) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = ScoringConfig.getByTournament(fight.tournament_id);
    const round = fight.current_round;
    const points = ScoringConfig.getPointsForAction(config, action);

    const score = Score.create({
      fight_id: fightId,
      round,
      team,
      action,
      points,
      timestamp: Date.now()
    });

    const col = team === 'red' ? 'score_red' : 'score_blue';
    db.prepare(`UPDATE fights SET ${col} = ${col} + ? WHERE id = ?`).run(points, fightId);

    const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

    const io = getIO();
    io.emit('score:awarded', {
      fightId,
      team,
      action,
      points,
      scoreRed: updatedFight.score_red,
      scoreBlue: updatedFight.score_blue,
      round,
      scoreId: score.id
    });
    io.emit('fight:updated', updatedFight);

    // Check gap point rule: this wins the round and ends it immediately
    const diff = Math.abs(updatedFight.score_red - updatedFight.score_blue);
    if (diff >= config.gap_point) {
      const winner = updatedFight.score_red > updatedFight.score_blue ? 'red' : 'blue';
      io.emit('fight:gap_point_win', {
        fightId,
        winner,
        round,
        scoreRed: updatedFight.score_red,
        scoreBlue: updatedFight.score_blue
      });
      timerService.endRound(fightId, { roundWinner: winner, reason: 'gap_point' });
    }

    return updatedFight;
  },

  editScore(fightId, scoreId, newPoints) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');
    if (fight.timer_running) throw new Error('No se pueden editar puntos con el timer corriendo');

    const updated = Score.updatePoints(scoreId, newPoints);
    if (!updated) throw new Error('Score no encontrado');

    const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

    const io = getIO();
    io.emit('score:edited', {
      fightId,
      scoreRed: updatedFight.score_red,
      scoreBlue: updatedFight.score_blue
    });
    io.emit('fight:updated', updatedFight);

    return updatedFight;
  },

  deleteScore(fightId, scoreId) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');
    if (fight.timer_running) throw new Error('No se pueden eliminar puntos con el timer corriendo');

    const deleted = Score.delete(scoreId);
    if (!deleted) throw new Error('Score no encontrado');

    const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

    const io = getIO();
    io.emit('score:edited', {
      fightId,
      scoreRed: updatedFight.score_red,
      scoreBlue: updatedFight.score_blue
    });
    io.emit('fight:updated', updatedFight);

    return updatedFight;
  },

  setScore(fightId, team, newScore) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const col = team === 'red' ? 'score_red' : 'score_blue';
    db.prepare(`UPDATE fights SET ${col} = ? WHERE id = ?`).run(newScore, fightId);

    const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

    const io = getIO();
    io.emit('score:edited', {
      fightId,
      scoreRed: updatedFight.score_red,
      scoreBlue: updatedFight.score_blue
    });
    io.emit('fight:updated', updatedFight);

    return updatedFight;
  },

  clearCurrentRoundScore(fightId) {
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error('Pelea no encontrada');
    if (fight.timer_running) throw new Error('Detén el timer antes de limpiar el score actual');

    const round = fight.current_round || 1;

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM fight_scores WHERE fight_id = ? AND round = ?').run(fightId, round);
      db.prepare('DELETE FROM judge_inputs WHERE fight_id = ? AND round = ?').run(fightId, round);
      db.prepare('UPDATE fights SET score_red = 0, score_blue = 0, gam_jeom_red = 0, gam_jeom_blue = 0 WHERE id = ?').run(fightId);
    });
    tx();

    const updatedFight = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);

    const io = getIO();
    io.emit('score:edited', {
      fightId,
      scoreRed: updatedFight.score_red,
      scoreBlue: updatedFight.score_blue
    });
    io.emit('fight:updated', updatedFight);

    return updatedFight;
  },

  getBreakdown(fightId) {
    return Score.getBreakdown(fightId);
  }
};
