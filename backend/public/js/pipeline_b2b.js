// =========================================================================
// SEGMED - PIPELINE B2B PRIVADO & COTIZADOR VÍCTOR IA
// =========================================================================

function calcularSLA(fechaIso, etapa) {
  if (etapa === 'CIERRE_GANADO' || etapa === 'GANADO') return { color: 'var(--accent-green)', bg: 'rgba(0, 245, 155, 0.12)', border: 'rgba(0, 245, 155, 0.35)', text: '🏆 Adjudicado' };
  const creacion = fechaIso ? new Date(fechaIso) : new Date(); const ahora = new Date();
  const diffHoras = Math.max(0, Math.floor((ahora - creacion) / (1000 * 60 * 60))); const diffDias = Math.floor(diffHoras / 24);
  let tiempoStr = diffHoras < 1 ? 'Hace instantes' : (diffHoras < 24 ? `Hace ${diffHoras}h` : `Hace ${diffDias}d`);
  if (diffHoras < 24) return { color: '#00f59b', bg: 'rgba(0, 245, 155, 0.12)', border: 'rgba(0, 245, 155, 0.3)', text: `🟢 Al día • ${tiempoStr}` };
  else if (diffHoras < 48) return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.35)', text: `🟡 Atención • ${tiempoStr}` };
  else return { color: '#ff4d4d', bg: 'rgba(255, 77, 77, 0.18)', border: 'rgba(255, 77, 77, 0.45)', text: `🔴 Urgente • ${tiempoStr}` };
}

function formatearFechaHora(fechaIso) {
  if (!fechaIso) return 'Hoy'; const d = new Date(fechaIso); if (isNaN(d.getTime())) return 'Hoy';
  return `${d.toLocaleDateString('es-CL')} a las ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
}

async function cargarPipeline() {
  try {
    let negocios = [];
    const res = await fetch('/api/pipeline');
    if (res.ok) negocios = await res.json();
    document.querySelectorAll('#pipelineView .kanban-cards').forEach(col => col.innerHTML = '');
    
    if (Array.isArray(negocios)) {
      negocios.forEach(negocio => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'kanban-card';
        tarjeta.draggable = true;
        tarjeta.id = 'negocio-' + negocio.id;
        tarjeta.ondragstart = (ev) => ev.dataTransfer.setData("text/plain", tarjeta.id);

        let etapaDestino = negocio.etapa || 'NUEVO_LEAD';
        if (etapaDestino === 'EN_PROPUESTA') etapaDestino = 'NEGOCIACION';
        if (etapaDestino === 'GANADO') etapaDestino = 'CIERRE_GANADO';

        const sla = calcularSLA(negocio.created_at || negocio.fecha_registro, etapaDestino);
        const fechaHoraStr = formatearFechaHora(negocio.created_at || negocio.fecha_registro);
        const montoVal = Number(negocio.monto || 0);

        let numCotiz = negocio.numero_cotizacion || '';
        if (!numCotiz && negocio.detalles_cotizacion) {
          try { numCotiz = JSON.parse(negocio.detalles_cotizacion).numeroCotizacion || ''; } catch(e){}
        }

        tarjeta.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <strong class="card-title" style="font-size: 14.5px;">${negocio.empresa || 'Empresa'}</strong>
            <span style="font-size:10px; font-weight:800; padding:3px 8px; border-radius:6px; background:${sla.bg}; color:${sla.color}; border:1px solid ${sla.border};">${sla.text}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <span style="color: var(--accent-cyan); font-size: 12.5px; font-weight:600;">👤 ${negocio.contacto_nombre || 'Sin contacto'}</span>
            <span style="font-size: 11.5px; color: var(--muted);">✉️ ${negocio.email || '—'}</span>
            ${negocio.telefono && negocio.telefono !== '—' ? `<span style="font-size: 11.5px; color: #cbd5e1; font-family:'JetBrains Mono';">📞 ${negocio.telefono}</span>` : ''}
          </div>
          ${montoVal > 0 ? `
          <div style="background:rgba(0,245,155,0.06); border:1px solid rgba(0,245,155,0.25); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:10px; font-weight:800; color:var(--accent-cyan); font-family:'JetBrains Mono';">${numCotiz ? '🔢 ' + numCotiz : 'VALOR PROPUESTA:'}</span>
              <span style="font-size:9.5px; color:var(--muted); font-weight:700;">NETO</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="font-size:14px; color:var(--accent-green); font-family:'JetBrains Mono';">$${montoVal.toLocaleString('es-CL')} CLP</strong>
              <span style="font-size:10px; color:#94a3b8; font-family:'JetBrains Mono';">+IVA: $${(Math.round(montoVal * 1.19)).toLocaleString('es-CL')}</span>
            </div>
          </div>` : ''}
          <div style="padding-top:8px; border-top:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; font-size:10.5px; color:var(--muted);">
            <span>🗓️ ${fechaHoraStr}</span>
            <button onclick="abrirCotizadorVictor(${negocio.id}, '${negocio.empresa.replace(/'/g, "\\'")}', '${(negocio.contacto_nombre||'').replace(/'/g, "\\'")}', '${(negocio.email||'').replace(/'/g, "\\'")}', '${(negocio.telefono||'').replace(/'/g, "\\'")}', '${numCotiz}')" class="btn-action cotizar">${montoVal > 0 ? '📄 Ver / Editar' : '📑 Cotizar'}</button>
          </div>`;
        
        const columna = document.querySelector(`.kanban-col[data-etapa="${etapaDestino}"] .kanban-cards`);
        if (columna) columna.appendChild(tarjeta);
      });
    }
  } catch (error) {
    console.error("Error en Pipeline B2B:", error);
  }
}

function filterPipelineLive() {
  const query = (document.getElementById('searchPipelineInput')?.value || '').toLowerCase();
  document.querySelectorAll('#pipelineView .kanban-card').forEach(card => {
    card.style.display = card.innerText.toLowerCase().includes(query) ? 'flex' : 'none';
  });
}

async function dropB2B(ev) {
  ev.preventDefault();
  const data = ev.dataTransfer.getData("text/plain");
  if (!data.startsWith('negocio-')) return;
  
  const tarjeta = document.getElementById(data); if (!tarjeta) return;
  const colEl = ev.target.closest('.kanban-col'); if (!colEl) return;
  const dropzone = colEl.querySelector('.kanban-cards'); if (!dropzone) return;
  
  dropzone.appendChild(tarjeta);
  const negocioId = data.replace('negocio-', '');
  const nuevaEtapa = colEl.getAttribute('data-etapa');

  try {
    let res = await fetch(`/api/pipeline/${negocioId}/etapa`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuevaEtapa, etapa: nuevaEtapa })
    });
    if (!res.ok) {
      await fetch(`/api/b2b/negocios/${negocioId}/etapa`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapa: nuevaEtapa })
      });
    }
    if (nuevaEtapa === 'CIERRE_GANADO') {
      await fetch(`/api/b2b/negocios/${negocioId}/reforzar-ganado`, { method: 'POST' }).catch(()=>{});
      showToast(`🏆 ¡Negocio Ganado! Memoria RAG reforzada.`);
    } else {
      showToast(`✅ Negocio movido a: ${nuevaEtapa.replace(/_/g, ' ')}`);
    }
    cargarPipeline();
  } catch(err) {
    showToast('❌ Error actualizando negocio');
  }
}

// ==========================================
// VÍCTOR IA (COTIZADOR)
// ==========================================
async function abrirCotizadorVictor(id, empresa, contacto, email, telefono, num) {
  state.cotizandoNegocioId = id;
  state.cotizandoEmpresa = empresa;
  state.cotizandoContacto = contacto;
  state.cotizandoEmail = email;
  state.cotizandoTelefono = telefono;
  state.cotizandoNumero = num || ('COT-SEGMED-' + Math.floor(1000 + Math.random() * 9000));
  
  document.getElementById('lblCotizadorCliente').innerText = `Dossier • ${empresa} (${state.cotizandoNumero})`;
  await consultarSugerenciaIA();
  document.getElementById('modalCotizadorVictor').classList.add('show');
}

function cerrarCotizadorVictor() {
  document.getElementById('modalCotizadorVictor').classList.remove('show');
}

async function consultarSugerenciaIA() {
  const servicio = document.getElementById('cotizServicio').value;
  try {
    const res = await fetch(`/api/b2b/ia/sugerir-cotizacion?servicio=${encodeURIComponent(servicio)}`);
    if (res.ok) {
      const data = await res.json();
      document.getElementById('cotizDiagnostico').value = data.diagnostico;
      state.partidasCotizacion = data.partidas || [];
      renderizarPartidasCotizador();
      showToast(`💡 Cotización calibrada (${data.origen === 'MEMORIA_HISTORICA_IA' ? 'RAG Histórico' : 'Estándar'})`);
    }
  } catch(e) {}
}

function renderizarPartidasCotizador() {
  const tbody = document.getElementById('tablaPartidasBody');
  tbody.innerHTML = '';
  let subtotal = 0;

  state.partidasCotizacion.forEach((item, index) => {
    subtotal += (item.cant || 1) * (item.pu || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${item.desc}" onchange="actualizarPartida(${index}, 'desc', this.value)" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--border-mid); background:var(--bg-subtle); color:#fff; font-size:12px;"></td>
      <td><input type="number" min="1" value="${item.cant}" onchange="actualizarPartida(${index}, 'cant', this.value)" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--border-mid); background:var(--bg-subtle); color:#fff; font-size:12px;"></td>
      <td><input type="number" min="0" step="1000" value="${item.pu}" onchange="actualizarPartida(${index}, 'pu', this.value)" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--border-mid); background:var(--bg-subtle); color:#fff; font-size:12px;"></td>
      <td style="text-align:center;"><button onclick="eliminarPartida(${index})" style="background:transparent; border:none; color:#ff4d4d; cursor:pointer; font-weight:bold;">✕</button></td>`;
    tbody.appendChild(tr);
  });

  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;
  document.getElementById('lblCotizSubtotal').innerText = `$${subtotal.toLocaleString('es-CL')} CLP`;
  document.getElementById('lblCotizIva').innerText = `$${iva.toLocaleString('es-CL')} CLP`;
  document.getElementById('lblCotizTotal').innerText = `$${total.toLocaleString('es-CL')} CLP`;
}

function agregarPartidaTecnica() {
  state.partidasCotizacion.push({ desc: 'Partida adicional de mantenimiento', cant: 1, pu: 350000 });
  renderizarPartidasCotizador();
}

function actualizarPartida(i, c, v) {
  state.partidasCotizacion[i][c] = (c==='cant'||c==='pu') ? Number(v)||0 : v;
  renderizarPartidasCotizador();
}

function eliminarPartida(i) {
  state.partidasCotizacion.splice(i, 1);
  renderizarPartidasCotizador();
}

function armarHTMLDossierCotizacion() {
  const subtotal = state.partidasCotizacion.reduce((a, it) => a + ((it.cant||1)*(it.pu||0)), 0);
  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;
  let filasHtml = '';

  state.partidasCotizacion.forEach((it, i) => {
    filasHtml += `<tr style="border-bottom:1px solid #e2e8f0; ${i%2===0?'background:#f8fafc;':'background:#ffffff;'}">
      <td style="padding:10px; font-size:11px; color:#0f172a;">${it.desc}</td>
      <td style="padding:10px; text-align:center; color:#334155;">${it.cant}</td>
      <td style="padding:10px; text-align:right; color:#334155;">$${(it.pu||0).toLocaleString('es-CL')}</td>
      <td style="padding:10px; text-align:right; font-weight:800; color:#0f172a;">$${((it.cant||1)*(it.pu||0)).toLocaleString('es-CL')}</td>
    </tr>`;
  });

  return `
    <div style="background:#070B14; border-bottom:4px solid #E30613; padding:18px 24px; color:#fff;">
      <div style="font-size:19px; font-weight:900;">SEGMED INGENIERÍA SpA</div>
      <div style="font-size:11px; color:#cbd5e1;">Propuesta Comercial Oficial: ${state.cotizandoNumero}</div>
    </div>
    <div style="padding:20px; color:#0f172a; font-family:'Plus Jakarta Sans', Arial, sans-serif;">
      <p style="font-size:12px; margin-bottom:15px;"><strong>Cliente:</strong> ${state.cotizandoEmpresa} | <strong>Contacto:</strong> ${state.cotizandoContacto}<br><strong>Servicio:</strong> ${document.getElementById('cotizServicio').value}</p>
      <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
        <thead><tr style="background:#0F172A; color:#ffffff; font-size:10px;"><th style="padding:8px;">Item</th><th style="padding:8px;">Cant</th><th style="padding:8px;">P.Unit</th><th style="padding:8px;">Total</th></tr></thead>
        <tbody>${filasHtml}</tbody>
      </table>
      <div style="text-align:right; font-size:12px; border-top:1px solid #e2e8f0; padding-top:10px;">
        <div>Subtotal Neto: <strong>$${subtotal.toLocaleString('es-CL')} CLP</strong></div>
        <div>IVA (19%): <strong>$${iva.toLocaleString('es-CL')} CLP</strong></div>
        <div style="font-size:15px; font-weight:900; color:#059669; margin-top:4px;">Total Propuesta: $${total.toLocaleString('es-CL')} CLP</div>
      </div>
    </div>`;
}

async function generarPDFBase64() {
  const plantilla = document.getElementById('plantillaPdfImprimible');
  plantilla.innerHTML = armarHTMLDossierCotizacion();
  plantilla.style.display = 'block';
  const opt = { margin: 6, filename: `Dossier_${state.cotizandoNumero}.pdf`, image: { type: 'jpeg', quality: 1.0 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
  const pdfUri = await html2pdf().from(plantilla).set(opt).outputPdf('datauristring');
  plantilla.style.display = 'none';
  return pdfUri;
}

function descargarPDFPropuestaVictor() {
  if(state.partidasCotizacion.length === 0) return showToast("Agregue partidas a la cotización");
  const plantilla = document.getElementById('plantillaPdfImprimible');
  plantilla.innerHTML = armarHTMLDossierCotizacion();
  plantilla.style.display = 'block';
  const opt = { margin: 6, filename: `Dossier_${state.cotizandoNumero}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
  html2pdf().from(plantilla).set(opt).save().then(() => {
    plantilla.style.display = 'none';
    showToast(`📄 Cotización descargada exitosamente.`);
  });
}

async function enviarCotizacionPorCorreo() {
  if(state.partidasCotizacion.length === 0) return showToast("Agregue partidas");
  showToast('⏳ Despachando correo corporativo...');
  const pdfBase64 = await generarPDFBase64();
  const payload = {
    montoNeto: state.partidasCotizacion.reduce((a,it)=>a+(it.cant*it.pu),0),
    numeroCotizacion: state.cotizandoNumero,
    servicio: document.getElementById('cotizServicio').value,
    validez: document.getElementById('cotizValidez').value,
    condiciones: document.getElementById('cotizPago').value,
    diagnostico: document.getElementById('cotizDiagnostico').value,
    items: state.partidasCotizacion,
    email: state.cotizandoEmail,
    pdfBase64: pdfBase64,
    enviarEmailDirecto: true
  };
  try {
    const res = await fetch(`/api/b2b/negocios/${state.cotizandoNegocioId}/cotizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✉️ Cotización enviada a ${data.emailEnviado || state.cotizandoEmail}`);
      cerrarCotizadorVictor();
      cargarPipeline();
    }
  } catch (err) {
    showToast('❌ Error despachando correo');
  }
}

async function enviarCotizacionPorWhatsApp() {
  if(state.partidasCotizacion.length === 0) return showToast("Agregue partidas");
  showToast('⏳ Registrando cotización...');
  const pdfBase64 = await generarPDFBase64();
  const payload = {
    montoNeto: state.partidasCotizacion.reduce((a,it)=>a+(it.cant*it.pu),0),
    numeroCotizacion: state.cotizandoNumero,
    servicio: document.getElementById('cotizServicio').value,
    validez: document.getElementById('cotizValidez').value,
    condiciones: document.getElementById('cotizPago').value,
    diagnostico: document.getElementById('cotizDiagnostico').value,
    items: state.partidasCotizacion,
    email: state.cotizandoEmail,
    pdfBase64: pdfBase64,
    enviarEmailDirecto: false
  };
  try {
    const res = await fetch(`/api/b2b/negocios/${state.cotizandoNegocioId}/cotizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Registrada en BD`);
      cerrarCotizadorVictor();
      if(data.whatsappUrl) window.open(data.whatsappUrl, '_blank');
      cargarPipeline();
    }
  } catch (err) {
    showToast('❌ Error al procesar WhatsApp');
  }
}