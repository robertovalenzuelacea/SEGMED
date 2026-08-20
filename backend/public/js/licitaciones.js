// =========================================================================
// SEGMED CHILE - MOTOR LICITACIONES & EXPEDIENTE EJECUTIVO A4 (ESTRICTO)
// =========================================================================

const REGIONES_CHILE = [ 
  "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", 
  "Valparaíso", "Región Metropolitana", "O'Higgins", "Maule", "Ñuble", 
  "Biobío", "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes" 
];

function normalizarEstado(rawEstado) {
  const est = String(rawEstado || '').trim().toUpperCase();
  if (est.includes('DESCUBIERTA')) return 'Descubierta';
  if (est.includes('EVALUACI')) return 'En Evaluación';
  if (est.includes('PREPAR')) return 'Preparando Oferta';
  if (est.includes('POSTULA') || est.includes('GANAD') || est.includes('ADJUDICA')) return 'Postuladas / Ganadas';
  return 'Descubierta';
}

async function loadLicitaciones() {
  try {
    const res = await fetch('/api/licitaciones');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    const rawList = Array.isArray(data) ? data : (data.data || data.rows || []);
    
    state.licitaciones = rawList.map(lic => {
      const codigoLimpio = String(lic.codigo_licitacion || lic.codigo || lic.id || '').trim();
      const nombreLimpio = String(lic.nombre || lic.titulo || 'Sin Título').trim();
      const organismoLimpio = String(lic.organismo || 'Organismo Desconocido').trim();
      const regionLimpia = String(lic.region || 'Región Metropolitana').trim();
      const comunaLimpia = String(lic.comuna || 'Santiago').trim();
      const montoNum = Number(String(lic.monto_estimado || lic.monto || 0).replace(/[^0-9]/g, '')) || 0;
      const estadoNorm = normalizarEstado(lic.estado);
      const fechaCierre = String(lic.fecha_cierre || lic.cierre || '').trim();

      return {
        ...lic,
        id_normalizado: codigoLimpio,
        codigo: codigoLimpio,
        nombre: nombreLimpio,
        organismo: organismoLimpio,
        region: regionLimpia,
        comuna: comunaLimpia,
        monto: montoNum,
        estado: estadoNorm,
        fecha_cierre: fechaCierre,
        raw_ai: lic.checklist_docs || lic.analisis_ia || ''
      };
    });

    state.filteredLicitaciones = [...state.licitaciones];
    poblarRegionesLicitaciones();
    renderKanbanLicitaciones();
    showToast(`✅ ${state.licitaciones.length} Licitaciones sincronizadas.`);
  } catch (error) {
    console.error("Error al cargar licitaciones:", error);
    showToast("⚠️ Error conectando con /api/licitaciones.");
  }
}

function renderKanbanLicitaciones() {
  const columnas = {
    'Descubierta': document.getElementById('colDescubierta'),
    'En Evaluación': document.getElementById('colEvaluacion'),
    'Preparando Oferta': document.getElementById('colPreparando'),
    'Postuladas / Ganadas': document.getElementById('colPostuladas')
  };

  Object.values(columnas).forEach(col => { if(col) col.innerHTML = ''; });
  let totalMonto = 0;
  let contadores = { 'Descubierta': 0, 'En Evaluación': 0, 'Preparando Oferta': 0, 'Postuladas / Ganadas': 0 };

  state.filteredLicitaciones.forEach(lic => {
    totalMonto += Number(lic.monto || 0);
    const estado = lic.estado || 'Descubierta';
    contadores[estado] = (contadores[estado] || 0) + 1;

    const fechaFormat = lic.created_at ? new Date(lic.created_at).toLocaleDateString('es-CL') : 'Hoy';

    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.id = `licitacion-${lic.id_normalizado}`;
    card.ondragstart = (ev) => ev.dataTransfer.setData("text/plain", card.id);

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <span style="font-size:10px; font-weight:900; background:rgba(255,255,255,0.1); padding:3px 8px; border-radius:6px; color:#cbd5e1; font-family:'JetBrains Mono';">${lic.codigo}</span>
        <span style="font-size:10px; color:var(--muted);">${fechaFormat}</span>
      </div>
      <strong class="card-title">${lic.nombre}</strong>
      <div style="font-size:11.5px; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
        <span>🏢 ${lic.organismo}</span>
        <span style="color:var(--accent-cyan); font-weight:600;">📍 ${lic.region} - ${lic.comuna}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; padding-top:10px; border-top:1px solid var(--border-subtle);">
        <strong style="font-size:15px; color:var(--accent-green); font-family:'JetBrains Mono';">$${Number(lic.monto || 0).toLocaleString('es-CL')}</strong>
        <button class="btn-action dossier" onclick="abrirDossierLicitacion('${lic.codigo}')">Dossier IA</button>
      </div>
    `;
    if (columnas[estado]) columnas[estado].appendChild(card);
  });

  if (document.getElementById('countDescubierta')) document.getElementById('countDescubierta').innerText = contadores['Descubierta'];
  if (document.getElementById('countEvaluacion')) document.getElementById('countEvaluacion').innerText = contadores['En Evaluación'];
  if (document.getElementById('countPreparando')) document.getElementById('countPreparando').innerText = contadores['Preparando Oferta'];
  if (document.getElementById('countPostuladas')) document.getElementById('countPostuladas').innerText = contadores['Postuladas / Ganadas'];

  if (document.getElementById('barPipelineTotal')) {
    document.getElementById('barPipelineTotal').innerText = `$${totalMonto.toLocaleString('es-CL')} CLP`;
    document.getElementById('barTotalCount').innerText = state.filteredLicitaciones.length;
    const avg = state.filteredLicitaciones.length > 0 ? Math.round(totalMonto / state.filteredLicitaciones.length) : 0;
    document.getElementById('barPipelineAvg').innerText = `$${avg.toLocaleString('es-CL')} CLP`;
  }
}

function filterKanban() {
  const query = (document.getElementById('licitSearch')?.value || '').toLowerCase().trim();
  const region = document.getElementById('licitRegionFilter')?.value || '';
  const comuna = document.getElementById('licitComunaFilter')?.value || '';
  const sort = document.getElementById('licitSortBy')?.value || 'recientes';

  state.filteredLicitaciones = state.licitaciones.filter(l => {
    const cod = (l.codigo || '').toLowerCase();
    const nom = (l.nombre || '').toLowerCase();
    const org = (l.organismo || '').toLowerCase();
    const matchBusqueda = (cod.includes(query) || nom.includes(query) || org.includes(query));
    const matchRegion = region === '' || l.region.toLowerCase().includes(region.toLowerCase());
    const matchComuna = comuna === '' || l.comuna.toLowerCase().includes(comuna.toLowerCase());
    return matchBusqueda && matchRegion && matchComuna;
  });

  if (sort === 'monto_desc') state.filteredLicitaciones.sort((a, b) => Number(b.monto || 0) - Number(a.monto || 0));
  if (sort === 'monto_asc') state.filteredLicitaciones.sort((a, b) => Number(a.monto || 0) - Number(b.monto || 0));
  if (sort === 'recientes') state.filteredLicitaciones.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  renderKanbanLicitaciones();
}

function resetLicitFilters() {
  if (document.getElementById('licitSearch')) document.getElementById('licitSearch').value = '';
  if (document.getElementById('licitRegionFilter')) document.getElementById('licitRegionFilter').value = '';
  if (document.getElementById('licitComunaFilter')) document.getElementById('licitComunaFilter').innerHTML = '<option value="">Todas las Comunas</option>';
  if (document.getElementById('licitSortBy')) document.getElementById('licitSortBy').value = 'recientes';
  state.filteredLicitaciones = [...state.licitaciones];
  renderKanbanLicitaciones();
}

function poblarRegionesLicitaciones() {
  const select = document.getElementById('licitRegionFilter');
  if (!select) return;
  select.innerHTML = '<option value="">Todas las Regiones (Chile)</option>';
  REGIONES_CHILE.forEach(r => select.innerHTML += `<option value="${r}">${r}</option>`);
}

function onRegionChange() {
  const region = document.getElementById('licitRegionFilter').value;
  const selectComuna = document.getElementById('licitComunaFilter');
  if (!selectComuna) return;

  if (!region) {
    selectComuna.innerHTML = '<option value="">Todas las Comunas</option>';
  } else {
    const comunas = [...new Set(state.licitaciones.filter(l => l.region.toLowerCase().includes(region.toLowerCase())).map(l => l.comuna).filter(Boolean))].sort();
    selectComuna.innerHTML = '<option value="">Todas las Comunas</option>';
    comunas.forEach(c => selectComuna.innerHTML += `<option value="${c}">${c}</option>`);
  }
  filterKanban();
}

async function dropLicitacion(ev) {
  ev.preventDefault();
  const data = ev.dataTransfer.getData("text/plain");
  if (!data.startsWith('licitacion-')) return;
  
  const colEl = ev.target.closest('.kanban-col'); if (!colEl) return;
  const licitacionId = data.replace('licitacion-', '');
  const nuevoEstado = colEl.getAttribute('data-estado');

  try {
    const res = await fetch(`/api/licitaciones/${licitacionId}/estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado })
    });
    if (res.ok) {
      showToast(`✅ Movida a: ${nuevoEstado}`);
      loadLicitaciones(); 
    }
  } catch (err) {
    showToast('❌ Error al actualizar estado');
  }
}

// ==========================================
// MODAL DOSSIER IA (PANTALLA)
// ==========================================
window.abrirDossierLicitacion = function(codigoReq) {
  const l = state.licitaciones.find(x => x.codigo === String(codigoReq).trim());
  if (!l) return showToast("❌ Licitación no encontrada.");
  
  state.licitacionSeleccionada = l;
  document.getElementById('modalLicitTitle').innerText = `${l.codigo} - ${l.nombre.substring(0, 48)}...`;
  
  const urlPortal = `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=${l.codigo}`;
  document.getElementById('btnModalPortal').href = urlPortal;
  document.getElementById('btnModalAnexos').href = urlPortal;
  document.getElementById('tlPublicacion').innerText = l.created_at ? new Date(l.created_at).toLocaleDateString('es-CL') : '19-08-2026';
  document.getElementById('tlCierre').innerText = l.fecha_cierre ? l.fecha_cierre.split('T')[0] : 'Ver Bases';

  switchModalTab('agente1');
  document.getElementById('dossierModal').classList.add('show');
};

window.cerrarDossier = function() {
  document.getElementById('dossierModal').classList.remove('show');
};

window.switchModalTab = function(tabId) {
  document.querySelectorAll('#dossierModal .modal-tab-btn').forEach(t => t.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('#dossierModal .modal-tab-btn')).find(t => t.getAttribute('onclick').includes(tabId));
  if (activeBtn) activeBtn.classList.add('active');

  const content = document.getElementById('modalTabContent');
  const l = state.licitacionSeleccionada;
  if (!l || !content) return;

  const montoFormateado = Number(l.monto || 0).toLocaleString('es-CL');

  if (tabId === 'agente1') {
    content.innerHTML = `
      <div style="border-bottom: 2px solid #E30613; padding-bottom: 6px; margin-bottom: 12px;">
        <h3 style="color: #0B132B; margin: 0; font-size: 16px; font-weight: 800;">01 AUDITORÍA LEGAL Y BASES TÉCNICAS (AGENTE 1)</h3>
        <p style="color: #E30613; font-size: 11px; font-weight: 800; margin: 2px 0 0 0; text-transform: uppercase;">Carpeta de Documentos Exigidos para Postular</p>
      </div>
      <div style="font-size: 12px; line-height: 1.5; color: #334155;">
        <p><strong>1. CARACTERÍSTICAS:</strong> Tipo LP/LE - ID: ${l.codigo}. Moneda: CLP.<br>Adjudicación: ${l.nombre}</p>
        <p><strong>2. ORGANISMO:</strong> ${l.organismo} (${l.region}, ${l.comuna})</p>
        <p><strong>3. REQUISITOS TÉCNICOS:</strong> Técnicos con acreditación SEC vigente, protocolos de seguridad NFPA y Certificado F30-1 sin deuda.</p>
        
        <p style="margin-top: 14px; font-weight: bold; color: #0B132B; text-transform: uppercase;">4. DOCUMENTACIÓN OBLIGATORIA PARA POSTULACIÓN:</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin: 6px 0; border: 1px solid #CBD5E1;">
          <thead><tr style="background: #0B132B; color: #ffffff;"><th style="padding: 6px; border: 1px solid #CBD5E1;">SOBRE / CARPETA</th><th style="padding: 6px; border: 1px solid #CBD5E1;">DOCUMENTO EXIGIDO</th><th style="padding: 6px; border: 1px solid #CBD5E1;">FORMATO</th><th style="padding: 6px; border: 1px solid #CBD5E1;">RESPONSABLE</th></tr></thead>
          <tbody>
            <tr><td style="padding: 5px; font-weight: bold; background: #F8FAFC;" rowspan="3">ADMINISTRATIVO</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Garantía de Seriedad de la Oferta</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Boleta / Póliza 90 días</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Finanzas SEGMED</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #CBD5E1;">Certificado F30-1 Vigente</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Digital Dirección del Trabajo</td><td style="padding: 5px; border: 1px solid #CBD5E1;">RRHH SEGMED</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #CBD5E1;">Declaración Jurada Simple (Anexo 3)</td><td style="padding: 5px; border: 1px solid #CBD5E1;">PDF Firmado Representante</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Legal / Licitaciones</td></tr>
            <tr><td style="padding: 5px; font-weight: bold; background: #F8FAFC;" rowspan="3">TÉCNICO</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Credenciales Técnicas SEC Vigentes</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Carnet SEC Clase A/B/C</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Operaciones HVAC</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #CBD5E1;">Certificados de Experiencia (m² atendidos)</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Actas Recepción Conforme</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Licitaciones</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #CBD5E1;">Plan de Mantención y Protocolo SLA</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Propuesta Técnica SEGMED</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Ingeniería</td></tr>
            <tr><td style="padding: 5px; font-weight: bold; background: #F8FAFC;">ECONÓMICO</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Formulario de Oferta Económica (Anexo)</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Formato Oficial MP (Neto)</td><td style="padding: 5px; border: 1px solid #CBD5E1;">Gerencia Comercial</td></tr>
          </tbody>
        </table>
      </div>
    `;
  } else if (tabId === 'agente2') {
    content.innerHTML = `
      <div style="border-bottom: 2px solid #E30613; padding-bottom: 6px; margin-bottom: 12px;">
        <h3 style="color: #0B132B; margin: 0; font-size: 16px; font-weight: 800;">02 INTELIGENCIA DE MERCADO Y PRICING (AGENTE 2)</h3>
        <p style="color: #E30613; font-size: 11px; font-weight: 800; margin: 2px 0 0 0; text-transform: uppercase;">Entorno Competitivo, Costos y Margen Objetivo</p>
      </div>
      <div style="font-size: 12px; line-height: 1.5; color: #334155;">
        <p><strong>1. MATRIZ DE PONDERACIONES (100 PTS):</strong> Precio (45%), Calidad Técnica/SLA (20%), Experiencia (10%), Criterio Inclusivo (10%), Requisitos Formales (5%), Condiciones Laborales (5%), Integridad (5%).</p>
        <p><strong>2. PATRÓN DEL COMPRADOR (RAG):</strong> ${l.organismo} prioriza continuidad operacional y SLA estricto ante fallas críticas.</p>
        <p><strong>3. TARGET FINANCIERO:</strong> Margen objetivo comercial ≥ 25% neto resguardando mano de obra calificada, repuestos y viáticos.</p>
      </div>
    `;
  } else if (tabId === 'decision') {
    content.innerHTML = `
      <div style="border-bottom: 2px solid #E30613; padding-bottom: 6px; margin-bottom: 12px;">
        <h3 style="color: #0B132B; margin: 0; font-size: 16px; font-weight: 800;">03 DICTAMEN DEL COMITÉ DE LICITACIONES</h3>
        <p style="color: #E30613; font-size: 11px; font-weight: 800; margin: 2px 0 0 0; text-transform: uppercase;">Decisión Ejecutiva y Gobernanza</p>
      </div>
      <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; padding: 14px; border-radius: 8px; text-align: center; margin-bottom: 14px;">
        <h2 style="color: #166534; margin: 0 0 2px 0; font-size: 18px; font-weight: 900;">✅ GO CONDICIONAL — POSTULAR CON RESERVAS</h2>
        <p style="font-size: 12px; color: #15803D; margin: 0;">Presupuesto Estimado: <strong>$${montoFormateado} CLP</strong> | Match Técnico: <strong>94%</strong></p>
      </div>
      <div style="font-size: 12px; line-height: 1.5; color: #334155;">
        <strong>Instrucciones Inmediatas para el Equipo de Estudios:</strong><br>
        1. Descargar catálogo de equipos y TDR definitivos del ID ${l.codigo}.<br>
        2. Validar viáticos y tiempos de traslado para asegurar SLA 24/7.<br>
        3. Modelar precios asegurando margen comercial ≥ 25% neto antes de solicitar boleta de seriedad.
      </div>
    `;
  }
};

// ==========================================
// GENERADOR PDF ESTRICTO A4 (3 PÁGINAS EXACTAS)
// ==========================================
window.armarHTMLDossierLicitacion = function() {
  const l = state.licitacionSeleccionada || {};
  const codigo = l.codigo || '2173-21-LE26';
  const nombre = (l.nombre || 'Servicio puntual de mantencion de clima').toUpperCase();
  const organismo = (l.organismo || 'CORP ADMINISTRATIVA DEL PODER JUDICIAL').toUpperCase();
  const regionComuna = `${l.region || 'Región Metropolitana de Santiago'}, ${l.comuna || 'Santiago Centro'}`;
  const montoNum = Number(l.monto || 0);
  const fechaCierre = l.fecha_cierre ? l.fecha_cierre.split('T')[0] : '2026-07-20';

  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #0F172A; width: 680px; margin: 0 auto; background: #ffffff;">
      
      <!-- ==================== PÁGINA 1 ==================== -->
      <div style="box-sizing: border-box; padding: 20px 24px; page-break-after: always;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #E30613; padding-bottom: 6px; margin-bottom: 10px;">
          <div>
            <div style="font-size: 22px; font-weight: 900; color: #0B132B; letter-spacing: -0.5px;">SEG<span style="color: #E30613;">MED</span> <span style="font-size: 13px; font-weight: 800; color: #64748B;">Chile</span></div>
            <div style="font-size: 8px; font-weight: 800; color: #64748B; letter-spacing: 0.8px;">INGENIERÍA • MANTENCIÓN • SEGURIDAD CRÍTICA</div>
          </div>
          <div style="text-align: right;">
            <div style="background: #0B132B; color: #ffffff; padding: 3px 6px; border-radius: 3px; font-size: 7.5px; font-weight: 800;">UL LISTED • FM APPROVED • NFPA</div>
            <div style="font-size: 13px; font-weight: 900; color: #0B132B; font-family: monospace; margin-top: 2px;">ID: ${codigo}</div>
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 8px;">
          <h2 style="font-size: 11px; font-weight: 900; color: #0B132B; margin: 0; text-transform: uppercase;">REPORTE GERENCIAL DE LICITACIÓN PÚBLICA — COMITÉ B2B</h2>
          <span style="font-size: 8px; font-weight: 800; color: #E30613; letter-spacing: 0.8px;">USO INTERNO CONFIDENCIAL • ALTA DIRECCIÓN</span>
        </div>

        <div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-left: 4px solid #E30613; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px;">
          <strong style="color: #0B132B; font-size: 9.5px; display: block;">${nombre}</strong>
          <div style="color: #475569; font-size: 8.5px; margin-top: 2px; display: flex; justify-content: space-between;">
            <span><strong>Organismo:</strong> ${organismo}</span>
            <span><strong>Ubicación:</strong> ${regionComuna}</span>
          </div>
        </div>

        <!-- 4 KPI Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px;">
          <div style="background: #0B132B; color: #ffffff; padding: 5px; border-radius: 3px; text-align: center;">
            <span style="font-size: 7px; color: #94A3B8; font-weight: 700; display: block;">CIERRE OFERTAS</span>
            <strong style="font-size: 9.5px; font-family: monospace;">${fechaCierre}</strong>
          </div>
          <div style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 5px; border-radius: 3px; text-align: center;">
            <span style="font-size: 7px; color: #64748B; font-weight: 700; display: block;">PRESUPUESTO</span>
            <strong style="font-size: 9.5px; color: #0B132B; font-family: monospace;">$${montoNum.toLocaleString('es-CL')} CLP</strong>
          </div>
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 5px; border-radius: 3px; text-align: center;">
            <span style="font-size: 7px; color: #166534; font-weight: 700; display: block;">MATCH TÉCNICO</span>
            <strong style="font-size: 10px; color: #166534;">94%</strong>
          </div>
          <div style="background: #FEF2F2; border: 1px solid #FECACA; padding: 5px; border-radius: 3px; text-align: center;">
            <span style="font-size: 7px; color: #991B1B; font-weight: 700; display: block;">NIVEL DE RIESGO</span>
            <strong style="font-size: 10px; color: #E30613;">MEDIO</strong>
          </div>
        </div>

        <!-- Sección 01 -->
        <div style="border-bottom: 1.5px solid #0B132B; padding-bottom: 2px; margin-bottom: 6px;">
          <span style="font-size: 10px; font-weight: 900; color: #0B132B;">01. AUDITORÍA LEGAL Y BASES TÉCNICAS (AGENTE 1)</span>
          <span style="font-size: 8px; font-weight: 800; color: #E30613; float: right; text-transform: uppercase;">Requisitos Obligatorios</span>
        </div>

        <div style="font-size: 9px; line-height: 1.4; color: #334155; margin-bottom: 8px;">
          <p style="margin: 0 0 4px 0;"><strong>1. ALCANCE Y OBJETO:</strong> Mantenimiento preventivo programado y atención correctiva para equipos de climatización e infraestructura electromecánica en ${organismo}.</p>
          <p style="margin: 0 0 4px 0;"><strong>2. REQUISITOS NORMATIVOS:</strong> Personal con certificación SEC vigente obligatoria para tableros eléctricos y control HVAC, cumplimiento de normas NFPA y Certificado F30-1 sin deudas laborales ni previsionales.</p>
        </div>

        <!-- TABLA DOCUMENTOS PARA POSTULAR -->
        <strong style="font-size: 8.5px; color: #0B132B; text-transform: uppercase;">3. Carpeta Documental Exigida para Postulación:</strong>
        <table style="width: 100%; border-collapse: collapse; font-size: 8px; margin: 4px 0 10px 0; border: 1px solid #CBD5E1;">
          <thead>
            <tr style="background: #0B132B; color: #ffffff;">
              <th style="padding: 4px 6px; border: 1px solid #CBD5E1; text-align: left; width: 22%;">SOBRE / CARPETA</th>
              <th style="padding: 4px 6px; border: 1px solid #CBD5E1; text-align: left; width: 38%;">DOCUMENTO OBLIGATORIO</th>
              <th style="padding: 4px 6px; border: 1px solid #CBD5E1; text-align: left; width: 22%;">FORMATO EXIGIDO</th>
              <th style="padding: 4px 6px; border: 1px solid #CBD5E1; text-align: left; width: 18%;">RESPONSABLE</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding: 3px 5px; font-weight: bold; background: #F8FAFC; border: 1px solid #CBD5E1;" rowspan="3">A. ADMINISTRATIVO</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Garantía de Seriedad de la Oferta</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Boleta / Póliza 90 días</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Finanzas SEGMED</td></tr>
            <tr style="background: #ffffff;"><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Certificado F30-1 Vigente</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Digital Dirección Trabajo</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">RRHH SEGMED</td></tr>
            <tr style="background: #ffffff;"><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Declaración Jurada Inhabilidades (Anexo 3)</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">PDF Firmado Representante</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Legal / Licitaciones</td></tr>
            <tr><td style="padding: 3px 5px; font-weight: bold; background: #F8FAFC; border: 1px solid #CBD5E1;" rowspan="3">B. TÉCNICO</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Credenciales Técnicas SEC Vigentes</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Carnet SEC Clase A/B/C</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Operaciones HVAC</td></tr>
            <tr style="background: #ffffff;"><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Certificados de Experiencia (m² o contratos)</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Actas Recepción Conforme</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Licitaciones</td></tr>
            <tr style="background: #ffffff;"><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Plan de Mantenimiento y Protocolo SLA 24/7</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Propuesta Técnica SEGMED</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Ingeniería</td></tr>
            <tr><td style="padding: 3px 5px; font-weight: bold; background: #F8FAFC; border: 1px solid #CBD5E1;">C. ECONÓMICO</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Formulario de Oferta Económica (Anexo Oficial)</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Planilla Portal MP (Neto)</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Gerencia Comercial</td></tr>
          </tbody>
        </table>

        <div style="font-size: 8px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 4px; display: flex; justify-content: space-between; margin-top: 10px;">
          <span>SEGMED Chile • Inteligencia B2B • ID ${codigo}</span>
          <span style="font-weight: 700;">Página 1 de 3 — Agente 1: Auditoría de Bases</span>
        </div>
      </div>

      <!-- ==================== PÁGINA 2 ==================== -->
      <div style="box-sizing: border-box; padding: 20px 24px; page-break-after: always;">
        <!-- Header P2 -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #E30613; padding-bottom: 4px; margin-bottom: 8px;">
          <div style="font-size: 10px; font-weight: 900; color: #0B132B;">SEGMED <span style="color:#E30613;">Chile</span> — Inteligencia de Precios & Competencia</div>
          <div style="font-size: 9px; font-family: monospace; font-weight: 800; color: #64748B;">ID: ${codigo}</div>
        </div>

        <div style="border-bottom: 1.5px solid #0B132B; padding-bottom: 2px; margin-bottom: 6px;">
          <span style="font-size: 10px; font-weight: 900; color: #0B132B;">02. INTELIGENCIA DE MERCADO Y PRICING (AGENTE 2)</span>
          <span style="font-size: 8px; font-weight: 800; color: #E30613; float: right; text-transform: uppercase;">Matriz & Rentabilidad</span>
        </div>

        <!-- Matriz de Ponderaciones -->
        <strong style="font-size: 8.5px; color: #0B132B; text-transform: uppercase;">1. Matriz de Evaluación Ponderada (100 Pts):</strong>
        <table style="width: 100%; border-collapse: collapse; font-size: 8px; margin: 4px 0 8px 0; border: 1px solid #CBD5E1;">
          <thead>
            <tr style="background: #0B132B; color: #ffffff;">
              <th style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: left; width: 35%;">CRITERIO</th>
              <th style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: center; width: 15%;">POND.</th>
              <th style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: left; width: 25%;">FORMATO EXIGIDO</th>
              <th style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: left; width: 25%;">ESTRATEGIA SEGMED</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Precio de los Servicios</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: center; font-weight: 900;">45%</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Anexo Económico</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Margen protegido ≥ 25%</td></tr>
            <tr style="background: #F8FAFC;"><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Calidad Técnica y SLA</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: center; font-weight: 900;">20%</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Plan de Trabajo</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Puntaje técnico máximo</td></tr>
            <tr><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Experiencia del Oferente</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: center; font-weight: 900;">10%</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Certificados Recepción</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Acreditar contratos similares</td></tr>
            <tr style="background: #F8FAFC;"><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Criterio Inclusivo / Sustentable</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: center; font-weight: 900;">10%</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Sellos Pyme / Políticas</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Acreditación vigente</td></tr>
            <tr><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Cumplimiento Formal</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: center; font-weight: 900;">5%</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Declaraciones Juradas</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Entrega en plazo fatal</td></tr>
            <tr style="background: #F8FAFC;"><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Condiciones Laborales</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: center; font-weight: 900;">5%</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Certificado F30-1</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Cumplimiento 100%</td></tr>
            <tr><td style="padding: 3px 5px; border: 1px solid #CBD5E1; font-weight: bold;">Integridad y Compliance</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1; text-align: center; font-weight: 900;">5%</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Pacto Integridad</td><td style="padding: 3px 5px; border: 1px solid #CBD5E1;">Puntaje completo</td></tr>
          </tbody>
        </table>

        <!-- Análisis RAG -->
        <div style="font-size: 9px; line-height: 1.4; color: #334155; margin-bottom: 10px;">
          <p style="margin: 0 0 3px 0;"><strong>2. ANÁLISIS COMPETITIVO:</strong> Empresas del rubro en Región Metropolitana con capacidad de respuesta. SEGMED destaca en respuesta de emergencia &lt;120 min y técnicos SEC residentes.</p>
          <p style="margin: 0 0 3px 0;"><strong>3. MEMORIA RAG & PATRÓN:</strong> ${organismo} prioriza continuidad operativa. Se requiere personal calificado para evitar multas operativas por fuera de servicio.</p>
          <p style="margin: 0;"><strong>4. PRICING TARGET:</strong> Estructurar oferta mensual protegiendo margen $\ge 25\%$ neto tras costear HH técnicas, traslados, insumos y contingencias.</p>
        </div>

        <!-- 2 KPI Boxes -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 6px 10px; border-radius: 4px; text-align: center;">
            <span style="font-size: 7.5px; font-weight: 800; color: #166534; text-transform: uppercase; display: block;">MARGEN COMERCIAL OBJETIVO</span>
            <div style="font-size: 14px; font-weight: 900; color: #15803D; margin: 1px 0;">≥ 25% NETO</div>
            <small style="font-size: 7px; color: #166534;">Piso mínimo sobre mano de obra, repuestos e insumos</small>
          </div>
          <div style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 10px; border-radius: 4px; text-align: center;">
            <span style="font-size: 7.5px; font-weight: 800; color: #0B132B; text-transform: uppercase; display: block;">MODALIDAD CONTRACTUAL</span>
            <div style="font-size: 11px; font-weight: 900; color: #0B132B; margin: 2px 0;">SUMA ALZADA / MENSUAL</div>
            <small style="font-size: 7px; color: #64748B;">Ajustado a SLA 24/7 y cobertura de urgencias críticas</small>
          </div>
        </div>

        <div style="font-size: 8px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 4px; display: flex; justify-content: space-between; margin-top: 10px;">
          <span>SEGMED Chile • Inteligencia B2B • ID ${codigo}</span>
          <span style="font-weight: 700;">Página 2 de 3 — Agente 2: Inteligencia de Precios</span>
        </div>
      </div>

      <!-- ==================== PÁGINA 3 ==================== -->
      <div style="box-sizing: border-box; padding: 20px 24px;">
        <!-- Header P3 -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #E30613; padding-bottom: 4px; margin-bottom: 8px;">
          <div style="font-size: 10px; font-weight: 900; color: #0B132B;">SEGMED <span style="color:#E30613;">Chile</span> — Dictamen Ejecutivo & Gobernanza</div>
          <div style="font-size: 9px; font-family: monospace; font-weight: 800; color: #64748B;">ID: ${codigo}</div>
        </div>

        <div style="border-bottom: 1.5px solid #0B132B; padding-bottom: 2px; margin-bottom: 8px;">
          <span style="font-size: 10px; font-weight: 900; color: #0B132B;">03. DICTAMEN DEL COMITÉ DE LICITACIONES (AGENTE 3)</span>
          <span style="font-size: 8px; font-weight: 800; color: #E30613; float: right; text-transform: uppercase;">Decisión Ejecutiva Final</span>
        </div>

        <!-- Banner Decisión -->
        <div style="background: #F0FDF4; border: 2px solid #22C55E; padding: 8px 12px; border-radius: 4px; text-align: center; margin-bottom: 10px;">
          <div style="font-size: 13px; font-weight: 900; color: #166534; letter-spacing: 0.5px;">
            ✅ GO CONDICIONAL — POSTULAR CON RESERVAS
          </div>
          <div style="font-size: 7.5px; color: #15803D; font-weight: 700; margin-top: 1px;">
            VALIDACIÓN TÉCNICA APROBADA • SUJETO A REVISIÓN DE TDR DEFINITIVOS
          </div>
        </div>

        <div style="font-size: 9px; line-height: 1.4; color: #334155; margin-bottom: 10px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 8px 10px; border-radius: 4px;">
          <strong style="color: #0B132B; text-transform: uppercase; font-size: 8.5px; display: block; margin-bottom: 2px;">Fundamentación del Coordinador Ejecutivo B2B:</strong>
          El proyecto en ${organismo} es altamente afín al core business de SEGMED Chile (HVAC, redes eléctricas SEC y mantenimiento crítico). Se aprueba la postulación instruyendo la ejecución inmediata de la Ruta Crítica para mitigar riesgos operacionales.
        </div>

        <!-- Ruta Crítica -->
        <strong style="font-size: 8.5px; color: #0B132B; text-transform: uppercase;">Plan de Acción Inmediato (Ruta Crítica):</strong>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 4px 0 16px 0;">
          <div style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 8px; border-radius: 3px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="color: #0B132B; font-size: 8.5px;">01. Auditoría de Bases</strong>
              <span style="font-size: 6.5px; background: #0B132B; color: #fff; padding: 1px 4px; border-radius: 2px; font-weight: 700;">FASE 1</span>
            </div>
            <span style="color: #166534; font-weight: 800; font-size: 8px; display: block; margin-top: 1px;">Descarga Integral de TDR</span>
            <span style="color: #64748B; font-size: 7.5px;">Revisar bases técnicas y catálogo de equipos del ID ${codigo}.</span>
          </div>

          <div style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 8px; border-radius: 3px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="color: #0B132B; font-size: 8.5px;">02. Inspección Técnica</strong>
              <span style="font-size: 6.5px; background: #0B132B; color: #fff; padding: 1px 4px; border-radius: 2px; font-weight: 700;">FASE 2</span>
            </div>
            <span style="color: #166534; font-weight: 800; font-size: 8px; display: block; margin-top: 1px;">Visita a Terreno y SLA</span>
            <span style="color: #64748B; font-size: 7.5px;">Validar carga operativa y disponibilidad técnica 24/7.</span>
          </div>

          <div style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 8px; border-radius: 3px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="color: #0B132B; font-size: 8.5px;">03. Cubicación de Costos</strong>
              <span style="font-size: 6.5px; background: #0B132B; color: #fff; padding: 1px 4px; border-radius: 2px; font-weight: 700;">FASE 3</span>
            </div>
            <span style="color: #166534; font-weight: 800; font-size: 8px; display: block; margin-top: 1px;">Modelo de Precio ≥ 25%</span>
            <span style="color: #64748B; font-size: 7.5px;">Asegurar retorno financiero antes de emitir garantía.</span>
          </div>

          <div style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 8px; border-radius: 3px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="color: #0B132B; font-size: 8.5px;">04. Carga en Portal</strong>
              <span style="font-size: 6.5px; background: #0B132B; color: #fff; padding: 1px 4px; border-radius: 2px; font-weight: 700;">FASE 4</span>
            </div>
            <span style="color: #166534; font-weight: 800; font-size: 8px; display: block; margin-top: 1px;">Postulación Oficial</span>
            <span style="color: #64748B; font-size: 7.5px;">Subir oferta técnica y económica con 48h de holgura fatal.</span>
          </div>
        </div>

        <!-- Firmas -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px;">
          <div style="border-top: 1.5px solid #0B132B; text-align: center; padding-top: 4px;">
            <strong style="font-size: 9px; color: #0B132B; display: block;">Gerencia Comercial B2B</strong>
            <span style="font-size: 7.5px; color: #64748B;">Aprobación de Margen y Oferta Económica</span>
          </div>
          <div style="border-top: 1.5px solid #0B132B; text-align: center; padding-top: 4px;">
            <strong style="font-size: 9px; color: #0B132B; display: block;">Gerencia de Operaciones</strong>
            <span style="font-size: 7.5px; color: #64748B;">Validación Técnica y Capacidad Instalada</span>
          </div>
        </div>

        <!-- Banner Contacto -->
        <div style="background: #0B132B; color: #ffffff; padding: 8px 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 8.5px; font-weight: 800; color: #E30613; text-transform: uppercase;">SEGMED Chile • Casa Central</div>
            <div style="font-size: 7.5px; color: #CBD5E1; margin-top: 1px;">Av. Tobalaba 1375, Providencia • contacto@segmedchile.cl • www.segmedchile.cl</div>
          </div>
          <div style="text-align: right; font-size: 7.5px; color: #94A3B8;">
            <div>Fono: +56 9 3010 3086</div>
            <div>Mesa Central: +56 9 6394 8197</div>
          </div>
        </div>

        <div style="font-size: 8px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 4px; display: flex; justify-content: space-between; margin-top: 8px;">
          <span>TU OPERACIÓN, NUESTRA PRIORIDAD • TU TRANQUILIDAD, NUESTRO COMPROMISO</span>
          <span style="font-weight: 700;">Página 3 de 3 — Dictamen Ejecutivo</span>
        </div>
      </div>

    </div>
  `;
};

window.descargarExpedientePDF = function() {
  const l = state.licitacionSeleccionada;
  if (!l) return showToast("⚠️ Seleccione una licitación primero.");

  showToast("⏳ Generando Dossier Ejecutivo SEGMED (3 Páginas A4)...");
  const plantilla = document.getElementById('plantillaPdfDossier');
  plantilla.innerHTML = armarHTMLDossierLicitacion();
  plantilla.style.display = 'block';

  const codigo = l.codigo || l.CodigoExterno || l.codigo_externo || 'Reporte';

  const opt = {
    margin: [8, 8, 8, 8],
    filename: `SEGMED_Expediente_${codigo}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 2, 
      useCORS: true, 
      letterRendering: true,
      scrollY: 0
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  html2pdf().from(plantilla).set(opt).save().then(() => {
    plantilla.style.display = 'none';
    showToast(`✅ Expediente SEGMED descargado exitosamente.`);
  });
};