module.exports = function(app, pool) {
  
  // 1. Obtener todos los negocios para pintar el tablero
  app.get('/api/pipeline', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM negocios_b2b ORDER BY fecha_creacion DESC');
      res.json(result.rows);
    } catch (error) {
      console.error("Error al obtener pipeline:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Mover una tarjeta de columna (Ej: de NUEVO_LEAD a NEGOCIACION)
  app.put('/api/pipeline/:id/etapa', async (req, res) => {
    try {
      const { id } = req.params;
      const { nuevaEtapa } = req.body;
      await pool.query('UPDATE negocios_b2b SET etapa = $1 WHERE id = $2', [nuevaEtapa, id]);
      res.json({ success: true, message: `Movido a ${nuevaEtapa}` });
    } catch (error) {
      console.error("Error al mover tarjeta:", error);
      res.status(500).json({ error: error.message });
    }
  });

};
