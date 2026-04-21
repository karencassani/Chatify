import express from 'express'; 
import { createServer } from 'node:http';
import { Server } from 'socket.io'; //IMPORTA el servidor de socket.io
import pg from 'pg';

const app = express();
const server = createServer(app); //Crea el servidor HTTP utilizando Express


const io = new Server(server, {
  connectionStateRecovery: {}, //configuracion para recuperar estados de conexion
  cors: { //Habilita cors para permitir opciones desde otros dominios 
    
    origin: "https://chatify-nine-liard.vercel.app", //Permite conexiones solo con mi link 
    methods: ['GET', 'POST'], //Metodos permitidos en las solicitudes 
    credentials: true //manejo de credenciales 
  }
});


const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

//Funcion para inicializar la base de datos y crear la tabla si no existe
const initDB = async () => {
  try { //Ejecute una query apra crear la tabla messages
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
initDB(); //llama la funcion para inicializar la base de datos 
//Ruta para comprobar que el servidor esta funcionando 
app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online</h1>');
});

//Manejo de conexiones de Socket.io
io.on('connection', async (socket) => {
  console.log('Cliente conectado:', socket.id);

  //intenta recuperar el historial de mensajes desde la base de datos 
  try {
    const offset = socket.handshake.auth.serverOffset || 0;
    
    const result = await pool.query(
      'SELECT id, content FROM messages WHERE id > $1 ORDER BY id ASC', //query para obtener mensajes nuevos
      [offset]
    );
    
    result.rows.forEach(row => {
      socket.emit('chat message', row.content, row.id);
    });
  } catch (e) {
    console.error('Error al recuperar historial:', e);
  }

  
  socket.on('chat message', async (msg) => {
    if (!msg) return; 

    try {
      
      const result = await pool.query(
        'INSERT INTO messages (content) VALUES ($1) RETURNING id',
        [msg]
      );
      
      const lastId = result.rows[0].id;

      //emite el mensaje a todos los clientes conectados 
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
