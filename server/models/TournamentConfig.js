import db from '../config/database.js';

export class TournamentConfig {
  // Obtener configuración actual
  static get() {
    const stmt = db.prepare('SELECT * FROM tournament_config WHERE id = 1');
    return stmt.get();
  }

  // Actualizar configuración
  static update(updates) {
    const allowedFields = [
      'min_rest_fights',
      'num_rounds',
      'allow_victory_by_rounds',
      'allow_victory_by_injury',
      'allow_victory_by_abandon',
      'enable_auto_validation'
    ];

    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
    if (fields.length === 0) return false;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);

    const stmt = db.prepare(`
      UPDATE tournament_config 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `);

    stmt.run(...values);
    return this.get();
  }

  // Resetear a valores por defecto
  static reset() {
    const stmt = db.prepare(`
      UPDATE tournament_config 
      SET min_rest_fights = 2,
          num_rounds = 2,
          allow_victory_by_rounds = 1,
          allow_victory_by_injury = 1,
          allow_victory_by_abandon = 1,
          enable_auto_validation = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    stmt.run();
    return this.get();
  }
}
