const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURACIÓN OFICIAL TELEGRAM SEGMED
// ==========================================
const TELEGRAM_TOKEN = '8726833039:AAG0KiM86dRb_-P2OmQ0Zzs36FPfug6ycBY';
const TELEGRAM_CHAT_ID = '-5386830569';

// Función para enviar alertas a Telegram
function enviarAlertaTelegram(mensaje, inlineKeyboard = null) {
  const payloadObj = {
    chat_id: TELEGRAM_CHAT_ID,
    text: mensaje,
    parse_mode: 'HTML'
  };

  if (inlineKeyboard && inlineKeyboard.length > 0) {
    payloadObj.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  const payload = JSON.stringify(payloadObj);

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let responseBody = '';
    res.on('data', (chunk) => { responseBody += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('🤖 Alerta Telegram enviada con éxito (Status 200)');
      }
    });
  });

  req.on('error', (e) => console.error("❌ Error de red Telegram:", e.message));
  req.write(payload);
  req.end();
}

// Disparador genérico a n8n
function dispararWebhookN8N(ruta, datos) {
  const data = JSON.stringify(datos);
  const options = {
    hostname: 'localhost',
    port: 5678,
    path: ruta,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`📡 Disparo a n8n (${ruta}) -> Status:`, res.statusCode);
  });
  req.on('error', (e) => {
    console.log(`ℹ️ n8n webhook (${ruta}) en espera:`, e.message);
  });
  req.write(data);
  req.end();
}

module.exports = function(app, pool) {

  // Auto-crear tabla de Memoria Episódica IA al inicializar
  pool.query(`
    CREATE TABLE IF NOT EXISTS ia_decisiones_comerciales (
      id SERIAL PRIMARY KEY,
      negocio_id INTEGER,
      empresa VARCHAR(255),
      servicio VARCHAR(255),
      diagnostico TEXT,
      partidas JSONB,
      monto_neto NUMERIC,
      total_iva NUMERIC,
      numero_cotizacion VARCHAR(50),
      estado_resultado VARCHAR(50) DEFAULT 'EMITIDA',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(err => console.error("Error inicializando tabla IA:", err.message));

  // 1. Inbound de Correos (Clara IA)
  app.post('/api/inbound/procesar-correo', async (req, res) => {
    try {
      const { remitente, asunto, cuerpo } = req.body;
      if (!remitente || !cuerpo) {
        return res.status(400).json({ error: "Datos de correo incompletos." });
      }

      let intencion = 'CONSULTA_GENERAL';
      const textoAnalisis = (asunto + " " + cuerpo).toLowerCase();

      if (textoAnalisis.match(/cotiz|presupuesto|precio|valor|propuesta/)) {
        intencion = 'SOLICITUD_COTIZACION';
      } else if (textoAnalisis.match(/reunión|visita|agendar|terreno|inspecci/)) {
        intencion = 'SOLICITUD_REUNION';
      }

      const contactoRes = await pool.query('SELECT * FROM contactos WHERE email = $1 LIMIT 1', [remitente]);
      let empresa = contactoRes.rows.length > 0 ? (contactoRes.rows[0].empresa || 'Empresa Desconocida (Inbound)') : 'Empresa Desconocida (Inbound)';
      let nombre = contactoRes.rows.length > 0 ? (contactoRes.rows[0].nombre || remitente) : remitente;
      let telefono = contactoRes.rows.length > 0 ? (contactoRes.rows[0].telefono || '—') : '—';

      await pool.query(`
        INSERT INTO negocios_b2b (empresa, contacto_nombre, email, telefono, etapa)
        VALUES ($1, $2, $3, $4, 'NUEVO_LEAD')
      `, [empresa, nombre, remitente, telefono]);

      res.json({
        success: true,
        agente: 'Clara IA',
        clasificacion: intencion,
        datos_cliente: { empresa, nombre, telefono, email: remitente },
        accion_tomada: 'PIPELINE_ACTUALIZADO'
      });

    } catch (error) {
      console.error("❌ Error en Clara Inbound:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Recepción de Visitas Agendadas
  app.post('/api/inbound/agendar-visita', async (req, res) => {
    try {
      const { nombre, telefono, email, empresa, direccion, fecha, hora, detalles } = req.body;

      if (!nombre || !telefono || !empresa || !direccion || !fecha || !email) {
        return res.status(400).json({ error: "Faltan campos obligatorios para agendar." });
      }

      await pool.query(`
        INSERT INTO negocios_b2b (empresa, contacto_nombre, email, telefono, etapa)
        VALUES ($1, $2, $3, $4, 'VISITA_AGENDADA')
      `, [empresa, nombre, email, `${telefono} | ${direccion}`]);

      const telLimpio = telefono.replace(/[^0-9]/g, '');

      const msjTelegram = 
        `📅 <b>¡NUEVA VISITA TÉCNICA AGENDADA!</b> 🚨\n\n` +
        `🏢 <b>Empresa:</b> ${empresa}\n` +
        `👤 <b>Contacto:</b> ${nombre}\n` +
        `✉️ <b>Correo:</b> ${email}\n` +
        `📱 <b>Teléfono:</b> ${telefono}\n` +
        `📍 <b>Dirección:</b> ${direccion}\n` +
        `🗓️ <b>Fecha:</b> ${fecha}\n` +
        `⏰ <b>Horario:</b> ${hora}\n` +
        `🛠️ <b>Requerimiento:</b> ${detalles || 'No especificado'}\n\n` +
        `<i>Coordinar inspección técnica en terreno.</i>`;

      const botonesTelegram = [
        [
          { text: "📍 Abrir en Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}` },
          { text: "💬 Chat WhatsApp", url: `https://wa.me/${telLimpio}` }
        ]
      ];

      enviarAlertaTelegram(msjTelegram, botonesTelegram);
      dispararWebhookN8N('/webhook/agendar-google-calendar', req.body);

      res.json({ success: true, message: "Visita registrada correctamente." });
    } catch (error) {
      console.error("❌ Error en agendamiento:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 3. MOTOR DE APRENDIZAJE: Sugerencia Inteligente RAG basada en experiencia previa
  app.get('/api/b2b/ia/sugerir-cotizacion', async (req, res) => {
    try {
      const { servicio } = req.query;

      // Buscar si Víctor ya aprendió de cotizaciones pasadas con este servicio
      const query = `
        SELECT diagnostico, partidas, monto_neto, estado_resultado 
        FROM ia_decisiones_comerciales 
        WHERE servicio ILIKE $1 
        ORDER BY (estado_resultado = 'GANADO') DESC, id DESC 
        LIMIT 1
      `;
      const result = await pool.query(query, [`%${servicio || ''}%`]);

      if (result.rows.length > 0) {
        const memoria = result.rows[0];
        return res.json({
          origen: 'MEMORIA_HISTORICA_IA',
          reforzadoPor: memoria.estado_resultado,
          diagnostico: memoria.diagnostico,
          partidas: memoria.partidas
        });
      }

      // Plantillas base de ingeniería en frío (Cold-Start)
      const plantillasBase = {
        'Climatización & HVAC Industrial': {
          diagnostico: 'Inspección técnica de unidades de tratamiento de aire y balanceo térmico. Se detecta descalibración de presiones y requerimiento de reemplazo de filtros de alta eficiencia.',
          partidas: [
            { desc: 'Mantenimiento Preventivo Chiller 120 TR y Balanceo de Presiones', cant: 1, pu: 1850000 },
            { desc: 'Suministro de Filtros HEPA de Alta Eficiencia y Válvulas Ranuradas', cant: 2, pu: 280000 },
            { desc: 'Informe Técnico de Operatividad y Certificación de Ingeniería SEGMED', cant: 1, pu: 380000 }
          ]
        },
        'Red Contra Incendio & Extinción NFPA 25': {
          diagnostico: 'Auditoría a red húmeda y seca bajo estándar NFPA 25. Sala de bombas requiere prueba de caudal, recambio de manómetros certificados y calibración de válvula de alivio.',
          partidas: [
            { desc: 'Normalización Red Húmeda y Prueba de Caudal Bomba Principal (NFPA 25)', cant: 1, pu: 1250000 },
            { desc: 'Mantención y Calibración Bomba Jockey con Tablero de Control', cant: 1, pu: 680000 },
            { desc: 'Suministro de Manómetros Certificados UL/FM y Sellos Ranurados', cant: 4, pu: 95000 },
            { desc: 'Certificado de Operatividad Contra Incendio con Timbre SEC', cant: 1, pu: 450000 }
          ]
        },
        'Normalización Eléctrica SEC Tableros': {
          diagnostico: 'Levantamiento termográfico y balanceo de cargas en tablero general de distribución. Requiere rotulado normativo, recambio de automáticos y presentación TE1.',
          partidas: [
            { desc: 'Inspección Termográfica y Reapriete de Conexiones en TGD', cant: 1, pu: 650000 },
            { desc: 'Reemplazo de Disyuntores Termomagnéticos Curva C Homologados', cant: 6, pu: 65000 },
            { desc: 'Confección de Planos As-Built y Trámite de Certificación TE1 SEC', cant: 1, pu: 850000 }
          ]
        }
      };

      const fallback = plantillasBase[servicio] || plantillasBase['Climatización & HVAC Industrial'];
      return res.json({
        origen: 'INGENIERIA_BASE',
        diagnostico: fallback.diagnostico,
        partidas: fallback.partidas
      });

    } catch (err) {
      console.error("Error en sugerencia IA:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. AGENTE VÍCTOR IA: Guardar Cotización, Registrar en Memoria y Despachar a n8n
  app.post('/api/b2b/negocios/:id/cotizar', async (req, res) => {
    try {
      const { id } = req.params;
      const { montoNeto, items, servicio, validez, condiciones, numeroCotizacion, diagnostico, email, pdfBase64, enviarEmailDirecto } = req.body;

      const numExpediente = numeroCotizacion || `COT-SEGMED-${Math.floor(1000 + Math.random() * 9000)}`;
      const fileName = `Dossier_${numExpediente}_SEGMED.pdf`;

      // Guardar PDF en disco
      let pdfUrl = null;
      let rawBase64 = null;
      if (pdfBase64) {
        rawBase64 = pdfBase64.replace(/^data:application\/pdf.*?;base64,/, '');
        const dirCotizaciones = path.join(__dirname, '..', 'public', 'cotizaciones');
        if (!fs.existsSync(dirCotizaciones)) fs.mkdirSync(dirCotizaciones, { recursive: true });
        fs.writeFileSync(path.join(dirCotizaciones, fileName), Buffer.from(rawBase64, 'base64'));
        pdfUrl = `http://localhost:3000/cotizaciones/${fileName}`;
      }

      await pool.query(`
        ALTER TABLE negocios_b2b ADD COLUMN IF NOT EXISTS monto NUMERIC DEFAULT 0;
        ALTER TABLE negocios_b2b ADD COLUMN IF NOT EXISTS detalles_cotizacion TEXT;
        ALTER TABLE negocios_b2b ADD COLUMN IF NOT EXISTS numero_cotizacion VARCHAR(50);
      `).catch(() => {});

      const updateRes = await pool.query(`
        UPDATE negocios_b2b 
        SET monto = $1, 
            etapa = 'NEGOCIACION', 
            numero_cotizacion = $2,
            detalles_cotizacion = $3,
            email = COALESCE($4, email)
        WHERE id = $5
        RETURNING *
      `, [montoNeto, numExpediente, JSON.stringify({ numeroCotizacion: numExpediente, servicio, diagnostico, items, validez, condiciones, pdfUrl }), email || null, id]);

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ error: "Negocio no encontrado." });
      }

      const neg = updateRes.rows[0];
      const correoFinal = email || neg.email;
      const montoFormateado = Number(montoNeto).toLocaleString('es-CL');
      const totalIvaFormateado = (Math.round(montoNeto * 1.19)).toLocaleString('es-CL');
      const telLimpio = (neg.telefono || '').replace(/[^0-9]/g, '');

      // REGISTRAR EN LA MEMORIA EPISÓDICA DE VÍCTOR IA
      await pool.query(`
        INSERT INTO ia_decisiones_comerciales 
        (negocio_id, empresa, servicio, diagnostico, partidas, monto_neto, total_iva, numero_cotizacion, estado_resultado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'EMITIDA')
      `, [id, neg.empresa, servicio, diagnostico, JSON.stringify(items), montoNeto, Math.round(montoNeto * 1.19), numExpediente]);

      console.log(`🧠 Memoria IA actualizada: registrado expediente ${numExpediente} para auto-aprendizaje.`);

      // Texto para WhatsApp
      const textoWhatsApp = encodeURIComponent(
        `Estimado(a) ${neg.contacto_nombre},\n\n` +
        `Junto con saludar de parte de SEGMED Ingeniería SpA, adjuntamos su propuesta técnica formal:\n\n` +
        `🔢 Nº Cotización: ${numExpediente}\n` +
        `🏢 Cliente: ${neg.empresa}\n` +
        `🛠️ Servicio: ${servicio}\n` +
        `💰 Valor Neto: $${montoFormateado} CLP\n` +
        `📊 Total con IVA: $${totalIvaFormateado} CLP\n` +
        `⏱️ Validez: ${validez}\n\n` +
        (pdfUrl ? `📄 Puede ver y descargar el documento oficial aquí:\n${pdfUrl}\n\n` : '') +
        `La propuesta cuenta con respaldo normativo SEC y NFPA 25. Quedamos a su disposición para coordinar el inicio de los trabajos.`
      );

      // Alerta a Telegram
      const msjTelegram = 
        `📑 <b>¡COTIZACIÓN OFICIAL EMITIDA POR VÍCTOR IA!</b> 💼\n\n` +
        `🔢 <b>Nº Cotización:</b> <code>${numExpediente}</code>\n` +
        `🏢 <b>Cliente:</b> ${neg.empresa}\n` +
        `👤 <b>Contacto:</b> ${neg.contacto_nombre}\n` +
        `✉️ <b>Correo:</b> ${correoFinal || 'Sin correo'}\n` +
        `🛠️ <b>Servicio:</b> ${servicio || 'Mantenimiento Técnico'}\n` +
        `💰 <b>Monto Neto:</b> $${montoFormateado} CLP\n` +
        `📊 <b>Total con IVA:</b> $${totalIvaFormateado} CLP\n\n` +
        `🚀 <i>Estado: Movido automáticamente a 'En Negociación'.</i>`;

      const botonesTelegram = [];
      if (telLimpio && telLimpio.length >= 8) {
        botonesTelegram.push([
          { text: "💬 Chat WhatsApp con Cliente", url: `https://wa.me/${telLimpio}?text=${textoWhatsApp}` }
        ]);
      }

      enviarAlertaTelegram(msjTelegram, botonesTelegram);

      // Disparar a n8n con el PDF en Base64
      if (enviarEmailDirecto) {
        console.log(`🚀 Despachando cotización ${numExpediente} a n8n para: ${correoFinal}`);
        dispararWebhookN8N('/webhook/enviar-cotizacion-pdf', {
          numeroCotizacion: numExpediente,
          negocioId: id,
          empresa: neg.empresa,
          contacto: neg.contacto_nombre,
          email: correoFinal,
          telefono: neg.telefono,
          servicio: servicio,
          montoNeto: Number(montoNeto),
          totalIva: Math.round(montoNeto * 1.19),
          validez: validez,
          condiciones: condiciones,
          diagnostico: diagnostico,
          fileName: fileName,
          pdfBase64: rawBase64,
          pdfUrl: pdfUrl,
          items: items
        });
      }

      res.json({
        success: true,
        message: "Cotización procesada exitosamente.",
        numeroCotizacion: numExpediente,
        pdfUrl: pdfUrl,
        emailEnviado: correoFinal,
        negocio: neg,
        whatsappUrl: telLimpio.length >= 8 ? `https://wa.me/${telLimpio}?text=${textoWhatsApp}` : null
      });

    } catch (error) {
      console.error("❌ Error en cotizador:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 5. REFUERZO DE APRENDIZAJE: Marcar negocio como GANADO en la memoria
  app.post('/api/b2b/negocios/:id/reforzar-ganado', async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query(`
        UPDATE ia_decisiones_comerciales 
        SET estado_resultado = 'GANADO' 
        WHERE negocio_id = $1
      `, [id]);
      console.log(`🏆 Negocio #${id} marcado como GANADO. Prioridad aumentada en el motor de decisión.`);
      res.json({ success: true, message: "Aprendizaje reforzado positivamente." });
    } catch(err) {
      res.status(500).json({ error: err.message });
    }
  });

};