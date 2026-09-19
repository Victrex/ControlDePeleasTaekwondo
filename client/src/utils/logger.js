// Logs de depuración sólo en desarrollo; errores siempre.
const DEV = import.meta.env.DEV;

export const log = DEV ? (...args) => console.log(...args) : () => {};
export const warn = DEV ? (...args) => console.warn(...args) : () => {};
export const error = (...args) => console.error(...args);
