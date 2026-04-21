import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';

const app = express();
const server = createServer(app);

// 1. Configuración de Socket.io (CON TU LINK ESPECÍFICO)
const io = new Server(server, {
  connectionStateRecovery: {}, 
  cors: {
    // IMPORTANTE: Hemos puesto tu link exacto con https://
    origin: "https://chatify-nine-liard.vercel.app", 
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// 2. Conexión a PostgreSQL con SSL (Obligatorio para Railway)
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 3. Inicialización de la Base de Datos
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          content TEXT
      );
    `);
    console.log('Base de datos conectada y tabla lista');
  } catch (err) {
    console.error('Error al conectar con la base de datos:', err);
  }
};
initDB();

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online</h1>');
});

// 4. Lógica de Socket.io
io.on('connection', async (socket) => {
  console.log('Cliente conectado:', socket.id);

  // --- CARGA DE HISTORIAL ---
  try {
    const offset = socket.handshake.auth.serverOffset || 0;
    
    const result = await pool.query(
      'SELECT id, content FROM messages WHERE id > $1 ORDER BY id ASC',
      [offset]
    );
    
    result.rows.forEach(row => {
      socket.emit('chat message', row.content, row.id);
    });
  } catch (e) {
    console.error('Error al recuperar historial:', e);
  }

  // --- RECIBIR MENSAJES NUEVOS ---
  socket.on('chat message', async (msg) => {
    if (!msg) return; 

    try {
      // Guardamos en Postgres
      const result = await pool.query(
        'INSERT INTO messages (content) VALUES ($1) RETURNING id',
        [msg]
      );
      
      const lastId = result.rows[0].id;

      // Reenviamos a TODOS los clientes conectados
      io.emit('chat message', msg, lastId);
    } catch (e) {
      console.error('Error al insertar mensaje:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

// 5. Configuración del Puerto para Railway
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});