const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend (CRM y Agenda)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../public')));

// Configuración robusta de Pool para Render o Local
const isProduction = !!process.env.DATABASE_URL;
const pool = new Pool(
  isProduction
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: process.env.DB_USER || 'segmed_admin',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'segmed_crm',
        password: process.env.DB_PASSWORD || 'segmed_pass_2026',
        port: process.env.DB_PORT || 5432
      }
);

// Inicialización y Migración Automática de Tablas en PostgreSQL
async function initDatabase() {
  try {
    // 1. Crear tabla leads si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        empresa VARCHAR(255) DEFAULT 'Sin Empresa',
        contacto VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        telefono VARCHAR(100),
        direccion TEXT,
        asunto TEXT,
        etapa VARCHAR(50) DEFAULT 'NUEVO_LEAD',
        clasificacion VARCHAR(100) DEFAULT 'General',
        fecha_visita VARCHAR(50),
        hora_visita VARCHAR(50),
        monto_neto NUMERIC(12, 2) DEFAULT 0,
        monto_total NUMERIC(12, 2) DEFAULT 0,
        folio_cotizacion VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Asegurar columnas en caso de que la tabla haya existido previamente
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS direccion TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS fecha_visita VARCHAR(50);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS hora_visita VARCHAR(50);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS clasificacion VARCHAR(100) DEFAULT 'General';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS folio_cotizacion VARCHAR(100);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS monto_neto NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS monto_total NUMERIC(12, 2) DEFAULT 0;
    `);

    console.log('✅ Base de Datos PostgreSQL inicializada y sincronizada en Render.');
  } catch (err) {
    console.error('❌ Error inicializando esquema PostgreSQL:', err.message);
  }
}
initDatabase();

// --- RUTAS DE NAVEGACIÓN WEB ---

// Ruta para la Agenda
app.get(['/agendar', '/agendar.html', '/agenda', '/agenda.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agendar.html'));
});

// Ruta principal para el Tablero CRM
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- RUTAS DE API ---

// 1. Obtener todos los Leads para el CRM
app.get('/api/leads', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leads ORDER BY updated_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error en GET /api/leads:', err);
    res.status(500).json({ error: 'Error al obtener leads' });
  }
});

// 2. Endpoint de Agendamiento de Visitas Técnicas (Móvil / Web) + Alertas
app.post('/api/agendar-visita', async (req, res) => {
  try {
    const { lead_id, empresa, nombre, telefono, email, direccion, fecha, hora } = req.body;
    const idNum = parseInt(lead_id, 10);

    // A. Guardar o actualizar en PostgreSQL
    if (idNum && idNum > 0) {
      await pool.query(
        `UPDATE leads 
         SET etapa = 'VISITA_AGENDADA', 
             telefono = COALESCE($1, telefono), 
             direccion = $2, 
             fecha_visita = $3, 
             hora_visita = $4, 
             updated_at = NOW() 
         WHERE id = $5`,
        [telefono, direccion, fecha, hora, idNum]
      );
    } else {
      await pool.query(
        `INSERT INTO leads (empresa, contacto, email, telefono, direccion, etapa, fecha_visita, hora_visita, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'VISITA_AGENDADA', $6, $7, NOW())`,
        [empresa || 'Prospecto Web', nombre || 'Contacto', email || 'contacto@segmedchile.cl', telefono, direccion, fecha, hora]
      );
    }

    console.log(`📅 Visita registrada en BD: ${empresa || nombre} (${fecha} ${hora})`);

    // B. Alerta Directa a Telegram (API Oficial Telegram 24/7)
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (token && chatId) {
      try {
        const mensaje = `🚨 *NUEVA VISITA TÉCNICA AGENDADA*\n\n🏢 *Empresa:* ${empresa}\n👤 *Contacto:* ${nombre}\n📞 *Teléfono:* ${telefono}\n📧 *Email:* ${email}\n📍 *Dirección:* ${direccion}\n📅 *Fecha:* ${fecha}\n⏰ *Hora:* ${hora} hrs\n\n📌 *Estado:* Registrado en CRM SEGMED`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: mensaje,
            parse_mode: 'Markdown'
          })
        });
        console.log('📲 Alerta enviada a Telegram.');
      } catch (tgErr) {
        console.warn('Aviso Telegram Bot:', tgErr.message);
      }
    }

    // C. Notificar a n8n Webhook (si está configurado)
    if (process.env.N8N_AGENDA_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_AGENDA_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id, empresa, nombre, telefono, email, direccion, fecha, hora })
        });
      } catch (n8nErr) {
        console.warn('Aviso Webhook n8n:', n8nErr.message);
      }
    }

    return res.status(200).json({ success: true, message: 'Visita agendada y registrada' });
  } catch (err) {
    console.error('❌ Error al procesar agendamiento:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. Crear Lead desde n8n / Webhooks Inbound
app.post('/api/leads/webhook', async (req, res) => {
  try {
    const { empresa, nombre, email, telefono, asunto, clasificacion } = req.body;
    const result = await pool.query(
      `INSERT INTO leads (empresa, contacto, email, telefono, asunto, clasificacion, etapa, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'NUEVO_LEAD', NOW())
       RETURNING *`,
      [empresa || asunto, nombre, email, telefono, asunto, clasificacion || 'General']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error en webhook de leads:', err);
    res.status(500).json({ error: 'Error al registrar lead' });
  }
});

// 4. Actualizar Etapa de un Lead en el CRM
app.put('/api/leads/:id/etapa', async (req, res) => {
  try {
    const { id } = req.params;
    const { etapa } = req.body;
    const result = await pool.query(
      `UPDATE leads SET etapa = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [etapa, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error actualizando etapa:', err);
    res.status(500).json({ error: 'Error al actualizar etapa' });
  }
});

// Servidor Activo
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor SEGMED CRM Enterprise activo en el puerto ${PORT}`);
});