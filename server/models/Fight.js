import db from '../config/database.js';

export class Fight {
  // Crear nueva pelea
  static create(fightData) {
    const stmt = db.prepare(`
      INSERT INTO fights (
        tournament_id, bracket_id, fight_number, competitor_red, competitor_blue,
        academy_red, academy_blue, order_index, bracket_position, bracket_round, pista
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      fightData.tournament_id,
      fightData.bracket_id || null,
      fightData.fight_number,
      fightData.competitor_red,
      fightData.competitor_blue,
      fightData.academy_red || null,
      fightData.academy_blue || null,
      fightData.order_index,
      fightData.bracket_position || null,
      fightData.bracket_round || null,
      fightData.pista || 1
    );

    return this.findById(result.lastInsertRowid);
  }

  // Buscar pelea por ID
  static findById(id) {
    const stmt = db.prepare('SELECT * FROM fights WHERE id = ?');
    return stmt.get(id);
  }

  // Obtener todas las peleas de un torneo
  static findByTournament(tournamentId) {
    const stmt = db.prepare('SELECT * FROM fights WHERE tournament_id = ? ORDER BY order_index ASC');
    return stmt.all(tournamentId);
  }

  // Obtener pelea actual
  static getCurrentFight(tournamentId) {
    const stmt = db.prepare("SELECT * FROM fights WHERE tournament_id = ? AND status = 'current'");
    return stmt.get(tournamentId);
  }

  // Obtener todas las peleas actuales (una por pista)
  static getAllCurrentFights(tournamentId) {
    const stmt = db.prepare("SELECT * FROM fights WHERE tournament_id = ? AND status = 'current' ORDER BY pista ASC");
    return stmt.all(tournamentId);
  }

  // Obtener pelea actual por pista
  static getCurrentFightByPista(tournamentId, pista) {
    const stmt = db.prepare("SELECT * FROM fights WHERE tournament_id = ? AND status = 'current' AND pista = ?");
    return stmt.get(tournamentId, pista);
  }

  // Obtener próxima pelea pendiente
  static getNextPendingFight(tournamentId) {
    const stmt = db.prepare(`
      SELECT * FROM fights 
      WHERE tournament_id = ? AND status = 'pending' 
      ORDER BY order_index ASC 
      LIMIT 1
    `);
    return stmt.get(tournamentId);
  }

  // Actualizar pelea
  static update(id, updates) {
    const allowedFields = [
      'competitor_red', 'competitor_blue', 'academy_red', 'academy_blue',
      'status', 'order_index', 'round_1_winner', 'round_2_winner', 'round_3_winner',
      'final_winner', 'victory_type', 'notes', 'bracket_position', 'bracket_round', 'pista'
    ];

    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
    if (fields.length === 0) return false;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);

    const stmt = db.prepare(`
      UPDATE fights 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    stmt.run(...values, id);
    return this.findById(id);
  }

  // Actualizar orden de peleas (batch)
  static updateOrder(fightOrders) {
    const stmt = db.prepare('UPDATE fights SET order_index = ? WHERE id = ?');
    
    const updateMany = db.transaction((orders) => {
      for (const order of orders) {
        stmt.run(order.order_index, order.id);
      }
    });

    updateMany(fightOrders);
    return true;
  }

  // Marcar pelea como actual
  static setAsCurrent(id, tournamentId) {
    // Obtener la pista de la pelea que se va a marcar como actual
    const fight = this.findById(id);
    const pista = fight ? fight.pista : null;
    
    const clearCurrent = pista
      ? db.prepare("UPDATE fights SET status = 'pending' WHERE tournament_id = ? AND status = 'current' AND pista = ?")
      : db.prepare("UPDATE fights SET status = 'pending' WHERE tournament_id = ? AND status = 'current'");
    const setCurrent = db.prepare("UPDATE fights SET status = 'current' WHERE id = ?");

    const transaction = db.transaction(() => {
      if (pista) {
        clearCurrent.run(tournamentId, pista);
      } else {
        clearCurrent.run(tournamentId);
      }
      setCurrent.run(id);
    });

    transaction();
    return this.findById(id);
  }

  // Completar pelea y avanzar a la siguiente
  static complete(id, tournamentId) {
    // Obtener pista de la pelea antes de completarla
    const fightBefore = this.findById(id);
    const pista = fightBefore ? fightBefore.pista : null;
    
    const updateFight = db.prepare("UPDATE fights SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    
    const transaction = db.transaction(() => {
      updateFight.run(id);
      // Solo limpiar current de la misma pista
      if (pista) {
        const clearCurrent = db.prepare("UPDATE fights SET status = 'pending' WHERE tournament_id = ? AND status = 'current' AND pista = ? AND id != ?");
        clearCurrent.run(tournamentId, pista, id);
      }
    });

    transaction();

    // Registrar en el historial
    const fight = this.findById(id);
    this.addToHistory(fight);

    return fight;
  }

  // Agregar pelea al historial
  static addToHistory(fight) {
    const stmt = db.prepare(`
      INSERT INTO fight_history (tournament_id, competitor_name, fight_id, fight_order)
      VALUES (?, ?, ?, ?), (?, ?, ?, ?)
    `);

    stmt.run(
      fight.tournament_id, fight.competitor_red, fight.id, fight.order_index,
      fight.tournament_id, fight.competitor_blue, fight.id, fight.order_index
    );
  }

  // Obtener historial de peleas de un competidor
  static getCompetitorHistory(tournamentId, competitorName) {
    const stmt = db.prepare(`
      SELECT * FROM fight_history 
      WHERE tournament_id = ? AND competitor_name = ? 
      ORDER BY fight_order DESC
    `);
    return stmt.all(tournamentId, competitorName);
  }

  // Eliminar pelea
  static delete(id) {
    const stmt = db.prepare('DELETE FROM fights WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Cancelar pelea
  static cancel(id) {
    const stmt = db.prepare("UPDATE fights SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    stmt.run(id);
    return this.findById(id);
  }

  // Posponer pelea
  static postpone(id) {
    const stmt = db.prepare("UPDATE fights SET status = 'postponed', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    stmt.run(id);
    return this.findById(id);
  }

  // Contar peleas por estado
  static countByStatus(tournamentId, status) {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM fights WHERE tournament_id = ? AND status = ?');
    const result = stmt.get(tournamentId, status);
    return result.count;
  }

  // Verificar si todas las peleas están completas
  static allCompleted(tournamentId) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM fights 
      WHERE tournament_id = ? AND status IN ('pending', 'current', 'postponed')
    `);
    const result = stmt.get(tournamentId);
    return result.count === 0;
  }
}
