const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Function to load default environment values from .env.example file
function loadEnvExample() {
  const envExamplePath = path.resolve(__dirname, '.env.example');
  const envExample = {};

  if (fs.existsSync(envExamplePath)) {
    const content = fs.readFileSync(envExamplePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line) => {
      if (line.trim() === '' || line.trim().startsWith('#')) {
        return;
      }
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=');
      if (key && value !== undefined) {
        envExample[key.trim()] = value.trim();
      }
    });
  }

  return envExample;
}

const envDefaults = loadEnvExample();

const mongoLogin =
  process.env.MONGO_LOGIN || envDefaults.MONGO_LOGIN || 'admin';
const mongoPassword =
  process.env.MONGO_PASSWORD || envDefaults.MONGO_PASSWORD || 'password123';
const mongoHost =
  process.env.MONGO_HOST || envDefaults.MONGO_HOST || 'localhost';
const mongoPort = process.env.MONGO_PORT || envDefaults.MONGO_PORT || '27017';
const mongoAuthDatabase =
  process.env.MONGO_AUTHDATABASE || envDefaults.MONGO_AUTHDATABASE || 'admin';
const mongoDatabase =
  process.env.MONGO_DATABASE || envDefaults.MONGO_DATABASE || 'manga_db';

// Create the connection URI including authentication if credentials provided
const uri = `mongodb://${mongoLogin}:${mongoPassword}@${mongoHost}:${mongoPort}/?authSource=${mongoAuthDatabase}`;

async function createAdminUser() {
  console.log('Using MongoDB configuration:');
  console.log(`  Host: ${mongoHost}:${mongoPort}`);
  console.log(`  Login: ${mongoLogin}`);
  console.log(`  Auth Database: ${mongoAuthDatabase}`);
  console.log(`  Database: ${mongoDatabase}`);

  // Create client with authentication credentials
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB successfully');

    const adminDb = client.db(mongoAuthDatabase);

    // Check if user already exists to avoid error
    const existingUsers = await adminDb.command({ usersInfo: mongoLogin });
    if (existingUsers.users.length === 0) {
      // Create admin user
      await adminDb.command({
        createUser: mongoLogin,
        pwd: mongoPassword,
        roles: [
          { role: 'userAdminAnyDatabase', db: mongoAuthDatabase },
          { role: 'dbAdminAnyDatabase', db: mongoAuthDatabase },
          { role: 'readWriteAnyDatabase', db: mongoAuthDatabase },
        ],
      });
      console.log(
        `User ${mongoLogin} created in database ${mongoAuthDatabase}`,
      );
    } else {
      console.log(
        `User ${mongoLogin} already exists in database ${mongoAuthDatabase}`,
      );
    }

    const mangaDb = client.db(mongoDatabase);
    const existingMangaUsers = await mangaDb.command({ usersInfo: mongoLogin });

    if (existingMangaUsers.users.length === 0) {
      // Create user for manga_db database
      await mangaDb.command({
        createUser: mongoLogin,
        pwd: mongoPassword,
        roles: [
          { role: 'readWrite', db: mongoDatabase },
          { role: 'dbAdmin', db: mongoDatabase },
        ],
      });
      console.log(`User ${mongoLogin} created for database ${mongoDatabase}`);
    } else {
      console.log(
        `User ${mongoLogin} already exists for database ${mongoDatabase}`,
      );
    }
  } catch (error) {
    console.error('Error creating user:', error);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

createAdminUser();
