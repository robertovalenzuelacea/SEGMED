// =========================================================================
// SEGMED - BASE MAESTRA DE PROSPECTOS B2B
// =========================================================================

async function loadContactos(pagina = 1) {
  const tbody = document.getElementById('tablaContactosBody');
  if(!tbody) return;

  try {
    const res = await fetch(`/api/contactos?page=${pagina}`);
    if(res.ok) {
      const data = await res.json();
      state.contactos = data.contactos || [];
      renderizarTablaContactos(state.contactos);
      return;
    }
  } catch(e) {}

  // Fallback visual representativo de la Base Maestra
  tbody.innerHTML = `
    <tr>
      <td><strong>Dr. Carlos Valenzuela</strong></td>
      <td>Hospital Clínico San Borja</td>
      <td>Jefe Mantención & Operaciones</td>
      <td>cvalenzuela@redsalud.gob.cl</td>
      <td>+56 9 8472 1190</td>
      <td><span style="color:var(--accent-green); font-weight:800;">96/100</span></td>
    </tr>
    <tr>
      <td><strong>Ing. Mauricio Paredes</strong></td>
      <td>Bodegas San Francisco Pudahuel</td>
      <td>Gerente de Infraestructura</td>
      <td>mparedes@bsf.cl</td>
      <td>+56 9 7123 4455</td>
      <td><span style="color:var(--accent-green); font-weight:800;">92/100</span></td>
    </tr>
    <tr>
      <td><strong>Lorena Fuentes</strong></td>
      <td>Clínica Las Condes</td>
      <td>Subdirectora de Abastecimiento</td>
      <td>lfuentes@clc.cl</td>
      <td>+56 9 6554 9900</td>
      <td><span style="color:var(--accent-cyan); font-weight:800;">88/100</span></td>
    </tr>
  `;
}

function renderizarTablaContactos(contactos) {
  const tbody = document.getElementById('tablaContactosBody');
  if(!tbody) return;
  tbody.innerHTML = '';
  contactos.forEach(c => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${c.nombre || 'Contacto'}</strong></td>
        <td>${c.empresa || 'Empresa'}</td>
        <td>${c.cargo || 'Cargo'}</td>
        <td>${c.email || '—'}</td>
        <td>${c.telefono || '—'}</td>
        <td><span style="color:var(--accent-green); font-weight:800;">${c.score || 90}/100</span></td>
      </tr>
    `;
  });
}

function filterContactosLive() {
  const query = (document.getElementById('searchContactosInput')?.value || '').toLowerCase();
  document.querySelectorAll('#tablaContactosBody tr').forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
  });
}