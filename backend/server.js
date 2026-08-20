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

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../public')));

// Configuración robusta de Pool para Render
const pool = process.env.DATABASE_URL 
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      user: process.env.DB_USER || 'segmed_admin',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'segmed_crm',
      password: process.env.DB_PASSWORD || 'segmed_pass_2026',
      port: process.env.DB_PORT || 5432
    });

// Inicialización de Tablas en PostgreSQL
async function initDatabase() {
  try {
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
    console.log('✅ Base de Datos PostgreSQL inicializada y sincronizada en Render.');
  } catch (err) {
    console.error('❌ Error inicializando tablas PostgreSQL:', err.message);
  }
}
initDatabase();

// Servir carpeta de archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../public')));

// Ruta explícita para agendar (acepta /agendar, /agendar.html, /agenda y /agenda.html)
app.get(['/agendar', '/agendar.html', '/agenda', '/agenda.html'], (req, res) => {
  const filePath = path.join(__dirname, 'public', 'agendar.html');
  res.sendFile(filePath);
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

// 2. Endpoint de Agendamiento de Visitas Técnicas (Móvil / Web)
app.post('/api/agendar-visita', async (req, res) => {
  try {
    const { lead_id, empresa, nombre, telefono, email, direccion, fecha, hora } = req.body;
    const idNum = parseInt(lead_id, 10);

    // 1. Guardar o actualizar en PostgreSQL
    if (idNum && idNum > 0) {
      await pool.query(
        `UPDATE leads 
         SET etapa = 'VISITA_AGENDADA', 
             telefono = COALESCE($1, telefono), 
             direccion = COALESCE($2, direccion), 
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

    console.log(`📅 Visita registrada en BD: ${empresa} (${fecha} ${hora})`);

    // 2. Disparar Alerta a Telegram / n8n Webhook
    const mensajeTelegram = `🚨 *NUEVA VISITA TÉCNICA AGENDADA*\n\n🏢 *Empresa:* ${empresa}\n👤 *Contacto:* ${nombre}\n📞 *Teléfono:* ${telefono}\n📧 *Email:* ${email}\n📍 *Dirección:* ${direccion}\n📅 *Fecha:* ${fecha}\n⏰ *Hora:* ${hora} hrs`;

    // Si usas Webhook de n8n:
    try {
      if (process.env.N8N_AGENDA_WEBHOOK_URL) {
        await fetch(process.env.N8N_AGENDA_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id, empresa, nombre, telefono, email, direccion, fecha, hora, mensaje: mensajeTelegram })
        });
      }
    } catch (e) {
      console.warn('Aviso webhook n8n:', e.message);
    }

    return res.status(200).json({ success: true, message: 'Visita agendada y notificada' });
  } catch (err) {
    console.error('Error al registrar visita:', err);
    return res.status(200).json({ success: true });
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

// Ruta amigable para la agenda
app.get('/agendar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agendar.html'));
});

// Servidor Activo
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor SEGMED CRM Enterprise activo en el puerto ${PORT}`);
});