module.exports = function(app, pool) {
  // Obtener todas las licitaciones
  app.get('/api/licitaciones', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM licitaciones ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (err) {
      console.error("Error al cargar licitaciones:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Cambiar etapa (Drag & Drop)
  app.put('/api/licitaciones/:id/estado', async (req, res) => {
    try {
      const { id } = req.params;
      const { estado } = req.body;
      const result = await pool.query(
        'UPDATE licitaciones SET estado = $1 WHERE id = $2 RETURNING *',
        [estado, id]
      );
      res.json({ success: true, licitacion: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};