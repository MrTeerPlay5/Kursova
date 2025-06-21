const express = require('express');
const sql = require('mssql');

const app = express();
const port = 3000;

// Конфігурація підключення до MS SQL
const config = {
    user: 'sa',
    password: '123',
    server: 'DESKTOP-VVN286Q',
    database: 'RegistrationDB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

app.use(express.json()); // парсинг JSON:contentReference[oaicite:4]{index=4}

const path = require('path');
app.use(express.static(__dirname));


// GET / – надсилаємо HTML-форму
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const WebSocket = require('ws');

// Створюємо WebSocket-сервер
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('🔗 Нове WebSocket-зʼєднання');

    ws.on('message', (message) => {
        console.log('📩 Отримано повідомлення:', message);
    });

    ws.on('close', () => {
        console.log('❌ WebSocket-зʼєднання закрито');
    });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  console.log('📤 Транслюємо через WebSocket:', data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Змінюємо виклик в app.post('/api/update-room-players', ...)

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
  
    try {
      const pool = await sql.connect(config);
      const result = await pool.request()
      // 🔍 Перевірка наявності користувача
      const check = await pool.request()
        .input('username', sql.NVarChar(50), username)
        .input('email', sql.NVarChar(100), email)
        .query('SELECT * FROM Users WHERE username = @username OR email = @email');
  
      if (check.recordset.length > 0) {
        return res.status(400).json({ error: 'Такий користувач або email вже існує' });
      }
  
      // 📝 Якщо немає — додаємо нового
      await pool.request()
        .input('username', sql.NVarChar(50), username)
        .input('email', sql.NVarChar(100), email)
        .input('password', sql.NVarChar(100), password)
        .query('INSERT INTO Users (username, email, password) VALUES (@username, @email, @password)');
  
      res.json({ message: 'Реєстрація успішна!' });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Помилка сервера' });
    }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input('email', sql.NVarChar(100), email)
      .input('password', sql.NVarChar(100), password)
      .query('SELECT * FROM Users WHERE email = @email AND password = @password');

    if (result.recordset.length > 0) {
      res.json({ message: 'Login OK', username: result.recordset[0].username });
    } else {
      res.status(401).json({ error: 'Невірний email або пароль' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

app.post('/api/save-progress', async (req, res) => {
  try {
      const { email, gameState } = req.body;

      const request = new sql.Request();
      await request
          .input('email', sql.NVarChar, email)
          .input('gameState', sql.NVarChar, gameState)
          .query(`
              MERGE GameProgress AS target
              USING (SELECT @email AS Email) AS source
              ON target.Email = source.Email
              WHEN MATCHED THEN 
                  UPDATE SET GameState = @gameState, UpdatedAt = GETDATE()
              WHEN NOT MATCHED THEN
                  INSERT (Email, GameState, UpdatedAt)
                  VALUES (@email, @gameState, GETDATE());
          `);

      res.json({ message: 'Прогрес збережено успішно' });
  } catch (err) {
      console.error('❌ Помилка при збереженні прогресу:', err);
      res.status(500).json({ error: 'Помилка сервера' });
  }
});

app.get('/api/load-progress', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    // Припустимо, ви зберігаєте прогрес за певним email
    // Можна використовувати query-параметр, наприклад, ?email=player@example.com
    const email = req.query.email || 'player@example.com';
    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT TOP 1 GameState FROM GameProgress WHERE Email = @email ORDER BY UpdatedAt DESC');

    if (result.recordset.length > 0) {
      res.json(JSON.parse(result.recordset[0].GameState));
    } else {
      res.status(404).json({ error: 'Прогрес не знайдено' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// GET /users – повертаємо усіх користувачів
app.get('/users', async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query('SELECT * FROM Users'); // SELECT всі колонки:contentReference[oaicite:6]{index=6}
    res.json(result.recordset); // повертаємо масив користувачів у форматі JSON
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

app.post('/api/save-waiting-room', async (req, res) => {
  try {
      const { roomCode, players, adminEmail } = req.body;

      const request = new sql.Request();
      await request
          .input('roomCode', sql.NVarChar, roomCode)
          .input('players', sql.NVarChar, players)
          .input('adminEmail', sql.NVarChar, adminEmail)
          .query(`
              MERGE Rooms AS target
              USING (SELECT @roomCode AS RoomCode) AS source
              ON target.RoomCode = source.RoomCode
              WHEN MATCHED THEN 
                  UPDATE SET Players = @players, AdminEmail = @adminEmail, CreatedAt = GETDATE()
              WHEN NOT MATCHED THEN
                  INSERT (RoomCode, Players, CreatedAt, AdminEmail)
                  VALUES (@roomCode, @players, GETDATE(), @adminEmail);
          `);

      res.json({ message: 'Кімната очікування збережена успішно' });
  } catch (err) {
      console.error('❌ Помилка при збереженні кімнати очікування:', err);
      res.status(500).json({ error: 'Помилка сервера' });
  }
});

app.delete('/api/delete-room', async (req, res) => {
    try {
        const { roomCode } = req.body;

        const pool = await sql.connect(config);
        await pool.request()
            .input('roomCode', sql.NVarChar, roomCode)
            .query('DELETE FROM Rooms WHERE RoomCode = @roomCode');

        res.json({ message: 'Кімнату успішно видалено' });
    } catch (err) {
        console.error('❌ Помилка при видаленні кімнати:', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

app.get('/api/get-room', async (req, res) => {
  try {
    const roomCode = req.query.roomCode;
    const pool = await sql.connect(config);

    const result = await pool.request()
      .input('roomCode', sql.NVarChar, roomCode)
      .query('SELECT RoomCode, Players FROM Rooms WHERE RoomCode = @roomCode');

    if (result.recordset.length > 0) {
      // Розпарсимо рядок Players, якщо він є JSON
      let players;
      try {
        players = JSON.parse(result.recordset[0].Players);
      } catch (e) {
        // Якщо Players не є валідним JSON, просто використовуємо рядок
        players = result.recordset[0].Players;
      }

      const roomData = {
        RoomCode: result.recordset[0].RoomCode,
        Players: players // Використовуємо розпарсений масив або рядок
      };

      res.json(roomData); // Надсилаємо об'єкт з RoomCode і Players
    } else {
      res.status(404).json({ error: 'Кімната не знайдена' });
    }
  } catch (err) {
    console.error('Помилка при отриманні даних кімнати:', err);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

app.post('/api/update-room-players', async (req, res) => {
  try {
      const { roomCode, newPlayer } = req.body;
      const pool = await sql.connect(config);

      const result = await pool.request()
          .input('roomCode', sql.NVarChar, roomCode)
          .query('SELECT Players, AdminEmail FROM Rooms WHERE RoomCode = @roomCode');

      if (result.recordset.length === 0) {
          return res.status(404).json({ error: 'Кімната не знайдена' });
      }

      let players = result.recordset[0].Players ? result.recordset[0].Players.split(',') : [];
      if (!players.includes(newPlayer)) {
          players.push(newPlayer);
      }

      const playersString = players.join(','); // <--- Створюємо рядок гравців

      await pool.request()
          .input('roomCode', sql.NVarChar, roomCode)
          .input('players', sql.NVarChar, playersString) // <--- Використовуємо рядок
          .query('UPDATE Rooms SET Players = @players WHERE RoomCode = @roomCode');

      // ✅ ВИРІШЕННЯ: Формуємо об'єкт, де `Players` - це РЯДОК
      const broadcastData = {
          RoomCode: roomCode,
          Players: playersString, // <--- Передаємо рядок, а не масив
          AdminEmail: result.recordset[0].AdminEmail
      };

      // Транслюємо оновлення з РЯДКОМ гравців
      broadcast({ type: 'PLAYERS_UPDATED', roomCode: roomCode, data: broadcastData });

      // Відповідь тому, хто приєднався (тут можна залишити масив)
      res.json({ message: 'Список гравців оновлено', players: players });
  } catch (err) {
      console.error('❌ Помилка при оновленні списку гравців:', err);
      res.status(500).json({ error: 'Помилка сервера' });
  }
});

// ✅ Ендпоінт, що приймає ВСІ початкові дані від адміна і транслює їх
app.post('/api/game/start-full', async (req, res) => {
    const initialData = req.body;
    const { roomCode, players, boardState, targetLaps, globalEventType, currentPlayerNickname } = initialData;

    if (!players || players.length === 0) {
        return res.status(400).json({ error: 'Список гравців порожній.' });
    }

    try {
        const pool = await sql.connect(config);
        await pool.request()
            .input('RoomCode', sql.NVarChar, roomCode)
            .input('CurrentPlayerNickname', sql.NVarChar, currentPlayerNickname)
            .input('PlayerPositions', sql.NVarChar, '{}') 
            .input('BoardState', sql.NVarChar(sql.MAX), JSON.stringify(boardState))
            .query(`
                MERGE ActiveGames AS target
                USING (SELECT @RoomCode AS RoomCode) AS source ON (target.RoomCode = source.RoomCode)
                WHEN NOT MATCHED THEN
                    INSERT (RoomCode, CurrentPlayerNickname, PlayerPositions, BoardState)
                    VALUES (@RoomCode, @CurrentPlayerNickname, @PlayerPositions, @BoardState);
            `);
      
        // Розсилаємо всім сигнал про старт гри з повними даними
        broadcast({ type: 'GAME_STARTED', roomCode, data: initialData });
        res.json({ message: 'Гра успішно розпочата!' });

    } catch (err) {
        console.error('❌ Помилка при старті гри:', err.message);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Ендпоінт для ОТРИМАННЯ СТАНУ ГРИ
app.get('/api/game/state', async (req, res) => {
  const { roomCode } = req.query;

  try {
      const pool = await sql.connect(config);
      const result = await pool.request()
          .input('RoomCode', sql.NVarChar, roomCode)
          .query('SELECT * FROM ActiveGames WHERE RoomCode = @RoomCode');
      
      if (result.recordset.length > 0) {
          res.json(result.recordset[0]);
      } else {
          res.status(404).json({ error: 'Ігрову сесію не знайдено.' });
      }
  } catch (err)
  {
      console.error('❌ Помилка при отриманні стану гри:', err);
      res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Ендпоінт для оновлення позицій гравців
app.post('/api/game/update-positions', async (req, res) => {
    const { roomCode, playerPositions } = req.body;

    try {
        const pool = await sql.connect(config);
        await pool.request()
            .input('RoomCode', sql.NVarChar, roomCode)
            .input('PlayerPositions', sql.NVarChar, playerPositions) // playerPositions - це JSON-рядок
            .query('UPDATE ActiveGames SET PlayerPositions = @PlayerPositions WHERE RoomCode = @RoomCode');
        
        // Розсилаємо всім оновлені позиції
        broadcast({ 
            type: 'POSITIONS_UPDATED', 
            roomCode: roomCode, 
            data: { playerPositions: JSON.parse(playerPositions) } // Розпаковуємо для передачі
        });

        res.json({ message: 'Позиції успішно оновлено' });
    } catch (err) {
        console.error('❌ Помилка при оновленні позицій:', err.message);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

app.post('/api/game/update-turn', async (req, res) => {
  const { roomCode, currentPlayerNickname } = req.body;

  try {
      const pool = await sql.connect(config);
      // Оновлюємо, хто ходить наступним у базі даних
      await pool.request()
          .input('RoomCode', sql.NVarChar, roomCode)
          .input('CurrentPlayerNickname', sql.NVarChar, currentPlayerNickname)
          .query('UPDATE ActiveGames SET CurrentPlayerNickname = @CurrentPlayerNickname WHERE RoomCode = @RoomCode');
      
      // Розсилаємо всім оновлення, хто тепер ходить
      broadcast({ 
          type: 'TURN_UPDATED', 
          roomCode: roomCode, 
          data: { currentPlayerNickname: currentPlayerNickname } 
      });

      res.json({ message: 'Хід успішно оновлено' });
  } catch (err) {
      console.error('❌ Помилка при оновленні ходу:', err);
      res.status(500).json({ error: 'Помилка сервера' });
  }
});

// ✅ Новий ендпоінт для обробки фінішу гравця
app.post('/api/game/player-finished', (req, res) => {
    const { roomCode, nickname } = req.body;
    
    // ✅ Транслюємо всім, що цей гравець фінішував
    broadcast({ 
        type: 'PLAYER_FINISHED_LAP', 
        roomCode: roomCode, 
        data: { finishedPlayerNickname: nickname } 
    });

    res.json({ message: 'Finish reported' });
});

// ✅ Ендпоінт для реєстрації гравця в клітці
app.post('/api/game/player-jailed', async (req, res) => {
    const { roomCode, nickname } = req.body;
    
    console.log(`Гравець ${nickname} в кімнаті ${roomCode} потрапив у клітку.`);
    
    // Транслюємо всім, що гравець потрапив у клітку
    broadcast({ 
        type: 'PLAYER_JAILED', 
        roomCode: roomCode, 
        data: { jailedPlayerNickname: nickname } 
    });

    res.json({ message: 'Jail status reported successfully' });
});

// ✅ Новий ендпоінт для трансляції глобального івенту
app.post('/api/game/broadcast-event', (req, res) => {
    const { roomCode, eventType } = req.body;
    
    console.log(`Трансляція івенту ${eventType} для кімнати ${roomCode}`);
    
    // Розсилаємо всім клієнтам у кімнаті
    broadcast({ 
        type: 'GLOBAL_EVENT_UPDATE', 
        roomCode: roomCode, 
        data: { eventType: parseInt(eventType) } 
    });

    res.json({ message: 'Event broadcasted' });
});

app.post('/api/game/update-board', (req, res) => {
    const { roomCode, boardState } = req.body;
    
    console.log(`Оновлення дошки для кімнати ${roomCode}`);
    
    // Розсилаємо всім клієнтам у кімнаті новий стан дошки
    broadcast({ 
        type: 'BOARD_UPDATED', 
        roomCode: roomCode, 
        data: { boardState: JSON.parse(boardState) } 
    });

    res.json({ message: 'Board state broadcasted' });
});

// ✅ Новий ендпоінт для трансляції стану нового кола
app.post('/api/game/new-lap', (req, res) => {
    const { roomCode, combinedData } = req.body;
    
    console.log(`Трансляція нового кола для кімнати ${roomCode}`);
    
    // Розсилаємо всім клієнтам у кімнаті дані про нове коло
    broadcast({ 
        type: 'NEW_LAP_UPDATE', 
        roomCode: roomCode, 
        data: JSON.parse(combinedData) // Дані вже є об'єктом в `NewLapData`
    });

    res.json({ message: 'New lap state broadcasted' });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущено на http://localhost:${port}`);
});
