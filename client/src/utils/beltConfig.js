// ── Configuración de cinturones KUP ─────────────────────────────────────────
// Clave de localStorage donde se guarda la configuración personalizada
export const BELT_CONFIG_STORAGE_KEY = 'belt_config_v1';

// Tabla de 10 niveles por defecto
export const DEFAULT_BELTS = [
  {
    index: 0, kup: '9 KUP', name: 'Blanco', color: '#d1d5db', textColor: '#111',
    aliases: 'blanco, white, blanco puro',
  },
  {
    index: 1, kup: '8 KUP', name: 'Blanco-Amarillo', color: '#F0E68C', textColor: '#555',
    aliases: 'blanco-amarillo, blanco amarillo, blancamarillo, amarillo palido, amarillo pálido, amarillo claro, naranja, naranja claro, naranja palido, naranja pálido, white yellow, light yellow',
  },
  {
    index: 2, kup: '7 KUP', name: 'Amarillo', color: '#FFD700', textColor: '#333',
    aliases: 'amarillo, yellow, amarillo oscuro',
  },
  {
    index: 3, kup: '6 KUP', name: 'Naranja', color: '#FF8C00', textColor: '#fff',
    aliases: 'orange, naranja oscuro, amarillo-verde, amarillo verde, naranja intenso',
  },
  {
    index: 4, kup: '5 KUP', name: 'Verde', color: '#2E8B57', textColor: '#fff',
    aliases: 'green, verde claro, jade',
  },
  {
    index: 5, kup: '4 KUP', name: 'Azul-Verde', color: '#1a9e8c', textColor: '#fff',
    aliases: 'azul-verde, azul verde, verde-azul, verde oscuro, blue green, green blue',
  },
  {
    index: 6, kup: '3 KUP', name: 'Azul', color: '#1565C0', textColor: '#fff',
    aliases: 'blue, azul oscuro, azul claro',
  },
  {
    index: 7, kup: '2 KUP', name: 'Rojo', color: '#C62828', textColor: '#fff',
    aliases: 'red, azul-rojo, azul rojo, rojo claro',
  },
  {
    index: 8, kup: '1 KUP', name: 'Rojo-Negro', color: '#850000', textColor: '#fff',
    aliases: 'rojo-negro, rojo negro, rojonegro, poom, cafe, café, brown, marron, marrón, rojo oscuro',
  },
  {
    index: 9, kup: '1 DAN+', name: 'Negro', color: '#212121', textColor: '#fff',
    aliases: 'negro, black, dan, 1dan, 1 dan, cinturon negro, cinturón negro, poom negro, poom-negro',
  },
];

/**
 * Carga la configuración de cinturones guardada en localStorage.
 * Si no hay config guardada (o está corrupta), devuelve DEFAULT_BELTS.
 */
export function loadBeltConfig() {
  try {
    const saved = localStorage.getItem(BELT_CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === 10) return parsed;
    }
  } catch { /* ignorar errores de parse */ }
  return DEFAULT_BELTS;
}

/**
 * Construye un mapa { alias_normalizado → índice } a partir de la config.
 * Incluye notación KUP numérica: "9kup", "kup 9", etc.
 */
export function buildBeltMap(belts) {
  const map = {};
  belts.forEach((b, i) => {
    map[b.name.toLowerCase()] = i;
    map[String(i)] = i;
    b.aliases
      .split(',')
      .map(a => a.trim().toLowerCase())
      .filter(Boolean)
      .forEach(a => { map[a] = i; });
  });
  // Notación KUP numérica
  const kupToIdx = { '9': 0, '8': 1, '7': 2, '6': 3, '5': 4, '4': 5, '3': 6, '2': 7, '1': 8 };
  for (const [kup, idx] of Object.entries(kupToIdx)) {
    map[`${kup}kup`]  = idx;
    map[`${kup} kup`] = idx;
    map[`kup${kup}`]  = idx;
    map[`kup ${kup}`] = idx;
  }
  return map;
}
