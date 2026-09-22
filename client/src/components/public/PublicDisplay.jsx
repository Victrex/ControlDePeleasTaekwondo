import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket, useSocketRoom } from '../../contexts/SocketContext';
import { Swords, Trophy, Circle, ClipboardList, CheckCircle2 } from 'lucide-react';
import api from '../../utils/api';
import { log, error as logError } from '../../utils/logger';

// Aplica un cambio de "pelea actual": la pelea recibida pasa a current y las demás
// current de la misma pista (o todas si no hay pista) vuelven a pending — mismo criterio que el servidor.
function applyCurrentChanged(fights, fight) {
  const pista = fight.pista;
  let found = false;
  const next = fights.map(f => {
    if (f.id === fight.id) {
      found = true;
      return { ...f, ...fight, status: 'current' };
    }
    if (f.status === 'current' && (!pista || f.pista === pista)) {
      return { ...f, status: 'pending' };
    }
    return f;
  });
  if (!found) next.push({ ...fight, status: 'current' });
  return next;
}

function upsertFight(fights, fight) {
  const idx = fights.findIndex(f => f.id === fight.id);
  if (idx === -1) {
    return [...fights, fight].sort((a, b) => a.order_index - b.order_index);
  }
  const next = fights.slice();
  next[idx] = { ...next[idx], ...fight };
  // Si cambió order_index, mantener el orden del servidor
  if (fights[idx].order_index !== fight.order_index) {
    next.sort((a, b) => a.order_index - b.order_index);
  }
  return next;
}

export default function PublicDisplay() {
  const { tournamentId } = useParams();
  const { socket, connected, reconnectCount } = useSocket();
  
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  // Todas las peleas del torneo seleccionado; se carga UNA vez y se actualiza por deltas de socket
  const [fights, setFights] = useState([]);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'completed'
  const [loading, setLoading] = useState(true);
  const [brackets, setBrackets] = useState([]);
  const [selectedBracket, setSelectedBracket] = useState(null);
  const [bracketMatches, setBracketMatches] = useState([]);
  const [fightWinner, setFightWinner] = useState(null);
  const [selectedPista, setSelectedPista] = useState(null);
  const selectedPistaRef = useRef(null);
  const selectedTournamentIdRef = useRef(null);
  const winnerTimeoutRef = useRef(null);

  selectedPistaRef.current = selectedPista;
  selectedTournamentIdRef.current = selectedTournament?.id ?? null;

  // Room del torneo (se re-une automáticamente al reconectar)
  useSocketRoom(socket, 'join:tournament', 'leave:tournament', selectedTournament?.id);

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    if (tournamentId && tournaments.length > 0) {
      const tournament = tournaments.find(t => t.id === parseInt(tournamentId));
      if (tournament) {
        setSelectedTournament(tournament);
      }
    } else if (tournaments.length > 0 && !selectedTournament) {
      // Seleccionar el primer torneo activo
      const active = tournaments.find(t => t.status === 'active');
      setSelectedTournament(active || tournaments[0]);
    }
  }, [tournamentId, tournaments]);

  // Carga inicial del torneo seleccionado (una sola petición de peleas)
  useEffect(() => {
    if (!selectedTournament) return;
    log('🎯 Torneo seleccionado cambiado:', selectedTournament.id);
    loadFights(selectedTournament.id);
    loadBrackets(selectedTournament.id);
  }, [selectedTournament]);

  // Tras una reconexión pudimos perder eventos: re-sincronizar estado completo
  useEffect(() => {
    if (reconnectCount > 0 && selectedTournamentIdRef.current) {
      loadFights(selectedTournamentIdRef.current);
    }
  }, [reconnectCount]);

  useEffect(() => {
    if (selectedBracket) {
      loadBracketMatches(selectedBracket.id);
    }
  }, [selectedBracket]);

  // Listeners de socket: registrados UNA vez por socket; usan refs para el estado actual
  useEffect(() => {
    if (!socket) return undefined;

    const isMine = (fight) => {
      const tid = fight?.tournament_id ?? fight?.tournamentId;
      return tid != null && tid === selectedTournamentIdRef.current;
    };

    const handleFightUpdate = (fight) => {
      if (!isMine(fight)) return;
      setFights(prev => upsertFight(prev, fight));
    };

    const handleFightCreated = (fight) => {
      if (!isMine(fight)) return;
      setFights(prev => upsertFight(prev, fight));
    };

    const handleFightDeleted = (fightId) => {
      setFights(prev => prev.some(f => f.id === fightId) ? prev.filter(f => f.id !== fightId) : prev);
    };

    const handleCurrentFightChange = (fight) => {
      if (!isMine(fight)) return;
      setFights(prev => applyCurrentChanged(prev, fight));
    };

    const handleOrderChanged = (list) => {
      if (!Array.isArray(list) || list.length === 0) return;
      if (!isMine(list[0])) return;
      setFights(list);
    };

    const handleResultRegistered = (data) => {
      if (!isMine(data)) return;
      // El payload es la pelea completa: actualizar estado local sin peticiones HTTP
      setFights(prev => upsertFight(prev, data));

      const pista = selectedPistaRef.current;
      if (pista && data.pista && data.pista !== pista) return;

      let winnerName = '';
      let winnerColor = '';
      if (data.final_winner === 'red') {
        winnerName = data.competitor_red || 'Rojo';
        winnerColor = 'red';
      } else if (data.final_winner === 'blue') {
        winnerName = data.competitor_blue || 'Azul';
        winnerColor = 'blue';
      }

      if (winnerName && winnerColor) {
        setFightWinner({ name: winnerName, color: winnerColor });
        if (winnerTimeoutRef.current) clearTimeout(winnerTimeoutRef.current);
        // Después de 10 segundos, ocultar el ganador (el estado ya está actualizado por socket)
        winnerTimeoutRef.current = setTimeout(() => {
          setFightWinner(null);
          winnerTimeoutRef.current = null;
        }, 10000);
      }
    };

    socket.on('fight:updated', handleFightUpdate);
    socket.on('fight:created', handleFightCreated);
    socket.on('fight:deleted', handleFightDeleted);
    socket.on('fight:current-changed', handleCurrentFightChange);
    socket.on('fights:order-changed', handleOrderChanged);
    socket.on('fight:result-registered', handleResultRegistered);

    return () => {
      socket.off('fight:updated', handleFightUpdate);
      socket.off('fight:created', handleFightCreated);
      socket.off('fight:deleted', handleFightDeleted);
      socket.off('fight:current-changed', handleCurrentFightChange);
      socket.off('fights:order-changed', handleOrderChanged);
      socket.off('fight:result-registered', handleResultRegistered);
    };
  }, [socket]);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (winnerTimeoutRef.current) {
        clearTimeout(winnerTimeoutRef.current);
      }
    };
  }, []);

  const loadTournaments = async () => {
    try {
      // Cargar todos los torneos para mostrarlos en la lista
      const allTournaments = await api.getTournaments();
      log('🏆 Torneos cargados:', allTournaments?.length);
      
      setTournaments(allTournaments || []);
      
      // Seleccionar el primer torneo activo, o el primero disponible
      if (allTournaments && allTournaments.length > 0 && !selectedTournament) {
        const activeTournament = allTournaments.find(t => t.status === 'active');
        const tournamentToSelect = activeTournament || allTournaments[0];
        setSelectedTournament(tournamentToSelect);
      }
    } catch (err) {
      logError('Error cargando torneos:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFights = async (tid) => {
    try {
      const data = await api.getFights(tid);
      // Evitar aplicar una respuesta tardía de un torneo que ya no está seleccionado
      if (selectedTournamentIdRef.current !== tid) return;
      setFights(Array.isArray(data) ? data : []);
    } catch (err) {
      logError('Error cargando peleas:', err);
    }
  };

  const loadBrackets = async (tid) => {
    try {
      const res = await api.getBracketsByTournament(tid);
      setBrackets(res || []);
      if (res && res.length > 0) {
        setSelectedBracket(res[0]);
      }
    } catch (err) {
      logError('Error cargando brackets:', err);
      setBrackets([]);
    }
  };

  const loadBracketMatches = async (bracketId) => {
    try {
      const res = await api.getBracketMatches(bracketId);
      setBracketMatches(res || []);
    } catch (err) {
      logError('Error cargando matches del bracket:', err);
      setBracketMatches([]);
    }
  };

  // Derivados del estado local (misma lógica que antes, sin HTTP por evento)
  const { currentFight, nextFights, completedFights } = useMemo(() => {
    const pista = selectedPista;
    const filtered = pista ? fights.filter(f => f.pista === pista) : fights;
    const currents = filtered.filter(f => f.status === 'current');
    // Sin filtro de pista, el servidor devolvía la primera fila (rowid más bajo)
    const current = currents.length > 0
      ? currents.reduce((a, b) => (a.id < b.id ? a : b))
      : null;
    return {
      currentFight: current,
      nextFights: filtered.filter(f => f.status === 'pending').slice(0, 10),
      completedFights: filtered.filter(f => f.status === 'completed').reverse()
    };
  }, [fights, selectedPista]);

  // Agrupar matches por ronda
  const matchesByRound = bracketMatches.reduce((acc, m) => {
    if (!acc[m.round]) acc[m.round] = [];
    acc[m.round].push(m);
    return acc;
  }, {});

  const getRoundName = (round, totalRounds) => {
    if (round === totalRounds) return 'FINAL';
    if (round === totalRounds - 1 && totalRounds > 1) return 'SEMIFINAL';
    if (round === totalRounds - 2 && totalRounds > 2) return 'CUARTOS';
    if (round === totalRounds - 3 && totalRounds > 3) return 'OCTAVOS';
    return `RONDA ${round}`;
  };

  const totalRounds = Math.max(...bracketMatches.map(m => m.round), 0);

  // Obtener el campeón si existe
  const champion = bracketMatches.length > 0 && matchesByRound[totalRounds]?.[0]?.winner_id
    ? matchesByRound[totalRounds][0]
    : null;

  if (loading) {
    return (
      <div className="public-loading">
        <div className="spinner-large"></div>
        <p>Cargando información del torneo...</p>
      </div>
    );
  }

  return (
    <div className="public-display">
      {/* Overlay del ganador */}
      {fightWinner && (
        <div className={`winner-overlay ${fightWinner.color}`}>
          <div className="winner-content">
            <div className="winner-trophy"><Trophy size={48} /></div>
            <div className="winner-label">¡GANADOR!</div>
            <div className="winner-name">{fightWinner.name}</div>
            <div className="winner-corner">Esquina {fightWinner.color === 'red' ? 'ROJA' : 'AZUL'}</div>
            <div className="winner-countdown">
              <span>Siguiente pelea en...</span>
              <div className="countdown-bar"></div>
            </div>
          </div>
        </div>
      )}

      <header className="public-header">
        <h1><Swords size={22} /> Torneo de Taekwondo</h1>
        {selectedTournament && (
          <div className="tournament-info">
            <h2>{selectedTournament.name}</h2>
            <div className="meta">
              {selectedTournament.category && <span>{selectedTournament.category}</span>}
              {selectedTournament.division && <span>{selectedTournament.division}</span>}
              {selectedTournament.weight_class && <span>{selectedTournament.weight_class}</span>}
            </div>
            {(selectedTournament.num_pistas || 1) > 1 && (
              <div className="pista-selector" style={{marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center'}}>
                <span style={{fontWeight: 'bold'}}>Pista:</span>
                <button
                  onClick={() => setSelectedPista(null)}
                  className={`btn-pista ${selectedPista === null ? 'active' : ''}`}
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '4px',
                    border: selectedPista === null ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                    background: selectedPista === null ? 'rgba(255,255,255,0.2)' : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: selectedPista === null ? 'bold' : 'normal'
                  }}
                >
                  Todas
                </button>
                {Array.from({length: selectedTournament.num_pistas}, (_, i) => (
                  <button
                    key={i+1}
                    onClick={() => setSelectedPista(i+1)}
                    className={`btn-pista ${selectedPista === i+1 ? 'active' : ''}`}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      border: selectedPista === i+1 ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                      background: selectedPista === i+1 ? 'rgba(255,255,255,0.2)' : 'transparent',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: selectedPista === i+1 ? 'bold' : 'normal'
                    }}
                  >
                    Pista {i+1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={`connection-indicator ${connected ? 'connected' : ''}`}>
          {connected ? <><Circle size={10} fill="#22c55e" color="#22c55e" /> En vivo</> : <><Circle size={10} fill="#ef4444" color="#ef4444" /> Sin conexión</>}
        </div>
      </header>

      <main className="public-main">
        {currentFight ? (
          <div className="current-fight-display">
            <h3><Swords size={16} /> PELEA EN CURSO {(selectedTournament?.num_pistas || 1) > 1 ? `- Pista ${currentFight.pista || 1}` : ''}</h3>
            <div className="fighters">
              <div className="fighter red">
                <br />
                <div className="corner-label">ROJO</div>
                <div className="fighter-name">{currentFight.competitor_red}</div>
                <div className="fighter-academy">{currentFight.academy_red || ''}</div>
                <div className="rounds-won">
                  {[1, 2, 3].map(r => (
                    <span 
                      key={r} 
                      className={`round-indicator ${currentFight[`round_${r}_winner`] === 'red' ? 'won' : ''}`}
                    />
                  ))}
                </div>
              </div>
              
              <div className="vs-display">
                <span>VS</span>
              </div>
              
              <div className="fighter blue">
                <div className="corner-label">AZUL</div>
                <br />
                <div className="fighter-name">{currentFight.competitor_blue}</div>
                <div className="fighter-academy">{currentFight.academy_blue || ''}</div>
                <div className="rounds-won">
                  {[1, 2, 3].map(r => (
                    <span 
                      key={r} 
                      className={`round-indicator ${currentFight[`round_${r}_winner`] === 'blue' ? 'won' : ''}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-current-fight">
            <h3>Esperando próxima pelea...</h3>
          </div>
        )}

        <div className="fights-section">
          <div className="fights-tabs">
            <button 
              className={`fights-tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              <ClipboardList size={14} /> Próximas ({nextFights.length})
            </button>
            <button 
              className={`fights-tab ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              <CheckCircle2 size={14} /> Finalizadas ({completedFights.length})
            </button>
          </div>

          {activeTab === 'pending' && (
            <div className="next-fights">
              {nextFights.length > 0 ? (
                <div className="upcoming-fights-list">
                  {nextFights.map((fight, idx) => (
                    <div key={fight.id} className={`upcoming-fight-card ${idx === 0 ? 'upcoming-fight-next' : ''}`}>
                      <div className="ufc-number">
                        {idx === 0
                          ? <span className="ufc-next-label">SIGUIENTE</span>
                          : <span className="ufc-num">#{idx + 1}</span>
                        }
                      </div>
                      <div className="ufc-body">
                        <div className="ufc-red">
                          <span className="ufc-corner-dot red-dot"></span>
                          <div className="ufc-fighter">
                            <span className="ufc-name">{fight.competitor_red}</span>
                            {fight.academy_red && <span className="ufc-academy">{fight.academy_red}</span>}
                          </div>
                        </div>
                        <div className="ufc-center">
                          <span className="ufc-vs">VS</span>
                          {(selectedTournament?.num_pistas || 1) > 1 && (
                            <span className="ufc-pista-badge">P{fight.pista || 1}</span>
                          )}
                          {fight.bracket_round && (
                            <span className="ufc-round-badge">{fight.bracket_round}</span>
                          )}
                        </div>
                        <div className="ufc-blue">
                          <div className="ufc-fighter ufc-fighter-right">
                            <span className="ufc-name">{fight.competitor_blue}</span>
                            {fight.academy_blue && <span className="ufc-academy">{fight.academy_blue}</span>}
                          </div>
                          <span className="ufc-corner-dot blue-dot"></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-fights-message">No hay peleas pendientes</p>
              )}
            </div>
          )}

          {activeTab === 'completed' && (
            <div className="completed-fights">
              {completedFights.length > 0 ? (
                <ul>
                  {completedFights.map((fight) => {
                    const winnerName = fight.final_winner === 'red' ? fight.competitor_red : fight.competitor_blue;
                    const winnerColor = fight.final_winner;
                    return (
                      <li key={fight.id} className="completed-fight-item">
                        <div className="fight-competitors">
                          <div className={`fighter-info red-name ${fight.final_winner === 'red' ? 'winner' : 'loser'}`}>
                            <span className="name">{fight.competitor_red}</span>
                            {fight.final_winner === 'red' && <span className="winner-icon"><Trophy size={14} /></span>}
                          </div>
                          <span className="vs">vs</span>
                          <div className={`fighter-info blue-name ${fight.final_winner === 'blue' ? 'winner' : 'loser'}`}>
                            <span className="name">{fight.competitor_blue}</span>
                            {fight.final_winner === 'blue' && <span className="winner-icon"><Trophy size={14} /></span>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="no-fights-message">No hay peleas finalizadas</p>
              )}
            </div>
          )}
        </div>
      </main>

      {tournaments.length > 1 && (
        <aside className="tournament-selector">
          <h4>Otros torneos</h4>
          <ul>
            {tournaments
              .filter(t => t.id !== selectedTournament?.id)
              .map(t => (
                <li key={t.id} onClick={() => setSelectedTournament(t)}>
                  {t.name}
                </li>
              ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
