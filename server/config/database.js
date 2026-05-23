import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, '../../database/tournament.db'));

// Habilitar foreign keys
db.pragma('foreign_keys = ON');

// Inicializar tablas
export function initializeDatabase() {
  // Tabla de usuarios
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'viewer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de configuración del torneo
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      min_rest_fights INTEGER NOT NULL DEFAULT 2,
      num_rounds INTEGER NOT NULL DEFAULT 2 CHECK(num_rounds IN (2, 3)),
      allow_victory_by_rounds BOOLEAN NOT NULL DEFAULT 1,
      allow_victory_by_injury BOOLEAN NOT NULL DEFAULT 1,
      allow_victory_by_abandon BOOLEAN NOT NULL DEFAULT 1,
      enable_auto_validation BOOLEAN NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de torneos/llaves
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      division TEXT,
      weight_class TEXT,
      num_pistas INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de peleas
  db.exec(`
    CREATE TABLE IF NOT EXISTS fights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      bracket_id INTEGER,
      fight_number INTEGER NOT NULL,
      competitor_red TEXT NOT NULL,
      competitor_blue TEXT NOT NULL,
      academy_red TEXT,
      academy_blue TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'current', 'completed', 'cancelled', 'postponed')),
      order_index INTEGER NOT NULL,
      round_1_winner TEXT CHECK(round_1_winner IN ('red', 'blue', NULL)),
      round_2_winner TEXT CHECK(round_2_winner IN ('red', 'blue', NULL)),
      round_3_winner TEXT CHECK(round_3_winner IN ('red', 'blue', NULL)),
      final_winner TEXT CHECK(final_winner IN ('red', 'blue', NULL)),
      victory_type TEXT CHECK(victory_type IN ('rounds', 'injury', 'abandon', NULL)),
      notes TEXT,
      pista INTEGER NOT NULL DEFAULT 1,
      bracket_position TEXT,
      bracket_round TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE SET NULL
    )
  `);

  // Agregar columna bracket_id si no existe (migración)
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN bracket_id INTEGER REFERENCES brackets(id) ON DELETE SET NULL`);
  } catch (e) {
    // columna ya existe
  }

  // Tabla de histórico de peleas (para validaciones de descanso)
  db.exec(`
    CREATE TABLE IF NOT EXISTS fight_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      competitor_name TEXT NOT NULL,
      fight_id INTEGER NOT NULL,
      fight_order INTEGER NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (fight_id) REFERENCES fights(id) ON DELETE CASCADE
    )
  `);

  // Tabla de podios
  db.exec(`
    CREATE TABLE IF NOT EXISTS podiums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL UNIQUE,
      first_place TEXT NOT NULL,
      first_place_academy TEXT,
      second_place TEXT NOT NULL,
      second_place_academy TEXT,
      third_place_1 TEXT NOT NULL,
      third_place_1_academy TEXT,
      third_place_2 TEXT,
      third_place_2_academy TEXT,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    )
  `);

  // Tabla de llaves (brackets)
  db.exec(`
    CREATE TABLE IF NOT EXISTS brackets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    )
  `);

  // Tabla de atletas (registro global reutilizable)
  db.exec(`
    CREATE TABLE IF NOT EXISTS athletes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dob TEXT,
      weight REAL,
      gender TEXT CHECK(gender IN ('M', 'F')),
      belt INTEGER DEFAULT 0 CHECK(belt BETWEEN 0 AND 6),
      academy TEXT,
      license_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de plantillas de categorías
  db.exec(`
    CREATE TABLE IF NOT EXISTS category_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gender TEXT DEFAULT 'Both' CHECK(gender IN ('M', 'F', 'Both')),
      min_age INTEGER DEFAULT 0,
      max_age INTEGER DEFAULT 99,
      min_weight REAL DEFAULT 0,
      max_weight REAL DEFAULT 999,
      belt_min INTEGER DEFAULT 0 CHECK(belt_min BETWEEN 0 AND 6),
      belt_max INTEGER DEFAULT 6 CHECK(belt_max BETWEEN 0 AND 6),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de competidores de la llave
  db.exec(`
    CREATE TABLE IF NOT EXISTS bracket_competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bracket_id INTEGER NOT NULL,
      athlete_id INTEGER,
      name TEXT NOT NULL,
      academy TEXT,
      peto_color TEXT CHECK(peto_color IN ('blue', 'red')),
      seed INTEGER,
      eliminated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE,
      FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE SET NULL
    )
  `);

  // Tabla de partidas del bracket (para manejar rondas)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bracket_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bracket_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      match_number INTEGER NOT NULL,
      competitor1_id INTEGER,
      competitor2_id INTEGER,
      winner_id INTEGER,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'current', 'completed')),
      next_match_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE,
      FOREIGN KEY (competitor1_id) REFERENCES bracket_competitors(id),
      FOREIGN KEY (competitor2_id) REFERENCES bracket_competitors(id),
      FOREIGN KEY (winner_id) REFERENCES bracket_competitors(id),
      FOREIGN KEY (next_match_id) REFERENCES bracket_matches(id)
    )
  `);

  // Tabla de configuración de scoring por torneo
  db.exec(`
    CREATE TABLE IF NOT EXISTS scoring_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL UNIQUE,
      round_time_seconds INTEGER NOT NULL DEFAULT 120,
      rest_time_seconds INTEGER NOT NULL DEFAULT 60,
      num_rounds INTEGER NOT NULL DEFAULT 3,
      gap_point INTEGER NOT NULL DEFAULT 20,
      max_gam_jeom INTEGER NOT NULL DEFAULT 10,
      judge_window_ms INTEGER NOT NULL DEFAULT 1500,
      num_judges INTEGER NOT NULL DEFAULT 3,
      min_judges_agree INTEGER NOT NULL DEFAULT 0,
      points_punch_body INTEGER NOT NULL DEFAULT 1,
      points_kick_body INTEGER NOT NULL DEFAULT 2,
      points_kick_head INTEGER NOT NULL DEFAULT 3,
      points_spinning_kick_body INTEGER NOT NULL DEFAULT 4,
      points_spinning_kick_head INTEGER NOT NULL DEFAULT 5,
      gam_jeom_points INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    )
  `);

  // Tabla de puntos otorgados oficiales
  db.exec(`
    CREATE TABLE IF NOT EXISTS fight_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fight_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      team TEXT NOT NULL CHECK(team IN ('red', 'blue')),
      action TEXT NOT NULL CHECK(action IN ('punch_body', 'kick_body', 'kick_head', 'spinning_kick_body', 'spinning_kick_head', 'gam_jeom')),
      points INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fight_id) REFERENCES fights(id) ON DELETE CASCADE
    )
  `);

  // Tabla de inputs crudos de jueces (buffer de consenso)
  db.exec(`
    CREATE TABLE IF NOT EXISTS judge_inputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fight_id INTEGER NOT NULL,
      judge_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      team TEXT NOT NULL CHECK(team IN ('red', 'blue')),
      action TEXT NOT NULL CHECK(action IN ('punch_body', 'kick_body', 'kick_head', 'spinning_kick_body', 'spinning_kick_head')),
      timestamp INTEGER NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (fight_id) REFERENCES fights(id) ON DELETE CASCADE
    )
  `);

  // Migraciones para tablas existentes
  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN status TEXT DEFAULT 'active'`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN num_pistas INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN pista INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE bracket_competitors ADD COLUMN seed INTEGER`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE bracket_competitors ADD COLUMN eliminated INTEGER DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE bracket_competitors ADD COLUMN athlete_id INTEGER REFERENCES athletes(id) ON DELETE SET NULL`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE bracket_matches ADD COLUMN next_match_slot INTEGER DEFAULT 1`);
  } catch (e) {}

  // Migraciones de scoring en fights
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN score_red INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN score_blue INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN gam_jeom_red INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN gam_jeom_blue INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN timer_running INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE fights ADD COLUMN timer_remaining_ms INTEGER`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE scoring_config ADD COLUMN min_judges_agree INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE brackets ADD COLUMN fixed_pista INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE brackets ADD COLUMN pista_num INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {}

  // ── Migración v1: sistema de 10 niveles KUP (belt 0-9) ─────────────────────
  // Remapeo: 0→0, 1(Amarillo)→2, 2(Naranja)→3, 3(Verde)→4, 4(Azul)→6, 5(Rojo)→7, 6(Negro)→9
  const schemaVersion = db.pragma('user_version', { simple: true });
  if (schemaVersion < 1) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      // Recrear athletes con CHECK(belt BETWEEN 0 AND 9)
      db.exec(`
        CREATE TABLE athletes_kup_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          dob TEXT,
          weight REAL,
          gender TEXT CHECK(gender IN ('M', 'F')),
          belt INTEGER DEFAULT 0 CHECK(belt BETWEEN 0 AND 9),
          academy TEXT,
          license_number TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec(`
        INSERT INTO athletes_kup_new
        SELECT id, name, dob, weight, gender,
          CASE belt
            WHEN 0 THEN 0  WHEN 1 THEN 2  WHEN 2 THEN 3
            WHEN 3 THEN 4  WHEN 4 THEN 6  WHEN 5 THEN 7
            WHEN 6 THEN 9  ELSE belt
          END,
          academy, license_number, created_at
        FROM athletes
      `);
      db.exec(`DROP TABLE athletes`);
      db.exec(`ALTER TABLE athletes_kup_new RENAME TO athletes`);

      // Recrear category_templates con CHECK(belt BETWEEN 0 AND 9)
      db.exec(`
        CREATE TABLE category_templates_kup_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          gender TEXT DEFAULT 'Both' CHECK(gender IN ('M', 'F', 'Both')),
          min_age INTEGER DEFAULT 0,
          max_age INTEGER DEFAULT 99,
          min_weight REAL DEFAULT 0,
          max_weight REAL DEFAULT 999,
          belt_min INTEGER DEFAULT 0 CHECK(belt_min BETWEEN 0 AND 9),
          belt_max INTEGER DEFAULT 9 CHECK(belt_max BETWEEN 0 AND 9),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec(`
        INSERT INTO category_templates_kup_new
        SELECT id, name, gender, min_age, max_age, min_weight, max_weight,
          CASE belt_min
            WHEN 0 THEN 0  WHEN 1 THEN 2  WHEN 2 THEN 3
            WHEN 3 THEN 4  WHEN 4 THEN 6  WHEN 5 THEN 7
            WHEN 6 THEN 9  ELSE belt_min
          END,
          CASE belt_max
            WHEN 0 THEN 0  WHEN 1 THEN 2  WHEN 2 THEN 3
            WHEN 3 THEN 4  WHEN 4 THEN 6  WHEN 5 THEN 7
            WHEN 6 THEN 9  ELSE belt_max
          END,
          created_at
        FROM category_templates
      `);
      db.exec(`DROP TABLE category_templates`);
      db.exec(`ALTER TABLE category_templates_kup_new RENAME TO category_templates`);
    })();
    db.pragma('foreign_keys = ON');
    db.pragma('user_version = 1');
    console.log('✅ Migración KUP aplicada: belt expandido a 10 niveles (0-9)');
  }

  // Insertar configuración por defecto si no existe
  const configExists = db.prepare('SELECT id FROM tournament_config WHERE id = 1').get();
  if (!configExists) {
    db.prepare(`
      INSERT INTO tournament_config (id, min_rest_fights, num_rounds, allow_victory_by_rounds, 
                                      allow_victory_by_injury, allow_victory_by_abandon, enable_auto_validation)
      VALUES (1, 2, 2, 1, 1, 1, 1)
    `).run();
  }

  // Crear usuario admin por defecto si no existe
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    // Password: admin123 (cambiar en producción)
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'admin');
  }

  // Seed de categorías estándar si no existen
  const catCount = db.prepare('SELECT COUNT(*) as c FROM category_templates').get();
  if (catCount.c === 0) {
    const insertCat = db.prepare(`
      INSERT INTO category_templates (name, gender, min_age, max_age, min_weight, max_weight, belt_min, belt_max)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seedCategories = [
      // belt 0-8 = colores (Blanco→Rojo-Negro), 9 = Negro
      ['Pre-Mini Colores Mixto',   'Both', 4,  6,  0, 999, 0, 8],
      ['Infantil A Colores M',     'M',    7,  9,  0, 999, 0, 8],
      ['Infantil A Colores F',     'F',    7,  9,  0, 999, 0, 8],
      ['Infantil B Colores M',     'M',   10, 11,  0, 999, 0, 8],
      ['Infantil B Colores F',     'F',   10, 11,  0, 999, 0, 8],
      ['Infantil Negro M',         'M',    7, 11,  0, 999, 9, 9],
      ['Infantil Negro F',         'F',    7, 11,  0, 999, 9, 9],
      ['Pre-Cadete Colores M',     'M',   12, 13,  0, 999, 0, 8],
      ['Pre-Cadete Colores F',     'F',   12, 13,  0, 999, 0, 8],
      ['Cadete Colores M',         'M',   14, 15,  0, 999, 0, 8],
      ['Cadete Colores F',         'F',   14, 15,  0, 999, 0, 8],
      ['Cadete Negro M',           'M',   12, 15,  0, 999, 9, 9],
      ['Cadete Negro F',           'F',   12, 15,  0, 999, 9, 9],
      ['Junior Colores M',         'M',   16, 17,  0, 999, 0, 8],
      ['Junior Colores F',         'F',   16, 17,  0, 999, 0, 8],
      ['Junior Negro M',           'M',   16, 17,  0, 999, 9, 9],
      ['Junior Negro F',           'F',   16, 17,  0, 999, 9, 9],
      ['Senior Negro M',           'M',   18, 40,  0, 999, 9, 9],
      ['Senior Negro F',           'F',   18, 40,  0, 999, 9, 9],
      ['Master Negro M',           'M',   41, 99,  0, 999, 9, 9],
      ['Master Negro F',           'F',   41, 99,  0, 999, 9, 9],
    ];
    const seedTx = db.transaction(() => {
      for (const row of seedCategories) insertCat.run(...row);
    });
    seedTx();
  }

  console.log('✅ Base de datos inicializada correctamente');
}

export default db;
