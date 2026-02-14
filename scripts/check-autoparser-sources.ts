/**
 * Запросы к тайтлам из задач автопарсера по каждому парсеру.
 * Проверяет ответы и какие данные возвращаются (и что будет записано в тайтл).
 *
 * Запуск (после npm run build):
 *   npx ts-node -r tsconfig-paths/register scripts/check-autoparser-sources.ts
 * Или с указанием API (если сервер поднят):
 *   API_BASE=https://tomilo-lib.ru/api npx ts-node -r tsconfig-paths/register scripts/check-autoparser-sources.ts
 *
 * Если задан API_BASE — запросы идут на POST /manga-parser/parse-metadata.
 * Иначе — читаем задачи из MongoDB и вызываем парсеры напрямую (нужен build).
 */
import 'dotenv/config';
import path from 'path';
import mongoose from 'mongoose';
import axios from 'axios';

const API_BASE = process.env.API_BASE || '';

const PARSER_ORDER = [
  'v2.mangahub.one',
  'mangahub.one',
  'mangahub.cc',
  'manga-shi.org',
  'senkuro.me',
  'mangabuff.ru',
  'telemanga.me',
];

function getParserKey(url: string): string | null {
  for (const key of PARSER_ORDER) {
    if (url.includes(key)) return key;
  }
  return null;
}

interface JobDoc {
  _id: unknown;
  titleId: unknown;
  sources?: string[];
  url?: string;
}

async function getJobsFromDb(): Promise<{ url: string; jobId: string }[]> {
  const login = process.env.MONGO_LOGIN || 'admin';
  const password = process.env.MONGO_PASSWORD || 'password123';
  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';
  const database = process.env.MONGO_DATABASE || 'tomilo-lib_db';
  const authDatabase = process.env.MONGO_AUTHDATABASE || 'admin';
  const uri = `mongodb://${login}:${password}@${host}:${port}/${database}?authSource=${authDatabase}`;

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB connection');
  const names = await db.listCollections().toArray();
  const colName = names.find((c) => c.name.toLowerCase().includes('autoparsing') || c.name.toLowerCase().includes('auto_parsing'))?.name || 'autoparsingjobs';
  const col = db.collection(colName);
  const jobs = await col.find({}).toArray();
  const out: { url: string; jobId: string }[] = [];
  for (const job of jobs as JobDoc[]) {
    const sources =
      job.sources && job.sources.length > 0 ? job.sources : job.url ? [job.url] : [];
    for (const url of sources) {
      if (url && getParserKey(url)) {
        out.push({ url, jobId: String(job._id) });
      }
    }
  }
  await mongoose.disconnect();
  return out;
}

interface ParsedMeta {
  title: string;
  alternativeTitles?: string[];
  description?: string;
  coverUrl?: string;
  genres?: string[];
  author?: string;
  artist?: string;
  tags?: string[];
  releaseYear?: number;
  type?: string;
  chapterCount: number;
}

async function parseViaApi(url: string): Promise<ParsedMeta | null> {
  const base = API_BASE.replace(/\/$/, '');
  const res = await axios.post(
    `${base}/manga-parser/parse-metadata`,
    { url },
    { timeout: 25000, validateStatus: () => true },
  );
  if (res.status !== 201 && res.status !== 200) {
    console.error(`  API error ${res.status}: ${res.data?.message || res.statusText}`);
    return null;
  }
  return res.data as ParsedMeta;
}

async function parseViaParsers(url: string): Promise<ParsedMeta | null> {
  try {
    const key = getParserKey(url);
    if (!key) return null;
    const distParsers = path.join(process.cwd(), 'dist', 'manga-parser', 'parsers');
    const load = (file: string): Record<string, new () => { parse: (u: string) => Promise<any> }> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(path.join(distParsers, file));
    };
    let ParserClass: new () => { parse: (u: string) => Promise<any> };
    switch (key) {
      case 'telemanga.me':
        ParserClass = load('telemanga.parser.js').TelemangaParser;
        break;
      case 'mangabuff.ru':
        ParserClass = load('mangabuff.parser.js').MangabuffParser;
        break;
      case 'manga-shi.org':
        ParserClass = load('manga-shi.parser.js').MangaShiParser;
        break;
      case 'senkuro.me':
        ParserClass = load('senkuro.parser.js').SenkuroParser;
        break;
      case 'mangahub.one':
      case 'v2.mangahub.one':
        ParserClass = load('mangahub.parser.js').MangahubParser;
        break;
      case 'mangahub.cc':
        ParserClass = load('mangahub-cc.parser.js').MangahubCcParser;
        break;
      default:
        return null;
    }
    const parser = new ParserClass();
    const data = await parser.parse(url);
    return {
      title: data.title,
      alternativeTitles: data.alternativeTitles,
      description: data.description,
      coverUrl: data.coverUrl,
      genres: data.genres,
      author: data.author,
      artist: data.artist,
      tags: data.tags,
      releaseYear: data.releaseYear,
      type: data.type,
      chapterCount: (data.chapters || []).length,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const short = msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
    console.error(`  Parser error: ${short}`);
    return null;
  }
}

function summarize(meta: ParsedMeta): string {
  const parts: string[] = [];
  if (meta.title) parts.push(`title`);
  if (meta.alternativeTitles?.length) parts.push(`altTitles(${meta.alternativeTitles.length})`);
  if (meta.description) parts.push('desc');
  if (meta.coverUrl) parts.push('cover');
  if (meta.genres?.length) parts.push(`genres(${meta.genres.length})`);
  if (meta.author) parts.push('author');
  if (meta.artist) parts.push('artist');
  if (meta.tags?.length) parts.push(`tags(${meta.tags.length})`);
  if (meta.releaseYear) parts.push(`year(${meta.releaseYear})`);
  if (meta.type) parts.push(`type(${meta.type})`);
  parts.push(`chapters(${meta.chapterCount})`);
  return parts.join(', ');
}

async function main() {
  console.log('=== Источники из задач автопарсера ===\n');
  if (API_BASE) {
    console.log(`Режим: запросы к API ${API_BASE}\n`);
  } else {
    console.log('Режим: MongoDB + парсеры из dist (нужен npm run build)\n');
  }

  const testUrls = [
    { url: 'https://telemanga.me/manga/one-piece', jobId: 'test' },
    { url: 'https://mangabuff.ru/manga/vanpanchmen', jobId: 'test' },
    { url: 'https://manga-shi.org/manga/one-piece', jobId: 'test' },
    { url: 'https://senkuro.me/manga/one-piece', jobId: 'test' },
    { url: 'https://mangahub.cc/manga/vanpanchmen', jobId: 'test' },
  ].filter((x) => getParserKey(x.url));

  let list: { url: string; jobId: string }[];
  try {
    list = await getJobsFromDb();
  } catch (e) {
    console.warn('БД недоступна, используем тестовые URL:', e instanceof Error ? e.message : e);
    list = testUrls;
  }

  if (list.length === 0) {
    console.log('В БД нет задач автопарсера с источниками. Используем тестовые URL по парсерам.\n');
    list = testUrls;
  }

  const byParser = new Map<string, { url: string; jobId: string }[]>();
  for (const { url, jobId } of list) {
    const key = getParserKey(url);
    if (!key) continue;
    if (!byParser.has(key)) byParser.set(key, []);
    byParser.get(key)!.push({ url, jobId });
  }

  const results: { parser: string; url: string; meta: ParsedMeta | null; err?: string }[] = [];

  for (const [parserKey, items] of byParser) {
    console.log(`\n--- Парсер: ${parserKey} (URLs: ${items.length}) ---`);
    for (const { url } of items) {
      process.stdout.write(`  ${url.slice(0, 60)}... `);
      let meta: ParsedMeta | null = null;
      let err: string | undefined;
      try {
        if (API_BASE) {
          meta = await parseViaApi(url);
        } else {
          meta = await parseViaParsers(url);
        }
        if (meta) {
          console.log('OK  ' + summarize(meta));
          results.push({ parser: parserKey, url, meta });
        } else {
          err = 'no data';
          results.push({ parser: parserKey, url, meta: null, err });
          console.log('FAIL (no data or error)');
        }
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
        results.push({ parser: parserKey, url, meta: null, err });
        console.log('FAIL ' + err);
      }
    }
  }

  console.log('\n\n=== Сводка по парсерам: какие поля возвращаются ===\n');
  const byParserResults = new Map<
    string,
    { success: number; fail: number; fields: Set<string>; samples: ParsedMeta[] }
  >();
  for (const r of results) {
    if (!byParserResults.has(r.parser)) {
      byParserResults.set(r.parser, { success: 0, fail: 0, fields: new Set(), samples: [] });
    }
    const stat = byParserResults.get(r.parser)!;
    if (r.meta) {
      stat.success++;
      if (r.meta.title) stat.fields.add('title');
      if (r.meta.alternativeTitles?.length) stat.fields.add('alternativeTitles');
      if (r.meta.description) stat.fields.add('description');
      if (r.meta.coverUrl) stat.fields.add('coverUrl');
      if (r.meta.genres?.length) stat.fields.add('genres');
      if (r.meta.author) stat.fields.add('author');
      if (r.meta.artist) stat.fields.add('artist');
      if (r.meta.tags?.length) stat.fields.add('tags');
      if (r.meta.releaseYear != null) stat.fields.add('releaseYear');
      if (r.meta.type) stat.fields.add('type');
      stat.fields.add('chapters');
      if (stat.samples.length < 2) stat.samples.push(r.meta);
    } else {
      stat.fail++;
    }
  }

  for (const [parser, stat] of byParserResults) {
    console.log(`${parser}:`);
    console.log(`  успешно: ${stat.success}, ошибок: ${stat.fail}`);
    console.log(`  поля: ${[...stat.fields].sort().join(', ')}`);
    if (stat.samples.length > 0) {
      const s = stat.samples[0];
      console.log(`  пример (что записывается в тайтл): name="${s.title?.slice(0, 40)}...", cover=${!!s.coverUrl}, genres=${s.genres?.length ?? 0}, author=${s.author ?? '—'}, artist=${s.artist ?? '—'}, type=${s.type ?? '—'}, year=${s.releaseYear ?? '—'}`);
    }
    console.log('');
  }

  console.log('Готово.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
