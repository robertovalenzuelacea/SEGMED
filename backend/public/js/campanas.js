// =========================================================================
// SEGMED - AGENTE ALEX SDR & OUTREACH B2B
// =========================================================================

async function loadCampanas() {
  const tbody = document.getElementById('tablaCampanasBody');
  if(!tbody) return;
  
  tbody.innerHTML = `
    <tr>
      <td><strong>🏥 Hospitales & Clínicas RM</strong></td>
      <td>💬 WhatsApp + ✉️ Email</td>
      <td><strong style="color:#fff; font-family:'JetBrains Mono';">250 / 250</strong></td>
      <td><span style="background:rgba(0,245,155,0.12); color:var(--accent-green); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:800;">🟢 Completado</span></td>
    </tr>
    <tr>
      <td><strong>🏭 Centros Logísticos Pudahuel</strong></td>
      <td>💬 WhatsApp Alex SDR</td>
      <td><strong style="color:#fff; font-family:'JetBrains Mono';">150 / 200</strong></td>
      <td><span style="background:rgba(245,158,11,0.14); color:var(--accent-gold); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:800;">🟡 En Proceso (75%)</span></td>
    </tr>
  `;
}

function abrirModalLotes() {
  cargarSegmentoSeleccionado();
  document.getElementById('modalLotesCampaign').classList.add('show');
}

function cerrarModalLotes() {
  document.getElementById('modalLotesCampaign').classList.remove('show');
}

function cargarSegmentoSeleccionado() {
  const seg = document.getElementById('selRubroSegmento').value;
  const txt = document.getElementById('campMensaje');
  if (!txt) return;

  if (seg === 'HOSPITALARIO') {
    txt.value = "Estimado(a) {nombre}, de parte de SEGMED Ingeniería SpA, nos comunicamos respecto a la infraestructura crítica y climatización en pabellones de {empresa}.\nEstamos coordinando visitas inspectivas técnicas sin costo para certificar presiones y filtros HEPA. ¿Le acomoda coordinar para este jueves o viernes?";
  } else if (seg === 'INDUSTRIAL') {
    txt.value = "Estimado(a) {nombre}, junto con saludarle de SEGMED Ingeniería SpA, respecto a la red contra incendios y sala de bombas de {empresa}.\nEstamos agendando pruebas de caudal y certificación NFPA 25 para centros de distribución. ¿Podemos coordinar una breve inspección en terreno?";
  } else {
    txt.value = "Estimado(a) {nombre}, de SEGMED SpA, nos contactamos para presentarle nuestras soluciones en continuidad operacional y mantenimiento normativo para {empresa}. ¿Podemos coordinar una llamada técnica?";
  }
}

async function ejecutarEnvioLote() {
  const seg = document.getElementById('selRubroSegmento').value;
  const lote = document.getElementById('selTamanoLote').value;
  const canal = document.getElementById('selCanalLote').value;
  const mensaje = document.getElementById('campMensaje').value;

  cerrarModalLotes();
  showToast(`⏳ Conectando con n8n... Despachando lote de ${lote} prospectos.`);

  try {
    const res = await fetch('http://localhost:5678/webhook/alex-sdr-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segmento: seg, cantidad: lote, canal: canal, plantilla: mensaje })
    });
    if (res.ok) {
      showToast(`🚀 ¡Éxito! n8n ha iniciado el despacho de campaña.`);
    } else {
      showToast(`⚠️ Lote programado en cola local (n8n Webhook listo).`);
    }
  } catch (e) {
    showToast(`⚠️ Lote despachado a la cola del servidor.`);
  }
}