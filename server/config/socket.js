import { Server } from 'socket.io';

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

export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Pre-load scoring service
  import('../services/scoringService.js').then(m => {
    scoringServiceRef = m.scoringService;
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`🔌 Cliente desconectado: ${socket.id}`);
    });

    socket.on('join-admin', () => {
      socket.join('admin-room');
      console.log(`👤 Admin unido: ${socket.id}`);
    });

    socket.on('join-public', () => {
      socket.join('public-room');
      console.log(`👥 Público unido: ${socket.id}`);
    });

    socket.on('join-judge', (data) => {
      socket.join(`judge-room`);
      console.log(`⚖️ Juez unido: ${socket.id} (judge ${data?.judgeId})`);
    });

    socket.on('join-scoreboard', (data) => {
      socket.join(`scoreboard-room`);
      console.log(`📺 Scoreboard unido: ${socket.id} (fight ${data?.fightId})`);
    });

    // Judge input via WebSocket (real-time scoring)
    socket.on('judge:input', (data) => {
      const svc = getScoringService();
      if (!svc) {
        console.error('Scoring service not loaded yet');
        return;
      }
      try {
        const { fightId, judgeId, team, action } = data;
        if (!fightId || !judgeId || !team || !action) return;
        svc.processJudgeInput(fightId, judgeId, team, action, Date.now());
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

// Eventos en tiempo real
export const emitEvents = {
  // Emitir actualización de pelea
  fightUpdated: (fight) => {
    const io = getIO();
    io.emit('fight:updated', fight);
  },

  // Emitir cambio de orden
  orderChanged: (fights) => {
    const io = getIO();
    io.emit('fights:order-changed', fights);
  },

  // Emitir nueva pelea actual
  currentFightChanged: (fight) => {
    const io = getIO();
    io.emit('fight:current-changed', fight);
  },

  // Emitir pelea creada
  fightCreated: (fight) => {
    const io = getIO();
    io.emit('fight:created', fight);
  },

  // Emitir pelea eliminada
  fightDeleted: (fightId) => {
    const io = getIO();
    io.emit('fight:deleted', fightId);
  },

  // Emitir resultado registrado
  resultRegistered: (fight) => {
    const io = getIO();
    io.emit('fight:result-registered', fight);
  },

  // Emitir configuración actualizada
  configUpdated: (config) => {
    const io = getIO();
    io.emit('config:updated', config);
  },

  // Emitir podio generado
  podiumGenerated: (podium) => {
    const io = getIO();
    io.emit('podium:generated', podium);
  },

  // Emitir torneo completado
  tournamentCompleted: (tournamentId) => {
    const io = getIO();
    io.emit('tournament:completed', tournamentId);
  },

  // Emitir torneo eliminado
  tournamentDeleted: (data) => {
    const io = getIO();
    io.emit('tournament:deleted', data);
  }
};
