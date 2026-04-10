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

  // Tabla de competidores de la llave
  db.exec(`
    CREATE TABLE IF NOT EXISTS bracket_competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bracket_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      academy TEXT,
      peto_color TEXT CHECK(peto_color IN ('blue', 'red')),
      seed INTEGER,
      eliminated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE
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
    db.exec(`ALTER TABLE bracket_matches ADD COLUMN next_match_slot INTEGER DEFAULT 1`);
  } catch (e) {}

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

  console.log('✅ Base de datos inicializada correctamente');
}

export default db;
