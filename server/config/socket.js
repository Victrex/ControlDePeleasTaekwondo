import { Server } from 'socket.io';

const DEBUG = process.env.NODE_ENV !== 'production';
const log = (...args) => { if (DEBUG) console.log(...args); };

let io;
let scoringServiceRef = null;

// Lazy load scoring service to avoid circular dependency
function getScoringService() {
  if (!scoringServiceRef) {
    import('../services/scoringService.js').then(m => {
      scoringServiceRef = m.scoringService;
    });
  }
  return scoringServiceRef;
}

// ============================================
// ROOMS
// ============================================
export const rooms = {
  tournament: (tournamentId) => `tournament:${tournamentId}`,
  fight: (fightId) => `fight:${fightId}`,
  admin: 'admin'
};

function toId(value) {
  const n = typeof value === 'object' && value !== null ? Number(value.id) : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function joinTournament(socket, tournamentId) {
  const id = toId(tournamentId);
  if (!id) return;
  // Un cliente sólo observa un torneo a la vez: salir del anterior evita acumular rooms
  if (socket.data.tournamentId && socket.data.tournamentId !== id) {
    socket.leave(rooms.tournament(socket.data.tournamentId));
  }
  socket.data.tournamentId = id;
  socket.join(rooms.tournament(id));
  log(`🏟️ ${socket.id} -> ${rooms.tournament(id)}`);
}

function leaveTournament(socket, tournamentId) {
  const id = toId(tournamentId);
  if (!id) return;
  socket.leave(rooms.tournament(id));
  if (socket.data.tournamentId === id) socket.data.tournamentId = null;
}

function joinFight(socket, fightId) {
  const id = toId(fightId);
  if (!id) return;
  if (socket.data.fightId && socket.data.fightId !== id) {
    socket.leave(rooms.fight(socket.data.fightId));
  }
  socket.data.fightId = id;
  socket.join(rooms.fight(id));
  log(`🥋 ${socket.id} -> ${rooms.fight(id)}`);
}

function leaveFight(socket, fightId) {
  const id = toId(fightId);
  if (!id) return;
  socket.leave(rooms.fight(id));
  if (socket.data.fightId === id) socket.data.fightId = null;
}

export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    // Los clientes sólo envían mensajes pequeños (joins / judge:input)
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 25000,
    pingTimeout: 20000
  });

  // Pre-load scoring service
  import('../services/scoringService.js').then(m => {
    scoringServiceRef = m.scoringService;
  });

  io.on('connection', (socket) => {
    log(`🔌 Cliente conectado: ${socket.id}`);

    socket.on('disconnect', () => {
      log(`🔌 Cliente desconectado: ${socket.id}`);
    });

    // --- Rooms ---
    socket.on('join:tournament', (tournamentId) => joinTournament(socket, tournamentId));
    socket.on('leave:tournament', (tournamentId) => leaveTournament(socket, tournamentId));
    socket.on('join:fight', (fightId) => joinFight(socket, fightId));
    socket.on('leave:fight', (fightId) => leaveFight(socket, fightId));
    socket.on('join:admin', () => socket.join(rooms.admin));

    // --- Alias legacy (compatibilidad con clientes antiguos) ---
    socket.on('join-admin', () => socket.join(rooms.admin));
    socket.on('join-public', () => { /* la room pública ahora es por torneo (join:tournament) */ });
    socket.on('join-judge', (data) => joinFight(socket, data?.fightId));
    socket.on('join-scoreboard', (data) => joinFight(socket, data?.fightId));

    // Judge input via WebSocket (real-time scoring)
    socket.on('judge:input', (data) => {
      const svc = getScoringService();
      if (!svc) {
        console.error('Scoring service not loaded yet');
        return;
      }
      try {
        const { fightId, judgeId, judgeName, team, action } = data || {};
        if (!fightId || !judgeId || !team || !action) return;
        svc.processJudgeInput(fightId, judgeId, team, action, Date.now(), judgeName);
      } catch (error) {
        console.error('Error processing judge input:', error.message);
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.IO no ha sido inicializado');
  }
  return io;
}

// ============================================
// EMISIÓN DIRIGIDA (rooms)
// ============================================
export const emitTo = {
  // Sólo a quienes observan ese torneo (público + dashboards admin)
  tournament(tournamentId, event, payload) {
    if (!tournamentId) return;
    getIO().to(rooms.tournament(tournamentId)).emit(event, payload);
  },
  // Sólo a scoreboards / jueces / operadores de esa pelea
  fight(fightId, event, payload) {
    if (!fightId) return;
    getIO().to(rooms.fight(fightId)).emit(event, payload);
  },
  // A observadores del torneo y de la pelea (Socket.IO deduplica sockets en ambas rooms)
  fightAndTournament(fight, event, payload) {
    if (!fight) return;
    const targets = [];
    if (fight.tournament_id) targets.push(rooms.tournament(fight.tournament_id));
    if (fight.id) targets.push(rooms.fight(fight.id));
    if (targets.length === 0) return;
    getIO().to(targets).emit(event, payload);
  },
  admin(event, payload) {
    getIO().to(rooms.admin).emit(event, payload);
  }
};

// Eventos en tiempo real
export const emitEvents = {
  // Actualización de pelea (estado, scores, ganadores de round, etc.)
  fightUpdated: (fight) => {
    emitTo.fightAndTournament(fight, 'fight:updated', fight);
  },

  // Cambio de orden: sólo los observadores del torneo lo necesitan
  orderChanged: (fights) => {
    const tournamentId = fights?.[0]?.tournament_id;
    if (!tournamentId) return;
    emitTo.tournament(tournamentId, 'fights:order-changed', fights);
  },

  currentFightChanged: (fight) => {
    emitTo.fightAndTournament(fight, 'fight:current-changed', fight);
  },

  fightCreated: (fight) => {
    emitTo.tournament(fight?.tournament_id, 'fight:created', fight);
  },

  fightDeleted: (fightId, tournamentId) => {
    emitTo.tournament(tournamentId, 'fight:deleted', fightId);
    emitTo.fight(fightId, 'fight:deleted', fightId);
  },

  resultRegistered: (fight) => {
    emitTo.fightAndTournament(fight, 'fight:result-registered', fight);
  },

  // Configuración global: sólo la consumen operadores
  configUpdated: (config) => {
    emitTo.admin('config:updated', config);
  },

  podiumGenerated: (podium, tournamentId) => {
    emitTo.tournament(tournamentId ?? podium?.tournament_id, 'podium:generated', podium);
    emitTo.admin('podium:generated', podium);
  },

  tournamentCompleted: (tournamentId) => {
    emitTo.tournament(tournamentId, 'tournament:completed', tournamentId);
    emitTo.admin('tournament:completed', tournamentId);
  },

  tournamentDeleted: (data) => {
    emitTo.tournament(data?.id, 'tournament:deleted', data);
    emitTo.admin('tournament:deleted', data);
  }
};
