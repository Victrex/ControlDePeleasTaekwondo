import db from '../config/database.js';

export class Bracket {
  // Crear nueva llave para un torneo
  static create(bracketData) {
    const stmt = db.prepare(`
      INSERT INTO brackets (tournament_id, name)
      VALUES (?, ?)
    `);
    const result = stmt.run(bracketData.tournament_id, bracketData.name);
    return this.findById(result.lastInsertRowid);
  }

  // Buscar llave por ID
  static findById(id) {
    const stmt = db.prepare('SELECT * FROM brackets WHERE id = ?');
    return stmt.get(id);
  }

  // Obtener todas las llaves de un torneo
  static findByTournament(tournament_id) {
    const stmt = db.prepare('SELECT * FROM brackets WHERE tournament_id = ?');
    return stmt.all(tournament_id);
  }

  // Agregar competidor a la llave
  static addCompetitor(bracket_id, name, academy, peto_color, seed = null) {
    const stmt = db.prepare(`
      INSERT INTO bracket_competitors (bracket_id, name, academy, peto_color, seed)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(bracket_id, name, academy, peto_color, seed);
    return result.lastInsertRowid;
  }

  // Obtener competidores de la llave
  static getCompetitors(bracket_id) {
    const stmt = db.prepare('SELECT * FROM bracket_competitors WHERE bracket_id = ? ORDER BY seed ASC, id ASC');
    return stmt.all(bracket_id);
  }

  // Generar estructura de bracket según cantidad de competidores
  static generateBracketStructure(bracket_id) {
    const competitors = this.getCompetitors(bracket_id);
    const n = competitors.length;
    
    console.log(`Generando bracket para ${n} competidores`);
    
    if (n < 2) return [];
    
    // Limpiar matches anteriores
    db.prepare('DELETE FROM bracket_matches WHERE bracket_id = ?').run(bracket_id);
    
    // 2 competidores = 1 final
    // 3 competidores = 1 semifinal + 1 final (1 con BYE)
    // 4 competidores = 2 semifinales + 1 final
    // 5 competidores = 2 cuartos + 1 semifinal con BYE + 1 final
    // 6 competidores = 2 cuartos + 2 semifinales (2 con BYE) + 1 final
    
    if (n === 2) {
      // Solo final
      const stmt = db.prepare(`
        INSERT INTO bracket_matches (bracket_id, round, match_number, competitor1_id, competitor2_id, status)
        VALUES (?, 1, 1, ?, ?, 'pending')
      `);
      stmt.run(bracket_id, competitors[0].id, competitors[1].id);
      
    } else if (n === 3) {
      // Semifinal: competidor 1 vs 2, Final: ganador vs competidor 3 (BYE)
      const finalStmt = db.prepare(`
        INSERT INTO bracket_matches (bracket_id, round, match_number, competitor2_id, status)
        VALUES (?, 2, 1, ?, 'pending')
      `);
      const finalResult = finalStmt.run(bracket_id, competitors[2].id);
      const finalId = finalResult.lastInsertRowid;
      
      const semiStmt = db.prepare(`
        INSERT INTO bracket_matches (bracket_id, round, match_number, competitor1_id, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 1, 1, ?, ?, ?, 1, 'pending')
      `);
      semiStmt.run(bracket_id, competitors[0].id, competitors[1].id, finalId);
      
    } else if (n === 4) {
      // 2 semifinales + 1 final
      const finalStmt = db.prepare(`
        INSERT INTO bracket_matches (bracket_id, round, match_number, status)
        VALUES (?, 2, 1, 'pending')
      `);
      const finalResult = finalStmt.run(bracket_id);
      const finalId = finalResult.lastInsertRowid;
      
      // Semifinal 1: competidor 1 vs 2 -> ganador va a competitor1 de final
      const semi1Stmt = db.prepare(`
        INSERT INTO bracket_matches (bracket_id, round, match_number, competitor1_id, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 1, 1, ?, ?, ?, 1, 'pending')
      `);
      semi1Stmt.run(bracket_id, competitors[0].id, competitors[1].id, finalId);
      
      // Semifinal 2: competidor 3 vs 4 -> ganador va a competitor2 de final
      const semi2Stmt = db.prepare(`
        INSERT INTO bracket_matches (bracket_id, round, match_number, competitor1_id, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 1, 2, ?, ?, ?, 2, 'pending')
      `);
      semi2Stmt.run(bracket_id, competitors[2].id, competitors[3].id, finalId);
      
    } else if (n === 5) {
      // FINAL
      const finalStmt = db.prepare(`
        INSERT INTO bracket_matches (bracket_id, round, match_number, status)
        VALUES (?, 3, 1, 'pending')
      `);
      const finalId = finalStmt.run(bracket_id).lastInsertRowid;

      // SEMIFINAL (ganador cuarto2 vs competidor 5)
      const semiStmt = db.prepare(`
        INSERT INTO bracket_matches 
        (bracket_id, round, match_number, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 2, 1, ?, ?, 2, 'pending')
      `);
      const semiId = semiStmt.run(
        bracket_id,
        competitors[4].id,
        finalId
      ).lastInsertRowid;

      // CUARTO 1 (ganador va directo a FINAL slot 1)
      const q1Stmt = db.prepare(`
        INSERT INTO bracket_matches 
        (bracket_id, round, match_number, competitor1_id, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 1, 1, ?, ?, ?, 1, 'pending')
      `);
      q1Stmt.run(
        bracket_id,
        competitors[0].id,
        competitors[1].id,
        finalId
      );

      // CUARTO 2 (ganador va a SEMIFINAL slot 1)
      const q2Stmt = db.prepare(`
        INSERT INTO bracket_matches 
        (bracket_id, round, match_number, competitor1_id, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 1, 2, ?, ?, ?, 1, 'pending')
      `);
      q2Stmt.run(
        bracket_id,
        competitors[2].id,
        competitors[3].id,
        semiId
      );
    } else if (n === 6) {

      // FINAL
      const finalStmt = db.prepare(`
        INSERT INTO bracket_matches (bracket_id, round, match_number, status)
        VALUES (?, 3, 1, 'pending')
      `);
      const finalId = finalStmt.run(bracket_id).lastInsertRowid;

      // SEMIFINAL (ganador cuarto2 vs ganador cuarto3)
      const semiStmt = db.prepare(`
        INSERT INTO bracket_matches 
        (bracket_id, round, match_number, next_match_id, next_match_slot, status)
        VALUES (?, 2, 1, ?, 2, 'pending')
      `);
      const semiId = semiStmt.run(
        bracket_id,
        finalId
      ).lastInsertRowid;

      // CUARTO 1 (ganador va directo a FINAL slot 1)
      const q1Stmt = db.prepare(`
        INSERT INTO bracket_matches 
        (bracket_id, round, match_number, competitor1_id, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 1, 1, ?, ?, ?, 1, 'pending')
      `);
      q1Stmt.run(
        bracket_id,
        competitors[0].id,
        competitors[1].id,
        finalId
      );

      // CUARTO 2 (ganador va a SEMIFINAL slot 1)
      const q2Stmt = db.prepare(`
        INSERT INTO bracket_matches 
        (bracket_id, round, match_number, competitor1_id, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 1, 2, ?, ?, ?, 1, 'pending')
      `);
      q2Stmt.run(
        bracket_id,
        competitors[2].id,
        competitors[3].id,
        semiId
      );

      // CUARTO 3 (ganador va a SEMIFINAL slot 2)
      const q3Stmt = db.prepare(`
        INSERT INTO bracket_matches 
        (bracket_id, round, match_number, competitor1_id, competitor2_id, next_match_id, next_match_slot, status)
        VALUES (?, 1, 3, ?, ?, ?, 2, 'pending')
      `);
      q3Stmt.run(
        bracket_id,
        competitors[4].id,
        competitors[5].id,
        semiId
      );
    }
    
    return this.getMatches(bracket_id);
  }

  // Obtener matches de un bracket
  static getMatches(bracket_id) {
    const stmt = db.prepare(`
      SELECT m.*, 
             c1.name as competitor1_name, c1.academy as competitor1_academy,
             c2.name as competitor2_name, c2.academy as competitor2_academy,
             w.name as winner_name
      FROM bracket_matches m
      LEFT JOIN bracket_competitors c1 ON m.competitor1_id = c1.id
      LEFT JOIN bracket_competitors c2 ON m.competitor2_id = c2.id
      LEFT JOIN bracket_competitors w ON m.winner_id = w.id
      WHERE m.bracket_id = ?
      ORDER BY m.round ASC, m.match_number ASC
    `);
    return stmt.all(bracket_id);
  }

  // Registrar ganador de un match y avanzar
  static setMatchWinner(match_id, winner_id) {
    // Obtener el match
    const match = db.prepare('SELECT * FROM bracket_matches WHERE id = ?').get(match_id);
    if (!match) throw new Error('Match no encontrado');
    
    // Actualizar ganador
    db.prepare('UPDATE bracket_matches SET winner_id = ?, status = ? WHERE id = ?')
      .run(winner_id, 'completed', match_id);
    
    let nextMatchReady = null;
    
    // Si hay siguiente match, agregar ganador en el slot correcto
    if (match.next_match_id) {
      const nextMatch = db.prepare('SELECT * FROM bracket_matches WHERE id = ?').get(match.next_match_id);
      if (nextMatch) {
        // Usar next_match_slot para determinar dónde poner al ganador
        const slot = match.next_match_slot || 1;
        if (slot === 1) {
          db.prepare('UPDATE bracket_matches SET competitor1_id = ? WHERE id = ?')
            .run(winner_id, match.next_match_id);
        } else {
          db.prepare('UPDATE bracket_matches SET competitor2_id = ? WHERE id = ?')
            .run(winner_id, match.next_match_id);
        }
        
        // Verificar si el siguiente match ahora tiene ambos competidores
        const updatedNextMatch = db.prepare(`
          SELECT m.*, 
                 c1.name as competitor1_name, c1.academy as competitor1_academy,
                 c2.name as competitor2_name, c2.academy as competitor2_academy
          FROM bracket_matches m
          LEFT JOIN bracket_competitors c1 ON m.competitor1_id = c1.id
          LEFT JOIN bracket_competitors c2 ON m.competitor2_id = c2.id
          WHERE m.id = ?
        `).get(match.next_match_id);
        
        if (updatedNextMatch.competitor1_id && updatedNextMatch.competitor2_id) {
          nextMatchReady = updatedNextMatch;
        }
      }
    }
    
    return {
      matches: this.getMatches(match.bracket_id),
      nextMatchReady,
      bracket_id: match.bracket_id
    };
  }

  // Obtener match por ID
  static getMatchById(match_id) {
    const stmt = db.prepare(`
      SELECT m.*, 
             c1.name as competitor1_name, c1.academy as competitor1_academy,
             c2.name as competitor2_name, c2.academy as competitor2_academy
      FROM bracket_matches m
      LEFT JOIN bracket_competitors c1 ON m.competitor1_id = c1.id
      LEFT JOIN bracket_competitors c2 ON m.competitor2_id = c2.id
      WHERE m.id = ?
    `);
    return stmt.get(match_id);
  }
}
