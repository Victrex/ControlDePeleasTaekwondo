import db from '../config/database.js';

const DEFAULTS = {
  round_time_seconds: 120,
  rest_time_seconds: 60,
  num_rounds: 3,
  gap_point: 20,
  max_gam_jeom: 10,
  judge_window_ms: 1500,
  num_judges: 3,
  min_judges_agree: 0,
  points_punch_body: 1,
  points_kick_body: 2,
  points_kick_head: 3,
  points_spinning_kick_body: 4,
  points_spinning_kick_head: 5,
  gam_jeom_points: 1
};

export class ScoringConfig {
  static getByTournament(tournamentId) {
    const row = db.prepare('SELECT * FROM scoring_config WHERE tournament_id = ?').get(tournamentId);
    if (row) return row;
    // Return defaults if no config exists
    return { tournament_id: tournamentId, ...DEFAULTS };
  }

  static upsert(tournamentId, config) {
    const existing = db.prepare('SELECT id FROM scoring_config WHERE tournament_id = ?').get(tournamentId);
    const fields = Object.keys(DEFAULTS);
    const data = {};
    for (const f of fields) {
      data[f] = config[f] !== undefined ? config[f] : DEFAULTS[f];
    }

    if (existing) {
      const sets = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => data[f]);
      db.prepare(`UPDATE scoring_config SET ${sets} WHERE tournament_id = ?`).run(...values, tournamentId);
    } else {
      const cols = ['tournament_id', ...fields].join(', ');
      const placeholders = ['tournament_id', ...fields].map(() => '?').join(', ');
      const values = [tournamentId, ...fields.map(f => data[f])];
      db.prepare(`INSERT INTO scoring_config (${cols}) VALUES (${placeholders})`).run(...values);
    }

    return this.getByTournament(tournamentId);
  }

  static getPointsForAction(config, action) {
    const map = {
      punch_body: config.points_punch_body,
      kick_body: config.points_kick_body,
      kick_head: config.points_kick_head,
      spinning_kick_body: config.points_spinning_kick_body,
      spinning_kick_head: config.points_spinning_kick_head,
      gam_jeom: config.gam_jeom_points
    };
    return map[action] || 0;
  }
}
