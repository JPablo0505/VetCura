import { api, cop } from '../api.js';
import { ICONS } from '../main.js';

function toCSV(rows) {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function DashboardView(root) {
  root.innerHTML = '<h1>Dashboard de Eficiencia Operativa</h1><p class="subtitle">Supervisión en vivo del rendimiento médico con datos reales del sistema.</p><p>Cargando indicadores…</p>';
  try {
    const d = await api('/dashboard');
    const perf = d.staff_performance
      .map(
        (s) =>
          `<tr><td><strong>${s.display_name}</strong></td><td>${s.attended}</td><td>${s.pending}</td></tr>`,
      )
      .join('');
    root.innerHTML = `
      <h1>Dashboard de Eficiencia Operativa</h1>
      <p class="subtitle">Supervisión en vivo del rendimiento médico con datos reales del sistema.</p>
      <div class="cards">
        <div class="card"><div class="icon-chip">${ICONS.billing}</div><div class="label">Ingresos (emitidas/pagadas)</div><div class="kpi">${cop(d.revenue_cents)}</div></div>
        <div class="card"><div class="icon-chip">${ICONS.agenda}</div><div class="label">Citas atendidas</div><div class="kpi">${d.attended}</div><div class="progress"><i style="width:${d.attended + d.pending === 0 ? 0 : Math.round((100 * d.attended) / (d.attended + d.pending))}%"></i></div></div>
        <div class="card"><div class="icon-chip">${ICONS.consult}</div><div class="label">Citas pendientes</div><div class="kpi">${d.pending}</div></div>
      </div>
      <p><button class="secondary" id="dl">${ICONS.download} Descargar Reporte Diario (CSV)</button></p>
      <div id="msg"></div>
      <h2>Rendimiento del Equipo Veterinario</h2>
      ${
        perf
          ? `<table><thead><tr><th>Especialista</th><th>Atendidas</th><th>Pendientes</th></tr></thead><tbody>${perf}</tbody></table>`
          : `<div class="empty">Sin datos de personal todavía.</div>`
      }`;
    root.querySelector('#dl').onclick = async () => {
      const msg = root.querySelector('#msg');
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [appts, invs] = await Promise.all([
          api(`/appointments?from=${today}T00:00:00.000Z&to=${today}T23:59:59.999Z`),
          api('/invoices'),
        ]);
        const csv = toCSV([
          ['VetCura reporte diario', today],
          [],
          ['CITAS'],
          ['id', 'mascota', 'inicio', 'estado', 'motivo'],
          ...appts.appointments.map((a) => [a.id, a.pet_name, a.starts_at, a.status, a.reason || '']),
          [],
          ['FACTURAS'],
          ['id', 'propietario', 'estado', 'total_clp'],
          ...invs.invoices.map((i) => [i.id, i.owner_id, i.status, Math.round(i.total_cents / 100)]),
        ]);
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `vetcura-reporte-${today}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) {
        msg.innerHTML = `<div class="alert error">No se pudo generar el reporte: ${e.message}</div>`;
      }
    };
  } catch (e) {
    root.innerHTML = `<h1>Dashboard de Eficiencia Operativa</h1><div class="alert error">No se pudieron cargar los indicadores: ${e.message}</div>`;
  }
}
