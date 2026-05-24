import db from '../config/database.js';

export class Score {
  // === fight_scores ===

  static create(data) {
    const stmt = db.prepare(`
      INSERT INTO fight_scores (fight_id, round, team, action, points, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(data.fight_id, data.round, data.team, data.action, data.points, data.timestamp);
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare('SELECT * FROM fight_scores WHERE id = ?').get(id);
  }

  static getByFight(fightId) {
    return db.prepare('SELECT * FROM fight_scores WHERE fight_id = ? ORDER BY timestamp ASC').all(fightId);
  }

  static getByFightAndRound(fightId, round) {
    return db.prepare('SELECT * FROM fight_scores WHERE fight_id = ? AND round = ? ORDER BY timestamp ASC').all(fightId, round);
  }

  static getBreakdown(fightId) {
    const scores = this.getByFight(fightId);
    const missed = this.getMissedInputsByFight(fightId);
    const breakdown = { rounds: {}, totals: { red: 0, blue: 0 } };

    for (const s of scores) {
      if (!breakdown.rounds[s.round]) {
        breakdown.rounds[s.round] = { red: 0, blue: 0, events: [], missedVotes: [] };
      }
      breakdown.rounds[s.round][s.team] += s.points;
      breakdown.rounds[s.round].events.push(s);
      breakdown.totals[s.team] += s.points;
    }

    for (const m of missed) {
      if (!breakdown.rounds[m.round]) {
        breakdown.rounds[m.round] = { red: 0, blue: 0, events: [], missedVotes: [] };
      }
      breakdown.rounds[m.round].missedVotes.push(m);
    }

    return breakdown;
  }

  static updatePoints(scoreId, newPoints) {
    const old = this.findById(scoreId);
    if (!old) return null;
    db.prepare('UPDATE fight_scores SET points = ? WHERE id = ?').run(newPoints, scoreId);

    // Recalculate fight totals
    const fight = db.prepare('SELECT * FROM fights WHERE id = ?').get(old.fight_id);
    if (fight) {
      const diff = newPoints - old.points;
      if (old.team === 'red') {
        db.prepare('UPDATE fights SET score_red = score_red + ? WHERE id = ?').run(diff, old.fight_id);
      } else {
        db.prepare('UPDATE fights SET score_blue = score_blue + ? WHERE id = ?').run(diff, old.fight_id);
      }
    }

    return this.findById(scoreId);
  }

  static delete(scoreId) {
    const old = this.findById(scoreId);
    if (!old) return null;

    // Subtract points from fight totals
    if (old.team === 'red') {
      db.prepare('UPDATE fights SET score_red = score_red - ? WHERE id = ?').run(old.points, old.fight_id);
    } else {
      db.prepare('UPDATE fights SET score_blue = score_blue - ? WHERE id = ?').run(old.points, old.fight_id);
    }

    db.prepare('DELETE FROM fight_scores WHERE id = ?').run(scoreId);
    return old;
  }

  // === judge_inputs ===

  static addJudgeInput(data) {
    const stmt = db.prepare(`
      INSERT INTO judge_inputs (fight_id, judge_id, round, team, action, timestamp, judge_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(data.fight_id, data.judge_id, data.round, data.team, data.action, data.timestamp, data.judge_name || null);
    return { id: result.lastInsertRowid, ...data };
  }

  static getUnprocessedInputs(fightId, round, team, action, windowStart) {
    return db.prepare(`
      SELECT * FROM judge_inputs
      WHERE fight_id = ? AND round = ? AND team = ? AND action = ? AND processed = 0 AND timestamp >= ?
      ORDER BY timestamp ASC
    `).all(fightId, round, team, action, windowStart);
  }

  static markInputsProcessed(ids) {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE judge_inputs SET processed = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  static cleanExpiredInputs(fightId, beforeTimestamp) {
    // Mark as processed=2 (expired/missed) instead of deleting — preserves data for analytics
    db.prepare('UPDATE judge_inputs SET processed = 2 WHERE fight_id = ? AND processed = 0 AND timestamp < ?').run(fightId, beforeTimestamp);
  }

  static getMissedInputsByFight(fightId) {
    return db.prepare('SELECT * FROM judge_inputs WHERE fight_id = ? AND processed = 2 ORDER BY timestamp ASC').all(fightId);
  }
}
