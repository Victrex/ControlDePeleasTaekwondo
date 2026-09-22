import express from 'express';
import { createServer } from 'http';
import session from 'express-session';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';
import connectSqlite3 from 'connect-sqlite3';

import db, { initializeDatabase } from './config/database.js';
import { initializeSocket } from './config/socket.js';
import { attachUser } from './middleware/auth.js';
import apiRoutes from './routes/api.js';

// Configuración de ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DIST_DIR = join(__dirname, '../dist');
const HAS_BUILD = existsSync(join(DIST_DIR, 'index.html'));

// Detrás de ngrok (proxy TLS) para que express-session vea req.secure correctamente
app.set('trust proxy', 1);

// Configurar SQLite session store
const SQLiteStore = connectSqlite3(session);

// ============================================
// MIDDLEWARE
// ============================================

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesiones
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: join(__dirname, '../database')
  }),
  secret: process.env.SESSION_SECRET || 'taekwondo_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// Adjuntar usuario a req
app.use(attachUser);

// ============================================
// RUTAS
// ============================================

// API routes
app.use('/api', apiRoutes);

// Servir el frontend construido (npm run build) cuando exista.
// En desarrollo Vite corre en :5173 con proxy, así que esto no interfiere.
if (IS_PRODUCTION || HAS_BUILD) {
  // Assets con hash: cache larga. index.html: sin cache para que los clientes tomen nuevos builds.
  app.use(express.static(DIST_DIR, {
    index: false,
    maxAge: '1y',
    immutable: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

// ============================================
// INICIALIZACIÓN
// ============================================

async function startServer() {
  try {
    // Inicializar base de datos
    await initializeDatabase();

    // Los timers viven en memoria: tras un reinicio ninguno está corriendo
    db.prepare('UPDATE fights SET timer_running = 0 WHERE timer_running = 1').run();

    // Inicializar Socket.IO
    initializeSocket(server);

    // Iniciar servidor
    server.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('🥋 Sistema de Torneos de Taekwondo');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
      console.log(`� Frontend: ${(IS_PRODUCTION || HAS_BUILD) ? 'sirviendo /dist (build)' : 'usar Vite dev (npm run dev) en :5173'}`);
      console.log(`�📊 Panel Admin: http://localhost:${PORT}/admin`);
      console.log(`👥 Vista Pública: http://localhost:${PORT}/public`);
      console.log(`📺 Scoreboard: http://localhost:${PORT}/scoreboard/:fightId`);
      console.log(`⚖️  Panel Juez: http://localhost:${PORT}/judge/:fightId?judgeId=N`);
      console.log(`🥋 Control Scoring: http://localhost:${PORT}/admin/scoring/:fightId`);
      console.log('');
      console.log('🔐 Credenciales por defecto:');
      console.log('   Usuario: admin');
      console.log('   Contraseña: admin123');
      console.log('');
      console.log('💡 Para compartir con Ngrok:');
      console.log(`   ngrok http ${PORT}`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

// Manejar cierre graceful
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado');
    db.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT recibido, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado');
    db.close();
    process.exit(0);
  });
});

// Iniciar servidor
startServer();

export default app;
