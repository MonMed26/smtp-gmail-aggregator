import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack, path: req.path });

  // Check if it's an API request
  if (req.path.startsWith('/api/')) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: err.message }),
    });
    return;
  }

  // Dashboard error page
  res.status(500).render('error', {
    title: 'Error',
    message: 'Something went wrong',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    currentPage: '',
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
    });
    return;
  }

  res.status(404).render('error', {
    title: '404 Not Found',
    message: 'Page not found',
    error: undefined,
    currentPage: '',
  });
}
