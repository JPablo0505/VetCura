import { api, euros } from '../api.js';

export async function DashboardView(root) {
  root.innerHTML = '<h1>Panel</h1><p>Cargando indicadores…</p>';
  try {
    const d = await api('/dashboard');
    const perf = d.staff_performance
      .map(
        (s) =>
          `<tr><td>${s.display_name}</td><td>${s.attended}</td><td>${s.pending}</td></tr>`,
      )
      .join('');
    root.innerHTML = `
      <h1>Panel</h1>
      <div class="cards">
        <div class="card"><div class="label">Ingresos (emitidas/pagadas)</div><div class="kpi">${euros(d.revenue_cents)}</div></div>
        <div class="card"><div class="label">Citas atendidas</div><div class="kpi">${d.attended}</div></div>
        <div class="card"><div class="label">Citas pendientes</div><div class="kpi">${d.pending}</div></div>
      </div>
      <h2>Rendimiento del personal</h2>
      ${
        perf
          ? `<table><thead><tr><th>Trabajador</th><th>Atendidas</th><th>Pendientes</th></tr></thead><tbody>${perf}</tbody></table>`
          : `<div class="empty">Sin datos de personal todavía.</div>`
      }`;
  } catch (e) {
    root.innerHTML = `<h1>Panel</h1><div class="alert error">No se pudieron cargar los indicadores: ${e.message}</div>`;
  }
}
