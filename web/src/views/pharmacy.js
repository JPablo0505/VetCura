import { api, clp } from '../api.js';

// Farmacia e Insumos (Trabajador.svg sidebar): catalog search + stock + add.
export async function PharmacyView(root) {
  root.innerHTML = '<h1>Farmacia e Insumos</h1><p>Cargando catálogo…</p>';
  async function render(q = '') {
    try {
      const list = await api(`/medications${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const rows = list.medications
        .map(
          (m) =>
            `<tr><td><strong>${m.name}</strong></td><td>${m.kind === 'drug' ? 'Medicamento' : 'Insumo'}</td><td>${clp(m.price_cents)}</td><td>${m.stock}</td></tr>`,
        )
        .join('');
      root.innerHTML = `
        <h1>Farmacia e Insumos</h1>
        <p class="subtitle">${list.medications.length} productos en catálogo.</p>
        <form class="inline" id="search"><input name="q" placeholder="Buscar fármaco o insumo…" value="${q.replace(/"/g, '&quot;')}" /><button class="secondary">Buscar</button></form>
        ${rows ? `<table><thead><tr><th>Producto</th><th>Tipo</th><th>Precio</th><th>Stock</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Sin resultados.</div>`}
        <h2>Agregar producto</h2>
        <form class="inline" id="add">
          <input name="name" placeholder="Nombre" required />
          <select name="kind"><option value="drug">Medicamento</option><option value="supply">Insumo</option></select>
          <input name="price_cents" type="number" min="0" placeholder="Precio (centavos)" required />
          <input name="stock" type="number" min="0" value="0" />
          <button>Agregar</button>
        </form>
        <div id="msg"></div>`;
      root.querySelector('#search').onsubmit = (e) => {
        e.preventDefault();
        render(new FormData(e.target).get('q') || '');
      };
      root.querySelector('#add').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api('/medications', {
            method: 'POST',
            body: {
              name: fd.get('name'),
              kind: fd.get('kind'),
              price_cents: Number(fd.get('price_cents')),
              stock: Number(fd.get('stock') || 0),
            },
          });
          render(q);
        } catch (err) {
          root.querySelector('#msg').innerHTML = `<div class="alert error">${err.message}</div>`;
        }
      };
    } catch (e) {
      root.innerHTML = `<h1>Farmacia e Insumos</h1><div class="alert error">No se pudo cargar el catálogo: ${e.message}</div>`;
    }
  }
  await render();
}
