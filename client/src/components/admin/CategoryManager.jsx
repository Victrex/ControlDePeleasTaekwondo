import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Edit2, Trash2, Check, AlertCircle, Tag } from 'lucide-react';
import api from '../../utils/api';
import './CategoryManager.css';

const BELT_NAMES  = ['Blanco','Blanco-Amarillo','Amarillo','Naranja','Verde','Azul-Verde','Azul','Rojo','Rojo-Negro','Negro'];
const BELT_COLORS = ['#f5f5f5','#F0E68C','#FFD700','#FF8C00','#2E8B57','#1a9e8c','#1565C0','#C62828','#850000','#212121'];

const emptyForm = {
  name: '', gender: 'Both',
  min_age: 0, max_age: 99,
  min_weight: 0, max_weight: 999,
  belt_min: 0, belt_max: 9
};

function BeltRange({ min, max }) {
  // Dark belts (index >= 4) use white text; light belts (Blanco, Blanco-Amarillo, Amarillo) use dark text
  const textColor = (i) => i <= 2 ? '#222' : '#fff';
  if (min === max) {
    return (
      <span className="cm-belt-badge" style={{ background: BELT_COLORS[min], color: textColor(min) }}>
        {BELT_NAMES[min]}
      </span>
    );
  }
  return (
    <span className="cm-belt-range">
      <span className="cm-belt-badge" style={{ background: BELT_COLORS[min], color: textColor(min) }}>{BELT_NAMES[min]}</span>
      <span>→</span>
      <span className="cm-belt-badge" style={{ background: BELT_COLORS[max], color: textColor(max) }}>{BELT_NAMES[max]}</span>
    </span>
  );
}

export default function CategoryManager() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadCategories = async () => {
    setLoading(true);
    try {
      setCategories(await api.getCategories());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCategories(); }, []);

  const openNew = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); setError(''); };
  const openEdit = (cat) => {
    setForm({ name: cat.name, gender: cat.gender, min_age: cat.min_age, max_age: cat.max_age,
      min_weight: cat.min_weight, max_weight: cat.max_weight, belt_min: cat.belt_min, belt_max: cat.belt_max });
    setEditingId(cat.id); setShowForm(true); setError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    if (parseInt(form.belt_min) > parseInt(form.belt_max)) { setError('Cinturón mínimo no puede ser mayor al máximo'); return; }
    setSaving(true); setError('');
    try {
      if (editingId) await api.updateCategory(editingId, form);
      else await api.createCategory(form);
      setShowForm(false); loadCategories();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await api.deleteCategory(id); setDeleteConfirm(null); loadCategories(); }
    catch (e) { setError('Error eliminando categoría'); }
  };

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="category-manager">
      <div className="cm-header">
        <button className="cm-back-btn" onClick={() => navigate('/admin')}>
          <ChevronLeft size={18} /> Volver
        </button>
        <div className="cm-title">
          <Tag size={24} />
          <div>
            <h1>Plantillas de Categorías</h1>
            <span>{categories.length} categoría{categories.length !== 1 ? 's' : ''} definida{categories.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button className="cm-btn-primary" onClick={openNew}>
          <Plus size={16} /> Nueva categoría
        </button>
      </div>

      {error && <div className="cm-error"><AlertCircle size={14} /> {error}</div>}

      {loading ? <div className="cm-loading">Cargando...</div> : (
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Género</th>
                <th>Edad</th>
                <th>Peso (kg)</th>
                <th>Cinturón</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id}>
                  <td className="cm-name">{cat.name}</td>
                  <td>
                    <span className={`cm-gender-badge ${cat.gender.toLowerCase()}`}>
                      {cat.gender === 'Both' ? 'Mixto' : cat.gender === 'M' ? 'Masc.' : 'Fem.'}
                    </span>
                  </td>
                  <td>{cat.min_age} – {cat.max_age} años</td>
                  <td>{cat.min_weight === 0 && cat.max_weight >= 999 ? 'Todos' : `${cat.min_weight} – ${cat.max_weight} kg`}</td>
                  <td><BeltRange min={cat.belt_min} max={cat.belt_max} /></td>
                  <td className="cm-actions">
                    <button className="cm-icon-btn" onClick={() => openEdit(cat)}><Edit2 size={14} /></button>
                    <button className="cm-icon-btn danger" onClick={() => setDeleteConfirm(cat)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="cm-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <h2>{editingId ? 'Editar categoría' : 'Nueva categoría'}</h2>
            {error && <div className="cm-error"><AlertCircle size={14} /> {error}</div>}
            <div className="cm-form-grid">
              <label className="cm-full-col">
                Nombre *
                <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Ej: Infantil B Colores Masculino" />
              </label>
              <label>
                Género
                <select value={form.gender} onChange={e => setF('gender', e.target.value)}>
                  <option value="Both">Mixto</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </label>
              <div />
              <label>
                Edad mínima
                <input type="number" min="0" max="99" value={form.min_age} onChange={e => setF('min_age', parseInt(e.target.value))} />
              </label>
              <label>
                Edad máxima
                <input type="number" min="0" max="99" value={form.max_age} onChange={e => setF('max_age', parseInt(e.target.value))} />
              </label>
              <label>
                Peso mínimo (kg)
                <input type="number" step="0.5" min="0" value={form.min_weight} onChange={e => setF('min_weight', parseFloat(e.target.value))} />
              </label>
              <label>
                Peso máximo (kg)
                <input type="number" step="0.5" min="0" value={form.max_weight} onChange={e => setF('max_weight', parseFloat(e.target.value))} />
              </label>
              <label>
                Cinturón mínimo
                <select value={form.belt_min} onChange={e => setF('belt_min', parseInt(e.target.value))}>
                  {BELT_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </label>
              <label>
                Cinturón máximo
                <select value={form.belt_max} onChange={e => setF('belt_max', parseInt(e.target.value))}>
                  {BELT_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="cm-modal-footer">
              <button className="cm-btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="cm-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : <><Check size={14} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="cm-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="cm-modal cm-modal-sm" onClick={e => e.stopPropagation()}>
            <h2>¿Eliminar categoría?</h2>
            <p>Se eliminará <strong>{deleteConfirm.name}</strong>. Esta acción no se puede deshacer.</p>
            <div className="cm-modal-footer">
              <button className="cm-btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="cm-btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
