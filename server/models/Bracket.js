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

  // Eliminar llave y todos sus datos en cascada (peleas, competidores, matches)
  static delete(id) {
    const deleteAll = db.transaction(() => {
      const bracket = db.prepare('SELECT * FROM brackets WHERE id = ?').get(id);
      if (!bracket) return null;

      const fightCount      = db.prepare('SELECT COUNT(*) as c FROM fights WHERE bracket_id = ?').get(id).c;
      const competitorCount = db.prepare('SELECT COUNT(*) as c FROM bracket_competitors WHERE bracket_id = ?').get(id).c;

      // Eliminar peleas del bracket (FK es ON DELETE SET NULL, hay que hacerlo explícito)
      db.prepare('DELETE FROM fights WHERE bracket_id = ?').run(id);

      // Eliminar la llave (cascade borra bracket_competitors y bracket_matches)
      db.prepare('DELETE FROM brackets WHERE id = ?').run(id);

      return { bracket, fightCount, competitorCount };
    });

    return deleteAll();
  }

  // Agregar competidor a la llave
  static addCompetitor(bracket_id, name, academy, peto_color, seed = null, athlete_id = null) {
    const stmt = db.prepare(`
      INSERT INTO bracket_competitors (bracket_id, athlete_id, name, academy, peto_color, seed)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(bracket_id, athlete_id, name, academy, peto_color, seed);
    return result.lastInsertRowid;
  }

  // Obtener competidores de la llave
  static getCompetitors(bracket_id) {
    const stmt = db.prepare('SELECT * FROM bracket_competitors WHERE bracket_id = ? ORDER BY seed ASC, id ASC');
    return stmt.all(bracket_id);
  }

  // Reordenar competidores actualizando sus seeds
  static reorderCompetitors(bracket_id, orderedIds) {
    orderedIds.forEach((id, idx) => {
      if (id !== null) {
        db.prepare('UPDATE bracket_competitors SET seed = ? WHERE id = ? AND bracket_id = ?')
          .run(idx + 1, id, bracket_id);
      }
    });
  }

  // Eliminar un competidor
  static removeCompetitor(competitor_id) {
    db.prepare('DELETE FROM bracket_competitors WHERE id = ?').run(competitor_id);
  }

  // Helper: ¿el slot vacío de un match es BYE permanente (sin feeder real)?
  static isPermaBye(matchId, slotNum) {
    const feeder = db.prepare(
      'SELECT competitor1_id, competitor2_id FROM bracket_matches WHERE next_match_id = ? AND next_match_slot = ?'
    ).get(matchId, slotNum);
    // Sin feeder → BYE permanente. Feeder sin competidores (fantasma BYEvBYE) → también BYE permanente.
    return !feeder || (!feeder.competitor1_id && !feeder.competitor2_id);
  }

  // Generar estructura de bracket según cantidad de competidores
  static generateBracketStructure(bracket_id) {
    const competitors = this.getCompetitors(bracket_id);
    const n = competitors.length;

    console.log(`Generando bracket para ${n} competidores`);
    if (n < 2) return [];

    // Limpiar matches anteriores
    db.prepare('DELETE FROM bracket_matches WHERE bracket_id = ?').run(bracket_id);

    // ── Array de slots potencia-de-2 ─────────────────────────────────────────
    //
    // Reglas de semilla:
    //   - Si el usuario puso BYEs manuales (nombre='BYE'), se respeta el orden exacto.
    //   - Si todos son reales y el total es IMPAR, P1 recibe BYE en R1:
    //       slots = [P1, null, P2, P3, ... Pn]
    //   - Si todos son reales y el total es PAR, orden natural:
    //       slots = [P1, P2, ... Pn]
    //   - En ambos casos se rellena con null hasta la siguiente potencia de 2.
    //
    // Con esto, para n=5: slots=[P1,null,P2,P3,P4,P5,null,null] (size=8)
    //   R1: M1(P1 vs null→BYE), M2(P2vP3), M3(P4vP5), M4(null vs null→fantasma)
    //   R2: M5(P1 vs win(M2)), M6(win(M3) vs null)→auto BYE cuando M3 resuelva
    //   R3: Final

    const hasManualByes = competitors.some(c => c.name === 'BYE');
    const realIds = competitors.filter(c => c.name !== 'BYE').map(c => c.id);
    const r = realIds.length;
    if (r < 2) return [];

    let slots;
    if (hasManualByes) {
      slots = competitors.map(c => c.name !== 'BYE' ? c.id : null);
    } else if (r % 2 === 1) {
      // Impar: P1 recibe BYE (null en posición 2)
      slots = [realIds[0], null, ...realIds.slice(1)];
    } else {
      slots = [...realIds];
    }

    // Rellenar hasta la siguiente potencia de 2
    let size = 1;
    while (size < slots.length) size *= 2;
    if (size < 2) size = 2;
    while (slots.length < size) slots.push(null);

    const totalRounds = Math.log2(size);

    // ── Crear árbol completo: final → ronda 1 ────────────────────────────────
    const ins = db.prepare(`
      INSERT INTO bracket_matches
        (bracket_id, round, match_number, competitor1_id, competitor2_id,
         next_match_id, next_match_slot, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    // Final
    const finalId = ins.run(bracket_id, totalRounds, 1, null, null, null, null).lastInsertRowid;
    const matchTree = { [totalRounds]: [finalId] };

    // Rondas intermedias y ronda 1
    for (let round = totalRounds - 1; round >= 1; round--) {
      const count = size >> round; // matches en esta ronda
      matchTree[round] = [];
      for (let i = 0; i < count; i++) {
        const parentId   = matchTree[round + 1][Math.floor(i / 2)];
        const nextSlot   = (i % 2 === 0) ? 1 : 2;
        const matchId    = ins.run(bracket_id, round, i + 1, null, null, parentId, nextSlot).lastInsertRowid;
        matchTree[round].push(matchId);
      }
    }

    // ── Asignar competidores de ronda 1 ──────────────────────────────────────
    const setComps = db.prepare(
      'UPDATE bracket_matches SET competitor1_id = ?, competitor2_id = ? WHERE id = ?'
    );

    const r1 = totalRounds === 1 ? [finalId] : matchTree[1];
    for (let i = 0; i < r1.length; i++) {
      setComps.run(slots[i * 2] ?? null, slots[i * 2 + 1] ?? null, r1[i]);
    }

    // ── Auto-resolver BYEs ronda a ronda ─────────────────────────────────────
    // Sólo resuelve un match si su slot vacío NO tiene un feeder real pendiente.
    // Esto evita que P1 gane la final cuando M2(P2vsP3) aún no se ha jugado.
    for (let round = 1; round <= totalRounds; round++) {
      const roundMatches = db.prepare(
        "SELECT * FROM bracket_matches WHERE bracket_id = ? AND round = ? AND status != 'completed'"
      ).all(bracket_id, round);

      for (const m of roundMatches) {
        if (m.competitor1_id && !m.competitor2_id && this.isPermaBye(m.id, 2)) {
          this.setMatchWinner(m.id, m.competitor1_id);
        } else if (!m.competitor1_id && m.competitor2_id && this.isPermaBye(m.id, 1)) {
          this.setMatchWinner(m.id, m.competitor2_id);
        }
      }
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
    const match = db.prepare('SELECT * FROM bracket_matches WHERE id = ?').get(match_id);
    if (!match) throw new Error('Match no encontrado');

    db.prepare('UPDATE bracket_matches SET winner_id = ?, status = ? WHERE id = ?')
      .run(winner_id, 'completed', match_id);

    let nextMatchReady = null;

    if (match.next_match_id) {
      const slot = match.next_match_slot || 1;
      if (slot === 1) {
        db.prepare('UPDATE bracket_matches SET competitor1_id = ? WHERE id = ?')
          .run(winner_id, match.next_match_id);
      } else {
        db.prepare('UPDATE bracket_matches SET competitor2_id = ? WHERE id = ?')
          .run(winner_id, match.next_match_id);
      }

      const updatedNext = db.prepare(`
        SELECT m.*,
               c1.name as competitor1_name, c1.academy as competitor1_academy,
               c2.name as competitor2_name, c2.academy as competitor2_academy
        FROM bracket_matches m
        LEFT JOIN bracket_competitors c1 ON m.competitor1_id = c1.id
        LEFT JOIN bracket_competitors c2 ON m.competitor2_id = c2.id
        WHERE m.id = ?
      `).get(match.next_match_id);

      if (updatedNext && updatedNext.status !== 'completed') {
        if (updatedNext.competitor1_id && updatedNext.competitor2_id) {
          // Ambos presentes → listo para jugar
          nextMatchReady = updatedNext;
        } else if (updatedNext.competitor1_id && !updatedNext.competitor2_id
                   && this.isPermaBye(updatedNext.id, 2)) {
          // Slot 2 es BYE permanente → avanzar automáticamente
          this.setMatchWinner(updatedNext.id, updatedNext.competitor1_id);
        } else if (!updatedNext.competitor1_id && updatedNext.competitor2_id
                   && this.isPermaBye(updatedNext.id, 1)) {
          // Slot 1 es BYE permanente → avanzar automáticamente
          this.setMatchWinner(updatedNext.id, updatedNext.competitor2_id);
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
