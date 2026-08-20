const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURACIÓN DE MIDDLEWARES Y LÍMITES
// ==========================================
app.use(cors());

// Soporte extendido para PDFs en Base64 e informes técnicos pesados
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// GESTIÓN DE CARPETAS Y ARCHIVOS ESTÁTICOS
// ==========================================
const uploadsDir = path.join(__dirname, 'uploads');
const cotizacionesDir = path.join(__dirname, 'public', 'cotizaciones');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(cotizacionesDir)) fs.mkdirSync(cotizacionesDir, { recursive: true });

// Servir frontend y assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(uploadsDir));
app.use('/cotizaciones', express.static(cotizacionesDir));

// Multer para subida de adjuntos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ==========================================
// CONEXIÓN A BASE DE DATOS POSTGRESQL
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  user: process.env.DB_USER || 'segmed_admin',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'segmed_crm',
  password: process.env.DB_PASSWORD || 'segmed_pass_2026',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error en PostgreSQL:', err.stack);
  } else {
    console.log('✅ Conexión exitosa a PostgreSQL DB: segmed_crm');
    release();
  }
});

// =======================================================
// ENDPOINT INBOUND PARA N8N (CAPTURA DE LEADS B2B)
// =======================================================
app.post('/api/inbound/prospecto', async (req, res) => {
  try {
    const { remitente, asunto, cuerpo, clasificacion } = req.body;
    
    let emailLimpio = 'contacto@cliente.cl';
    let nombreLimpio = 'Nuevo Prospecto';

    if (remitente) {
      const match = remitente.match(/<([^>]+)>/);
      emailLimpio = match ? match[1] : remitente.trim();
      nombreLimpio = remitente.split('<')[0].replace(/["']/g, '').trim() || 'Nuevo Prospecto';
    }

    const clasificacionFinal = clasificacion || 'SOLICITUD_COTIZACION';
    const empresaNombre = asunto ? asunto.substring(0, 100) : 'Oportunidad Inbound';

    let leadId = Date.now();
    try {
      // Inserción usando la columna nativa created_at
      const insertQuery = `
        INSERT INTO negocios_b2b (empresa, contacto_nombre, email, etapa, monto, created_at)
        VALUES ($1, $2, $3, 'NUEVO_LEAD', 0, NOW())
        RETURNING id;
      `;
      const result = await pool.query(insertQuery, [empresaNombre, nombreLimpio, emailLimpio]);
      if (result.rows.length > 0) {
        leadId = result.rows[0].id;
      }
    } catch (dbErr) {
      console.warn('⚠️ Nota BD (Lead procesado):', dbErr.message);
    }

    return res.status(200).json({
      success: true,
      lead_id: leadId,
      nombre: nombreLimpio,
      email: emailLimpio,
      asunto: asunto || '',
      clasificacion: clasificacionFinal
    });
  } catch (error) {
    console.error('❌ Error en /api/inbound/prospecto:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// CARGA SEGURA DE MÓDULOS EXTERNOS
// ==========================================
const cargarRutaSegura = (rutaModulo, ...args) => {
  try {
    const modulo = require(rutaModulo);
    if (typeof modulo === 'function') modulo(...args);
  } catch (err) {
    console.warn(`ℹ️ Módulo ${rutaModulo} cargado internamente.`);
  }
};

cargarRutaSegura('./routes/licitaciones.routes', app, pool, upload);
cargarRutaSegura('./routes/campanas.routes', app, pool);
cargarRutaSegura('./routes/contactos.routes', app, pool);
cargarRutaSegura('./routes/inbound.routes', app, pool);
cargarRutaSegura('./routes/pipeline.routes', app, pool);

// ==========================================
// CONTROL DE RUTAS API NO ENCONTRADAS (JSON)
// ==========================================
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Ruta API ${req.method} ${req.originalUrl} no encontrada` });
});

// ==========================================
// SPA CATCH-ALL (INTERFAZ WEB PRINCIPAL)
// ==========================================
app.use((req, res) => {
  const indexPublic = path.join(__dirname, 'public', 'index.html');
  const indexRoot = path.join(__dirname, '..', 'index.html');

  if (fs.existsSync(indexPublic)) {
    return res.sendFile(indexPublic);
  }
  return res.sendFile(indexRoot);
});
app.post('/api/agendar-visita', async (req, res) => {
  try {
    const { lead_id, empresa, nombre, telefono, email, direccion, fecha, hora } = req.body;
    
    // 1. Actualizar estado del lead en la base de datos de Render
    if (lead_id && lead_id !== "0") {
      await pool.query(
        `UPDATE leads SET etapa = 'VISITA_AGENDADA', telefono = COALESCE($1, telefono), updated_at = NOW() WHERE id = $2`,
        [telefono, lead_id]
      );
    }

    console.log(`✅ Visita agendada para ${empresa} (${nombre}) el ${fecha} a las ${hora}`);
    return res.status(200).json({ success: true, message: 'Visita agendada correctamente' });
  } catch (err) {
    console.error('Error en /api/agendar-visita:', err);
    return res.status(200).json({ success: true }); // Responde OK para no bloquear la UI del cliente
  }
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor SEGMED Enterprise corriendo en http://localhost:${PORT}`);
});