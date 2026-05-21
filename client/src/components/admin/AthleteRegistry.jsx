import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Search, Edit2, Trash2, ChevronLeft, Users, Filter, X, Check, AlertCircle } from 'lucide-react';
import api from '../../utils/api';
import './AthleteRegistry.css';

const BELT_NAMES = ['Blanco', 'Amarillo', 'Naranja', 'Verde', 'Azul', 'Rojo', 'Negro'];
const BELT_COLORS = ['#f5f5f5', '#FFD700', '#FF8C00', '#2E8B57', '#1565C0', '#C62828', '#212121'];

const emptyForm = { name: '', academy: '', dob: '', weight: '', gender: '', belt: 0, license_number: '' };

function calcAge(dob) {
  if (!dob) return '—';
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function AthleteRegistry() {
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBelt, setFilterBelt] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadAthletes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAthletes({ q: search, belt: filterBelt, gender: filterGender });
      setAthletes(data);
    } catch (e) {
      setError('Error cargando atletas');
    } finally {
      setLoading(false);
    }
  }, [search, filterBelt, filterGender]);

  useEffect(() => {
    const t = setTimeout(loadAthletes, 300);
    return () => clearTimeout(t);
  }, [loadAthletes]);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setError('');
  };

  const openEdit = (athlete) => {
    setForm({
      name: athlete.name || '',
      academy: athlete.academy || '',
      dob: athlete.dob || '',
      weight: athlete.weight != null ? athlete.weight : '',
      gender: athlete.gender || '',
      belt: athlete.belt ?? 0,
      license_number: athlete.license_number || ''
    });
    setEditingId(athlete.id);
    setShowForm(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.updateAthlete(editingId, form);
      } else {
        await api.createAthlete(form);
      }
      setShowForm(false);
      loadAthletes();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteAthlete(id);
      setDeleteConfirm(null);
      loadAthletes();
    } catch (e) {
      setError('Error eliminando atleta');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterBelt('');
    setFilterGender('');
  };

  const hasFilters = search || filterBelt !== '' || filterGender;

  return (
    <div className="athlete-registry">
      {/* Header */}
      <div className="ar-header">
        <button className="ar-back-btn" onClick={() => navigate('/admin')}>
          <ChevronLeft size={18} /> Volver
        </button>
        <div className="ar-title">
          <Users size={24} />
          <div>
            <h1>Registro de Atletas</h1>
            <span>{athletes.length} atleta{athletes.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="ar-header-actions">
          <button className="ar-btn-secondary" onClick={() => navigate('/admin/bulk-import')}>
            Importar CSV/Excel
          </button>
          <button className="ar-btn-primary" onClick={openNew}>
            <UserPlus size={16} /> Agregar atleta
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="ar-filters">
        <div className="ar-search">
          <Search size={16} />
          <input
            placeholder="Buscar por nombre o academia..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')}><X size={14} /></button>}
        </div>
        <select value={filterBelt} onChange={e => setFilterBelt(e.target.value)} className="ar-select">
          <option value="">Todos los cinturones</option>
          {BELT_NAMES.map((n, i) => (
            <option key={i} value={i}>{n}</option>
          ))}
        </select>
        <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className="ar-select">
          <option value="">Todos</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
        </select>
        {hasFilters && (
          <button className="ar-clear-filters" onClick={clearFilters}>
            <X size={14} /> Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="ar-loading">Cargando...</div>
      ) : athletes.length === 0 ? (
        <div className="ar-empty">
          <Users size={48} />
          <p>No hay atletas registrados</p>
          <button className="ar-btn-primary" onClick={openNew}>Agregar el primero</button>
        </div>
      ) : (
        <div className="ar-table-wrap">
          <table className="ar-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Academia</th>
                <th>Cinturón</th>
                <th>Edad</th>
                <th>Peso</th>
                <th>Género</th>
                <th>Licencia</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {athletes.map(a => (
                <tr key={a.id}>
                  <td className="ar-name">{a.name}</td>
                  <td>{a.academy || '—'}</td>
                  <td>
                    <span
                      className="ar-belt-badge"
                      style={{ background: BELT_COLORS[a.belt ?? 0], color: a.belt === 6 || a.belt === 4 || a.belt === 2 ? '#fff' : '#222' }}
                    >
                      {BELT_NAMES[a.belt ?? 0]}
                    </span>
                  </td>
                  <td>{calcAge(a.dob)}</td>
                  <td>{a.weight != null ? `${a.weight} kg` : '—'}</td>
                  <td>{a.gender === 'M' ? 'Masc.' : a.gender === 'F' ? 'Fem.' : '—'}</td>
                  <td>{a.license_number || '—'}</td>
                  <td className="ar-actions">
                    <button className="ar-icon-btn" onClick={() => openEdit(a)} title="Editar">
                      <Edit2 size={14} />
                    </button>
                    <button className="ar-icon-btn danger" onClick={() => setDeleteConfirm(a)} title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="ar-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="ar-modal" onClick={e => e.stopPropagation()}>
            <h2>{editingId ? 'Editar atleta' : 'Nuevo atleta'}</h2>
            {error && <div className="ar-error"><AlertCircle size={14} /> {error}</div>}
            <div className="ar-form-grid">
              <label>
                Nombre *
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" />
              </label>
              <label>
                Academia
                <input value={form.academy} onChange={e => setForm(f => ({ ...f, academy: e.target.value }))} placeholder="Club / Academia" />
              </label>
              <label>
                Fecha de nacimiento
                <input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
              </label>
              <label>
                Peso (kg)
                <input type="number" step="0.1" min="0" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="Ej: 42.5" />
              </label>
              <label>
                Género
                <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">— Seleccionar —</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </label>
              <label>
                Cinturón
                <select value={form.belt} onChange={e => setForm(f => ({ ...f, belt: parseInt(e.target.value) }))}>
                  {BELT_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </label>
              <label className="ar-full-col">
                Número de licencia
                <input value={form.license_number} onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} placeholder="Opcional" />
              </label>
            </div>
            <div className="ar-modal-footer">
              <button className="ar-btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="ar-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : <><Check size={14} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="ar-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="ar-modal ar-modal-sm" onClick={e => e.stopPropagation()}>
            <h2>¿Eliminar atleta?</h2>
            <p>Se eliminará a <strong>{deleteConfirm.name}</strong>. Esta acción no se puede deshacer.</p>
            <div className="ar-modal-footer">
              <button className="ar-btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="ar-btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
