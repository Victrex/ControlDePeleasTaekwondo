import { Server } from 'socket.io';

let io;

export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
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
  }
};
