import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../utils/api';
import BracketManager from './BracketManager';
import { Trash2, Swords, BarChart2, Trophy, Circle, User, Settings, Link2, Monitor, Play, Check, RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();
  
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [fights, setFights] = useState([]);
  const [brackets, setBrackets] = useState([]);
  const [currentFights, setCurrentFights] = useState([]);
  const [selectedAdminPista, setSelectedAdminPista] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showNewTournament, setShowNewTournament] = useState(false);
  const [showNewFight, setShowNewFight] = useState(false);
  const [creatingFight, setCreatingFight] = useState(false);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [selectedBracketId, setSelectedBracketId] = useState(null);
  const [pistaFilter, setPistaFilter] = useState('');
  const [showScoringConfig, setShowScoringConfig] = useState(null);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [openMenuTournamentId, setOpenMenuTournamentId] = useState(null);
  
  // Form states
  const [tournamentForm, setTournamentForm] = useState({
    name: '',
    category: '',
    division: '',
    weight_class: '',
    num_pistas: 1
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
    const closeMenu = () => setOpenMenuTournamentId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
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
    if (selectedTournament && data.tournament_id === selectedTournament.id) {
      loadFights(selectedTournament.id);
    }
  };

  const handleFightCreated = (data) => {
    if (selectedTournament && data.tournamentId === selectedTournament.id) {
      loadFights(selectedTournament.id);
    }
  };

  const selectTournament = (tournament) => {
    setSelectedTournament(tournament);
    if (tournament) {
      localStorage.setItem('selectedTournamentId', tournament.id);
    } else {
      localStorage.removeItem('selectedTournamentId');
    }
  };

  const loadTournaments = async () => {
    try {
      const data = await api.getTournaments();
      setTournaments(data);
      if (data.length > 0) {
        const savedId = localStorage.getItem('selectedTournamentId');
        if (!selectedTournament) {
          const saved = savedId ? data.find(t => t.id === parseInt(savedId)) : null;
          selectTournament(saved || data[0]);
        } else {
          // Actualizar el objeto del torneo seleccionado con los datos frescos de la BD
          const refreshed = data.find(t => t.id === selectedTournament.id);
          if (refreshed) setSelectedTournament(refreshed);
        }
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
      // Cargar todas las peleas actuales (una por pista)
      const allCurrent = await api.getAllCurrentFights(tournamentId);
      setCurrentFights(allCurrent || []);
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
      selectTournament(newTournament);
      setShowNewTournament(false);
      setTournamentForm({ name: '', category: '', division: '', weight_class: '', num_pistas: 1 });
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
      // Obtener cuántas llaves hay para nombrar la nueva
      const existingBrackets = await api.getBracketsByTournament(selectedTournament.id);
      const bracketName = `Llave ${existingBrackets.length + 1}`;
      // Crear la llave (bracket) sin generar peleas todavía
      const bracketRes = await api.createBracket({
        tournament_id: selectedTournament.id,
        name: bracketName
      });
      const newBracket = bracketRes.bracket || bracketRes;
      // Agregar todos los competidores a la llave
      for (let i = 0; i < competitors.length; i++) {
        await api.addBracketCompetitor({
          bracket_id: newBracket.id,
          name: competitors[i].name,
          academy: competitors[i].academy,
          peto_color: i % 2 === 0 ? 'blue' : 'red',
          seed: i + 1
        });
      }
      // Abrir el editor de bracket para que el usuario reordene antes de generar
      setSelectedBracketId(newBracket.id);
      setShowBracketModal(true);
      setShowNewFight(false);
      setFightForm({ competitor_red: '', competitor_blue: '', academy_red: '', academy_blue: '' });
      setCompetitors([
        { name: '', academy: '' },
        { name: '', academy: '' }
      ]);
    } catch (error) {
      alert('Error creando llave: ' + error.message);
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

  // Repetir pelea completada
  const handleRepeatFight = async (fightId) => {
    if (!window.confirm('¿Repetir esta pelea? Se resetearán todos los puntajes y rondas.')) return;
    try {
      await api.repeatFight(fightId, selectedTournament.id);
      loadFights(selectedTournament.id);
    } catch (error) {
      alert('Error repitiendo pelea: ' + error.message);
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

  const handleSetActiveTournament = (e, tournament) => {
    e.stopPropagation();
    selectTournament(tournament);
  };

  const handleChangeTournamentStatus = async (e, tournament, newStatus) => {
    e.stopPropagation();
    setOpenMenuTournamentId(null);
    try {
      await api.updateTournament(tournament.id, { status: newStatus });
      await loadTournaments();
    } catch (err) {
      alert('Error cambiando estado: ' + err.message);
    }
  };

  const handleDeleteTournament = async (e, tournament) => {
    e.stopPropagation();
    setOpenMenuTournamentId(null);
    const confirmed = window.confirm(
      `⚠️ ELIMINAR TORNEO\n\n` +
      `"${tournament.name}"\n\n` +
      `Se eliminarán en cascada:\n` +
      `• Todas las llaves (brackets)\n` +
      `• Todas las peleas\n` +
      `• Todos los puntajes y registros\n\n` +
      `Esta acción NO se puede deshacer.\n\n` +
      `¿Confirmas la eliminación?`
    );
    if (!confirmed) return;
    try {
      const result = await api.deleteTournament(tournament.id);
      if (selectedTournament?.id === tournament.id) {
        setSelectedTournament(null);
        setFights([]);
        setBrackets([]);
        setCurrentFights([]);
        localStorage.removeItem('selectedTournamentId');
      }
      await loadTournaments();
      alert(`✅ ${result.message}\n(${result.deleted.fights} peleas, ${result.deleted.brackets} llaves, ${result.deleted.scores} puntajes eliminados)`);
    } catch (err) {
      alert('Error eliminando torneo: ' + err.message);
    }
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
        <h1><Swords size={22} /> Panel de Administración</h1>
        <div className="header-info">
          <button onClick={() => navigate('/admin/analytics')} className="btn-awards" style={{ background: 'rgba(99,102,241,.2)', borderColor: '#6366f1', color: '#818cf8' }}>
            <BarChart2 size={14} /> Dashboard
          </button>
          <button onClick={() => navigate('/admin/awards')} className="btn-awards">
            <Trophy size={14} /> Premiación
          </button>
          <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? <><Circle size={9} fill="#22c55e" color="#22c55e" /> Conectado</> : <><Circle size={9} fill="#ef4444" color="#ef4444" /> Desconectado</>}
          </span>
          <span className="user-info"><User size={14} /> {user?.username}</span>
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
                onClick={() => { selectTournament(t); setOpenMenuTournamentId(null); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', position: 'relative' }}
              >
                <span className="tournament-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                  <span className={`status-badge ${t.status}`}>{t.status}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenMenuTournamentId(openMenuTournamentId === t.id ? null : t.id); }}
                    title="Opciones"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0 3px', color: 'inherit', opacity: 0.7 }}
                  >
                    ⋮
                  </button>
                </div>
                {openMenuTournamentId === t.id && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', right: 0, top: '100%', zIndex: 100,
                      background: '#2d3748', border: '1px solid #4a5568', borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)', minWidth: '160px', overflow: 'hidden'
                    }}
                  >
                    <div style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', color: '#a0aec0', borderBottom: '1px solid #4a5568' }}>Cambiar estado</div>
                    {[['active', 'Activo'], ['completed', 'Completado'], ['cancelled', 'Cancelado']].map(([status, label]) => (
                      <button
                        key={status}
                        onClick={(e) => handleChangeTournamentStatus(e, t, status)}
                        disabled={t.status === status}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '0.5rem 0.75rem', background: t.status === status ? 'rgba(255,255,255,0.08)' : 'none',
                          border: 'none', color: t.status === status ? '#fff' : '#e2e8f0',
                          cursor: t.status === status ? 'default' : 'pointer', fontSize: '0.85rem'
                        }}
                        onMouseEnter={e => { if (t.status !== status) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                        onMouseLeave={e => { if (t.status !== status) e.currentTarget.style.background = 'none'; }}
                      >
                        {label}{t.status === status ? ' ✓' : ''}
                      </button>
                    ))}
                    <div style={{ borderTop: '1px solid #4a5568', marginTop: '0.25rem', paddingTop: '0.25rem' }}>
                      <button
                        onClick={(e) => handleDeleteTournament(e, t)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '0.5rem 0.75rem', background: 'none',
                          border: 'none', color: '#fc8181',
                          cursor: 'pointer', fontSize: '0.85rem'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(252,129,129,0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                      >
                        <Trash2 size={13} /> Eliminar torneo
                      </button>
                    </div>
                  </div>
                )}
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
                  <span>Pistas: {selectedTournament.num_pistas || 1}
                    <input
                      type="number"
                      min="1"
                      value={selectedTournament.num_pistas || 1}
                      onChange={async (e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        try {
                          await api.updateTournament(selectedTournament.id, { num_pistas: val });
                          const updated = { ...selectedTournament, num_pistas: val };
                          setSelectedTournament(updated);
                          setTournaments(tournaments.map(t => t.id === updated.id ? updated : t));
                        } catch (err) {
                          alert('Error actualizando pistas: ' + err.message);
                        }
                      }}
                      style={{width: '50px', marginLeft: '0.5rem', padding: '0.1rem 0.25rem'}}
                    />
                  </span>
                </div>
                <button onClick={() => setShowNewFight(true)} className="btn-primary">
                  + Nueva Pelea
                </button>
                <button
                  onClick={async () => {
                    try {
                      const cfg = await api.getScoringConfig(selectedTournament.id);
                      setScoringConfig(cfg);
                      setShowScoringConfig(true);
                    } catch (e) { alert(e.message); }
                  }}
                  className="btn-primary"
                  style={{ marginLeft: '0.5rem', background: '#805ad5' }}
                >
                  <Settings size={14} /> Config Scoring
                </button>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/public/${selectedTournament.id}`;
                    navigator.clipboard.writeText(url).then(() => alert('Enlace copiado al portapapeles:\n' + url));
                  }}
                  className="btn-primary"
                  style={{ marginLeft: '0.5rem', background: '#2980b9' }}
                  title="Copiar enlace público del torneo"
                >
                  <Link2 size={14} /> Enlace Público
                </button>
                <a
                  href={`/public/${selectedTournament.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ marginLeft: '0.5rem', background: '#27ae60', color: 'white', textDecoration: 'none', display: 'inline-block' }}
                  title="Abrir pantalla pública del torneo en nueva pestaña"
                >
                  <Monitor size={14} /> Ver Público
                </a>
                {/* Bracket Manager Integration */}
                {/* <BracketManager tournamentId={selectedTournament.id} /> */}
              </div>

              {(() => {
                const numPistas = selectedTournament.num_pistas || 1;
                const currentFight = currentFights.find(f => f.pista === selectedAdminPista) || null;
                return (
                <>
                {/* Selector de pistas */}
                {numPistas > 1 && (
                  <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center'}}>
                    <span style={{fontWeight: 'bold'}}>Pista:</span>
                    {Array.from({length: numPistas}, (_, i) => {
                      const pistaNum = i + 1;
                      const hasCurrent = currentFights.some(f => f.pista === pistaNum);
                      return (
                        <button
                          key={pistaNum}
                          onClick={() => setSelectedAdminPista(pistaNum)}
                          className={`btn-small ${selectedAdminPista === pistaNum ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            position: 'relative',
                            fontWeight: selectedAdminPista === pistaNum ? 'bold' : 'normal'
                          }}
                        >
                          Pista {pistaNum}
                          {hasCurrent && <span style={{color: '#ff5252', marginLeft: '0.25rem'}}>●</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentFight ? (
                <div className="current-fight-panel">
                  <h3>Pelea Actual — Pista {currentFight.pista || 1}</h3>
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
                    <Check size={14} /> Completar Pelea
                  </button>
                </div>
                ) : (
                  <div className="current-fight-panel" style={{opacity: 0.6, textAlign: 'center'}}>
                    <h3>Pista {selectedAdminPista} — Sin pelea en curso</h3>
                    <p>Inicia una pelea de la pista {selectedAdminPista} desde la lista de abajo.</p>
                  </div>
                )}
                </>
                );
              })()}

              <div className="fights-list">
                <h3>Lista de Peleas</h3>
                <div style={{marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <label>Filtrar por pista:</label>
                  <select value={pistaFilter} onChange={e => setPistaFilter(e.target.value)} style={{padding: '0.25rem 0.5rem'}}>
                    <option value="">Todas</option>
                    {Array.from({length: selectedTournament.num_pistas || 1}, (_, i) => (
                      <option key={i+1} value={i+1}>Pista {i+1}</option>
                    ))}
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Pista</th>
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
                      .filter(f => !pistaFilter || f.pista === parseInt(pistaFilter))
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
                            <span className="fight-order">{fight.status === 'current' ? <Play size={11} /> : displayOrder}</span>
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
                        <td>
                          <select 
                            value={fight.pista || 1} 
                            onChange={async (e) => {
                              try {
                                await api.updateFight(fight.id, { pista: parseInt(e.target.value) });
                                loadFights(selectedTournament.id);
                              } catch (err) {
                                alert('Error actualizando pista: ' + err.message);
                              }
                            }}
                            style={{padding: '0.15rem 0.25rem', fontSize: '0.85rem'}}
                          >
                            {Array.from({length: selectedTournament.num_pistas || 1}, (_, i) => (
                              <option key={i+1} value={i+1}>{i+1}</option>
                            ))}
                          </select>
                        </td>
                        <td className="red">{fight.competitor_red}</td>
                        <td className="blue">{fight.competitor_blue}</td>
                        <td>
                          <span className={`status-badge ${fight.status}`}>
                            {fight.status}
                          </span>
                        </td>
                        <td>
                          {fight.final_winner === 'red' && <span className="winner red"><Trophy size={12} /> Rojo</span>}
                          {fight.final_winner === 'blue' && <span className="winner blue"><Trophy size={12} /> Azul</span>}
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
                          {fight.status === 'current' && (
                            <Link 
                              to={`/admin/scoring/${fight.id}`}
                              className="btn-small"
                              style={{ marginLeft: '0.5rem', textDecoration: 'none', display: 'inline-block', background: '#805ad5', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem' }}
                            >
                              <Swords size={12} /> Scoring
                            </Link>
                          )}
                          {fight.status === 'completed' && fight.final_winner && (
                            <button
                              onClick={() => handleRepeatFight(fight.id)}
                              className="btn-small"
                              style={{ background: '#e67e22', color: 'white' }}
                              title="Resetear la pelea y ponerla en curso nuevamente"
                            >
                              <RefreshCw size={12} /> Repetir
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
              <div className="form-group">
                <label>Número de Pistas *</label>
                <input
                  type="number"
                  min="1"
                  value={tournamentForm.num_pistas}
                  onChange={e => setTournamentForm({...tournamentForm, num_pistas: Math.max(1, parseInt(e.target.value) || 1)})}
                  required
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
                    ><Trash2 size={16} /></button>
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

      {/* Modal Scoring Config */}
      {showScoringConfig && scoringConfig && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth: '600px'}}>
            <h3><Settings size={16} /> Configuración de Puntuación</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.updateScoringConfig(selectedTournament.id, scoringConfig);
                setShowScoringConfig(false);
                alert('Configuración guardada');
              } catch (err) { alert(err.message); }
            }}>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.8rem'}}>
                <div className="form-group">
                  <label>Rounds</label>
                  <input type="number" min="1" max="5" value={scoringConfig.num_rounds}
                    onChange={e => setScoringConfig({...scoringConfig, num_rounds: parseInt(e.target.value) || 3})} />
                </div>
                <div className="form-group">
                  <label>Duración round (seg)</label>
                  <input type="number" min="30" max="600" value={scoringConfig.round_time_seconds}
                    onChange={e => setScoringConfig({...scoringConfig, round_time_seconds: parseInt(e.target.value) || 120})} />
                </div>
                <div className="form-group">
                  <label>Descanso (seg)</label>
                  <input type="number" min="10" max="300" value={scoringConfig.rest_time_seconds}
                    onChange={e => setScoringConfig({...scoringConfig, rest_time_seconds: parseInt(e.target.value) || 60})} />
                </div>
                <div className="form-group">
                  <label>Gap Point (dif. pts)</label>
                  <input type="number" min="5" max="50" value={scoringConfig.gap_point}
                    onChange={e => setScoringConfig({...scoringConfig, gap_point: parseInt(e.target.value) || 20})} />
                </div>
                <div className="form-group">
                  <label>Máx Gam-jeom</label>
                  <input type="number" min="3" max="20" value={scoringConfig.max_gam_jeom}
                    onChange={e => setScoringConfig({...scoringConfig, max_gam_jeom: parseInt(e.target.value) || 10})} />
                </div>
                <div className="form-group">
                  <label>Núm. Jueces</label>
                  <input type="number" min="1" max="7" value={scoringConfig.num_judges}
                    onChange={e => setScoringConfig({...scoringConfig, num_judges: parseInt(e.target.value) || 3, min_judges_agree: 0})} />
                </div>
                {scoringConfig.num_judges === 2 && (
                  <div className="form-group">
                    <label>Jueces para puntuar</label>
                    <select value={scoringConfig.min_judges_agree || 0}
                      onChange={e => setScoringConfig({...scoringConfig, min_judges_agree: parseInt(e.target.value)})}>
                      <option value={0}>Mayoría automática (1)</option>
                      <option value={1}>Basta 1 juez</option>
                      <option value={2}>Ambos jueces</option>
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Ventana jueces (ms)</label>
                  <input type="number" min="500" max="5000" step="100" value={scoringConfig.judge_window_ms}
                    onChange={e => setScoringConfig({...scoringConfig, judge_window_ms: parseInt(e.target.value) || 1500})} />
                </div>
              </div>
              <h4 style={{marginTop:'1rem', marginBottom:'0.5rem', color:'#a0aec0'}}>Puntos por Técnica</h4>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.8rem'}}>
                <div className="form-group">
                  <label>Puño peto</label>
                  <input type="number" min="0" max="10" value={scoringConfig.points_punch_body}
                    onChange={e => setScoringConfig({...scoringConfig, points_punch_body: parseInt(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label>Patada peto</label>
                  <input type="number" min="0" max="10" value={scoringConfig.points_kick_body}
                    onChange={e => setScoringConfig({...scoringConfig, points_kick_body: parseInt(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label>Patada cabeza</label>
                  <input type="number" min="0" max="10" value={scoringConfig.points_kick_head}
                    onChange={e => setScoringConfig({...scoringConfig, points_kick_head: parseInt(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label>Giro peto</label>
                  <input type="number" min="0" max="10" value={scoringConfig.points_spinning_kick_body}
                    onChange={e => setScoringConfig({...scoringConfig, points_spinning_kick_body: parseInt(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label>Giro cabeza</label>
                  <input type="number" min="0" max="10" value={scoringConfig.points_spinning_kick_head}
                    onChange={e => setScoringConfig({...scoringConfig, points_spinning_kick_head: parseInt(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label>Pts por Gam-jeom</label>
                  <input type="number" min="0" max="5" value={scoringConfig.gam_jeom_points}
                    onChange={e => setScoringConfig({...scoringConfig, gam_jeom_points: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              <div className="modal-buttons" style={{marginTop:'1rem'}}>
                <button type="button" onClick={() => setShowScoringConfig(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
