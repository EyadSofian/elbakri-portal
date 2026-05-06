import { Request, Response } from 'express';
import {
  getSheetsConfig,
  isSyncEntity,
  listSyncHistory,
  markSheetsConnectionFailed,
  syncEntityFromSheets,
  testSheetsConnection,
  updateSheetsConfig,
  SyncEntity,
} from './sheets-sync.service';

export async function getConfig(req: Request, res: Response): Promise<void> {
  const config = await getSheetsConfig();
  res.json({ success: true, data: config });
}

export async function saveConfig(req: Request, res: Response): Promise<void> {
  const config = await updateSheetsConfig(req.body as {
    spreadsheetId?: string;
    autoSyncEnabled?: boolean;
    cronExpression?: string;
  });
  res.json({ success: true, data: config });
}

export async function testConnection(req: Request, res: Response): Promise<void> {
  const spreadsheetId = typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId : undefined;
  try {
    const result = await testSheetsConnection(spreadsheetId);
    res.json({ success: true, data: result });
  } catch (error) {
    await markSheetsConnectionFailed(spreadsheetId);
    res.status(400).json({ success: false, error: 'SHEETS_CONNECTION_FAILED', message: (error as Error).message });
  }
}

export async function syncEntity(req: Request, res: Response): Promise<void> {
  const entity = req.params.entity;
  if (!isSyncEntity(entity)) {
    res.status(404).json({ success: false, error: 'UNKNOWN_SYNC_ENTITY' });
    return;
  }

  try {
    const result = await syncEntityFromSheets(entity, {
      spreadsheetId: typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId : undefined,
      triggeredById: req.user?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'SYNC_FAILED', message: (error as Error).message });
  }
}

export function syncSpecificEntity(entity: SyncEntity) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await syncEntityFromSheets(entity, {
        spreadsheetId: typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId : undefined,
        triggeredById: req.user?.id,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: 'SYNC_FAILED', message: (error as Error).message });
    }
  };
}

export async function history(req: Request, res: Response): Promise<void> {
  const limit = Number.parseInt(String(req.query.limit ?? '10'), 10);
  const data = await listSyncHistory(Number.isFinite(limit) ? limit : 10);
  res.json({ success: true, data });
}
