const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'segmed_admin',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'segmed_crm',
  password: process.env.DB_PASSWORD || 'segmed_pass_2026',
  port: process.env.DB_PORT || 5432,
});

async function diagnosticar() {
  console.log("==================================================");
  console.log("🔍 ESCÁNER DE SALUD Y PERSISTENCIA — POSTGRESQL");
  console.log("==================================================");
  
  try {
    const client = await pool.connect();
    console.log("✅ Conexión establecida con éxito a la instancia PostgreSQL.");
    
    // 1. Listar Tablas
    const tablasRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tablas = tablasRes.rows.map(r => r.table_name);
    console.log(`📋 Tablas detectadas (${tablas.length}):`, tablas.join(', ') || 'Ninguna');

    // 2. Conteo de Registros por Tabla
    for (const t of ['contactos', 'negocios_b2b', 'licitaciones', 'ia_decisiones_comerciales']) {
      if (tablas.includes(t)) {
        const countRes = await client.query(`SELECT COUNT(*) FROM ${t}`);
        console.log(`   📊 Tabla '${t}': ${countRes.rows[0].count} registros.`);
      } else {
        console.log(`   ⚠️ Tabla '${t}': NO EXISTE (Requiere migración).`);
      }
    }

    client.release();
    pool.end();
    console.log("==================================================");
  } catch (err) {
    console.error("❌ FALLO CRÍTICO DE CONEXIÓN A POSTGRESQL:");
    console.error("   Detalle del error:", err.message);
    console.log("\n💡 Solución rápida:");
    console.log("   1. Si Postgres está apagado en Mac, corre: brew services start postgresql");
    console.log("   2. Si usas Docker, corre: docker start segmed-postgres");
    console.log("==================================================");
  }
}

diagnosticar();
