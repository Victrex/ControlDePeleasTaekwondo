import db from '../config/database.js';

// Sistema de 10 niveles KUP (9 KUP = Blanco … 1 DAN+ = Negro)
export const BELT_NAMES = [
  'Blanco',         // 0 — 9 KUP
  'Blanco-Amarillo',// 1 — 8 KUP  (también: Naranja en algunas academias)
  'Amarillo',       // 2 — 7 KUP
  'Naranja',        // 3 — 6 KUP
  'Verde',          // 4 — 5 KUP
  'Azul-Verde',     // 5 — 4 KUP
  'Azul',           // 6 — 3 KUP
  'Rojo',           // 7 — 2 KUP
  'Rojo-Negro',     // 8 — 1 KUP  (Poom para menores)
  'Negro',          // 9 — 1 DAN+
];

function calcAge(dob) {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export class Athlete {
  static create(data) {
    const { name, dob, weight, gender, belt, academy, license_number } = data;
    const stmt = db.prepare(`
      INSERT INTO athletes (name, dob, weight, gender, belt, academy, license_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name,
      dob || null,
      weight != null ? parseFloat(weight) : null,
      gender || null,
      belt != null ? parseInt(belt) : 0,
      academy || null,
      license_number || null
    );
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare('SELECT * FROM athletes WHERE id = ?').get(id);
  }

  static findAll({ q, belt, gender, academy } = {}) {
    let sql = 'SELECT * FROM athletes WHERE 1=1';
    const params = [];
    if (q) {
      sql += ' AND (name LIKE ? OR academy LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (belt != null && belt !== '') {
      sql += ' AND belt = ?';
      params.push(parseInt(belt));
    }
    if (gender) {
      sql += ' AND gender = ?';
      params.push(gender);
    }
    if (academy) {
      sql += ' AND academy LIKE ?';
      params.push(`%${academy}%`);
    }
    sql += ' ORDER BY name ASC';
    return db.prepare(sql).all(...params);
  }

  static update(id, data) {
    const { name, dob, weight, gender, belt, academy, license_number } = data;
    db.prepare(`
      UPDATE athletes SET name=?, dob=?, weight=?, gender=?, belt=?, academy=?, license_number=?
      WHERE id=?
    `).run(
      name,
      dob || null,
      weight != null ? parseFloat(weight) : null,
      gender || null,
      belt != null ? parseInt(belt) : 0,
      academy || null,
      license_number || null,
      id
    );
    return this.findById(id);
  }

  static delete(id) {
    return db.prepare('DELETE FROM athletes WHERE id = ?').run(id);
  }

  static deleteAll() {
    return db.prepare('DELETE FROM athletes').run();
  }

  static importBatch(rows) {
    const insert = db.prepare(`
      INSERT INTO athletes (name, dob, weight, gender, belt, academy, license_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((rows) => {
      const ids = [];
      for (const r of rows) {
        const res = insert.run(
          r.name,
          r.dob || null,
          r.weight != null ? parseFloat(r.weight) : null,
          r.gender || null,
          r.belt != null ? parseInt(r.belt) : 0,
          r.academy || null,
          r.license_number || null
        );
        ids.push(res.lastInsertRowid);
      }
      return ids;
    });
    return tx(rows);
  }

  static suggestCategories(athleteId) {
    const athlete = this.findById(athleteId);
    if (!athlete) return [];
    const age = calcAge(athlete.dob);
    return this._matchCategories(age, athlete.weight, athlete.gender, athlete.belt);
  }

  static suggestCategoriesForData({ dob, weight, gender, belt }) {
    const age = calcAge(dob);
    return this._matchCategories(age, weight, gender, belt);
  }

  static _matchCategories(age, weight, gender, belt) {
    let sql = `
      SELECT * FROM category_templates
      WHERE (gender = 'Both' OR gender = ?)
        AND (? IS NULL OR (min_age <= ? AND max_age >= ?))
        AND (? IS NULL OR (min_weight <= ? AND max_weight >= ?))
        AND belt_min <= ? AND belt_max >= ?
      ORDER BY min_age ASC, name ASC
    `;
    return db.prepare(sql).all(
      gender || 'Both',
      age, age, age,
      weight, weight, weight,
      belt ?? 0, belt ?? 0
    );
  }

  // Obtener en cuántas llaves está un atleta (por tournamentId opcional)
  static getBracketAssignments(athleteId, tournamentId = null) {
    let sql = `
      SELECT bc.id, bc.bracket_id, bc.name, bc.academy, bc.peto_color, bc.seed,
             b.tournament_id, b.name as bracket_name, t.name as tournament_name
      FROM bracket_competitors bc
      JOIN brackets b ON bc.bracket_id = b.id
      JOIN tournaments t ON b.tournament_id = t.id
      WHERE bc.athlete_id = ?
    `;
    const params = [athleteId];
    if (tournamentId) {
      sql += ' AND b.tournament_id = ?';
      params.push(tournamentId);
    }
    return db.prepare(sql).all(...params);
  }
}
