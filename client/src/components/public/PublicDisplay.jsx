import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../utils/api';

export default function PublicDisplay() {
  const { tournamentId } = useParams();
  const { socket, connected } = useSocket();
  
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [currentFight, setCurrentFight] = useState(null);
  const [nextFights, setNextFights] = useState([]);
  const [completedFights, setCompletedFights] = useState([]);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'completed'
  const [loading, setLoading] = useState(true);
  const [brackets, setBrackets] = useState([]);
  const [selectedBracket, setSelectedBracket] = useState(null);
  const [bracketMatches, setBracketMatches] = useState([]);
  const [fightWinner, setFightWinner] = useState(null);
  const winnerTimeoutRef = useRef(null);

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

  useEffect(() => {
    if (selectedTournament) {
      console.log('🎯 Torneo seleccionado cambiado:', selectedTournament);
      loadCurrentFight();
      loadNextFights();
      loadBrackets();
      
      // Unirse a la sala del torneo
      if (socket) {
        socket.emit('join:tournament', selectedTournament.id);
      }
    }
    
    return () => {
      if (socket && selectedTournament) {
        socket.emit('leave:tournament', selectedTournament.id);
      }
    };
  }, [selectedTournament, socket]);

  useEffect(() => {
    if (selectedBracket) {
      loadBracketMatches(selectedBracket.id);
    }
  }, [selectedBracket]);

  useEffect(() => {
    if (socket) {
      socket.on('fight:updated', handleFightUpdate);
      socket.on('fight:current-changed', handleCurrentFightChange);
      socket.on('fight:created', handleFightUpdate);
      socket.on('fight:result-registered', handleResultRegistered);
      
      return () => {
        socket.off('fight:updated');
        socket.off('fight:current-changed');
        socket.off('fight:created');
        socket.off('fight:result-registered');
      };
    }
  }, [socket, selectedTournament]);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (winnerTimeoutRef.current) {
        clearTimeout(winnerTimeoutRef.current);
      }
    };
  }, []);

  const handleResultRegistered = (data) => {
    console.log('fight:result-registered recibido:', data);
    const tournamentIdFromData = data?.tournament_id || data?.tournamentId;
    if (selectedTournament && (!tournamentIdFromData || tournamentIdFromData === selectedTournament.id)) {
      // Determinar el ganador basado en los datos recibidos
      // Los campos pueden ser: final_winner, round_1_winner, round_2_winner, round_3_winner
      // con valores 'red' o 'blue'
      let winnerName = '';
      let winnerColor = '';
      
      // Verificar si hay un ganador final de la pelea
      const finalWinner = data.final_winner;
      
      if (finalWinner === 'red') {
        winnerName = data.competitor_red || currentFight?.competitor_red || 'Rojo';
        winnerColor = 'red';
      } else if (finalWinner === 'blue') {
        winnerName = data.competitor_blue || currentFight?.competitor_blue || 'Azul';
        winnerColor = 'blue';
      }
      
      if (winnerName && winnerColor) {
        console.log('Mostrando ganador:', winnerName, winnerColor);
        // Mostrar el ganador
        setFightWinner({ name: winnerName, color: winnerColor });
        
        // Limpiar timeout anterior si existe
        if (winnerTimeoutRef.current) {
          clearTimeout(winnerTimeoutRef.current);
        }
        
        // Después de 10 segundos, ocultar el ganador y cargar siguiente pelea
        winnerTimeoutRef.current = setTimeout(() => {
          setFightWinner(null);
          loadCurrentFight();
          loadNextFights();
          if (selectedBracket) {
            loadBracketMatches(selectedBracket.id);
          }
        }, 10000);
      } else {
        // Es un resultado parcial (round), solo actualizar la pelea actual
        loadCurrentFight();
      }
    }
  };

  const handleFightUpdate = (data) => {
    // data puede ser la pelea directamente o un objeto con tournament_id
    const tournamentIdFromData = data?.tournament_id || data?.tournamentId;
    if (selectedTournament && (!tournamentIdFromData || tournamentIdFromData === selectedTournament.id)) {
      loadCurrentFight();
      loadNextFights();
      // Recargar matches del bracket para actualizar ganadores
      if (selectedBracket) {
        loadBracketMatches(selectedBracket.id);
      }
    }
  };

  const handleCurrentFightChange = (fight) => {
    // El evento emite la pelea directamente
    if (selectedTournament && fight?.tournament_id === selectedTournament.id) {
      setCurrentFight(fight);
      loadNextFights();
    } else if (selectedTournament) {
      // Recargar si no podemos determinar el torneo
      loadCurrentFight();
      loadNextFights();
    }
  };

  const loadTournaments = async () => {
    try {
      // Cargar todos los torneos para mostrarlos en la lista
      const allTournaments = await api.getTournaments();
      console.log('🏆 Todos los torneos cargados:', allTournaments);
      
      setTournaments(allTournaments || []);
      
      // Seleccionar el primer torneo activo, o el primero disponible
      if (allTournaments && allTournaments.length > 0 && !selectedTournament) {
        const activeTournament = allTournaments.find(t => t.status === 'active');
        const tournamentToSelect = activeTournament || allTournaments[0];
        console.log('✅ Seleccionando torneo automáticamente:', tournamentToSelect);
        setSelectedTournament(tournamentToSelect);
      }
    } catch (error) {
      console.error('Error cargando torneos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentFight = async () => {
    if (!selectedTournament) {
      console.log('⚠️ loadCurrentFight: No hay torneo seleccionado');
      return;
    }
    try {
      console.log('🔄 Cargando pelea actual para torneo:', selectedTournament.id);
      const data = await api.getCurrentFight(selectedTournament.id);
      console.log('⚔️ Pelea actual cargada:', data);
      setCurrentFight(data);
    } catch (error) {
      console.log('⚠️ No hay pelea actual o error:', error.message);
      setCurrentFight(null);
    }
  };

  const loadNextFights = async () => {
    if (!selectedTournament) {
      console.log('⚠️ loadNextFights: No hay torneo seleccionado');
      return;
    }
    try {
      console.log('🔄 Cargando peleas para torneo:', selectedTournament.id);
      const fights = await api.getFights(selectedTournament.id);
      console.log('📋 Todas las peleas:', fights);
      const pending = fights.filter(f => f.status === 'pending').slice(0, 5);
      const completed = fights.filter(f => f.status === 'completed').reverse();
      console.log('📋 Peleas pendientes:', pending);
      console.log('✅ Peleas completadas:', completed);
      setNextFights(pending);
      setCompletedFights(completed);
    } catch (error) {
      console.error('Error cargando próximas peleas:', error);
    }
  };

  const loadBrackets = async () => {
    if (!selectedTournament) return;
    try {
      const res = await api.getBracketsByTournament(selectedTournament.id);
      setBrackets(res || []);
      if (res && res.length > 0) {
        setSelectedBracket(res[0]);
      }
    } catch (error) {
      console.error('Error cargando brackets:', error);
      setBrackets([]);
    }
  };

  const loadBracketMatches = async (bracketId) => {
    try {
      const res = await api.getBracketMatches(bracketId);
      setBracketMatches(res || []);
    } catch (error) {
      console.error('Error cargando matches del bracket:', error);
      setBracketMatches([]);
    }
  };

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

  // Debug logs
  console.log('🔍 Estado actual:', {
    loading,
    selectedTournament: selectedTournament?.id,
    currentFight: currentFight?.id,
    nextFightsCount: nextFights.length,
    connected
  });

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
            <div className="winner-trophy">🏆</div>
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
        <h1>🥋 Torneo de Taekwondo</h1>
        {selectedTournament && (
          <div className="tournament-info">
            <h2>{selectedTournament.name}</h2>
            <div className="meta">
              {selectedTournament.category && <span>{selectedTournament.category}</span>}
              {selectedTournament.division && <span>{selectedTournament.division}</span>}
              {selectedTournament.weight_class && <span>{selectedTournament.weight_class}</span>}
            </div>
          </div>
        )}
        <div className={`connection-indicator ${connected ? 'connected' : ''}`}>
          {connected ? '🟢 En vivo' : '🔴 Sin conexión'}
        </div>
      </header>

      <main className="public-main">
        {currentFight ? (
          <div className="current-fight-display">
            <h3>⚔️ PELEA EN CURSO</h3>
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
              📋 Próximas ({nextFights.length})
            </button>
            <button 
              className={`fights-tab ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              ✅ Finalizadas ({completedFights.length})
            </button>
          </div>

          {activeTab === 'pending' && (
            <div className="next-fights">
              {nextFights.length > 0 ? (
                <ul>
                  {nextFights.map((fight, idx) => (
                    <li key={fight.id}>
                      <span className="fight-number">#{idx + 1}</span>
                      <div className="fighter-info red-name">
                        <span className="name">{fight.competitor_red}</span>
                        {fight.academy_red && <span className="academy">({fight.academy_red})</span>}
                      </div>
                      <span className="vs">vs</span>
                      <div className="fighter-info blue-name">
                        <span className="name">{fight.competitor_blue}</span>
                        {fight.academy_blue && <span className="academy">({fight.academy_blue})</span>}
                      </div>
                    </li>
                  ))}
                </ul>
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
                            {fight.final_winner === 'red' && <span className="winner-icon">🏆</span>}
                          </div>
                          <span className="vs">vs</span>
                          <div className={`fighter-info blue-name ${fight.final_winner === 'blue' ? 'winner' : 'loser'}`}>
                            <span className="name">{fight.competitor_blue}</span>
                            {fight.final_winner === 'blue' && <span className="winner-icon">🏆</span>}
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
