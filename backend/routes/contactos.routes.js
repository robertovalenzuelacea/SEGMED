// Archivo: backend/routes/contactos.routes.js
module.exports = function(app, pool) {

  // Consulta paginada segura para 39.733 registros
  app.get('/api/contactos', async (req, res) => {
    try {
      const pagina = parseInt(req.query.pagina) || 1;
      const limite = parseInt(req.query.limite) || 50;
      const busqueda = (req.query.q || '').trim().toLowerCase();
      const offset = (pagina - 1) * limite;

      let whereClauses = [];
      let params = [];

      if (busqueda) {
        params.push(`%${busqueda}%`);
        whereClauses.push(`(
          LOWER(COALESCE(nombre, '')) LIKE $${params.length} OR 
          LOWER(COALESCE(empresa, '')) LIKE $${params.length} OR 
          LOWER(COALESCE(email, '')) LIKE $${params.length} OR 
          LOWER(COALESCE(cargo, '')) LIKE $${params.length}
        )`);
      }

      const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countQuery = `SELECT COUNT(*) FROM contactos ${whereSQL}`;
      const totalRes = await pool.query(countQuery, params);
      const totalRegistros = parseInt(totalRes.rows[0].count, 10);

      params.push(limite, offset);
      const dataQuery = `
        SELECT id, nombre, empresa, cargo, email, telefono, rubro, score, estado 
        FROM contactos 
        ${whereSQL}
        ORDER BY id ASC 
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;
      const dataRes = await pool.query(dataQuery, params);

      res.json({
        total: totalRegistros,
        pagina,
        limite,
        totalPaginas: Math.ceil(totalRegistros / limite),
        contactos: dataRes.rows
      });
    } catch (error) {
      console.error('Error al consultar contactos:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/contactos/stats', async (req, res) => {
    try {
      const totalRes = await pool.query('SELECT COUNT(*) FROM contactos');
      res.json({ total: parseInt(totalRes.rows[0].count, 10) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};