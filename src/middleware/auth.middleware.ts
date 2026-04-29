import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * API Key authentication middleware.
 * Checks X-API-Key header or ?api_key query parameter.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;

  if (!apiKey || apiKey !== config.api.key) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing API key',
    });
    return;
  }

  next();
}

/**
 * Dashboard session authentication middleware.
 * Redirects to login page if not authenticated.
 */
export function dashboardAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.authenticated) {
    next();
    return;
  }

  // Allow login page
  if (req.path === '/login') {
    next();
    return;
  }

  res.redirect('/login');
}
