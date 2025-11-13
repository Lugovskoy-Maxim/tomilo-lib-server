const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Функция для загрузки переменных из .env.example
function loadEnvExample() {
  const envExamplePath = path.resolve(__dirname, '.env.example');
  const envExample = {};
  
  if (fs.existsSync(envExamplePath)) {
    const content = fs.readFileSync(envExamplePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach(line => {
      // Пропускаем пустые строки и комментарии
      if (line.trim() === '' || line.trim().startsWith('#')) {
        return;
      }
      
      // Разделяем по знаку =
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=');
      
      if (key && value !== undefined) {
        envExample[key.trim()] = value.trim();
      }
    });
  }
  
  return envExample;
}

// Загружаем переменные из .env.example как значения по умолчанию
const envDefaults = loadEnvExample();

// Получаем значения из переменных окружения или используем значения по умолчанию из .env.example
const mongoLogin = process.env.MONGO_LOGIN || envDefaults.MONGO_LOGIN || 'admin';
const mongoPassword = process.env.MONGO_PASSWORD || envDefaults.MONGO_PASSWORD || 'password123';
const mongoHost = process.env.MONGO_HOST || envDefaults.MONGO_HOST || 'localhost';
const mongoPort = process.env.MONGO_PORT || envDefaults.MONGO_PORT || '27017';
const mongoAuthDatabase = process.env.MONGO_AUTHDATABASE || envDefaults.MONGO_AUTHDATABASE || 'admin';
const mongoDatabase = process.env.MONGO_DATABASE || envDefaults.MONGO_DATABASE || 'manga_db';

async function createAdminUser() {
  console.log('Using MongoDB configuration:');
  console.log(`  Host: ${mongoHost}:${mongoPort}`);
  console.log(`  Login: ${mongoLogin}`);
  console.log(`  Auth Database: ${mongoAuthDatabase}`);
  console.log(`  Database: ${mongoDatabase}`);

  // Подключение к MongoDB без аутентификации
  const client = new MongoClient(`mongodb://${mongoHost}:${mongoPort}`);
  
  try {
    // Подключаемся к серверу
    await client.connect();
    console.log('Подключение к MongoDB успешно');
    
    // Создаем администратора
    const db = client.db(mongoAuthDatabase);
    
    // Создаем пользователя с правами администратора
    await db.command({
      createUser: mongoLogin,
      pwd: mongoPassword,
      roles: [
        { role: 'userAdminAnyDatabase', db: mongoAuthDatabase },
        { role: 'dbAdminAnyDatabase', db: mongoAuthDatabase },
        { role: 'readWriteAnyDatabase', db: mongoAuthDatabase }
      ]
    });
    
    console.log(`Пользователь ${mongoLogin} успешно создан в базе ${mongoAuthDatabase}`);
    
    // Создаем базу данных manga_db и пользователя для нее
    const mangaDb = client.db(mongoDatabase);
    
    // Создаем пользователя для базы данных manga_db
    await mangaDb.command({
      createUser: mongoLogin,
      pwd: mongoPassword,
      roles: [
        { role: 'readWrite', db: mongoDatabase },
        { role: 'dbAdmin', db: mongoDatabase }
      ]
    });
    
    console.log(`Пользователь ${mongoLogin} для базы данных ${mongoDatabase} успешно создан`);
  } catch (error) {
    if (error.code === 51003) {
      console.log(`Пользователь ${mongoLogin} уже существует`);
    } else {
      console.error('Ошибка при создании пользователя:', error);
    }
  } finally {
    await client.close();
    console.log('Подключение закрыто');
  }
}

createAdminUser();