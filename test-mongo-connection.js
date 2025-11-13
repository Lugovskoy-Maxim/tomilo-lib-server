const { MongoClient } = require('mongodb');

async function testConnection() {
  // Подключение к MongoDB с аутентификацией
  const uri = 'mongodb://admin:password123@localhost:27017/manga_db?authSource=admin';
  const client = new MongoClient(uri);
  
  try {
    // Подключаемся к серверу
    await client.connect();
    console.log('Подключение к MongoDB успешно!');
    
    // Проверяем доступ к базе данных
    const db = client.db('manga_db');
    const collections = await db.listCollections().toArray();
    console.log('Доступные коллекции:', collections.map(c => c.name));
    
  } catch (error) {
    console.error('Ошибка подключения к MongoDB:', error);
  } finally {
    await client.close();
    console.log('Подключение закрыто');
  }
}

testConnection();