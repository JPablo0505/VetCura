import { api } from '../api.js';
import { ICONS } from '../main.js';

const STATUS_LABEL = {
  scheduled: 'Pendiente',
  checked_in: 'En consulta',
  done: 'Atendida',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
};

// What the next legal click does per status (subset of the backend machine).
const NEXT = { scheduled: 'checked_in', checked_in: 'done' };

function dayBounds(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setDate(d.getDate() + 1);
  return { from: d.toISOString(), to: end.toISOString() };
}

function rangeFor(mode, anchor) {
  if (mode === 'day') return dayBounds(anchor);
  const base = new Date(anchor);
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const span = mode === 'month' ? 31 : 7;
  const end = new Date(monday);
  end.setDate(monday.getDate() + span);
  return { from: monday.toISOString(), to: end.toISOString(), monday, span };
}

export async function AgendaView(root) {
  let mode = 'week';
  let anchor = new Date();

  async function render() {
    const { from, to, monday, span } = rangeFor(mode, anchor);
    const title =
      mode === 'day'
        ? anchor.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
        : `Semana del ${monday.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}`;
    root.innerHTML = '<h1>Agenda Semanal</h1><p>Cargando citas…</p>';
    try {
      const [list, vets] = await Promise.all([
        api(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api('/vets'),
      ]);
      const byDay = new Map();
      for (const a of list.appointments) {
        const key = new Date(a.starts_at).toLocaleDateString('es-CO');
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(a);
      }
      const vetName = Object.fromEntries(vets.vets.map((v) => [v.id, v.display_name]));
      const days = [];
      const start = mode === 'day' ? new Date(anchor).setHours(0, 0, 0, 0) : monday.getTime();
      const n = mode === 'day' ? 1 : span;
      for (let i = 0; i < n; i += 1) {
        const d = new Date(start + i * 864e5);
        const key = d.toLocaleDateString('es-CO');
        const chips = (byDay.get(key) || [])
          .map((a) => {
            const next = NEXT[a.status];
            const detail = `${a.pet_name} · ${new Date(a.starts_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · ${vetName[a.vet_user_id] || 'Sin asignar'} · ${STATUS_LABEL[a.status] || a.status}`;
            return `<button class="chip-appt st-${a.status}" data-id="${a.id}" data-pet="${a.pet_id}" data-next="${next || ''}" title="${detail}${next ? ` — clic para avanzar a ${STATUS_LABEL[next]}` : ' — clic para ver la ficha'}">
              <strong>${a.pet_name}</strong><small>${new Date(a.starts_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · ${vetName[a.vet_user_id] || 'S/A'}</small>
              <small>${a.reason || 'Sin motivo'}</small>
              <small>${STATUS_LABEL[a.status] || a.status}${next ? ' →' : ''}</small>
            </button>`;
          })
          .join('');
        days.push(`<div class="day-col"><h4>${d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}</h4><div class="count">${(byDay.get(key) || []).length} citas</div>${chips || '<div class="empty">—</div>'}</div>`);
      }
      const vetOptions = vets.vets.map((v) => `<option value="${v.id}">${v.display_name}</option>`).join('');
      root.innerHTML = `
        <h1>Agenda Semanal</h1>
        <p class="subtitle">${list.appointments.length} citas asignadas en el período · clic en una cita en curso para avanzarla, en una terminada para ver su ficha.</p>
        <div class="view-tabs" id="modes">
          ${['day', 'week', 'month'].map((m) => `<button data-mode="${m}" class="${m === mode ? 'active' : ''}">${m === 'day' ? 'Día' : m === 'week' ? 'Semana' : 'Mes'}</button>`).join('')}
        </div>
        <p><strong>${title}</strong>
          <button class="secondary" id="prev">‹</button>
          <button class="secondary" id="next">›</button>
          <button class="secondary" id="today">Hoy</button>
          <button class="accent" id="toggle-form">${ICONS.plus} Agendar Nueva Cita</button></p>
        <p><span class="badge">Pendiente</span> <span class="badge warn">En consulta</span> <span class="badge ok">Atendida</span> <span class="badge bad">Cancelada / No asistió</span></p>
        <div class="week-grid">${days.join('')}</div>
        <div id="form-wrap" style="display:none">
          <h2>Nueva cita por disponibilidad</h2>
          <form class="inline" id="create">
            <input name="pet_id" type="number" min="1" placeholder="ID mascota" required />
            <select name="vet_user_id" id="f-vet"><option value="">Sin asignar</option>${vetOptions}</select>
            <input name="date" id="f-date" type="date" />
            <input name="reason" placeholder="Motivo" />
            <input name="starts_at" type="hidden" />
            <input name="ends_at" type="hidden" />
            <button>Crear en el horario elegido</button>
          </form>
          <div id="slots"><p class="empty">Elegí veterinario y fecha para ver sus horas libres.</p></div>
        </div>
        <div id="msg"></div>`;
      const shift = mode === 'month' ? 31 : mode === 'day' ? 1 : 7;
      root.querySelector('#prev').onclick = () => { anchor = new Date(anchor.getTime() - shift * 864e5); render(); };
      root.querySelector('#next').onclick = () => { anchor = new Date(anchor.getTime() + shift * 864e5); render(); };
      root.querySelector('#today').onclick = () => { anchor = new Date(); render(); };
      root.querySelectorAll('#modes button').forEach((b) => {
        b.onclick = () => { mode = b.dataset.mode; render(); };
      });
      root.querySelector('#toggle-form').onclick = () => {
        const w = root.querySelector('#form-wrap');
        w.style.display = w.style.display === 'none' ? 'block' : 'none';
      };
      root.querySelectorAll('.chip-appt').forEach((c) => {
        c.onclick = async () => {
          // Terminal states open the clinical file (the record);
          // live ones advance along the status machine.
          if (!c.dataset.next) {
            location.hash = `#/pacientes/${c.dataset.pet}`;
            return;
          }
          const msg = root.querySelector('#msg');
          try {
            await api(`/appointments/${c.dataset.id}/status`, {
              method: 'PATCH',
              body: { status: c.dataset.next },
            });
            render();
          } catch (err) {
            msg.innerHTML = `<div class="alert error">${err.message}</div>`;
          }
        };
      });
      root.querySelector('#create').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const msg = root.querySelector('#msg');
        if (fd.get('vet_user_id') && (!fd.get('starts_at') || !fd.get('ends_at'))) {
          msg.innerHTML = '<div class="alert error">Elegí una hora libre del veterinario.</div>';
          return;
        }
        try {
          await api('/appointments', {
            method: 'POST',
            body: {
              pet_id: Number(fd.get('pet_id')),
              vet_user_id: fd.get('vet_user_id') ? Number(fd.get('vet_user_id')) : null,
              starts_at: fd.get('starts_at') ? new Date(fd.get('starts_at')).toISOString() : new Date().toISOString(),
              ends_at: fd.get('ends_at') ? new Date(fd.get('ends_at')).toISOString() : new Date(Date.now() + 1800e3).toISOString(),
              reason: fd.get('reason') || null,
            },
          });
          msg.innerHTML = '<div class="alert info">Cita creada.</div>';
          render();
        } catch (err) {
          msg.innerHTML = `<div class="alert error">${err.message}</div>`;
        }
      };
      const vetSel = root.querySelector('#f-vet');
      const dateSel = root.querySelector('#f-date');
      async function loadSlots() {
        const box = root.querySelector('#slots');
        if (!vetSel.value || !dateSel.value) {
          box.innerHTML = '<p class="empty">Elegí veterinario y fecha para ver sus horas libres.</p>';
          return;
        }
        box.innerHTML = '<p>Cargando horas libres…</p>';
        try {
          const s = await api(`/vets/${vetSel.value}/slots?date=${dateSel.value}`);
          if (!s.slots.length) {
            box.innerHTML = '<div class="empty">Sin horas libres ese día (fuera de horario u ocupado).</div>';
            return;
          }
          box.innerHTML = s.slots
            .map((slot, i) => `<button class="secondary" data-i="${i}">${new Date(slot.starts_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</button>`)
            .join(' ');
          box.querySelectorAll('button').forEach((b) => {
            b.onclick = () => {
              const slot = s.slots[Number(b.dataset.i)];
              const form = root.querySelector('#create');
              form.starts_at.value = slot.starts_at;
              form.ends_at.value = slot.ends_at;
              box.querySelectorAll('button').forEach((x) => x.classList.remove('accent'));
              b.classList.add('accent');
            };
          });
        } catch (err) {
          box.innerHTML = `<div class="alert error">${err.message}</div>`;
        }
      }
      vetSel.onchange = loadSlots;
      dateSel.onchange = loadSlots;
    } catch (e) {
      root.innerHTML = `<h1>Agenda Semanal</h1><div class="alert error">No se pudo cargar la agenda: ${e.message}</div>`;
    }
  }
  await render();
}
