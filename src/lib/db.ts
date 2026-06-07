import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { AnalysisResult, HistorySummary, Material, MaterialType, TrainingSession } from "./types";

const dataDir = path.join(process.cwd(), "data");

let db: Database.Database | undefined;
let currentDbPath: string | undefined;

function resolveDbPath() {
  return process.env.EXPRESSION_DB_PATH || path.join(dataDir, "expression.sqlite");
}

export function getDb() {
  const dbPath = resolveDbPath();
  if (db && currentDbPath !== dbPath) {
    db.close();
    db = undefined;
  }

  if (!db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    currentDbPath = dbPath;
    db.pragma("journal_mode = WAL");
    migrate(db);
  }
  return db;
}

export function resetDbForTests() {
  if (db) {
    db.close();
    db = undefined;
    currentDbPath = undefined;
  }
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      transcript TEXT NOT NULL,
      material_ids TEXT NOT NULL DEFAULT '[]',
      self_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analysis_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      total INTEGER NOT NULL,
      brevity INTEGER NOT NULL,
      structure INTEGER NOT NULL,
      viewpoint INTEGER NOT NULL,
      density INTEGER NOT NULL,
      camera_presence INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
}

function mapMaterial(row: Record<string, unknown>): Material {
  return {
    id: Number(row.id),
    title: String(row.title),
    type: row.type as MaterialType,
    content: String(row.content),
    sourceUrl: row.source_url ? String(row.source_url) : null,
    createdAt: String(row.created_at)
  };
}

function mapSession(row: Record<string, unknown>): TrainingSession {
  return {
    id: Number(row.id),
    topic: String(row.topic),
    transcript: String(row.transcript),
    materialIds: JSON.parse(String(row.material_ids || "[]")) as number[],
    selfNote: row.self_note ? String(row.self_note) : null,
    createdAt: String(row.created_at),
    analysis: row.result_json ? (JSON.parse(String(row.result_json)) as AnalysisResult) : undefined
  };
}

export function listMaterials() {
  return getDb()
    .prepare("SELECT * FROM materials ORDER BY created_at DESC, id DESC")
    .all()
    .map((row) => mapMaterial(row as Record<string, unknown>));
}

export function getMaterialsByIds(ids: number[]) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT * FROM materials WHERE id IN (${placeholders})`)
    .all(...ids)
    .map((row) => mapMaterial(row as Record<string, unknown>));
}

export function createMaterial(input: {
  title: string;
  type: MaterialType;
  content: string;
  sourceUrl?: string;
}) {
  const result = getDb()
    .prepare("INSERT INTO materials (title, type, content, source_url) VALUES (?, ?, ?, ?)")
    .run(input.title, input.type, input.content, input.sourceUrl || null);

  return getDb()
    .prepare("SELECT * FROM materials WHERE id = ?")
    .get(result.lastInsertRowid) as Record<string, unknown>;
}

export function saveAnalysisSession(input: {
  topic: string;
  transcript: string;
  materialIds: number[];
  selfNote?: string;
  analysis: AnalysisResult;
}) {
  const database = getDb();
  const transaction = database.transaction(() => {
    const session = database
      .prepare("INSERT INTO sessions (topic, transcript, material_ids, self_note) VALUES (?, ?, ?, ?)")
      .run(input.topic, input.transcript, JSON.stringify(input.materialIds), input.selfNote || null);
    const sessionId = Number(session.lastInsertRowid);

    database
      .prepare("INSERT INTO analysis_results (session_id, result_json) VALUES (?, ?)")
      .run(sessionId, JSON.stringify(input.analysis));

    const score = input.analysis.score;
    database
      .prepare(
        `INSERT INTO score_history
        (session_id, total, brevity, structure, viewpoint, density, camera_presence)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        sessionId,
        score.total,
        score.breakdown.brevity,
        score.breakdown.structure,
        score.breakdown.viewpoint,
        score.breakdown.density,
        score.breakdown.cameraPresence
      );

    return sessionId;
  });

  return transaction();
}

export function getHistory(): HistorySummary {
  const sessions = getDb()
    .prepare(
      `SELECT s.*, ar.result_json
       FROM sessions s
       LEFT JOIN analysis_results ar ON ar.session_id = s.id
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 30`
    )
    .all()
    .map((row) => mapSession(row as Record<string, unknown>));

  const scoreTrend = getDb()
    .prepare("SELECT date(created_at) as date, total FROM score_history ORDER BY created_at ASC, id ASC LIMIT 60")
    .all()
    .map((row) => {
      const typed = row as Record<string, unknown>;
      return { date: String(typed.date), total: Number(typed.total) };
    });

  const averageRow = getDb().prepare("SELECT AVG(total) as averageScore FROM score_history").get() as {
    averageScore?: number;
  };

  const wordCounts = new Map<string, number>();
  for (const session of sessions) {
    for (const item of session.analysis?.draftDiagnosis?.redundantExpressions || []) {
      wordCounts.set(item.text, (wordCounts.get(item.text) || 0) + 1);
    }
  }

  return {
    sessions,
    topRedundantWords: [...wordCounts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    averageScore: Math.round(averageRow.averageScore || 0),
    scoreTrend
  };
}
