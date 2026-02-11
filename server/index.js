import express from 'express';
import { createServer } from 'http';
import session from 'express-session';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
    secure: process.env.NODE_ENV === 'production',
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

// Servir archivos estáticos del cliente en producción
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
  });
}

// ============================================
// INICIALIZACIÓN
// ============================================

async function startServer() {
  try {
    // Inicializar base de datos
    await initializeDatabase();

    // Inicializar Socket.IO
    initializeSocket(server);

    // Iniciar servidor
    server.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('🥋 Sistema de Torneos de Taekwondo');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
      console.log(`📊 Panel Admin: http://localhost:${PORT}/admin`);
      console.log(`👥 Vista Pública: http://localhost:${PORT}/public`);
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
