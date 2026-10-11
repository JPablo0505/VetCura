import { api } from '../api.js';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function fmt(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// Doctores: each veterinarian and their weekly availability. Booking
// (agenda + app) only offers hours inside these ranges.
export async function DoctorsView(root) {
  root.innerHTML = '<h1>Doctores y Disponibilidad</h1><p>Cargando equipo…</p>';
  try {
    const vets = await api('/vets');
    const cards = vets.vets
      .map((v) => `<div class="card" data-vet="${v.id}"><div class="label">Veterinario</div><div class="kpi" style="font-size:1.2rem">${v.display_name}</div><div class="ranges"><p>Cargando horarios…</p></div></div>`)
      .join('');
    root.innerHTML = `
      <h1>Doctores y Disponibilidad</h1>
      <p class="subtitle">Las citas solo pueden reservarse dentro de estos horarios. Sin rangos, el doctor figura sin horas libres.</p>
      <div class="doctor-list">${cards || '<div class="empty">Sin veterinarios.</div>'}</div>
      <div id="msg"></div>`;
    for (const vet of vets.vets) {
      const card = root.querySelector(`[data-vet="${vet.id}"] .ranges`);
      await paintRanges(card, vet);
    }

    async function paintRanges(card, vet) {
      try {
        const data = await api(`/vets/${vet.id}/availability`);
        const rows = data.availability
          .map(
            (r) => `<tr><td>${DAYS[r.weekday]}</td><td>${fmt(r.start_min)} – ${fmt(r.end_min)}</td>
              <td><button class="secondary" data-del="${r.id}">Quitar</button></td></tr>`,
          )
          .join('');
        card.innerHTML = `
          ${rows ? `<div class="table-wrap"><table><thead><tr><th>Día</th><th>Horario</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Sin horarios definidos.</div>`}
          <form class="inline" data-add="${vet.id}">
            <select name="weekday">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
            <input name="start" type="time" value="08:00" required />
            <input name="end" type="time" value="17:00" required />
            <button>Agregar</button>
          </form>`;
        card.querySelectorAll('[data-del]').forEach((b) => {
          b.onclick = async () => {
            try {
              await api(`/availability/${b.dataset.del}`, { method: 'DELETE' });
              paintRanges(card, vet);
            } catch (err) {
              root.querySelector('#msg').innerHTML = `<div class="alert error">${err.message}</div>`;
            }
          };
        });
        card.querySelector('[data-add]').onsubmit = async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api(`/vets/${vet.id}/availability`, {
              method: 'POST',
              body: { weekday: Number(fd.get('weekday')), start: fd.get('start'), end: fd.get('end') },
            });
            paintRanges(card, vet);
          } catch (err) {
            root.querySelector('#msg').innerHTML = `<div class="alert error">${err.message}</div>`;
          }
        };
      } catch (e) {
        card.innerHTML = `<div class="alert error">${e.message}</div>`;
      }
    }
  } catch (e) {
    root.innerHTML = `<h1>Doctores y Disponibilidad</h1><div class="alert error">${e.message}</div>`;
  }
}
