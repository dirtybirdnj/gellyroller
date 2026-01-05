// SQLite Database Module for Gellyroller
// Stores files, settings, and history

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'gellyroller.db');

class GellyrollerDB {
  constructor(dbPath = DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  init() {
    // Files table - stores original content
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Settings table - per-file settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_settings (
        file_id INTEGER PRIMARY KEY,
        draw_speed INTEGER DEFAULT 3000,
        travel_speed INTEGER DEFAULT 6000,
        pen_down_delay INTEGER DEFAULT 150,
        pen_up_delay INTEGER DEFAULT 100,
        scale_mode TEXT DEFAULT 'contain',
        align_x TEXT DEFAULT 'center',
        align_y TEXT DEFAULT 'center',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      )
    `);

    // Settings history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        settings_json TEXT NOT NULL,
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      )
    `);
  }

  // Files CRUD
  createFile(filename, type, content) {
    const size = Buffer.byteLength(content, 'utf8');
    const stmt = this.db.prepare(`
      INSERT INTO files (filename, type, content, size)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(filename, type, content, size);
    const fileId = result.lastInsertRowid;

    // Create default settings
    this.db.prepare(`
      INSERT INTO file_settings (file_id) VALUES (?)
    `).run(fileId);

    return this.getFile(fileId);
  }

  getFile(id) {
    const file = this.db.prepare(`
      SELECT f.*,
             s.draw_speed, s.travel_speed, s.pen_down_delay, s.pen_up_delay,
             s.scale_mode, s.align_x, s.align_y
      FROM files f
      LEFT JOIN file_settings s ON f.id = s.file_id
      WHERE f.id = ?
    `).get(id);

    if (!file) return null;

    return {
      id: file.id,
      filename: file.filename,
      type: file.type,
      content: file.content,
      size: file.size,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      settings: {
        drawSpeed: file.draw_speed,
        travelSpeed: file.travel_speed,
        penDownDelay: file.pen_down_delay,
        penUpDelay: file.pen_up_delay,
        scaleMode: file.scale_mode,
        alignX: file.align_x,
        alignY: file.align_y
      }
    };
  }

  getAllFiles() {
    const files = this.db.prepare(`
      SELECT f.id, f.filename, f.type, f.size, f.created_at, f.updated_at
      FROM files f
      ORDER BY f.updated_at DESC
    `).all();

    return files.map(f => ({
      id: f.id,
      filename: f.filename,
      type: f.type,
      size: f.size,
      createdAt: f.created_at,
      updatedAt: f.updated_at
    }));
  }

  deleteFile(id) {
    const stmt = this.db.prepare('DELETE FROM files WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Settings
  getSettings(fileId) {
    const settings = this.db.prepare(`
      SELECT * FROM file_settings WHERE file_id = ?
    `).get(fileId);

    if (!settings) return null;

    return {
      drawSpeed: settings.draw_speed,
      travelSpeed: settings.travel_speed,
      penDownDelay: settings.pen_down_delay,
      penUpDelay: settings.pen_up_delay,
      scaleMode: settings.scale_mode,
      alignX: settings.align_x,
      alignY: settings.align_y
    };
  }

  updateSettings(fileId, settings) {
    // Save current settings to history first
    const current = this.getSettings(fileId);
    if (current) {
      this.db.prepare(`
        INSERT INTO settings_history (file_id, settings_json)
        VALUES (?, ?)
      `).run(fileId, JSON.stringify(current));
    }

    // Update settings
    const stmt = this.db.prepare(`
      UPDATE file_settings SET
        draw_speed = COALESCE(?, draw_speed),
        travel_speed = COALESCE(?, travel_speed),
        pen_down_delay = COALESCE(?, pen_down_delay),
        pen_up_delay = COALESCE(?, pen_up_delay),
        scale_mode = COALESCE(?, scale_mode),
        align_x = COALESCE(?, align_x),
        align_y = COALESCE(?, align_y),
        updated_at = CURRENT_TIMESTAMP
      WHERE file_id = ?
    `);

    stmt.run(
      settings.drawSpeed,
      settings.travelSpeed,
      settings.penDownDelay,
      settings.penUpDelay,
      settings.scaleMode,
      settings.alignX,
      settings.alignY,
      fileId
    );

    // Update file's updated_at
    this.db.prepare(`
      UPDATE files SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(fileId);

    return this.getSettings(fileId);
  }

  resetSettings(fileId) {
    this.db.prepare(`
      UPDATE file_settings SET
        draw_speed = 3000,
        travel_speed = 6000,
        pen_down_delay = 150,
        pen_up_delay = 100,
        scale_mode = 'contain',
        align_x = 'center',
        align_y = 'center',
        updated_at = CURRENT_TIMESTAMP
      WHERE file_id = ?
    `).run(fileId);

    return this.getSettings(fileId);
  }

  getSettingsHistory(fileId) {
    const history = this.db.prepare(`
      SELECT * FROM settings_history
      WHERE file_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(fileId);

    return history.map(h => ({
      id: h.id,
      settings: JSON.parse(h.settings_json),
      note: h.note,
      createdAt: h.created_at
    }));
  }

  close() {
    this.db.close();
  }
}

// Export singleton
const db = new GellyrollerDB();
export { GellyrollerDB };
export default db;
