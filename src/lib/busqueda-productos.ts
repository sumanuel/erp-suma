// Cuántos productos devuelve una búsqueda: 12 en la lista desplegable; en la ventana de productos, lo que pida (máximo 1.000).
export const tope = (limite?: number) => (limite && Number.isFinite(limite) ? Math.min(Math.max(Math.trunc(limite), 1), 1000) : 12);
