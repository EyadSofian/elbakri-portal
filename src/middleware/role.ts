import { Request, Response, NextFunction } from 'express';

type AllowedRole = 'SUPERADMIN' | 'COMPANY_ADMIN' | 'AGENT';

export function requireRole(...roles: AllowedRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }
    if (!roles.includes(req.user.role as AllowedRole)) {
      res.status(403).json({ success: false, error: 'FORBIDDEN' });
      return;
    }
    next();
  };
}
