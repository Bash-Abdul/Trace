import { Router } from 'express';
import { authenticateRead } from '../auth/auth.middleware.js';
import { list } from './reviews.controller.js';
// Mounted beneath Projects' browser and rate-limit controls.
export const reviewsRouter = Router();
reviewsRouter.get('/', authenticateRead(list));
