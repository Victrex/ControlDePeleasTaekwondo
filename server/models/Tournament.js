import db from '../config/database.js';

export class Tournament {
  // Crear nuevo torneo/llave
  static create(tournamentData) {
    const stmt = db.prepare(`
      INSERT INTO tournaments (name, category, division, weight_class, num_pistas)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      tournamentData.name,
      tournamentData.category || null,
      tournamentData.division || null,
      tournamentData.weight_class || null,
      tournamentData.num_pistas || 1
    );

    return this.findById(result.lastInsertRowid);
  }

  // Buscar torneo por ID
  static findById(id) {
    const stmt = db.prepare('SELECT * FROM tournaments WHERE id = ?');
    return stmt.get(id);
  }

  // Obtener todos los torneos
  static findAll() {
    const stmt = db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC');
    return stmt.all();
  }

  // Obtener torneos activos
  static findActive() {
    const stmt = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY created_at DESC");
    return stmt.all();
  }

  // Actualizar torneo
  static update(id, updates) {
    const allowedFields = ['name', 'category', 'division', 'weight_class', 'status', 'num_pistas'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) return false;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);

    const stmt = db.prepare(`UPDATE tournaments SET ${setClause} WHERE id = ?`);
    stmt.run(...values, id);
    
    return this.findById(id);
  }

  // Marcar torneo como completado
  static complete(id) {
    const stmt = db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?");
    stmt.run(id);
    return this.findById(id);
  }

  // Cancelar torneo
  static cancel(id) {
    const stmt = db.prepare("UPDATE tournaments SET status = 'cancelled' WHERE id = ?");
    stmt.run(id);
    return this.findById(id);
  }

  // Eliminar torneo y todos sus datos en cascada (peleas, llaves, scores, historial, podio)
  static delete(id) {
    const deleteAll = db.transaction(() => {
      const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
      if (!tournament) return null;

      const fightCount    = db.prepare('SELECT COUNT(*) as c FROM fights WHERE tournament_id = ?').get(id).c;
      const bracketCount  = db.prepare('SELECT COUNT(*) as c FROM brackets WHERE tournament_id = ?').get(id).c;
      const scoreCount    = db.prepare(`
        SELECT COUNT(*) as c FROM fight_scores
        WHERE fight_id IN (SELECT id FROM fights WHERE tournament_id = ?)
      `).get(id).c;

      // La FK con ON DELETE CASCADE se encarga del resto; eliminamos el torneo raíz.
      db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);

      return { tournament, fightCount, bracketCount, scoreCount };
    });

    return deleteAll();
  }

  // Obtener estadísticas del torneo
  static getStats(id) {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total_fights,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'current' THEN 1 ELSE 0 END) as current,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'postponed' THEN 1 ELSE 0 END) as postponed
      FROM fights
      WHERE tournament_id = ?
    `);
    
    return stmt.get(id);
  }
}
