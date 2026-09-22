import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { log } from "../utils/logger";

const SocketContext = createContext();

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  // Se incrementa en cada RE-conexión (no en la primera) para que las vistas re-sincronicen estado
  const [reconnectCount, setReconnectCount] = useState(0);
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    const newSocket = io({
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });

    newSocket.on("connect", () => {
      log("✅ Socket conectado");
      setConnected(true);
      if (hasConnectedOnce.current) {
        setReconnectCount((c) => c + 1);
      }
      hasConnectedOnce.current = true;
    });

    newSocket.on("disconnect", () => {
      log("❌ Socket desconectado");
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.removeAllListeners();
      newSocket.close();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected, reconnectCount }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

/**
 * Une el socket a una room y la re-une automáticamente tras cada reconexión.
 * Al desmontar / cambiar de id, sale de la room.
 */
export function useSocketRoom(socket, joinEvent, leaveEvent, id) {
  useEffect(() => {
    if (!socket || id == null || id === "") return undefined;

    const join = () => socket.emit(joinEvent, id);
    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      socket.off("connect", join);
      if (leaveEvent && socket.connected) socket.emit(leaveEvent, id);
    };
  }, [socket, joinEvent, leaveEvent, id]);
}
