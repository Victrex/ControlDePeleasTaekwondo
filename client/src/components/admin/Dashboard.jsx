import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../utils/api';
import BracketManager from './BracketManager';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();
  
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [fights, setFights] = useState([]);
  const [brackets, setBrackets] = useState([]);
  const [currentFight, setCurrentFight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewTournament, setShowNewTournament] = useState(false);
  const [showNewFight, setShowNewFight] = useState(false);
  const [creatingFight, setCreatingFight] = useState(false);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [selectedBracketId, setSelectedBracketId] = useState(null);
  
  // Form states
  const [tournamentForm, setTournamentForm] = useState({
    name: '',
    category: '',
    division: '',
    weight_class: ''
  });
  
  const [fightForm, setFightForm] = useState({
    competitor_red: '',
    competitor_blue: '',
    academy_red: '',
    academy_blue: ''
  });
  // Nuevo: lista de peleadores para la llave
  const [competitors, setCompetitors] = useState([
    { name: '', academy: '' },
    { name: '', academy: '' }
  ]);

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    if (selectedTournament) {
      loadFights(selectedTournament.id);
    }
  }, [selectedTournament]);

  useEffect(() => {
    if (socket) {
      socket.on('fight:updated', handleFightUpdate);
      socket.on('fight:created', handleFightCreated);
      socket.on('tournament:updated', loadTournaments);
      
      return () => {
        socket.off('fight:updated');
        socket.off('fight:created');
        socket.off('tournament:updated');
      };
    }
  }, [socket, selectedTournament]);

  const handleFightUpdate = (data) => {
    if (selectedTournament && data.tournamentId === selectedTournament.id) {
      loadFights(selectedTournament.id);
    }
  };

  const handleFightCreated = (data) => {
    if (selectedTournament && data.tournamentId === selectedTournament.id) {
      loadFights(selectedTournament.id);
    }
  };

  const loadTournaments = async () => {
    try {
      const data = await api.getTournaments();
      setTournaments(data);
      if (data.length > 0 && !selectedTournament) {
        setSelectedTournament(data[0]);
      }
    } catch (error) {
      console.error('Error cargando torneos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFights = async (tournamentId) => {
    try {
      const data = await api.getFights(tournamentId);
      setFights(data);
      const current = data.find(f => f.status === 'current');
      setCurrentFight(current || null);
      // Cargar brackets también
      const bracketsData = await api.getBracketsByTournament(tournamentId);
      setBrackets(bracketsData);
    } catch (error) {
      console.error('Error cargando peleas:', error);
    }
  };

  const handleCreateTournament = async (e) => {
    e.preventDefault();
    try {
      const newTournament = await api.createTournament(tournamentForm);
      setTournaments([...tournaments, newTournament]);
      setSelectedTournament(newTournament);
      setShowNewTournament(false);
      setTournamentForm({ name: '', category: '', division: '', weight_class: '' });
    } catch (error) {
      alert('Error creando torneo: ' + error.message);
    }
  };

  const handleCreateFight = async (e) => {
    e.preventDefault();
    if (!selectedTournament) return;
    if (creatingFight) return;
    try {
      setCreatingFight(true);
      // Asignar colores automáticamente: azul, rojo, azul, rojo...
      const competitorsWithColor = competitors.map((c, idx) => ({
        ...c,
        peto_color: idx % 2 === 0 ? 'blue' : 'red'
      }));
      // Para la pelea principal, usar los dos primeros
      const fightRes = await api.createFight({
        tournament_id: selectedTournament.id,
        competitor_red: competitorsWithColor[1]?.name || '',
        competitor_blue: competitorsWithColor[0]?.name || '',
        academy_red: competitorsWithColor[1]?.academy || '',
        academy_blue: competitorsWithColor[0]?.academy || ''
      });
      // Buscar la última llave creada para este torneo
      const brackets = await api.getBracketsByTournament(selectedTournament.id);
      const newBracket = brackets[brackets.length - 1];
      // Asociar todos los peleadores a la nueva llave
      for (let i = 0; i < competitors.length; i++) {
        await api.addBracketCompetitor({
          bracket_id: newBracket.id,
          name: competitors[i].name,
          academy: competitors[i].academy,
          peto_color: i < 2 * Math.floor(competitors.length / 2) ? (i % 2 === 0 ? 'blue' : 'red') : null
        });
      }
      loadFights(selectedTournament.id);
      setShowNewFight(false);
      setFightForm({ competitor_red: '', competitor_blue: '', academy_red: '', academy_blue: '' });
      setCompetitors([
        { name: '', academy: '' },
        { name: '', academy: '' }
      ]);
    } catch (error) {
      alert('Error creando pelea: ' + error.message);
    } finally {
      setCreatingFight(false);
    }
  };

  const handleSetCurrent = async (fightId) => {
    try {
      await api.setCurrentFight(fightId, selectedTournament.id);
      loadFights(selectedTournament.id);
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleRegisterResult = async (fightId, round, winner) => {
    try {
      await api.registerResult(fightId, { round, winner });
      loadFights(selectedTournament.id);
    } catch (error) {
      alert('Error registrando resultado: ' + error.message);
    }
  };

  const handleCompleteFight = async (fightId) => {
    try {
      await api.completeFight(fightId, selectedTournament.id);
      loadFights(selectedTournament.id);
    } catch (error) {
      alert('Error completando pelea: ' + error.message);
    }
  };

  // Victoria inmediata por K.O. (injury) o abandono
  const handleImmediateVictory = async (fightId, type, winner) => {
    try {
      await api.registerResult(fightId, { victory_type: type, final_winner: winner });
      // Completar automáticamente la pelea
      await api.completeFight(fightId, selectedTournament.id);
      loadFights(selectedTournament.id);
    } catch (error) {
      alert('Error registrando victoria inmediata: ' + error.message);
    }
  };

  // Mover pelea hacia arriba o abajo en la lista
  const handleMoveFight = async (fightId, direction) => {
    // Filtrar solo peleas pendientes para reordenar
    const pendingFights = fights.filter(f => f.status === 'pending');
    const currentIndex = pendingFights.findIndex(f => f.id === fightId);
    
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // Verificar límites
    if (newIndex < 0 || newIndex >= pendingFights.length) return;
    
    // Intercambiar posiciones
    const reorderedFights = [...pendingFights];
    [reorderedFights[currentIndex], reorderedFights[newIndex]] = 
    [reorderedFights[newIndex], reorderedFights[currentIndex]];
    
    // Solo enviar las dos peleas que cambiaron de posición
    // Usar el order_index actual de las peleas originales intercambiado
    const fight1 = pendingFights[currentIndex];
    const fight2 = pendingFights[newIndex];
    
    const fightOrders = [
      {
        id: fight1.id,
        order_index: fight2.order_index || newIndex + 1,
        tournament_id: selectedTournament.id
      },
      {
        id: fight2.id,
        order_index: fight1.order_index || currentIndex + 1,
        tournament_id: selectedTournament.id
      }
    ];
    
    console.log('Reordenando peleas:', fightOrders);
    
    try {
      const result = await api.reorderFights(fightOrders);
      console.log('Resultado reorden:', result);
      if (result.warnings && result.warnings.length > 0) {
        console.warn('Advertencias:', result.warnings);
      }
      loadFights(selectedTournament.id);
    } catch (error) {
      console.error('Error completo:', error);
      alert('Error reordenando peleas: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🥋 Panel de Administración</h1>
        <div className="header-info">
          <button onClick={() => navigate('/admin/awards')} className="btn-awards">
            🏆 Premiación
          </button>
          <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '🟢 Conectado' : '🔴 Desconectado'}
          </span>
          <span className="user-info">👤 {user?.username}</span>
          <button onClick={handleLogout} className="btn-logout">Cerrar Sesión</button>
        </div>
      </header>

      <div className="dashboard-content">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h3>Torneos</h3>
            <button onClick={() => setShowNewTournament(true)} className="btn-add">+</button>
          </div>
          
          <ul className="tournament-list">
            {tournaments.map(t => (
              <li 
                key={t.id}
                className={selectedTournament?.id === t.id ? 'active' : ''}
                onClick={() => setSelectedTournament(t)}
              >
                <span className="tournament-name">{t.name}</span>
                <span className={`status-badge ${t.status}`}>{t.status}</span>
              </li>
            ))}
          </ul>
        </aside>

        <main className="main-content">
            {selectedTournament ? (
              <>
              <div className="tournament-header">
                <h2>{selectedTournament.name}</h2>
                <div className="tournament-meta">
                  {selectedTournament.category && <span>Categoría: {selectedTournament.category}</span>}
                  {selectedTournament.division && <span>División: {selectedTournament.division}</span>}
                  {selectedTournament.weight_class && <span>Peso: {selectedTournament.weight_class}</span>}
                </div>
                <button onClick={() => setShowNewFight(true)} className="btn-primary">
                  + Nueva Pelea
                </button>
                {/* Bracket Manager Integration */}
                {/* <BracketManager tournamentId={selectedTournament.id} /> */}
              </div>

              {currentFight && (
                <div className="current-fight-panel">
                  <h3>🔥 Pelea Actual</h3>
                  <div className="fight-display">
                    <div className="competitor red">
                      <span className="corner">ROJO</span>
                      <span className="name">{currentFight.competitor_red}</span>
                      <span className="academy">{currentFight.academy_red || '-'}</span>
                    </div>
                    <div className="vs">VS</div>
                    <div className="competitor blue">
                      <span className="corner">AZUL</span>
                      <span className="name">{currentFight.competitor_blue}</span>
                      <span className="academy">{currentFight.academy_blue || '-'}</span>
                    </div>
                  </div>
                  
                  <div className="rounds-control">
                    {[1, 2, 3].map(round => (
                      <div key={round} className="round-control">
                        <span>Round {round}</span>
                        <div className="round-buttons">
                          <button 
                            onClick={() => handleRegisterResult(currentFight.id, round, 'red')}
                            className={`btn-red ${currentFight[`round_${round}_winner`] === 'red' ? 'active' : ''}`}
                          >
                            Rojo
                          </button>
                          <button 
                            onClick={() => handleRegisterResult(currentFight.id, round, 'blue')}
                            className={`btn-blue ${currentFight[`round_${round}_winner`] === 'blue' ? 'active' : ''}`}
                          >
                            Azul
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounds-control" style={{marginTop: '0.5rem'}}>
                    <div className="round-control">
                      <span>Victoria inmediata</span>
                      <div className="round-buttons">
                        <button 
                          onClick={() => handleImmediateVictory(currentFight.id, 'injury', 'red')}
                          className="btn-red"
                        >
                          K.O. Rojo
                        </button>
                        <button 
                          onClick={() => handleImmediateVictory(currentFight.id, 'injury', 'blue')}
                          className="btn-blue"
                        >
                          K.O. Azul
                        </button>
                        <button 
                          onClick={() => handleImmediateVictory(currentFight.id, 'abandon', 'red')}
                          className="btn-red"
                        >
                          Abandono Azul
                        </button>
                        <button 
                          onClick={() => handleImmediateVictory(currentFight.id, 'abandon', 'blue')}
                          className="btn-blue"
                        >
                          Abandono Rojo
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => handleCompleteFight(currentFight.id)}
                    className="btn-complete"
                  >
                    ✓ Completar Pelea
                  </button>
                </div>
              )}

              <div className="fights-list">
                <h3>Lista de Peleas</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Rojo</th>
                      <th>Azul</th>
                      <th>Estado</th>
                      <th>Ganador</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Ordenar: completed primero, luego current, luego pending */}
                    {[...fights]
                      .sort((a, b) => {
                        const order = { completed: 0, current: 1, pending: 2 };
                        return (order[a.status] || 3) - (order[b.status] || 3);
                      })
                      .map((fight, idx) => {
                      const pendingFights = fights.filter(f => f.status === 'pending');
                      const completedFights = fights.filter(f => f.status === 'completed');
                      const pendingIndex = pendingFights.findIndex(f => f.id === fight.id);
                      const isFirstPending = pendingIndex === 0;
                      const isLastPending = pendingIndex === pendingFights.length - 1;
                      
                      // Mostrar número: para completed mostrar su orden original, para pending mostrar posición en cola
                      const displayOrder = fight.status === 'completed' 
                        ? completedFights.findIndex(f => f.id === fight.id) + 1
                        : fight.status === 'pending' 
                          ? pendingIndex + 1
                          : '-';
                      
                      return (
                      <tr key={fight.id} className={fight.status}>
                        <td>
                          <div className="order-controls">
                            <span className="fight-order">{fight.status === 'current' ? '▶' : displayOrder}</span>
                            {fight.status === 'pending' && (
                              <div className="move-buttons">
                                <button 
                                  onClick={() => handleMoveFight(fight.id, 'up')}
                                  className="btn-move"
                                  disabled={isFirstPending}
                                  title="Subir"
                                >
                                  ▲
                                </button>
                                <button 
                                  onClick={() => handleMoveFight(fight.id, 'down')}
                                  className="btn-move"
                                  disabled={isLastPending}
                                  title="Bajar"
                                >
                                  ▼
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="red">{fight.competitor_red}</td>
                        <td className="blue">{fight.competitor_blue}</td>
                        <td>
                          <span className={`status-badge ${fight.status}`}>
                            {fight.status}
                          </span>
                        </td>
                        <td>
                          {fight.final_winner === 'red' && <span className="winner red">🏆 Rojo</span>}
                          {fight.final_winner === 'blue' && <span className="winner blue">🏆 Azul</span>}
                        </td>
                        <td>
                          {fight.status === 'pending' && (
                            <button 
                              onClick={() => handleSetCurrent(fight.id)}
                              className="btn-small"
                            >
                              Iniciar
                            </button>
                          )}
                          <button 
                            onClick={() => {
                              // Usar bracket_id si existe, sino buscar por índice
                              const bracketId = fight.bracket_id || (brackets[idx] ? brackets[idx].id : null);
                              setSelectedBracketId(bracketId);
                              setShowBracketModal(true);
                            }}
                            className="btn-small"
                            style={{ marginLeft: '0.5rem' }}
                          >
                            Ver llave
                          </button>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h2>No hay torneos</h2>
              <p>Crea un nuevo torneo para comenzar</p>
              <button onClick={() => setShowNewTournament(true)} className="btn-primary">
                Crear Torneo
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Modal Nuevo Torneo */}
      {showNewTournament && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Nuevo Torneo</h3>
            <form onSubmit={handleCreateTournament}>
              <div className="form-group">
                <label>Nombre *</label>
                <input
                  type="text"
                  value={tournamentForm.name}
                  onChange={e => setTournamentForm({...tournamentForm, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Categoría</label>
                <input
                  type="text"
                  value={tournamentForm.category}
                  onChange={e => setTournamentForm({...tournamentForm, category: e.target.value})}
                  placeholder="Ej: Cadetes, Junior, Senior"
                />
              </div>
              <div className="form-group">
                <label>División</label>
                <input
                  type="text"
                  value={tournamentForm.division}
                  onChange={e => setTournamentForm({...tournamentForm, division: e.target.value})}
                  placeholder="Ej: Masculino, Femenino"
                />
              </div>
              <div className="form-group">
                <label>Peso</label>
                <input
                  type="text"
                  value={tournamentForm.weight_class}
                  onChange={e => setTournamentForm({...tournamentForm, weight_class: e.target.value})}
                  placeholder="Ej: -58kg, -68kg"
                />
              </div>
              <div className="modal-buttons">
                <button type="button" onClick={() => setShowNewTournament(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nueva Pelea */}
      {showNewFight && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Nueva Pelea / Crear Llave</h3>
            <form onSubmit={handleCreateFight}>
              <div>
                <label style={{marginBottom: '0.5rem', display: 'block'}}>Peleadores de la llave:</label>
                {competitors.map((comp, idx) => (
                  <div key={idx} style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem'}}>
                    <input
                      type="text"
                      value={comp.name}
                      onChange={e => {
                        const arr = [...competitors];
                        arr[idx].name = e.target.value;
                        setCompetitors(arr);
                      }}
                      placeholder="Nombre *"
                      required
                      style={{flex: 1}}
                    />
                    <input
                      type="text"
                      value={comp.academy}
                      onChange={e => {
                        const arr = [...competitors];
                        arr[idx].academy = e.target.value;
                        setCompetitors(arr);
                      }}
                      placeholder="Academia"
                      style={{flex: 1}}
                    />
                    <button 
                      type="button" 
                      onClick={() => {
                        const arr = competitors.filter((_, i) => i !== idx);
                        setCompetitors(arr);
                      }} 
                      disabled={competitors.length <= 2} 
                      style={{
                        background: competitors.length <= 2 ? '#ccc' : '#ff5252',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        cursor: competitors.length <= 2 ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Eliminar"
                    >🗑️</button>
                  </div>
                ))}
                <button type="button" disabled={creatingFight} onClick={() => setCompetitors([...competitors, { name: '', academy: '' }])} className="btn-secondary" style={{marginTop: '0.5rem'}}>
                  + Agregar Peleador
                </button>
              </div>
              <div className="modal-buttons">
                <button type="button" disabled={creatingFight} onClick={() => setShowNewFight(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={creatingFight} className="btn-primary">{creatingFight ? 'Creando...' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ver Llaves / Competidores */}
      {showBracketModal && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth: '900px', width: '95%'}}>
            <div className="modal-header">
              <div className="modal-title">Llave y Competidores</div>
              <button className="modal-close" onClick={() => { setShowBracketModal(false); setSelectedBracketId(null); }}>×</button>
            </div>
            <BracketManager 
              tournamentId={selectedTournament?.id} 
              initialBracketId={selectedBracketId}
              onFightsCreated={() => {
                if (selectedTournament) {
                  loadFights(selectedTournament.id);
                }
              }}
            />
            <div className="modal-buttons">
              <button className="btn-secondary" onClick={() => { setShowBracketModal(false); setSelectedBracketId(null); }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
